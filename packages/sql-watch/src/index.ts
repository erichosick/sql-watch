#!/usr/bin/env node

import commander from 'commander';
import { SqlWatch } from 'sql-watch-lib';
import * as jsonPackage from '../package.json';

(async () => {
  const program = new commander.Command();
  program
    .option('-w, --watch', `when true, continuously watch for changes to sql scripts and
                          automatically run them based on selected options.
                          `)
    .option('-a, --always-run', `when true, sql files in the '/run' directory are always run:
                          ignoring the last run time.
                          `)
    .option('-b, --bypass', `bypasses the "are you sure?" prompt when resetting the database
                          in production. Use this option when using Sql Watch within a
                          CI/CD environment.
                          `)
    .option('-v, --verbose', `provides additional information about running sql scripts
                          such as which ones were skipped.
                          `)
    .option('-l, --log-level <level>', `set the logging level: 'info' is the default.
                           `)
    .option('-i, --init <environment>', `creates all migration directories and initializes the
                          Sql Watch schema in a database. The default environment is 'production'.
                          `)
    .option('-r, --reset', `execute sql scripts located in the ./reset directory.
                          Combined with --watch causes a reset on every file change. A prompt
                          is provided if the environment isn't one of 'development', 'staging',
                          'test' or 'other. See the --bypass option to bypass prompt.
                          `)
    .option('-s, --seed', `pre-seed the database with Lorem ipsum data which useful for
                          local development. Examples being pre-loading movies, invoices, etc.
                          Note: Meta-data, such as lookups, tags, etc. should be loaded
                          via sql script located in the '/run' directory.
                          `)
    .option('-t, --run-tests <type>', `define when tests are run. Options:
                          always [default] - Always run tests.
                          only - Only run tests.
                          skip - Don't run tests. Hint: Use this option when you need to 
                                 recreate the database from scratch for for each test during
                                 integration testing.
                          `)
    .version(jsonPackage.version)

    .addHelpText('after', `

Example calls:
  
  $ sql-watch --init development
  $ sql-watch --seed --verbose
  $ sql-watch --reset # will reset on every run
  $ sql-watch --disable-watch --reset # reset without re-running`);

  program.parse(process.argv);
  const progOpts = program.opts();

  const options = {
    reset: !!progOpts.reset,
    watch: !!progOpts.watch,
    bypass: !!progOpts.bypass,
    alwaysRun: !!progOpts.alwaysRun,
    loggerOptions: {
      level: progOpts.logLevel ? progOpts.logLevel : 'info',
    },
    verbose: !!progOpts.verbose,
    init: progOpts.init,
    seed: !!progOpts.seed,
    runTests: progOpts.runTests ? progOpts.runTests : 'always',
  };

  const sqlWatch = new SqlWatch(options);
  try {
    const watching = await sqlWatch.run();
    if (!watching) {
      process.exit(0);
    } // else we shouldn't exit the process and letter the watcher
  } catch (err: unknown) {
    // if we are here, then a major error occurred like bad code
    const error = err as Error;
    // eslint-disable-next-line no-console
    console.log(error.stack || '');
    process.exit(1);
  }
})();
