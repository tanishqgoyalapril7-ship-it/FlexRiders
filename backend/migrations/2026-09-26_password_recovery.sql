-- FlexRiders: password recovery by email. Additive only: 3 new columns on users (with safe defaults)
-- and one new table. Nothing is renamed, dropped or deleted. Safe to run more than once.

BEGIN;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP WITHOUT TIME ZONE;

CREATE TABLE IF NOT EXISTS email_codes (
	id SERIAL NOT NULL, 
	purpose VARCHAR(20) NOT NULL, 
	email VARCHAR(120) NOT NULL, 
	user_id INTEGER, 
	code_hash VARCHAR(64) NOT NULL, 
	attempts INTEGER NOT NULL, 
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	used_at TIMESTAMP WITHOUT TIME ZONE, 
	request_key VARCHAR(64), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_email_codes_created_at ON email_codes (created_at);
CREATE INDEX IF NOT EXISTS ix_email_codes_email ON email_codes (email);
CREATE INDEX IF NOT EXISTS ix_email_codes_id ON email_codes (id);
CREATE INDEX IF NOT EXISTS ix_email_codes_purpose ON email_codes (purpose);
CREATE INDEX IF NOT EXISTS ix_email_codes_request_key ON email_codes (request_key);
CREATE INDEX IF NOT EXISTS ix_email_codes_user_id ON email_codes (user_id);

ALTER TABLE "email_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "email_codes" FROM anon, authenticated;

COMMIT;
