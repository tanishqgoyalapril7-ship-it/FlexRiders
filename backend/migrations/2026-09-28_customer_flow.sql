-- FlexRiders: Customer app & campaign submission flow
-- Additive only: link User to Brand (brand_id), brand gst_number/address,
-- and customer-defined campaign criteria on campaigns table.
-- Safe to run multiple times.

BEGIN;

-- 1. Link Users to Brand for Customer accounts
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "brand_id" INTEGER REFERENCES brands (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_users_brand_id ON users (brand_id);

-- 2. Customer profile details on existing Brand
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "gst_number" VARCHAR(30);
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "address" TEXT;

-- 3. Customer campaign requirements on existing Campaign
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "campaign_type" VARCHAR(60);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "campaign_objective" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "locations_data" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "daily_start_time" VARCHAR(20);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "daily_end_time" VARCHAR(20);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "rider_requirements" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "budget_type" VARCHAR(30);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "estimated_budget" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "expected_rider_rate" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "instructions" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "documents" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "admin_feedback" TEXT;

COMMIT;
