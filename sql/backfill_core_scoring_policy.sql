-- Core scoring policy backfill
-- Standard: active scores are only
--   score_network, score_cpu_single, score_cpu_multi, score_defense
-- All non-core score fields are reset to 0.

BEGIN;

UPDATE products
SET
  score_memory = 0,
  score_storage = 0,
  score_latency = 0,
  score_delivery = 0,
  score_support = 0,
  score_platform_bonus = 0,
  updated_at = NOW()
WHERE
  COALESCE(score_memory, 0) <> 0
  OR COALESCE(score_storage, 0) <> 0
  OR COALESCE(score_latency, 0) <> 0
  OR COALESCE(score_delivery, 0) <> 0
  OR COALESCE(score_support, 0) <> 0
  OR COALESCE(score_platform_bonus, 0) <> 0;

COMMIT;
