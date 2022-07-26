# sql-watch

`sql-watch` is a command line utility that enables rapid SQL development by automatically applying idempotent SQL scripts to a PostgreSQL database on file change.

`sql-watch` is **NOT** a SQL migration tool. `sql-watch` does not support the standard `migrate up` and `migrate rollback` development process.

## Setup

`sql-watch` requires a running PostgreSQL database instance and the following environment variables set:

```bash
# required environment variables with example values
# .env.example file
PGDATABASE=postgres
PGUSER=postgres
PGPORT=5432
PGPASSWORD=localpassword
PGHOST=localhost
NODE_ENV=development
```

```bash
yarn add --dev sql-watch
# or
npm install sql-watch --save-dev

# initialize sql_watch schema and script directories.
(set -o allexport; source .env.production; set +o allexport; node ./packages/sql-watch --init development)
```

## Usage

## How `sql-watch` Works

`sql-watch` monitors for changes to SQL scripts. Upon changing and saving any of your scripts, `sql-watch` retroactively applies those changes to your database.

<div style="text-align:center"><img src="https://github.com/erichosick/sql-watch/blob/0317650cf5ed9b4a0dbea788a94cce0d3e92c5cd/docs/sql-runner-run.gif?raw=true" /></div>

### Run Order

When one sql file is changed, `sql-watch` attempts to minimize the number of sql files executed: specifically in the `run` and `seed` directories. To that extent, `sql-watch` executes file in a specific order.

On saving any given SQL file, scripts run in the following order:

1) `./db/scripts/prerun` - all scripts are always ran first
2) `./db/scripts/run` - based on sort order, the edited script and all scripts that follow are ran
3) `./db/scripts/seed` - when `--seed` flag is provided, based on sort order, the edited script and all scripts that follow are ran
4) `./db/scripts/postrun` - all scripts are always ran last

Within each folder, scripts run alphabetically by file name:

1) `010_ran-first.sql`
2) `040_ran-second.sql`
3) `900_ran-last.sql`

For rapid development, the general intent is to add new files such that they sort after older files. This minimizes the number of file that run every time you make a change to a newer file.

### Directory Intent

* `prerun` - anything that must run first: setting session variables, for example.
* `run` - create core entities (schemas, table, views), test scripts, and populate meta-data (such as tags, lookups, defaults).
* `seed` - pre-load a database with seed data for developers and staging environments. Though possible, seed data is not meant for production or before each test run.
  * Populate data required in production/testing via the `run` directory.
  * Populate data required for each test in the test itself.
* `postrun` - run the script after running and seeding the database. For example, maybe a quick sanity check.
* `reset` - the intent is to tear down and reset everything in the database.

## Idempotent SQL

By design, `sql-watch` runs the same sql script multiple times against a database. As such, sql script will need to be written with a focus on idempotence.

Example SQL script that is idempotent (can be ran multiple times with the same outcome):

```sql
-- Creating a schema using IF NOT EXISTS
CREATE SCHEMA IF NOT EXISTS iso;

-- Creating a table using IF NOT EXISTS
CREATE TABLE IF NOT EXISTS iso.iso639_1 (
  alpha2_id iso.alpha2 NOT NULL PRIMARY KEY,
  label shared.label NOT NULL
);

-- Creating a domain by surround with TRY/CATCH
DO $$ BEGIN
  CREATE DOMAIN shared.weight AS DECIMAL(18,2);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- adding a column using IF NOT EXITS

ALTER TABLE iso.iso639_1 ADD COLUMN IF NOT EXISTS description shared.description NOT NULL;

-- and so on
```

### Examples

Given the following sql files:

```bash
01) ./db/scripts/prerun/10_set-session.sql
02) ./db/scripts/run/10_account-schema.sql
03) ./db/scripts/run/12_account-schema.test.sql
04) ./db/scripts/run/20_user-schema.sql
05) ./db/scripts/run/22_user-schema.test.sql
06) ./db/scripts/run/30_book-schema.sql
07) ./db/scripts/run/32_book-schema.test.sql
08) ./db/scripts/seed/10_account-seed.sql
09) ./db/scripts/seed/20_user-seed.sql
10) ./db/scripts/seed/20_book-seed.sql
11) ./db/scripts/postrun/10_sanity-check.sql
12) ./db/scripts/reset/10_destroy-all.sql
```

#### Example 01 - running `sql-watch --watch --seed`

* changes to file 01 causes files 01 through 11 to run
* changes to file 04 causes file 01 and files 04 through 11 to run
* changes to file 10 causes file 01 and files 10 through 11 to run

#### Example 02 - running `sql-watch --watch` (seed disabled)

* changes to file 03 causes file 01, files 03 through 07, and file 11 to run

#### Example 03 - running `sql-watch --watch --run-tests only`

* changes to file 02 are not run but all test files are ran (03, 05, and 07).
  * Note that this mode is intended for sanity checking/smoke testing staging and/or production and not local development.

#### Example 04 - running `sql-watch --watch --reset`

* changes to any file cause 12 to run then 01-11 to run.

#### Example 05 - running `sql-watch --reset`

* changes to any file cause 12 to run. All other files are ignored and `sql-watch` doesn't watch for any other changes.

## Features

* Programming Language agnostic
* Doesn't use/rely on an ORM
* Use any SQL testing framework
* Enables TDD and BDD
* Improves SQL transparency in the design and development process
* Faster SQL development time

## Development

See [Monorepo readme](../../README.md) .
