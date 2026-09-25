-- FlexRiders: vehicle types, campaign categories, public-asset approval, versioned campaign terms.
-- Additive only: 3 new nullable columns and 2 new tables. Nothing is renamed, dropped, rewritten or deleted.
-- Safe to run more than once (IF NOT EXISTS everywhere; enabling RLS again is a no-op).
--
-- Terms retention: campaign_terms and campaign_terms_acceptances are permanent history. They reference
-- campaigns, riders, users and join requests by plain id plus a name snapshot (NO foreign keys), so no
-- reset, deletion or cascade can remove them or be blocked by them. The only foreign key is
-- acceptance -> terms version (ON DELETE NO ACTION: a version with acceptances can never be deleted).

BEGIN;

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "campaign_category" VARCHAR(30);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "public_image_approved" BOOLEAN;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "public_assets_approved" BOOLEAN;

CREATE TABLE IF NOT EXISTS campaign_terms (
	id SERIAL NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	campaign_name VARCHAR(150), 
	version INTEGER NOT NULL, 
	body TEXT NOT NULL, 
	change_note VARCHAR(500), 
	published_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	published_by_id INTEGER, 
	published_by_email VARCHAR(120), 
	PRIMARY KEY (id), 
	CONSTRAINT uq_campaign_terms_version UNIQUE (campaign_id, version)
);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_campaign_id ON campaign_terms (campaign_id);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_id ON campaign_terms (id);
ALTER TABLE "campaign_terms" ENABLE ROW LEVEL SECURITY;  -- same lock-down as every other table (no public API access)

CREATE TABLE IF NOT EXISTS campaign_terms_acceptances (
	id SERIAL NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	campaign_name VARCHAR(150), 
	rider_id INTEGER NOT NULL, 
	rider_code VARCHAR(20), 
	rider_name VARCHAR(120), 
	terms_id INTEGER NOT NULL, 
	terms_version INTEGER NOT NULL, 
	accepted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	application_id INTEGER, 
	source VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_terms_acceptance_once UNIQUE (terms_id, rider_id), 
	FOREIGN KEY(terms_id) REFERENCES campaign_terms (id)
);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_acceptances_campaign_id ON campaign_terms_acceptances (campaign_id);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_acceptances_id ON campaign_terms_acceptances (id);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_acceptances_rider_id ON campaign_terms_acceptances (rider_id);
ALTER TABLE "campaign_terms_acceptances" ENABLE ROW LEVEL SECURITY;  -- same lock-down as every other table (no public API access)

COMMIT;

-- Existing data: riders.vehicle_category keeps its values (TWO_WHEELER / THREE_WHEELER are still valid);
-- campaigns.eligible_vehicle_categories keeps its values; a NULL campaign_category means Standard.
-- The production database had 0 riders and 0 campaigns at audit time, so nothing needs backfilling.
