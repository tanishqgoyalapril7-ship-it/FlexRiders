-- FlexRiders: Brand payment tracking & accounting ledger
-- Additive only: contract_amount on brands, brand_id foreign key on brand_payment_records,
-- make campaign_id nullable, and backfill brand_id from campaigns.
-- Safe to run more than once.

BEGIN;

ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "contract_amount" DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE "brand_payment_records" ADD COLUMN IF NOT EXISTS "brand_id" INTEGER REFERENCES brands (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_brand_payment_records_brand_id ON brand_payment_records (brand_id);

-- In Postgres, allow campaign_id to be nullable for general brand-level payments
ALTER TABLE "brand_payment_records" ALTER COLUMN "campaign_id" DROP NOT NULL;

-- Backfill brand_id for existing campaign-linked payment records
UPDATE brand_payment_records bpr
SET brand_id = c.brand_id
FROM campaigns c
WHERE bpr.campaign_id = c.id
  AND bpr.brand_id IS NULL;

COMMIT;
