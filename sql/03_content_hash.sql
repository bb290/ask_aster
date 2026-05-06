-- Ask Aster v0.5 — content fingerprinting for incremental ingest
--
-- Adds a content_hash column so the ingest script can skip chunks whose
-- embed input hasn't changed. Reduces post-capture wall-clock from
-- ~15 min (full re-embed) to ~10 sec (only changed files).
--
-- Run after: 01_schema.sql, 02_match_sops.sql.
-- Idempotent — safe to run multiple times.

alter table sops add column if not exists content_hash text;

-- No new index needed — the existing unique (file_path, chunk_index) index
-- from 01_schema.sql is the lookup key for incremental comparisons.

-- After this migration runs, rows have null content_hash; the next ingest
-- will see the mismatch and re-embed everything once. Subsequent ingests
-- will only re-embed files whose chunks actually changed.
