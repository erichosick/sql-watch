-- This example error file will result in information about the error logging
-- when ran by sql-watch.

CREATE TABLE sometable (
  missing_type /* int */ NOT NULL DEFAULT 0
);