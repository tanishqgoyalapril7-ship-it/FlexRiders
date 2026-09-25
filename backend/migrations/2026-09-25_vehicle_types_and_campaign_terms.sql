-- FlexRiders: vehicle types, campaign categories, public-asset approval, versioned campaign terms.
-- Additive only: 3 new nullable columns and 2 new tables. Nothing is renamed, dropped or rewritten.
-- The backend applies exactly this on startup (add_missing_columns / create_all / ensure_indexes /
-- lock_down_public_api); it is written out here for review.

BEGIN;

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "campaign_category" VARCHAR(30);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "public_image_approved" BOOLEAN;
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "public_assets_approved" BOOLEAN;

CREATE TABLE IF NOT EXISTS campaign_terms (
	id SERIAL NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	version INTEGER NOT NULL, 
	body TEXT NOT NULL, 
	change_note VARCHAR(500), 
	published_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	published_by_id INTEGER, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_campaign_terms_version UNIQUE (campaign_id, version), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(published_by_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_id ON campaign_terms (id);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_campaign_id ON campaign_terms (campaign_id);
ALTER TABLE "campaign_terms" ENABLE ROW LEVEL SECURITY;  -- same lock-down as every other table (no public API access)

CREATE TABLE IF NOT EXISTS campaign_terms_acceptances (
	id SERIAL NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	rider_id INTEGER NOT NULL, 
	terms_id INTEGER NOT NULL, 
	terms_version INTEGER NOT NULL, 
	accepted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	application_id INTEGER, 
	source VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_terms_acceptance_once UNIQUE (terms_id, rider_id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(rider_id) REFERENCES riders (id), 
	FOREIGN KEY(terms_id) REFERENCES campaign_terms (id), 
	FOREIGN KEY(application_id) REFERENCES campaign_applications (id)
);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_acceptances_id ON campaign_terms_acceptances (id);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_acceptances_campaign_id ON campaign_terms_acceptances (campaign_id);
CREATE INDEX IF NOT EXISTS ix_campaign_terms_acceptances_rider_id ON campaign_terms_acceptances (rider_id);
ALTER TABLE "campaign_terms_acceptances" ENABLE ROW LEVEL SECURITY;  -- same lock-down as every other table (no public API access)

COMMIT;

-- Existing data: riders.vehicle_category keeps its values (TWO_WHEELER / THREE_WHEELER are still valid);
-- campaigns.eligible_vehicle_categories keeps its values; a NULL campaign_category means Standard.
-- The database currently has 0 riders and 0 campaigns, so nothing needs backfilling.
