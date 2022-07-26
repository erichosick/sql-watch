/* eslint-disable no-new */

import { rmSync, existsSync, readFileSync } from 'fs';

// NOTE: Spent a lot of time trying to figure out how to get pretty to send
// output to an in memory stream but it looks like that just isn't possible?
// There was an outputStream option but that doesn't seem to be used anymore.
// For now, we write to a file then check the contents of the file. :-(

import { prettyLogger } from './pretty-support';

import {
  SqlConnection, SqlWatch, DirectoriesDefault, Environment, TestOption, WatchOptionsPartial,
} from '../src/index';

const testConnection = {
  dbname: 'postgres',
  user: 'postgres',
  host: 'localhost',
  port: 5477,

  // committing to git because this is only for local testing
  password: 'localpassword',
};

const sqlWatchSchemaName = 'sql_watch_test';

describe('unit tests', () => {
  const testRootDirectory = './test_unit_01';

  if (existsSync(testRootDirectory)) {
    rmSync(testRootDirectory, { recursive: true });
  }

  it('SqlWatch should throw an error when connection options are incorrect', () => {
    expect(() => {
      new SqlWatch({
        directories: {
          ...DirectoriesDefault,
          ...{ rootDirectory: testRootDirectory },
        },
        sqlWatchSchemaName,
      });
    }).toThrow('Connection missing required options: host, user, password, database. Required options can be set with environment variables or via the connection parameter');

    // AND no directory will be created
    expect(existsSync(testRootDirectory)).toEqual(false);
  });
});

describe('integration tests', () => {
  const testRootDirectory = './test_integration_01';
  let logger = prettyLogger('./test.log');
  const sql = new SqlConnection(logger, testConnection).connection;

  beforeEach(async () => {
    // GIVEN no sql schema directories exists
    if (existsSync(testRootDirectory)) {
      rmSync(testRootDirectory, { recursive: true });
    }
    // AND the test log file has been removed
    if (existsSync('./test.log')) {
      rmSync('./test.log');
    }

    // AND there is no sql watch schema
    await sql`DROP SCHEMA IF EXISTS ${sql(sqlWatchSchemaName)} CASCADE;`;
  });

  afterEach(async () => {
    // THEN remove the sql schema directories generated by sql watch before each run
    if (existsSync(testRootDirectory)) {
      rmSync(testRootDirectory, { recursive: true });
    }
    // AND remove the test log file
    if (existsSync('./test.log')) {
      rmSync('./test.log');
    }
    // AND remove the sql watch schema
    await sql`DROP SCHEMA IF EXISTS ${sql(sqlWatchSchemaName)} CASCADE;`;
  });

  afterAll(async () => {
    // THEN cleanup everything
    await sql.end({ timeout: 4 });
  });

  describe('sql schema directories', () => {
    it(`SqlWatch, without the init option, should create the sql schema
        directories and not create the sql_schema schema in the database`, async () => {
      // GIVEN SqlWatch has not generated any of the sql schema directories
      expect(existsSync(testRootDirectory)).toEqual(false);

      // WHEN SqlWatch is ran against the test root directory
      new SqlWatch({
        directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
        connection: testConnection,
      });

      // THEN the sql schema directories should have been created
      expect(existsSync(testRootDirectory)).toEqual(true);

      // AND there should be no sql watch schema
      const schemaFound = await sql`SELECT * FROM information_schema.schemata WHERE schema_name = '${sql(sqlWatchSchemaName)}';`;
      expect(schemaFound.length).toEqual(0);
    });
  });

  describe('SqlWatch options', () => {
    beforeEach(async () => {
      // GIVEN a new logger setup
      logger = prettyLogger('./test.log');
    });

    describe('init option', () => {
      it('SqlWatch should support init option with default of production', async () => {
        // GIVEN sql watch is created
        const sqlWatch = new SqlWatch({
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          init: Environment.Production,
          connection: testConnection,
          sqlWatchSchemaName,
        }, logger);

        // WHEN sqlWatch is first ran
        await sqlWatch.run();

        // THEN the environment should be production
        await expect(await sqlWatch.getEnvironment(sql)).toEqual('production');

        // AND the console should notify us what was done
        const content = readFileSync('./test.log').toString('ascii').split('\n');
        expect(content.length).toEqual(5);
        expect(content[0]).toEqual('INFO: Sql Watch successfully:');
        expect(content[1]).toEqual('INFO:   * created/updated the sql_watch_test schema in postgresql://postgres:*****@localhost:5477/postgres');
        expect(content[2]).toEqual('INFO:   * set the environment in sql_watch_test.environment to \'production\'.');
        expect(content[3]).toEqual('INFO:   * created/updated required script directories in \'./test_integration_01\'.');
        expect(content[4]).toEqual('');

        // AND nothing should have run
        const run = await sql`SELECT COUNT(*) AS run_count FROM ${sql(sqlWatchSchemaName)}.run;`;
        expect(run[0].run_count).toEqual('0');
      });

      it('SqlWatch should support init option with a non default value', async () => {
        // GIVEN sql watch is created
        const sqlWatch = new SqlWatch({
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          init: Environment.Development,
          connection: testConnection,
          sqlWatchSchemaName,
        }, logger);

        // WHEN sqlWatch is first ran
        await sqlWatch.run();

        // THEN the environment should be development
        await expect(await sqlWatch.getEnvironment(sql)).toEqual('development');

        // AND the console should notify us what was done
        const content = readFileSync('./test.log').toString('ascii').split('\n');
        expect(content.length).toEqual(5);
        expect(content[0]).toEqual('INFO: Sql Watch successfully:');
        expect(content[1]).toEqual('INFO:   * created/updated the sql_watch_test schema in postgresql://postgres:*****@localhost:5477/postgres');
        expect(content[2]).toEqual('INFO:   * set the environment in sql_watch_test.environment to \'development\'.');
        expect(content[3]).toEqual('INFO:   * created/updated required script directories in \'./test_integration_01\'.');
        expect(content[4]).toEqual('');

        // AND there should be no entries in the run table
        const runInfo = await sql`SELECT * FROM ${sql(sqlWatchSchemaName)}.run;`;
        expect(runInfo.length).toEqual(0);
      });

      it('SqlWatch should ignore the watch option when init option is provided', async () => {
        // GIVEN sql watch is created
        const sqlWatch = new SqlWatch({
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          init: Environment.Staging,
          watch: true, // this option is ignored
          connection: testConnection,
          sqlWatchSchemaName,
        }, logger);

        // WHEN sqlWatch is first ran
        await sqlWatch.run();

        // THEN the environment should be staging
        await expect(await sqlWatch.getEnvironment(sql)).toEqual('staging');

        // AND the console should notify us what was done
        const content = readFileSync('./test.log').toString('ascii').split('\n');
        expect(content.length).toEqual(5);
        expect(content[0]).toEqual('INFO: Sql Watch successfully:');
        expect(content[1]).toEqual('INFO:   * created/updated the sql_watch_test schema in postgresql://postgres:*****@localhost:5477/postgres');
        expect(content[2]).toEqual('INFO:   * set the environment in sql_watch_test.environment to \'staging\'.');
        expect(content[3]).toEqual('INFO:   * created/updated required script directories in \'./test_integration_01\'.');
        expect(content[4]).toEqual('');

        // AND there should be no entries in the run table
        const runInfo = await sql`SELECT * FROM ${sql(sqlWatchSchemaName)}.run;`;
        expect(runInfo.length).toEqual(0);
      });

      it('SqlWatch should error if running SqlWatch without calling init first', async () => {
        // GIVEN sql watch is created
        const sqlWatch = new SqlWatch({
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          watch: true,
          connection: testConnection,
          sqlWatchSchemaName,
        }, logger);

        // WHEN sqlWatch is first ran
        await sqlWatch.run();

        const content = readFileSync('./test.log').toString('ascii').split('\n');
        expect(content.length).toEqual(2);
        expect(content[0]).toEqual('ERROR: SqlWatch has not been initialized. Have your run sql-watch with the init option? If you feel this is in error please check and verify that the sql_watch_test.environment table exists and has a valid environment entry');
      });
    });

    describe('running sql watch', () => {
      beforeEach(async () => {
        // We need to run SqlWatch init for each test but need to clean up
        // the log file after each init so we don't have to test for/skip the
        // init messages (such as Sql Watch successfully:) that would show up
        // in the log file.
        const options: WatchOptionsPartial = {
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          init: Environment.Development,
          connection: testConnection,
          sqlWatchSchemaName,
        };

        // GIVEN sql watch is created
        const sqlWatch = new SqlWatch(options, logger);

        // AND sqlWatch is first ran with nothing in any of the directories
        await sqlWatch.run();

        // AND the test log file has been removed
        if (existsSync('./test.log')) {
          rmSync('./test.log');
        }

        // AND a new logger setup
        logger = prettyLogger('./test.log');
      });

      describe('run under development', () => {
        it('SqlWatch should only show "finished" when directories are all empty', async () => {
          const options: WatchOptionsPartial = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            connection: testConnection,
            sqlWatchSchemaName,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with no sql files in the sql schema directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN there should only be an info of finished
          expect(content.length).toEqual(2);
          expect(content[0]).toContain('INFO: Finished in');
          expect(content[1]).toEqual('');

          // AND there should be 1 entry in the run table
          const runInfo = await sql`SELECT * FROM ${sql(sqlWatchSchemaName)}.run;`;
          expect(runInfo.length).toEqual(1);
          expect(runInfo[0].meta_data.options).toEqual({
            level: 'info',
            reset: false,
            watch: false,
            bypass: false,
            runTests: 'always',
            alwaysRun: false,
          });

          const ranAt: Date = runInfo[0].ran_at;

          // AND the last run time should be close to the time that we ran
          expect(ranAt.getTime()).toBeLessThanOrEqual(new Date().getTime());
          expect(ranAt.getTime()).toBeGreaterThanOrEqual(new Date().getTime() - 500);
        });
      });

      describe('reset under development', () => {
        it('SqlWatch should only show reset and "finished" when directories are all empty', async () => {
          const options: WatchOptionsPartial = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            connection: testConnection,
            sqlWatchSchemaName,
            reset: true,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN there should only be an info of finished in
          expect(content.length).toEqual(3);
          expect(content[0]).toEqual('INFO: Resetting database');
          expect(content[1]).toContain('INFO: Finished in');
          expect(content[2]).toEqual('');

          // AND there should be 1 entry in the run table
          const runInfo = await sql`SELECT * FROM ${sql(sqlWatchSchemaName)}.run;`;
          expect(runInfo.length).toEqual(1);
          expect(runInfo[0].meta_data.options).toEqual({
            level: 'info',
            reset: true,
            watch: false,
            bypass: false,
            runTests: 'always',
            alwaysRun: false,
          });

          // AND the last run time should be 1970-01-01T00:00:00.000Z because
          // we just reset everything
          expect(runInfo[0].ran_at).toEqual(new Date(0));
        });
      });

      describe('run test and directory options', () => {
        it('SqlWatch should run both tests and run directory by default.', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN we should see test and non-test files ran
          expect(content.length).toEqual(10);
          expect(content[0]).toEqual('INFO: APPLIED ./db/scripts/prerun/10_set-environment.sql');
          expect(content[1]).toEqual('INFO: APPLIED ./db/scripts/prerun/50_set.test.sql');
          expect(content[2]).toEqual('INFO: APPLIED ./db/scripts/run/020_shared-schema.sql');
          expect(content[3]).toEqual('INFO: APPLIED ./db/scripts/run/021_shared-schema.test.sql');
          expect(content[4]).toEqual('INFO: APPLIED ./db/scripts/run/040_iso-schema.sql');
          expect(content[5]).toEqual('INFO: APPLIED ./db/scripts/run/041_iso-metadata.sql');
          expect(content[6]).toEqual('INFO: APPLIED ./db/scripts/postrun/10_review.sql');
          expect(content[7]).toEqual('INFO: APPLIED ./db/scripts/postrun/50_review.test.sql');
          expect(content[8]).toContain('INFO: Finished in ');
          expect(content[9]).toEqual('');
        });

        it('SqlWatch should run both tests and run directory when always is set', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
            runTests: TestOption.Always,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN we should see test and non-test files ran
          expect(content.length).toEqual(10);
          expect(content[0]).toEqual('INFO: APPLIED ./db/scripts/prerun/10_set-environment.sql');
          expect(content[1]).toEqual('INFO: APPLIED ./db/scripts/prerun/50_set.test.sql');
          expect(content[2]).toEqual('INFO: APPLIED ./db/scripts/run/020_shared-schema.sql');
          expect(content[3]).toEqual('INFO: APPLIED ./db/scripts/run/021_shared-schema.test.sql');
          expect(content[4]).toEqual('INFO: APPLIED ./db/scripts/run/040_iso-schema.sql');
          expect(content[5]).toEqual('INFO: APPLIED ./db/scripts/run/041_iso-metadata.sql');
          expect(content[6]).toEqual('INFO: APPLIED ./db/scripts/postrun/10_review.sql');
          expect(content[7]).toEqual('INFO: APPLIED ./db/scripts/postrun/50_review.test.sql');
          expect(content[8]).toContain('INFO: Finished in ');
          expect(content[9]).toEqual('');
        });

        it('SqlWatch should only run run directory when tests are skipped', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
            runTests: TestOption.Skip,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN we should see test and non-test files ran
          expect(content.length).toEqual(7);
          expect(content[0]).toEqual('INFO: APPLIED ./db/scripts/prerun/10_set-environment.sql');
          expect(content[1]).toEqual('INFO: APPLIED ./db/scripts/run/020_shared-schema.sql');
          expect(content[2]).toEqual('INFO: APPLIED ./db/scripts/run/040_iso-schema.sql');
          expect(content[3]).toEqual('INFO: APPLIED ./db/scripts/run/041_iso-metadata.sql');
          expect(content[4]).toEqual('INFO: APPLIED ./db/scripts/postrun/10_review.sql');
          expect(content[5]).toContain('INFO: Finished in ');
          expect(content[6]).toEqual('');
        });

        it('SqlWatch should only tests when set to only run tests', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
            runTests: TestOption.Only,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN we should see test and non-test files ran
          expect(content.length).toEqual(5);
          expect(content[0]).toEqual('INFO: APPLIED ./db/scripts/prerun/50_set.test.sql');
          expect(content[1]).toEqual('INFO: APPLIED ./db/scripts/run/021_shared-schema.test.sql');
          expect(content[2]).toEqual('INFO: APPLIED ./db/scripts/postrun/50_review.test.sql');
          expect(content[3]).toContain('INFO: Finished in ');
          expect(content[4]).toEqual('');
        });

        it('SqlWatch should throw an error when runTest option is invalid', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
            runTests: undefined,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN running sqlWatch
          // THEN it should throw an exception
          await expect(sqlWatch.run())
            .rejects
            .toThrow("Non existent test option 'undefined'");
        });
      });

      describe('run verbose options', () => {
        it('SqlWatch should provide additional info when sql-watch is run with verbose and seed false.', async () => {
          const options: WatchOptionsPartial = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            connection: testConnection,
            sqlWatchSchemaName,
            verbose: true,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with no sql files in the sql schema directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN there should be extra information about the seed file being skipped
          expect(content.length).toEqual(3);

          expect(content[0]).toEqual('INFO: SKIPPED ./test_integration_01/seed: all (seed option was false)');
          expect(content[1]).toContain('INFO: Finished in ');
          expect(content[2]).toEqual('');
        });

        it('SqlWatch should NOT provide additional info when sql-watch is run with verbose and seed true.', async () => {
          const options: WatchOptionsPartial = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            connection: testConnection,
            sqlWatchSchemaName,
            verbose: true,
            seed: true,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with no sql files in the sql schema directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN there should NOT be extra information as the seed file is not skipped
          expect(content.length).toEqual(2);

          expect(content[0]).toContain('INFO: Finished in ');
          expect(content[1]).toEqual('');
        });
      });

      describe('run invalid directories', () => {
        it('SqlWatch should error with a missing run directory', async () => {
          const badRunDirectory = {
            ...DirectoriesDefault,
            run: 'runNoForward',
          };

          const options: WatchOptionsPartial = {
            directories: badRunDirectory,
            connection: testConnection,
            sqlWatchSchemaName,
          };
          // WHEN sql watch is created
          // THEN it should throw an exception

          expect(() => { new SqlWatch(options, logger); })
            .toThrow("Directories must start with / which is missing from 'runNoForward'");
        });
      });

      describe('sql file contains invalid sql', () => {
        it('SqlWatch should log information about where the error is', async () => {
          const options: WatchOptionsPartial = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: './db2/scripts' } },
            connection: testConnection,
            sqlWatchSchemaName,
            verbose: true,
            seed: true,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with no sql files in the sql schema directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN information about the error should be logged
          expect(content.length).toEqual(8);

          expect(content[0]).toContain('/db2/scripts/run/030_bad-sql.sql:4 PostgresError (42601) syntax error at or near "NOT"');
          expect(content[1]).toEqual('INFO:      1: -- This example error file will result in information about the error logging');
          expect(content[2]).toEqual('INFO:      2: -- when ran by sql-watch.');
          expect(content[3]).toEqual('INFO:      3: ');
          expect(content[4]).toEqual('ERROR: *   4: CREATE TABLE sometable (');
          expect(content[5]).toEqual('INFO:      5:   missing_type /* int */ NOT NULL DEFAULT 0');
          expect(content[6]).toEqual('INFO:      6: );');
          expect(content[7]).toEqual('');
        });

        it('SqlWatch should log information an error but not know where the error is', async () => {
          const options: WatchOptionsPartial = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: './db3/scripts' } },
            connection: testConnection,
            sqlWatchSchemaName,
            verbose: true,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with no sql files in the sql schema directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN information about the error should be logged
          expect(content.length).toEqual(2);

          expect(content[0]).toContain('/db3/scripts/run/040_bad-sql.sql:0 PostgresError (42P01) relation "notable" does not exist');
          expect(content[1]).toEqual('');
        });
      });

      describe('sql-watch schema manually removed', () => {
        it('SqlWatch should log information about an error when last_run is manually removed', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN we drop the last_run view
          await sql`DROP VIEW IF EXISTS ${sql(sqlWatchSchemaName)}.last_run;`;

          // AND run sql watch
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN information about the error should be logged
          expect(content.length).toEqual(3);

          expect(content[0]).toEqual('ERROR: :0 PostgresError (42P01) relation "sql_watch_test.last_run" does not exist');
          expect(content[1]).toEqual('WARN: Unable to determine error line number.');
          expect(content[2]).toEqual('');
        });

        it('SqlWatch should log information about an error when environment is manually removed', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN we drop the environment table
          await sql`DROP TABLE IF EXISTS ${sql(sqlWatchSchemaName)}.environment;`;

          // AND run sql watch
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN information about the error should be logged
          expect(content.length).toEqual(2);

          expect(content[0]).toEqual('ERROR: SqlWatch has not been initialized. Have your run sql-watch with the init option? If you feel this is in error please check and verify that the sql_watch_test.environment table exists and has a valid environment entry');
          expect(content[1]).toEqual('');
        });

        it('SqlWatch should error out when the connection is closed', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // AND a sql connection
          const sql2 = new SqlConnection(logger, testConnection).connection;

          // WHEN we close the connection
          await sql2.end({ timeout: 4 });

          // AND we try to verify
          // THEN an error is thrown
          await expect(sqlWatch.verifyInitialized(sql2))
            .rejects
            .toThrow('write CONNECTION_ENDED localhost:5477');
        });

        it('SqlWatch should error out when the environment is cleared out', async () => {
          const options: WatchOptionsPartial = {
            connection: testConnection,
            sqlWatchSchemaName,
          };
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN we drop the environment table
          await sql`DELETE FROM ${sql(sqlWatchSchemaName)}.environment;`;

          // AND try to run sql watch
          await sqlWatch.run();

          const content = readFileSync('./test.log').toString('ascii').split('\n');

          // THEN information about the error should be logged
          expect(content[8]).toEqual('WARN: sql_watch_test.environment had no records when it should contain at least one record. Defaulting environment setting to production');
        });
      });
    });
  });
});
