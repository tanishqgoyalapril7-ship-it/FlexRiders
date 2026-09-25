-- FlexRiders: account deletion requests from the public web form (Google Play account-deletion requirement).
-- Additive only: one new table. Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
	id SERIAL NOT NULL,
	mobile_number VARCHAR(20) NOT NULL,
	full_name VARCHAR(120) NOT NULL,
	message VARCHAR(1000),
	status VARCHAR(20) NOT NULL,
	resolution VARCHAR(500),
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	handled_at TIMESTAMP WITHOUT TIME ZONE,
	handled_by_email VARCHAR(120),
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_account_deletion_requests_id ON account_deletion_requests (id);
CREATE INDEX IF NOT EXISTS ix_account_deletion_requests_mobile_number ON account_deletion_requests (mobile_number);
ALTER TABLE "account_deletion_requests" ENABLE ROW LEVEL SECURITY;  -- same lock-down as every other table

COMMIT;
