-- FlexRiders: Redeem Offer (guest photo -> admin approval -> one-time brand voucher). Additive only: four new
-- tables. Safe to run more than once. Only the backend reads them; RLS with no policies + revoked grants keep
-- them out of the public API. Run this on Supabase BEFORE deploying the backend that uses these tables.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_offers (
	id SERIAL NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	enabled BOOLEAN NOT NULL, 
	title VARCHAR(120) NOT NULL, 
	description TEXT, 
	discount_type VARCHAR(10) NOT NULL, 
	discount_value FLOAT NOT NULL, 
	max_vouchers INTEGER, 
	validity_days INTEGER NOT NULL, 
	start_date DATE, 
	end_date DATE, 
	outlets TEXT, 
	max_per_customer INTEGER NOT NULL, 
	cooldown_days INTEGER NOT NULL, 
	settlement_notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (campaign_id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id)
);
CREATE INDEX IF NOT EXISTS ix_campaign_offers_id ON campaign_offers (id);
ALTER TABLE "campaign_offers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "campaign_offers" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS offer_guests (
	id SERIAL NOT NULL, 
	phone VARCHAR(10) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	last_seen_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (phone)
);
CREATE INDEX IF NOT EXISTS ix_offer_guests_id ON offer_guests (id);
ALTER TABLE "offer_guests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "offer_guests" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS offer_submissions (
	id SERIAL NOT NULL, 
	public_id VARCHAR(16) NOT NULL, 
	guest_id INTEGER NOT NULL, 
	guest_name VARCHAR(120) NOT NULL, 
	claim_token_hash VARCHAR(64) NOT NULL, 
	offer_hint_id INTEGER, 
	photo_path VARCHAR(300) NOT NULL, 
	stamped_path VARCHAR(300), 
	photo_sha256 VARCHAR(64) NOT NULL, 
	photo_dhash VARCHAR(16), 
	received_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	device_captured_at TIMESTAMP WITHOUT TIME ZONE, 
	latitude FLOAT, 
	longitude FLOAT, 
	accuracy_m FLOAT, 
	device_info VARCHAR(200), 
	source_key VARCHAR(64), 
	status VARCHAR(16) NOT NULL, 
	flags TEXT, 
	duplicate_of_id INTEGER, 
	suggested_campaign_id INTEGER, 
	suggested_rider_id INTEGER, 
	suggested_distance_m FLOAT, 
	campaign_id INTEGER, 
	rider_id INTEGER, 
	reject_reason VARCHAR(300), 
	flagged_suspicious BOOLEAN NOT NULL, 
	reviewed_by_id INTEGER, 
	reviewed_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (public_id), 
	FOREIGN KEY(guest_id) REFERENCES offer_guests (id), 
	FOREIGN KEY(offer_hint_id) REFERENCES campaign_offers (id), 
	FOREIGN KEY(duplicate_of_id) REFERENCES offer_submissions (id), 
	FOREIGN KEY(suggested_campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(suggested_rider_id) REFERENCES riders (id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(rider_id) REFERENCES riders (id), 
	FOREIGN KEY(reviewed_by_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_campaign_id ON offer_submissions (campaign_id);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_claim_token_hash ON offer_submissions (claim_token_hash);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_guest_id ON offer_submissions (guest_id);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_guest_received ON offer_submissions (guest_id, received_at);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_id ON offer_submissions (id);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_photo_dhash ON offer_submissions (photo_dhash);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_photo_sha256 ON offer_submissions (photo_sha256);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_received_at ON offer_submissions (received_at);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_source_key ON offer_submissions (source_key);
CREATE INDEX IF NOT EXISTS ix_offer_submissions_status ON offer_submissions (status);
ALTER TABLE "offer_submissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "offer_submissions" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS vouchers (
	id SERIAL NOT NULL, 
	code VARCHAR(24) NOT NULL, 
	submission_id INTEGER NOT NULL, 
	guest_id INTEGER NOT NULL, 
	brand_id INTEGER NOT NULL, 
	campaign_id INTEGER NOT NULL, 
	offer_id INTEGER NOT NULL, 
	title VARCHAR(120) NOT NULL, 
	discount_type VARCHAR(10) NOT NULL, 
	discount_value FLOAT NOT NULL, 
	status VARCHAR(12) NOT NULL, 
	issued_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	approved_by_id INTEGER, 
	redeemed_at TIMESTAMP WITHOUT TIME ZONE, 
	redeemed_by_id INTEGER, 
	redeemed_outlet VARCHAR(160), 
	bill_amount FLOAT, 
	cancelled_reason VARCHAR(300), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_voucher_submission UNIQUE (submission_id), 
	UNIQUE (code), 
	FOREIGN KEY(submission_id) REFERENCES offer_submissions (id), 
	FOREIGN KEY(guest_id) REFERENCES offer_guests (id), 
	FOREIGN KEY(brand_id) REFERENCES brands (id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(offer_id) REFERENCES campaign_offers (id), 
	FOREIGN KEY(approved_by_id) REFERENCES users (id), 
	FOREIGN KEY(redeemed_by_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS ix_vouchers_brand_id ON vouchers (brand_id);
CREATE INDEX IF NOT EXISTS ix_vouchers_campaign_id ON vouchers (campaign_id);
CREATE INDEX IF NOT EXISTS ix_vouchers_guest_campaign ON vouchers (guest_id, campaign_id);
CREATE INDEX IF NOT EXISTS ix_vouchers_guest_id ON vouchers (guest_id);
CREATE INDEX IF NOT EXISTS ix_vouchers_id ON vouchers (id);
CREATE INDEX IF NOT EXISTS ix_vouchers_status ON vouchers (status);
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "vouchers" FROM anon, authenticated;

COMMIT;
