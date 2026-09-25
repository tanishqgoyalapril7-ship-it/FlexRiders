-- FlexRiders: rider ↔ support chat. Additive only: two new tables and their indexes. Safe to run more than once.
-- Access is only through the FastAPI backend (it checks who is asking). Row level security with no policies,
-- plus revoked grants, means the Supabase REST API (publishable key) can't read or write these tables at all.

BEGIN;

CREATE TABLE IF NOT EXISTS support_conversations (
	id SERIAL NOT NULL, 
	rider_id INTEGER NOT NULL, 
	campaign_id INTEGER, 
	campaign_name VARCHAR(150), 
	subject VARCHAR(150) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	assigned_admin_id INTEGER, 
	last_message_at TIMESTAMP WITHOUT TIME ZONE, 
	last_message_preview VARCHAR(160), 
	rider_last_read_id INTEGER NOT NULL, 
	admin_last_read_id INTEGER NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	resolved_at TIMESTAMP WITHOUT TIME ZONE, 
	closed_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(rider_id) REFERENCES riders (id), 
	FOREIGN KEY(assigned_admin_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_support_conversations_assigned_admin_id ON support_conversations (assigned_admin_id);
CREATE INDEX IF NOT EXISTS ix_support_conversations_campaign_id ON support_conversations (campaign_id);
CREATE INDEX IF NOT EXISTS ix_support_conversations_id ON support_conversations (id);
CREATE INDEX IF NOT EXISTS ix_support_conversations_rider_id ON support_conversations (rider_id);
CREATE INDEX IF NOT EXISTS ix_support_conversations_status ON support_conversations (status);
CREATE INDEX IF NOT EXISTS ix_support_conversations_updated_at ON support_conversations (updated_at);
CREATE TABLE IF NOT EXISTS support_messages (
	id SERIAL NOT NULL, 
	conversation_id INTEGER NOT NULL, 
	sender_type VARCHAR(10) NOT NULL, 
	sender_user_id INTEGER, 
	sender_name VARCHAR(120), 
	body TEXT NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES support_conversations (id)
);
CREATE INDEX IF NOT EXISTS ix_support_messages_conversation_id ON support_messages (conversation_id);
CREATE INDEX IF NOT EXISTS ix_support_messages_conversation_id_id ON support_messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS ix_support_messages_created_at ON support_messages (created_at);
CREATE INDEX IF NOT EXISTS ix_support_messages_id ON support_messages (id);

ALTER TABLE "support_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "support_conversations", "support_messages" FROM anon, authenticated;

COMMIT;
