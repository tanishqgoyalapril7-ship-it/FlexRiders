-- FlexRiders: geo-targeted campaigns, rider working areas / current location, brand request review.
-- Additive only (new nullable columns, one new table, indexes). Existing rows keep working unchanged:
-- a campaign without target coordinates stays visible to every eligible rider, as before.
-- Safe to run more than once. Run after 2026-09-28_customer_flow.sql.

BEGIN;

-- 1. Brand request review (approval is separate from going live)
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "approved_by_id" INTEGER REFERENCES users (id);

-- Campaigns created by admins before this change were approved by definition.
UPDATE "campaigns" c SET approved_at = COALESCE(c.published_at, c.created_at), approved_by_id = c.created_by_id
WHERE c.approved_at IS NULL
  AND c.status NOT IN ('PENDING_APPROVAL', 'CHANGES_REQUIRED', 'REJECTED')
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.created_by_id AND u.role = 'CUSTOMER');

-- 2. Campaign geo-targeting and radius expansion (per campaign)
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "target_lat" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "target_lng" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "initial_radius_km" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "current_radius_km" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "max_radius_km" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "expansion_step_km" DOUBLE PRECISION;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "expansion_interval_min" INTEGER;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "expansion_paused" BOOLEAN DEFAULT FALSE;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "radius_updated_at" TIMESTAMP;
CREATE INDEX IF NOT EXISTS ix_campaigns_target_lat ON campaigns (target_lat);
CREATE INDEX IF NOT EXISTS ix_campaigns_target_lng ON campaigns (target_lng);

-- 3. Rider's latest location (only while the app is in use)
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "last_lat" DOUBLE PRECISION;
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "last_lng" DOUBLE PRECISION;
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "last_located_at" TIMESTAMP;
CREATE INDEX IF NOT EXISTS ix_riders_last_lat ON riders (last_lat);
CREATE INDEX IF NOT EXISTS ix_riders_last_lng ON riders (last_lng);

-- 3b. Rider gender (optional, from the app profile step)
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(20);

-- 4. Rider working areas (max 3 per rider, enforced by the API)
CREATE TABLE IF NOT EXISTS "rider_working_areas" (
    id SERIAL PRIMARY KEY,
    rider_id INTEGER NOT NULL REFERENCES riders (id) ON DELETE CASCADE,
    label VARCHAR(200) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rider_working_areas_id ON rider_working_areas (id);
CREATE INDEX IF NOT EXISTS ix_rider_working_areas_rider_id ON rider_working_areas (rider_id);
CREATE INDEX IF NOT EXISTS ix_rider_working_areas_latitude ON rider_working_areas (latitude);
CREATE INDEX IF NOT EXISTS ix_rider_working_areas_longitude ON rider_working_areas (longitude);
-- Keep Supabase's public REST API closed (the backend is the table owner and keeps full access).
ALTER TABLE "rider_working_areas" ENABLE ROW LEVEL SECURITY;

COMMIT;
