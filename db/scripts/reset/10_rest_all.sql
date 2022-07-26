-- In this example, we are cascade deleting the two schemas created.
-- One thing we won't undo are extensions as they may be used by other
-- resources that we did not create

DROP SCHEMA IF EXISTS iso CASCADE;
DROP SCHEMA IF EXISTS shared CASCADE;
