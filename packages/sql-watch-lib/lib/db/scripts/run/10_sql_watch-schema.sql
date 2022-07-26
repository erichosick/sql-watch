-- NOTE: This file is used to create resources required by sql-watch.

-- EXTENSIONS ------------------------------------------------------------------

-- Support generation of UUIDs
-- https://www.postgresql.org/docs/14/uuid-ossp.html
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- SCHEMA ----------------------------------------------------------------------

-- DROP SCHEMA IF EXISTS sql_watch;
CREATE SCHEMA IF NOT EXISTS sql_watch;
COMMENT ON SCHEMA sql_watch IS 'defines information about the last time sql-watch was executed against the database';

-- TABLE -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sql_watch.run (
  run_id uuid NOT NULL DEFAULT uuid_generate_v1(),
  ran_at timestamptz NOT NULL,
  meta_data jsonb NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sql_watch_run_id_pk PRIMARY KEY (run_id)
);

COMMENT ON TABLE  sql_watch.run IS 'Contains information about the last time Sql Watch was ran against the database.';
COMMENT ON COLUMN sql_watch.run.run_id IS 'A unique id (uuid) for the entry in this table.';
COMMENT ON COLUMN sql_watch.run.ran_at IS 'The last time sql was ran against the server.';
COMMENT ON COLUMN sql_watch.run.meta_data IS 'Information about the last run.';
COMMENT ON COLUMN sql_watch.run.created_at IS 'The time (with timezone) the entry was added.';

CREATE INDEX IF NOT EXISTS sql_watch_run_created_at_idx
  ON sql_watch.run (created_at);

-- VIEW ------------------------------------------------------------------------

CREATE OR REPLACE VIEW sql_watch.last_run AS
SELECT ran_at
FROM sql_watch.run
ORDER BY created_at DESC
LIMIT 1;

-- TABLE -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sql_watch.environment (
  environment varchar(100) NOT NULL DEFAULT 'production',
  CONSTRAINT sql_watch_environment_pk PRIMARY KEY (environment)
);

COMMENT ON TABLE  sql_watch.environment IS 'A data source with one or more RESTful API endpoints.';
COMMENT ON COLUMN sql_watch.environment.environment IS 'The environment of the database server. By deafult, this is set to production to assure we ';

CREATE OR REPLACE FUNCTION sql_watch.trigger_verify_environment()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sql_watch.environment) THEN
    -- Only allow a single record int he sql-watchner.environment table. Ignore
    -- any additional inserts.
    RETURN null;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION sql_watch.trigger_verify_environment() IS 'Assure that the environment table only contains a single entry.';


DO $$ BEGIN
  CREATE TRIGGER sql_watch_environment_before_insert BEFORE INSERT ON sql_watch.environment
    FOR EACH ROW EXECUTE PROCEDURE sql_watch.trigger_verify_environment();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

INSERT INTO sql_watch.environment (environment)
VALUES ('production')
ON CONFLICT DO NOTHING;
