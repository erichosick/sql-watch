-- SCHEMA ----------------------------------------------------------------------
-- Support generation of UUIDs
-- https://www.postgresql.org/docs/14/uuid-ossp.html
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DROP SCHEMA IF EXISTS shared CASCADE;
CREATE SCHEMA IF NOT EXISTS shared;
COMMENT ON SCHEMA shared IS 'contains resources that can potentially be shared with other schema such as domains, extensions, etc.';


DO $$ BEGIN
	CREATE DOMAIN shared.label AS varchar(128);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
COMMENT ON DOMAIN shared.label IS 'A label is a human readable value often used in, drop down list box, as a check box label, radio label, etc.';

CREATE OR REPLACE FUNCTION shared.trigger_verify_upsert()
RETURNS TRIGGER AS $$
BEGIN

  IF TG_OP = 'UPDATE' AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Can not update created at time.';
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION shared.trigger_verify_upsert() IS 'Used to set the updated_at column to now(). Called by a trigger.';
