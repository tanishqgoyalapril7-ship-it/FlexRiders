-- FlexRiders: platform Terms & Privacy acceptance, campaign video, brand payment mode/status/due date.
-- Additive only: one new table and new nullable/defaulted columns. Nothing is renamed, dropped or deleted.
-- Existing brand payment records keep counting (status defaults to RECORDED). Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS platform_consents (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	terms_version VARCHAR(40) NOT NULL,
	privacy_version VARCHAR(40) NOT NULL,
	source VARCHAR(30) NOT NULL,
	accepted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_platform_consents_id ON platform_consents (id);
CREATE INDEX IF NOT EXISTS ix_platform_consents_user_id ON platform_consents (user_id);
ALTER TABLE "platform_consents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "platform_consents" FROM anon, authenticated;

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "video_url" VARCHAR(500);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "video_path" VARCHAR(300);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "brand_payment_due_date" DATE;

ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "payment_mode" VARCHAR(20);
ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'RECORDED';
ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "cancel_reason" VARCHAR(500);
ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "cancelled_by_id" INTEGER REFERENCES users (id);
ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITHOUT TIME ZONE;

COMMIT;
