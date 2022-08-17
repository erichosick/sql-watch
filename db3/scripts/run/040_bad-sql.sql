-- This example error file will result in information that there is an error
-- but we can't find out where it is.

CREATE TABLE sometable (
  missing_type int NOT NULL DEFAULT 0
);

COMMENT ON TABLE notable IS 'Table is not there';

CREATE TABLE sometable3 (
  missing_type int NOT NULL DEFAULT 0
);