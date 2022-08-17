# sql-watch

`sql-watch` is a command line utility that enables rapid SQL development by automatically applying idempotent SQL scripts to a PostgreSQL database on file change.

`sql-watch` is **NOT** a SQL migration tool. `sql-watch` does not support the standard `migrate up` and `migrate rollback` sql migration pattern.

## Features

* Programming language agnostic
* Doesn't use/rely on an ORM
* Use any SQL testing framework
* Enables TDD and BDD
* Improves SQL transparency in the design and development process
* Faster SQL development time
* Use `sql-watch` as a migration tool for production
* Backwards compatible with the sql migration script pattern: use `sql-watch` for development and a migration tool when pushing to production

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
# add globally
yarn global add sql-watch
# or
npm install -g sql-watch

# locally to a project

yarn add --dev sql-watch
# or
npm install sql-watch --save-dev

# initialize sql_watch schema and script directories.
(set -o allexport; source .env.example; set +o allexport; npx sql-watch --init development)
```

## Usage

## How `sql-watch` Works

`sql-watch` monitors for changes to SQL scripts. Upon changing and saving any of your scripts, `sql-watch` actively applies those changes to your database.

<div style="text-align:center"><img src="https://github.com/erichosick/sql-watch/blob/f136513a2cc1b61ef81782ecfe338f94b81f5b90/docs/sql-runner-run.gif?raw=true" /></div>

## Options

| Option                   | Description                                                                                                                                                                                                                                                 |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| -w, --watch              | when true, continuously watch for changes to sql scripts and automatically run them based on selected options.                                                                                                                                              |
| -a, --always-run         | when true, sql files in the '/run' directory are always run: ignoring the last run time.                                                                                                                                                                    |
| -b, --bypass             | bypasses the "are you sure?" prompt when resetting the database in production. Use this option when using Sql Watch within a CI/CD environment.                                                                                                             |
| -v, --verbose            | provides additional information about running sql scripts such as which ones were skipped.                                                                                                                                                                  |
| -l, --log-level <level>  | set the logging level: 'info' is the default.                                                                                                                                                                                                               |
| -i, --init <environment> | creates all migration directories and initializes the Sql Watch schema in a database. The default environment is 'production'.                                                                                                                              |
| -r, --reset              | execute sql scripts located in the ./reset directory. Combined with --watch causes a reset on every file change. A prompt is provided if the environment isn't one of 'development', 'staging', 'test' or 'other. See the --bypass option to bypass prompt. |
| -s, --seed               | pre-seed the database with Lorem ipsum data which useful for local development. Examples being pre-loading movies, invoices, etc. Note: Meta-data, such as lookups, tags, etc. should be loaded via sql script located in the '/run' directory.             |
| -t, --run-tests <type>   | define when tests are run. Options:<br>  always [default] - Always run tests.<br>  only - Only run tests.<br>  skip - Don't run tests. Hint: Use this option when you need to recreate the database from scratch for each test during integration testing.  |
| -V, --version            | output the version number.                                                                                                                                                                                                                                  |
| -h, --help               | display help for command.                                                                                                                                                                                                                                   |
| Example calls:           | sql-watch --init development<br>sql-watch --seed --verbose<br>sql-watch --reset # will reset on every run<br>sql-watch --disable-watch --reset # reset without re-running                                                                                   |

### Run Order

When one sql file is changed, to speed up development, `sql-watch` attempts to minimize the number of sql files executed: specifically in the `run` and `seed` directories. To that extent, `sql-watch` executes files in a specific order.

On saving any given SQL file, scripts run in the following order:

1) `./db/scripts/prerun` - all scripts are always ran first
2) `./db/scripts/run` - based on sort order, the edited script and all scripts that follow are ran
3) `./db/scripts/seed` - when the `--seed` flag is provided, based on sort order, the edited script and all scripts that follow are ran
4) `./db/scripts/postrun` - all scripts are always ran last

Within each folder, scripts run alphabetically by file name:

1) `010_ran-first.sql`
2) `040_ran-second.sql`
3) `900_ran-last.sql`

For rapid development, the general intent is to name new files such that they sort after older files. This minimizes the number of files that run every time you make a change to a file.

### Committing

`sql-watch` views sql files as independent units: committing each one based on run order. An error thrown by any given sql file will not roll back prior sql files but will stop any additional sql files from running.

**Note**: Create a single sql file if you want to assure an all-or-nothing approach to committing.

### Directory Intent

* `prerun` - anything that must run first: setting session variables, for example.
* `run` - create core entities (schemas, table, views), test scripts, and populate meta-data (such as tags, lookups, defaults).
* `seed` - pre-load a database with seed data for developers and staging environments. Though possible, seed data is not meant for production or before each test run.
  * Populate data required in production/testing via the `run` directory.
  * Populate data required for each test in the test itself.
* `postrun` - run the script after running and seeding the database. For example, maybe a quick sanity check.
* `reset` - the intent is to tear down and reset everything in the database.

## Idempotent SQL

By design, `sql-watch` runs the same sql script multiple times against a database. As such, sql script will need to be written with a focus on idempotence (see [example scripts](https://github.com/erichosick/sql-watch/tree/main/db/scripts)).

Example SQL script that is idempotent (can be ran multiple times with the same outcome):

```sql
-- Creating a schema using IF NOT EXISTS
CREATE SCHEMA IF NOT EXISTS iso;

-- Creating a table using IF NOT EXISTS
CREATE TABLE IF NOT EXISTS iso.iso639_1 (
  alpha2_id iso.alpha2 NOT NULL PRIMARY KEY,
  label shared.label NOT NULL
);

-- Creating a domain: surrounding it with TRY/CATCH in the case the domain
-- already exists.
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

## Development

See the [monorepo readme](https://www.github.com/erichosick/sql-watch).

## Why?

We feel that sql should be treated as first class code. Traditional process that apply sql to a database, such as the "run once" migration script, view sql as second class code (see [Idempotent SQL DDL](https://medium.com/full-stack-architecture/idempotent-sql-ddl-ca354a1eee62) for thoughts on this) meaning we can't leverage other development practices afforded first class code.
