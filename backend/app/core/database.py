from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

database_url = settings.DATABASE_URL
# Supabase/Heroku hand out "postgres://" URLs, which SQLAlchemy 2 no longer accepts.
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
# Name the driver we install (psycopg2): newer SQLAlchemy versions default "postgresql://" to psycopg 3.
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {}
if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

pool_args = {}
if settings.VERCEL and not database_url.startswith("sqlite"):
    # Serverless: many short-lived instances. Don't hold idle connections; use Supabase's transaction
    # pooler (port 6543) in DATABASE_URL so each request borrows a pooled connection.
    pool_args = {"poolclass": NullPool}
    connect_args = {"connect_timeout": 15}
elif not database_url.startswith("sqlite"):
    # Supabase's session pooler allows 15 clients per project; stay well under it so the
    # dev server, tests and scripts can run side by side.
    # A request waits at most 10s for a free connection, so slow periods fail fast instead of piling up.
    pool_args = {"pool_size": 5, "max_overflow": 3, "pool_recycle": 300, "pool_timeout": 10}
    connect_args = {"connect_timeout": 15}

engine = create_engine(
    database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    **pool_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def lock_down_public_api():
    """On Supabase, every table in the public schema is exposed through its REST API
    (readable with the publishable key). Enabling RLS with no policies blocks that API,
    while this backend keeps full access as the table owner."""
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        # Only tables still missing RLS: ALTER TABLE takes a lock, so running it on every table at
        # every (re)start is slow and can time out against a busy database.
        unprotected = {
            name
            for (name,) in conn.exec_driver_sql(
                "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
            )
        }
        for table in Base.metadata.sorted_tables:
            if table.name in unprotected:
                conn.exec_driver_sql(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY')


def ensure_indexes():
    """create_all() skips indexes on tables that already exist; create any that are missing."""
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            index.create(bind=engine, checkfirst=True)


def add_missing_columns():
    """create_all() creates new tables but never alters existing ones, so add any columns
    introduced after a table was first created. Only ever adds nullable columns."""
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column.type.compile(dialect=engine.dialect)}'
                for fk in column.foreign_keys:
                    ddl += f' REFERENCES "{fk.column.table.name}" ("{fk.column.name}")'
                conn.exec_driver_sql(ddl)
