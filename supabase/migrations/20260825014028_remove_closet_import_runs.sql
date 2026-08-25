-- The Notion import completed on 2026-07-26 and its active writer was removed
-- before this cleanup. The two historical rows were exported locally with a
-- verified SHA-256 before preparing this migration.
--
-- Omit IF EXISTS so migration drift fails closed. Omit CASCADE so an
-- unexpected external dependency cannot be removed with this legacy log.

drop table public.closet_import_runs;
