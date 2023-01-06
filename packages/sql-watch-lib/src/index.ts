import {
  existsSync, readdirSync, statSync, mkdirSync, readFileSync,
} from 'fs';
import { resolve } from 'path';

import ssh2 from 'ssh2';

import chokidar from 'chokidar';
import postgres, { PostgresError } from 'postgres'; // https://github.com/porsager/postgres
import promptSync from 'prompt-sync';

// TODO: Decouple pino from the library
import pino, { Logger } from 'pino';

/**
 * sql-watch uses itself to setup create the sql_watch schema used to maintain
 * state. We don't want any logging to occur at time of setup.
 * Set this to value to false if you need to debug the sql_watch schema setup
 * process.
 */
const SQL_WATCH_SCRIPT_SILENT = true;

// Logging default -------------------------------------------------------------

/*
* Logging options.
*/
export interface LoggerOptions {

  /** Log level. This value may be different based on the logging library
   * used
   */
  level: string
}

/**
 * By default, pino logs are a json format. Example:
 * {"level":30,"msg":"APPLIED ./db/scripts/prerun/20_session-two.sql"}
 *
 * pino-pretty provides a more human friendly format:
 * INFO: APPLIED ./db/scripts/prerun/20_session-two.sql
 */
export const loggerDefault = {
  level: 'info',
  transport: {
    target: 'pino-pretty',
  },

  // Disable display of the process id and host name
  base: {
    pid: undefined,
    hostname: undefined,
  },

  // Disable the display of the timestamp
  timestamp: false,
};

// Connection configuration ----------------------------------------------------

/**
 * Ssh connection options.
 */
export interface SshConnection {
  /** The ssh host for the ssh connection. Example: localhost. */
  host: string,

  /** The ssh port for the ssh connection. Example: 22. */
  port: number,

  /** The ssh user for the connection */
  user: string,

  /** The ssh private key path for the ssh connection */
  privateKeyPath: string

  /** The ssh private key for the ssh connection */
  privateKey?: string
}

/**
 * Connection options. These options are based on the conventions described in
 * https://www.postgresql.org/docs/current/libpq-envars.html
 */
export interface Connection {
  /** The host for the connection. Example: localhost. The PGHOST environment
   * variable overrides this value.
    */
  host: string,

  /** The port for the connection. Defaults to 5432. The PGPORT environment
   * variable overrides this value.
   */
  port: number,

  /** The username for the connection. The PGUSER environment variable overrides
   *  this value.
  */
  user: string,

  /** A password for the connection. The PGPASSWORD environment variable
   * overrides this value.
   */
  password: string,

  /** The database name of the connection. The PGDATABASE environment variable
   * overrides this value.
   */
  dbname: string,

  /** An optional schema to default to in the database. The PGSCHEMA environment
   * variable overrides this value. Note: At the time of writing this code,
   * PGSCHEMA was not an official postgresql environment variable.
   */
  schema?: string | undefined

  /** An optional setting for an ssh connection  */
  ssh?: SshConnection

  /** FUTURE FEATURE: Add options and ssl configuration */

  socket?: any | undefined
}

interface PostgresNotice {
  [field: string]: string;
}

export class SqlConnection {
  private _connectionOptions: Connection;

  private _connection: postgres.Sql<{}>;

  private _logger: Logger;

  constructor(
    logger: Logger,
    connection: Partial<Connection> = {},
  ) {
    this._logger = logger;

    // Environment variables override connection options.
    const { env } = process;
    const host = env.PGHOST || connection?.host;
    const port = Number(env.PGPORT) || connection?.port || 5432;
    const user = env.PGUSER || connection?.user;
    const password = env.PGPASSWORD || connection?.password;
    const dbname = env.PGDATABASE || connection?.dbname;
    const schema = env.PGSCHEMA || connection?.schema;

    const socket = undefined;

    let sshConnection;

    if (!host || !user || !password || !dbname) {
      const missingOptions = [];
      if (!host) { missingOptions.push('host'); }
      if (!user) { missingOptions.push('user'); }
      if (!password) { missingOptions.push('password'); }
      if (!dbname) { missingOptions.push('database'); }

      const errorMessage = `Connection missing required options: ${missingOptions.join(', ')}. Required options can be set with environment variables or via the connection parameter`;
      throw Error(errorMessage);
    }

    // see https://github.com/mscdex/ssh2 and https://github.com/porsager/postgres#custom-socket
    if (env.SSH_HOST !== undefined) {
      const sshHost = env.SSH_HOST;
      const sshPort = Number(env.SSH_PORT);
      const sshUser = env.SSH_USER;
      const sshPrivateKeyPath = env.SSH_PRIVATE_KEY_PATH;

      if (!sshHost || !sshPort || !sshUser || !sshPrivateKeyPath) {
        const missingSshOptions = [];
        if (!sshHost) { missingSshOptions.push('ssh host'); }
        if (!sshPort) { missingSshOptions.push('ssh port'); }
        if (!sshUser) { missingSshOptions.push('ssh user'); }
        if (!sshPrivateKeyPath) { missingSshOptions.push('ssh private key path'); }

        const errorMessage = `When the ssh option is set, then the following options are also required: ${missingSshOptions.join(', ')}. Required ssh options can be set with environment variables or via the connection parameter`;
        throw Error(errorMessage);
      }

      const privateKey = readFileSync(sshPrivateKeyPath, 'utf8');

      sshConnection = {
        host: sshHost,
        port: sshPort,
        user: sshUser,
        privateKeyPath: sshPrivateKeyPath,
        privateKey,
      };
    }

    this._connectionOptions = {
      host, port, user, password, dbname, schema, ssh: sshConnection, socket,
    };

    this._connection = this.createConnection();
  }

  /**
   * Creates and returns a postgres connection.
   * @returns A postgres connection (see https://github.com/porsager/postgres)
   */
  private createConnection(): postgres.Sql<{}> {
    const finalConnection = this._connectionOptions;
    // https://github.com/porsager/postgres#all-postgres-options

    const options = {
      ...finalConnection,
      // If we get the error "UNDEFINED_VALUE: Undefined values are not allowed"
      // then it probably means we have something like
      // select * from x where y = ${ undefined }. So, we aren't going to enable
      // the transform option.
      // transform: { undefined: null },
      onnotice: (notice: PostgresNotice) => {
        // Let's not pollute sql-watch's output by showing postgresql messages
        // that will be common with idempotent sql such as already exists,
        // does not exist, etc.
        if (
          !notice.message.includes('already exists') // CREATE IF NOT EXIST ...
          && (notice.severity !== 'INFO')
          && (!notice.message.includes('does not exist')) // DROP IF EXISTS ...
        ) {
          const severity = notice.severity.includes('NOTICE') ? '' : `${notice.severity}: `;
          this._logger.info(`${severity}${notice.message}`);

          const noticeDetails = notice.detail?.split('\n');
          if (noticeDetails) {
            for (const noticeDetail of noticeDetails) {
              this._logger.info(`${severity}  ${noticeDetail}`);
            }
          }
        }
      },
    };

    if (finalConnection?.ssh) {
      this._logger.debug('SSH: Connecting to database using an ssh Tunnel.');
      const sshConnection = {
        host: finalConnection.ssh.host,
        port: finalConnection.ssh.port,
        username: finalConnection.ssh.user,
        privateKey: finalConnection.ssh.privateKey,
      };
      options.socket = () => new Promise((resolve2, reject2) => {
        const ssh = new ssh2.Client();
        ssh
          .on('error', reject2)
          .on('ready', () => {
            this._logger.debug(`SSH: Client ready to connect. Forwarding localhost:${finalConnection.port} to ${finalConnection.host}:${finalConnection.port}`);
            ssh.forwardOut(
              'localhost',
              finalConnection.port,
              finalConnection.host,
              finalConnection.port,
              (err, socket) => (err ? reject2(err) : resolve2(socket)),
            );
          })
          .connect(sshConnection);
      });
    }

    return postgres(options);
  }

  /**
   * Build at the query part of the uri.
   * @returns Database connection query part (what follows after ? in uri)
   */
  private getConnectionParams(): string {
    const con = this._connectionOptions;
    return con.schema ? `?search_path=${con.schema}` : '';
  }

  /**
   * Returns the active connection to the database.
   */
  public get connection(): postgres.Sql<{}> {
    return this._connection;
  }

  /**
   * Generates a uri connection which includes the password
   * @returns A postgresql uri connection of the form:
   * postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
   */
  public get connectionUri(): string {
    const con = this._connectionOptions;
    return `postgresql://${con.user}:${con.password}@${con.host}:${con.port}/${con.dbname}${this.getConnectionParams()}`;
  }

  /**
   * Generates a uri connection without the password. Useful for logging.
   * @param connection Connection options.
   * @returns A postgresql uri connection of the form:
   * postgresql://[user[:*****]@][netloc][:port][/dbname][?param1=value1&...]
   */
  public get connectionUriNoPwd(): string {
    const con = this._connectionOptions;
    return `postgresql://${con.user}:*****@${con.host}:${con.port}/${con.dbname}${this.getConnectionParams()}`;
  }

  /**
   * Returns final connection options
   */
  public get connectionOptions() {
    return this._connectionOptions;
  }
}

// SqlWatch --------------------------------------------------------------------

/**
 * sql script directories used by sql-watch.
 */
export interface ScriptDirectories {
  /**
   * The rootDirectory pre-pended to all other script directories. Example:
   * if rootDirectory is './db/scripts' and preRun is '/prerun' then the final
   * directory would be './db/scripts/prerun'.
   */
  rootDirectory: string;

  /**
   * Contains all sql script that will run when the reset option is provided.
   * Script in this directory should reset/undo all other scripts. Example sql:
   *   DROP schema <some-schema> CASCADE;
   */
  reset?: string | undefined;

  /**
   * Sql script in this directory are always applied and are applied before the
   * script located in the 'run' directory. Example sql:
   *   SET my.account.seed = 'ffc9088c-f32e-11ec-814e-0e5750b8373d';
   */
  preRun?: string | undefined;

  /**
   * Sql script in this directory is only applied when it has changed. This
   * directory contains all sql script core to the project.
   */
  run: string;

  /**
   * Sql script in this directory is always applied and is applied after the
   * script located in the 'run' directory. Example sql could be some kind of
   * sanity check.
   */
  postRun?: string | undefined;

  /**
   * Sql script in this directory is only applied when it has changed and the
   * seed option set to true. This directory contains seed data that would not
   * be applied in production but would be used to seed local development.
   * Note: Any data that needs to be seeded in production would be placed in
   * the 'run' directory.
   */
  seed?: string | undefined;

}

/**
 * Supported development environments.
 */
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
  Other = 'other'
}

/**
 * sql-watch test options. A file is considered a test file if it matches
 * the one or more patterns in 'WatchOptions.testExtensions'.
 */
export enum TestOption {
  /**
   * Tests are always ran.
   */
  Always = 'always',

  /**
   * Only tests are run. All other sql script is not run.
   */
  Only = 'only',

  /**
   * Tests are not run.
   */
  Skip = 'skip'
}

export interface ISqlWatch {
  run(ignoreLastRunTime: boolean, fileNameChanged: string): Promise<boolean>;
  doReset(): Promise<{ startedAt: Date, skip: boolean }>;
  verifyInitialized(sql: postgres.Sql<{}>): Promise<boolean>;
  getEnvironment(sql: postgres.Sql<{}>): Promise<Environment>;
}
/**
 * Options passed to sql-watch.
 */
export interface WatchOptions {

  /**
   * When true, the sql script in the 'reset' directory is executed. If set
   * in conjunction with the watch option, then the sql script is executed on
   * every file change.
   */
  reset: boolean;

  /** When true, sql-watch will go into watch mode. Any changes in the sql
   * script directories will cause sql-script to run.
    */
  watch: boolean;

  /**
   * When true, bypasses the "are you sure?" prompt when resetting the database
   * in production.
   */
  bypass: boolean;

  /** When true, all sql script is run on change even if it isn't necessary
   * to run the script. For example, the script file had not changed.
   */
  alwaysRun: boolean;

  /**
   * Logging options.
   */
  loggerOptions: LoggerOptions;

  /**
   * When true, provides additional logging information about running sql
   * scripts such as which ones were skipped.
   */
  verbose: boolean;

  /**
   * When set, sql-watch will create directories and setup the sql_watch
   * schema in the database. This option is idempotent making it safe to
   * run multiple times.
   */
  init?: Environment;

  /**
   * When true, the sql script in the 'seed' directory is ran.
   */
  seed: boolean;

  /**
   * Affect when tests are ran based on the TestOption. By default, tests
   * are always ran.
   */
  runTests: TestOption;

  /**
   * Defines which files are considered sql script files. Default value
   * is ['*.sql'].
   */
  extensions: string[];

  /**
   * Defines which files are considered test sql script files. Default value
   * is ['*.spec.sql', '*.test.sql'].
   */
  testExtensions: string[];

  /**
   * The directors where sql script is located. Note that directory names
   * are case sensitive.
   */
  directories: ScriptDirectories;

  /**
   * Optionally provide a database connection. If one is not provided,
   * connection information is pulled from environment variables.
   */
  connection?: Connection;

  /**
   * The schema name for the sql watch schema. The sql watch schema contains
   * state information about sql-watch. Default: sql_watch NOTE: recommend
   * using the default.
   */
  sqlWatchSchemaName: string;
}

export type WatchOptionsPartial = Partial<WatchOptions>;

export const DirectoriesDefault = {
  rootDirectory: './db/scripts',
  run: '/run',
  preRun: '/prerun',
  postRun: '/postrun',
  reset: '/reset',
  seed: '/seed',
};

/**
 * Default sql-watch options.
 */
export const WatchOptionsDefault = {
  reset: false,
  watch: false,
  bypass: false,
  alwaysRun: false,
  loggerOptions: {
    level: 'info',
  },
  verbose: false,
  seed: false,
  runTests: TestOption.Always,
  extensions: ['.sql'],
  testExtensions: ['.spec.sql', '.test.sql'],
  directories: {
    ...DirectoriesDefault,
  },
  sqlWatchSchemaName: 'sql_watch',
};

/**
 * SqlWatch watches for changes to sql files: running sql files as needed when
 * changes are made.
 */
export class SqlWatch implements ISqlWatch {
  private isSetup: boolean = false;

  private logger: Logger;

  private options: WatchOptions;

  private sqlConnection: SqlConnection;

  private runDirectories: ScriptDirectories;

  private sql: postgres.Sql<{}>;

  private watcher: chokidar.FSWatcher | undefined;

  private dirWithRoot(directory: string) {
    if (!directory.startsWith('/')) {
      throw new Error(`Directories must start with / which is missing from '${directory}'`);
    }
    return `${this.options.directories.rootDirectory}${directory}`;
  }

  /**
   * Sets up SqlWatch, verifying the configuration, setting up a logger and
   * a sql connection to the database.
   * TODO: Decouple the logger from SqlWatch.
   * @param options Configuration options.
   */
  constructor(
    options: WatchOptionsPartial,
    logger: Logger | undefined = undefined,
  ) {
    // if (options === undefined || options === null) {
    //   throw new Error('The SqlWatch parameter \'option\' was null or undefined');
    // }

    // Set up the logger
    const loggerConfig = {
      ...loggerDefault,
      ...{
        level: options.loggerOptions?.level
          ? options.loggerOptions?.level : 'info',
      },
    };
    this.logger = logger || pino(loggerConfig);

    this.options = {
      ...WatchOptionsDefault,
      ...options,
    };

    this.sqlConnection = new SqlConnection(this.logger, options.connection);
    const dirs = this.options.directories;

    this.runDirectories = {
      rootDirectory: dirs.rootDirectory,
      reset: dirs.reset ? resolve(this.dirWithRoot(dirs.reset)) : undefined,
      preRun: dirs.preRun ? resolve(this.dirWithRoot(dirs.preRun)) : undefined,
      run: resolve(this.dirWithRoot(dirs.run)),
      postRun: dirs.postRun ? resolve(this.dirWithRoot(dirs.postRun)) : undefined,
      seed: dirs.seed ? resolve(this.dirWithRoot(dirs.seed)) : undefined,
    };

    this.createDirs();

    this.sql = this.sqlConnection.connection;

    // Don't setup the watcher when we are initializing
    if (options.watch && !options.init) {
      this.watcher = this.setupWatcher();
    } else {
      this.watcher = undefined;
    }
  }

  public getSql(): postgres.Sql<{}> {
    return this.sql;
  }

  /**
   * Checks if a file name should be ran based on the options.extension. If a
   * file has the extension, it is considered runnable.
   * @param filename The file name
   * @returns True if the file should be ran by sql-watch. False if the
   * file should not be run by sql-watch.
   */
  private isRunnableExtension(filename: string): boolean {
    for (const extension of this.options.extensions) {
      if (filename.endsWith(`${extension}`)) return true;
    }
    return false;
  }

  private isTestExtension(filename: string): boolean {
    for (const extension of this.options.testExtensions) {
      if (filename.endsWith(`${extension}`)) return true;
    }
    return false;
  }

  private getFilesToRun(files: string[]): string[] {
    return files
      // Find all files that are actually runnable: both test sql and non-test sql
      .filter((filename) => (this.isRunnableExtension(filename) ? filename : undefined))
      // Remove test files if configured as such
      .filter((filename) => {
        const isTestFile = this.isTestExtension(filename);
        switch (this.options.runTests) {
          case TestOption.Always: {
            return filename;
          }
          case TestOption.Only: {
            return isTestFile ? filename : undefined;
          }
          case TestOption.Skip: {
            return isTestFile ? undefined : filename;
          }
          default: {
            throw new Error(`Non existent test option '${this.options.runTests}'`);
          }
        }
      });
  }

  private setupWatcher(): chokidar.FSWatcher {
    this.logger.debug(`Watching ${this.options.directories.rootDirectory}`);

    const watcher = chokidar.watch(
      this.options.directories.rootDirectory,
      { persistent: true, awaitWriteFinish: true, ignoreInitial: true },
    );

    watcher
      .on('add', async (path) => {
        this.logger.debug(`File ${path} has been added`);
        await this.run(false, path);
      })
      .on('change', async (path) => {
        this.logger.debug(`File ${path} has been changed`);
        await this.run(false, path);
      })
      .on('unlink', async () => {
        // removed something, so we should re-run everything. This does not
        await this.run(true);
      })
      .on('error', async (error: unknown) => {
        this.logger.debug('There was an error ', error);
        // NOTE: User is already notified of the error
      });

    return watcher;
  }

  // TODO: Refactor this a bit
  // Try our best to show where the error is
  private logPostgreSqlError(file: string, error: PostgresError) {
    const position = Number(error.position) || 0;
    const { query } = error;
    const lines = query.split('\n');

    const numLines = query.split('\n').map((line, index) => {
      const lineNum = String(index + 1).padStart(6, ' ');
      return `${lineNum}: ${line}`;
    });

    let atPosition = 0;
    let errorLineNumber = 0;
    for (let line = 0; line < lines.length; line += 1) {
      atPosition += lines[line].length;
      if (atPosition > position) {
        errorLineNumber = line - 1;
        if (errorLineNumber > 0) {
          numLines[errorLineNumber] = numLines[errorLineNumber].replace(' ', '*');
          // Align output for logging. ERROR is 1 letter longer than INFO.
          numLines[errorLineNumber] = numLines[errorLineNumber].replace(' ', '');
        }
        break;
      }
    }
    this.logger.error(`${file}:${errorLineNumber + 1} ${error.name} (${error.code}) ${error.message}`);
    if (errorLineNumber < 0) {
      this.logger.warn('Unable to determine error line number.');
    }

    if (this.options.verbose) {
      for (let line = 0; line < numLines.length; line += 1) {
        if (line === errorLineNumber) {
          this.logger.error(`${numLines[line]}`);
        } else {
          this.logger.info(`${numLines[line]}`);
        }
      }
    } else if (errorLineNumber > 0) {
      if (errorLineNumber > 1) {
        this.logger.info(`${numLines[errorLineNumber - 1]}`);
      }
      this.logger.error(`${numLines[errorLineNumber]}`);
      this.logger.info(`${numLines[errorLineNumber + 1]}`);
    }
  }

  /**
   * Runs sql located in file on database
   * @param fileName Name of the file which contains sql script that the postgres
   * library will run on the database server.
   */
  private async applyOnFile(
    fileName: string,
  ): Promise<void> {
    // await this.sql.begin(async () => {
    await this.sql.file(fileName)
      .catch((err: unknown) => {
        if (err instanceof PostgresError) {
          this.logPostgreSqlError(fileName, err);
        }
        // rethrow the error so we don't try to run anymore files.
        throw err;
      });
    // }).catch((err: unknown) => {
    //   throw err;
    // });
  }

  private async setupSqlWatch(environment: string) {
    if (!this.isSetup) {
      try {
        // Setup schema that Sql Watch requires using itself. We use __dirname
        // because the sql files are located within the installation (the library)
        // itself

        this.logger.debug(`Running Sql Watch setup. ${process.cwd()} ${__dirname}`);
        await this.runSql(`${__dirname}/db/scripts/run`, './db/scripts/run', new Date(0), true, SQL_WATCH_SCRIPT_SILENT);
        await this.setEnvironment(environment);
      } catch (err: unknown) {
        if (err instanceof Error) {
          const error = err as Error;
          this.logger.error(`${error.name} ${error.message}`);
        }
      } finally {
        this.isSetup = true;
      }
    }
  }

  private async getLastRunTime(): Promise<Date> {
    const { sql } = this;
    try {
      const ranAt = await sql`SELECT ran_at FROM ${sql(this.options.sqlWatchSchemaName)}.last_run;`;
      // If ranAt result was empty, then it means that this is the first time
      // anything was ran successfully, so we set that last run time to "0".
      return ranAt.length === 0 ? new Date(0) : ranAt[0].ran_at;
    } catch (err) {
      if (err instanceof PostgresError) {
        this.logPostgreSqlError('', err);
      }
      throw err;
    }
  }

  public async verifyInitialized(sql: postgres.Sql<{}>): Promise<boolean> {
    try {
      await sql`SELECT environment FROM ${sql(this.options.sqlWatchSchemaName)}.environment`;
    } catch (err: unknown) {
      if (err instanceof PostgresError && err.code === '42P01') {
        this.logger.error(`SqlWatch has not been initialized. Have your run sql-watch with the init option? If you feel this is in error please check and verify that the ${this.options.sqlWatchSchemaName}.environment table exists and has a valid environment entry`);
        return false;
      }
      // Have no idea why there was an error so we need to re-throw it.
      throw err;
    }
    return true;
  }

  public async getEnvironment(sql: postgres.Sql<{}>): Promise<Environment> {
    const environment = await sql`SELECT environment FROM ${sql(this.options.sqlWatchSchemaName)}.environment`;
    if (environment.length === 0) {
      this.logger.warn(`${this.options.sqlWatchSchemaName}.environment had no records when it should contain at least one record. Defaulting environment setting to production`);
      return Environment.Production;
    }
    return environment[0].environment;
  }

  private async getRunMetaData(): Promise<postgres.JSONValue> {
    return {
      username: process.env.USER || process.env.LOGNAME || process.env.npm_package_author_name || 'unknown',
      email: process.env.npm_config_email || process.env.npm_package_author_email || 'unknown',
      node_environment: process.env.NODE_ENV || 'not set',
      environment: await this.getEnvironment(this.sql),
      workingDirectory: process.env.PWD,
      options: {
        reset: this.options.reset,
        watch: this.options.watch,
        bypass: this.options.bypass,
        alwaysRun: this.options.alwaysRun,
        level: this.options.loggerOptions.level,
        runTests: this.options.runTests,
      },
    };
  }

  private async setLastRunTime(ranAt: Date): Promise<void> {
    const { sql } = this;
    const metaData = sql.json(await this.getRunMetaData());
    await sql`
      INSERT INTO ${sql(this.options.sqlWatchSchemaName)}.run(ran_at, meta_data)
      VALUES (${ranAt}, ${metaData});
    `;
  }

  private async runSql(
    resolvedDir: string,
    directory: string,
    lastRunTime: Date,
    ignoreLastRunTime: boolean = false,
    silent: boolean = false,
  ): Promise<boolean> {
    const applied = false;
    if (!silent) {
      this.logger.debug(`Running ${ignoreLastRunTime ? 'all ' : ''}sql in directory ${resolvedDir}`);
    }
    const files = readdirSync(resolvedDir).sort();

    if (files.length === 0 && !silent) {
      this.logger.debug(`No SQL files were found in ${resolvedDir}`);
    }

    const filesFiltered = this.getFilesToRun(files);

    if (filesFiltered.length === 0) {
      this.logger.debug(`No SQL files were found in ${resolvedDir} after running filters.`);
      return false;
    }

    let startMigrating = false;
    for (const filename of filesFiltered) {
      const file = resolve(resolvedDir, filename);
      const stat = statSync(file);
      const fileDate = new Date(stat.mtime);

      if (!startMigrating && fileDate >= lastRunTime) {
        startMigrating = true;
      }

      if (startMigrating || ignoreLastRunTime) {
        // eslint-disable-next-line no-await-in-loop
        await this.applyOnFile(file);
        if (!silent) {
          this.logger.info(`APPLIED ${directory}/${filename}`);
        }
      } else if (!silent && this.options.verbose) {
        this.logger.info(`SKIPPED ${directory}/${filename}`);
      }
    }
    return applied;
  }

  public async doReset(): Promise<{ startedAt: Date, skip: boolean }> {
    let startedAt = new Date();
    let skip = false;
    if (this.options.reset) {
      let doReset = true;
      const environment = await this.getEnvironment(this.sql);

      // We really want to make sure that the developer has explicitly set the
      // environment to a "non production" environment. So, we check for each
      // of these known environments instead of just checking for
      // environment === Environment.Production.
      if (environment !== Environment.Development
        && environment !== Environment.Staging
        && environment !== Environment.Other
        && environment !== Environment.Test
      ) {
        const inputPrompt = environment === Environment.Production ? 'Resetting database in PRODUCTION environment!!!'
          : `Resetting database in the '${environment}' environment.`;
        const prompt = promptSync({ sigint: true });
        const input = prompt(`WARNING! ${inputPrompt} Type 'DESTROY IT ALL' to continue. `);
        if (input !== 'DESTROY IT ALL') {
          doReset = false;
          skip = true;
          this.logger.info('Reset cancelled');
        } else {
          this.logger.info('Resetting database in production');
        }
      } else {
        this.logger.info('Resetting database');
      }

      if (doReset) {
        startedAt = new Date();
        const resetDir = this.runDirectories.reset;
        const resetRoot = this.dirWithRoot(this.options.directories.reset || '');
        if (!resetDir) {
          this.logger.warn('The sql reset directory (defaulted to ./db/reset) must be defined for reset to work. Please review the options provided.');
        } else {
          // Date(0) because we always run all the reset sql
          await this.runSql(resetDir, resetRoot, new Date(0));

          // We need to reset the last run time because we have cleaned out the
          // database.
          await this.setLastRunTime(new Date(0));
        }
      }
      if (!this.options.watch) {
        // if Sql Watch is executed with --reset flag only then we don't want
        // to run the
        skip = true;
      }
    }
    return {
      startedAt,
      skip,
    };
  }

  private async doPreRun() {
    const preRunDir = this.runDirectories.preRun;
    if (preRunDir) {
      const preRunRoot = this.dirWithRoot(this.options.directories.preRun || '');
      // Date(0) because we always run all the pre run sql
      await this.runSql(preRunDir, preRunRoot, new Date(0));
    }
  }

  private async doRun(
    lastRunTime: Date,
    ignoreLastRunTime: boolean = false,
  ): Promise<boolean> {
    const runDir = this.runDirectories.run;
    const runRoot = this.dirWithRoot(this.options.directories.run);
    return this.runSql(runDir, runRoot, lastRunTime, ignoreLastRunTime);
  }

  private async doPostRun() {
    const postRunDir = this.runDirectories.postRun;

    if (postRunDir) {
      const postRunRoot = this.dirWithRoot(this.options.directories.postRun || '');
      // Date(0) because we always run all the post run sql
      await this.runSql(postRunDir, postRunRoot, new Date(0));
    }
  }

  private async doSeed(
    lastRunTime: Date,
    ignoreLastRunTime: boolean = false,
  ) {
    const seedDir = this.runDirectories.seed;
    const seedRoot = this.dirWithRoot(this.options.directories.seed || '');

    if (this.options.seed && seedDir) {
      await this.runSql(seedDir, seedRoot, lastRunTime, ignoreLastRunTime);
    } else if (this.options.verbose) {
      this.logger.info(`SKIPPED ${seedRoot}: all (seed option was false)`);
    }
  }

  private async setEnvironment(environment: string): Promise<void> {
    const { sql } = this;
    await sql`
      UPDATE ${sql(this.options.sqlWatchSchemaName)}.environment
      SET environment = ${environment};
      `;
  }

  private static createDir(
    root: string,
    directory: string | undefined,
  ) {
    if (directory && !existsSync(`${root}/${directory}`)) {
      mkdirSync(`${root}/${directory}`);
    }
  }

  private createDirs() {
    const root = resolve(this.options.directories.rootDirectory);
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true });
    }
    SqlWatch.createDir(root, this.options.directories.postRun);
    SqlWatch.createDir(root, this.options.directories.preRun);
    SqlWatch.createDir(root, this.options.directories.reset);
    SqlWatch.createDir(root, this.options.directories.run);
    SqlWatch.createDir(root, this.options.directories.seed);
  }

  private async init(environment: string) {
    this.createDirs();
    await this.setupSqlWatch(environment);
  }

  public async shutdown() {
    await this.sql.end({ timeout: 5 });
    if (this.watcher) {
      await this.watcher.close();
    }
  }

  /**
   * Runs all the sql script located in the directories configured in
   * options.directories based on the state of the last run time.
   * @param ignoreLastRunTime When true, sql files are not skipped base on the
   * last run time. Note that the runTests options are still honored.
   * @param fileNameChanged A non empty value means a single file was changed.
   * @returns When true, watch has been enabled and the calling program
   * should not exit (if possible). When false, the sql-watch is not watching
   * watch has not been enabled and the user can exit the program.
   */

  public async run(
    ignoreLastRunTime: boolean = false,
    fileNameChanged: string = '',
  ): Promise<boolean> {
    try {
      if (this.options.init) {
        await this.init(this.options.init);
        this.logger.info('Sql Watch successfully:');
        this.logger.info(`  * created/updated the ${this.options.sqlWatchSchemaName} schema in ${this.sqlConnection.connectionUriNoPwd}`);
        this.logger.info(`  * set the environment in ${this.options.sqlWatchSchemaName}.environment to '${await this.getEnvironment(this.sql)}'.`);
        this.logger.info(`  * created/updated required script directories in '${this.options.directories.rootDirectory}'.`);
      } else {
        const isInitialized = await this.verifyInitialized(this.sql);
        if (!isInitialized) {
          // not initialized so can't run at this time.
          await this.shutdown();
          return this.options.watch;
        }

        const lastRunTime = await this.getLastRunTime();
        let lastRunTimeIgnored = ignoreLastRunTime;

        if (this.options.directories.preRun
          && fileNameChanged.includes(this.options.directories.preRun)
        ) {
          // Something was changed in the prerun, so should re-run everything.
          lastRunTimeIgnored = true;
        }

        if (
          this.options.directories.seed
          && fileNameChanged.includes(this.options.directories.seed)
          && (this.options.seed === false)
        ) {
          this.logger.warn(`Seed file ./${fileNameChanged} was edited but seed option was file changes was not applied`);
        }

        // If reset is selected, then we always need to re-run everything.
        if (this.options.reset) {
          lastRunTimeIgnored = true;
        }

        const { startedAt, skip } = await this.doReset();
        if (!skip) {
          await this.doPreRun();
          const appliedRun = await this.doRun(lastRunTime, lastRunTimeIgnored);

          // We may have run scripts and made changes to see files when the seed
          // flag was not set. This assures that on the first run
          // (aka: fileNameChanged = ''), the seeds files are ran.
          // If there were changes in the run directory, then we also need to
          // re-run all the files in the seeds directory (if the flag is set).
          const seedLastRunTimeIgnore = (fileNameChanged === '' || appliedRun) ? true : lastRunTimeIgnored;
          await this.doSeed(lastRunTime, seedLastRunTimeIgnore);
          await this.doPostRun();
          await this.setLastRunTime(new Date());
        }

        const finishedAt = new Date();
        const finishedMessage = `Finished in ${finishedAt.getTime() - startedAt.getTime()} ms`;
        this.logger.info(finishedMessage);
      }
    } catch (err: unknown) {
      if (!(err instanceof PostgresError)) {
        const error = err as Error;
        this.logger.error(`${error.name} ${error.message}`);
        // stop running sql-watcher
        await this.shutdown();
        throw err;
      } // else error logged already. We may not want't to stop sql-watch
      // if the watch option is true.
    }

    if (this.options.init || !this.options.watch) {
      await this.shutdown();
    } else {
      this.logger.info('Waiting for changes');
    }

    return this.options.watch;
  }
}
