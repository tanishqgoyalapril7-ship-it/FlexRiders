-- FlexRiders: website enquiries (leads). Additive only: one new table. Safe to run more than once.
-- Only the backend reads it; RLS with no policies + revoked grants keep it out of the public API.

BEGIN;

CREATE TABLE IF NOT EXISTS brand_enquiries (
	id SERIAL NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	intent VARCHAR(20), 
	name VARCHAR(120) NOT NULL, 
	company_name VARCHAR(160), 
	phone VARCHAR(20) NOT NULL, 
	email VARCHAR(160), 
	city VARCHAR(80), 
	vehicle_interest VARCHAR(20), 
	campaign_requirement VARCHAR(1000), 
	campaign_duration VARCHAR(80), 
	message TEXT, 
	status VARCHAR(20) NOT NULL, 
	notes TEXT, 
	brand_id INTEGER, 
	source_key VARCHAR(64), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	handled_by_email VARCHAR(120), 
	PRIMARY KEY (id), 
	FOREIGN KEY(brand_id) REFERENCES brands (id)
);
CREATE INDEX IF NOT EXISTS ix_brand_enquiries_created_at ON brand_enquiries (created_at);
CREATE INDEX IF NOT EXISTS ix_brand_enquiries_id ON brand_enquiries (id);
CREATE INDEX IF NOT EXISTS ix_brand_enquiries_kind ON brand_enquiries (kind);
CREATE INDEX IF NOT EXISTS ix_brand_enquiries_phone ON brand_enquiries (phone);
CREATE INDEX IF NOT EXISTS ix_brand_enquiries_source_key ON brand_enquiries (source_key);
CREATE INDEX IF NOT EXISTS ix_brand_enquiries_status ON brand_enquiries (status);

ALTER TABLE "brand_enquiries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "brand_enquiries" FROM anon, authenticated;

COMMIT;
