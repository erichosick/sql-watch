/* eslint-disable no-new */

import { rmSync, existsSync, readFileSync } from 'fs';

// NOTE: Spent a lot of time trying to figure out how to get pretty to send
// output to an in memory stream but it looks like that just isn't possible?
// There was an outputStream option but that doesn't seem to be used anymore.
// For now, we write to a file then check the contents of the file. :-(

import { prettyLogger } from './pretty-support';

import {
  SqlConnection, SqlWatch, DirectoriesDefault, Environment,
} from '../src/index';

describe('sql-watch-lib', () => {
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

    it('it should throw an error when connection options are incorrect', () => {
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
    describe('directories', () => {
      const testRootDirectory = './test_integration_01';
      beforeEach(() => {
        // clean up just in case
        if (existsSync(testRootDirectory)) {
          rmSync(testRootDirectory, { recursive: true });
        }
      });

      afterEach(() => {
        // clean up
        if (existsSync(testRootDirectory)) {
          rmSync(testRootDirectory, { recursive: true });
        }
      });

      it('it should create directories and not create sql_schema on first new of SqlWatch', async () => {
        // GIVEN no folder exits
        expect(existsSync(testRootDirectory)).toEqual(false);

        // WHEN sql watch is created
        new SqlWatch({
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          connection: testConnection,
        });

        // THEN the directory should have been created
        expect(existsSync(testRootDirectory)).toEqual(true);
      });
    });

    describe('sql-watch option', () => {
      let logger = prettyLogger('./test.log');
      const sql = new SqlConnection(logger, testConnection).connection;

      const testRootDirectory = './test_integration_02';
      beforeEach(async () => {
        // clean up just in case
        if (existsSync(testRootDirectory)) {
          rmSync(testRootDirectory, { recursive: true });
        }
        await sql`DROP SCHEMA IF EXISTS ${sql(sqlWatchSchemaName)} CASCADE;`;
        logger = prettyLogger('./test.log');
      });

      afterEach(async () => {
        // clean up
        if (existsSync(testRootDirectory)) {
          rmSync(testRootDirectory, { recursive: true });
        }
        await sql`DROP SCHEMA IF EXISTS ${sql(sqlWatchSchemaName)} CASCADE;`;

        if (existsSync('./test.log')) {
          rmSync('./test.log');
        }
      });

      afterAll(async () => {
        // cleanup everything
        await sql.end({ timeout: 4 });
        if (existsSync('./test.log')) {
          rmSync('./test.log');
        }
      });

      describe('init', () => {
        it('should support init option with default of production', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch({
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            init: Environment.Production,
            connection: testConnection,
            sqlWatchSchemaName,
          }, logger);

          // WHEN sqlWatch is first ran
          await sqlWatch.run();

          await expect(await sqlWatch.getEnvironment(sql)).toEqual('production');

          const content = readFileSync('./test.log').toString('ascii');
          expect(content).toEqual(readFileSync(`${__dirname}/output-files/sql-watch-init-production.txt`).toString('ascii'));

          // AND nothing should have run
          const run = await sql`SELECT COUNT(*) AS run_count FROM ${sql(sqlWatchSchemaName)}.run;`;
          expect(run[0].run_count).toEqual('0');
        });

        it('should support init option with a non default value', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch({
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            init: Environment.Development,
            connection: testConnection,
            sqlWatchSchemaName,
          }, logger);

          // WHEN sqlWatch is first ran
          await sqlWatch.run();

          await expect(await sqlWatch.getEnvironment(sql)).toEqual('development');

          const content = readFileSync('./test.log').toString('ascii');
          expect(content).toEqual(readFileSync(`${__dirname}/output-files/sql-watch-init-development.txt`).toString('ascii'));

          // AND there should be no entries in the run table
          const runInfo = await sql`SELECT * FROM ${sql(sqlWatchSchemaName)}.run;`;
          expect(runInfo.length).toEqual(0);
        });

        it('should ignore the watch option when init option is provided', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch({
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            init: Environment.Staging,
            watch: true,
            connection: testConnection,
            sqlWatchSchemaName,
          }, logger);

          // WHEN sqlWatch is first ran
          await sqlWatch.run();

          await expect(await sqlWatch.getEnvironment(sql)).toEqual('staging');

          const content = readFileSync('./test.log').toString('ascii');
          expect(content).toEqual(readFileSync(`${__dirname}/output-files/sql-watch-init-staging.txt`).toString('ascii'));
        });

        it('should error if running sql-watch without calling init first', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch({
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            watch: true,
            connection: testConnection,
            sqlWatchSchemaName,
          }, logger);

          // WHEN sqlWatch is first ran
          await sqlWatch.run();

          const content = readFileSync('./test.log').toString('ascii');
          expect(content.split('\n').length).toEqual(2);
          expect(content.split('\n')[0]).toEqual('ERROR: sql-watch has not been initialized. Please run sql-watch --init <environment>. If you feel this is in error please check and verify that the sql_watch.environment table exists and has a valid environment entry');
        });
      });

      describe('run under development', () => {
        beforeEach(async () => {
          const options = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            init: Environment.Development,
            connection: testConnection,
            sqlWatchSchemaName,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);
          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
        });

        const options = {
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          connection: testConnection,
          sqlWatchSchemaName,
        };

        it('should only show "finished" when directories are all empty', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii');

          // THEN there should be an info of finished in
          expect(content.split('\n').length).toEqual(6);
          expect(content.split('\n')[4]).toContain('INFO: Finished in');
        });

        it('should only show "finished" when directories are all empty', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii');

          // THEN there should be an info of finished in
          expect(content.split('\n').length).toEqual(6);
          expect(content.split('\n')[4]).toContain('INFO: Finished in');

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

        // TODO: Provide test cases for directories with sql files.
      });

      describe('reset under development', () => {
        beforeEach(async () => {
          const options = {
            directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
            init: Environment.Development,
            connection: testConnection,
            sqlWatchSchemaName,
          };

          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);
          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
        });

        const options = {
          directories: { ...DirectoriesDefault, ...{ rootDirectory: testRootDirectory } },
          connection: testConnection,
          sqlWatchSchemaName,
          reset: true,
        };

        it('should only show reset and "finished" when directories are all empty', async () => {
          // GIVEN sql watch is created
          const sqlWatch = new SqlWatch(options, logger);

          // WHEN sqlWatch is first ran with nothing in any of the directories
          await sqlWatch.run();
          const content = readFileSync('./test.log').toString('ascii');

          const contentSplit = content.split('\n');

          // THEN there should only be an info of finished in
          expect(contentSplit.length).toEqual(7);
          expect(contentSplit[4]).toEqual('INFO: Resetting database');
          expect(contentSplit[5]).toContain('INFO: Finished in');

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
    });
  });
});
