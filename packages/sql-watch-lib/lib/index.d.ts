import postgres from 'postgres';
import { Logger } from 'pino';
export interface LoggerOptions {
    /** Log level. This value may be different based on the logging library
     * used
     */
    level: string;
}
/**
 * By default, pino logs are a json format. Example:
 * {"level":30,"msg":"APPLIED ./db/scripts/prerun/20_session-two.sql"}
 *
 * pino-pretty provides a more human friendly format:
 * INFO: APPLIED ./db/scripts/prerun/20_session-two.sql
 */
export declare const loggerDefault: {
    level: string;
    transport: {
        target: string;
    };
    base: {
        pid: undefined;
        hostname: undefined;
    };
    timestamp: boolean;
};
/**
 * Ssh connection options.
 */
export interface SshConnection {
    /** The ssh host for the ssh connection. Example: localhost. */
    host: string;
    /** The ssh port for the ssh connection. Example: 22. */
    port: number;
    /** The ssh user for the connection */
    user: string;
    /** The ssh private key path for the ssh connection */
    privateKeyPath: string;
    /** The ssh private key for the ssh connection */
    privateKey?: string;
}
/**
 * Connection options. These options are based on the conventions described in
 * https://www.postgresql.org/docs/current/libpq-envars.html
 */
export interface Connection {
    /** The host for the connection. Example: localhost. The PGHOST environment
     * variable overrides this value.
      */
    host: string;
    /** The port for the connection. Defaults to 5432. The PGPORT environment
     * variable overrides this value.
     */
    port: number;
    /** The username for the connection. The PGUSER environment variable overrides
     *  this value.
    */
    user: string;
    /** A password for the connection. The PGPASSWORD environment variable
     * overrides this value.
     */
    password: string;
    /** The database name of the connection. The PGDATABASE environment variable
     * overrides this value.
     */
    dbname: string;
    /** An optional schema to default to in the database. The PGSCHEMA environment
     * variable overrides this value. Note: At the time of writing this code,
     * PGSCHEMA was not an official postgresql environment variable.
     */
    schema?: string | undefined;
    /** An optional setting for an ssh connection  */
    ssh?: SshConnection;
    /** FUTURE FEATURE: Add options and ssl configuration */
    socket?: any | undefined;
}
export declare class SqlConnection {
    private _connectionOptions;
    private _connection;
    private _logger;
    constructor(logger: Logger, connection?: Partial<Connection>);
    /**
     * Creates and returns a postgres connection.
     * @returns A postgres connection (see https://github.com/porsager/postgres)
     */
    private createConnection;
    /**
     * Build at the query part of the uri.
     * @returns Database connection query part (what follows after ? in uri)
     */
    private getConnectionParams;
    /**
     * Returns the active connection to the database.
     */
    get connection(): postgres.Sql<{}>;
    /**
     * Generates a uri connection which includes the password
     * @returns A postgresql uri connection of the form:
     * postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
     */
    get connectionUri(): string;
    /**
     * Generates a uri connection without the password. Useful for logging.
     * @param connection Connection options.
     * @returns A postgresql uri connection of the form:
     * postgresql://[user[:*****]@][netloc][:port][/dbname][?param1=value1&...]
     */
    get connectionUriNoPwd(): string;
    /**
     * Returns final connection options
     */
    get connectionOptions(): Connection;
}
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
export declare enum Environment {
    Development = "development",
    Staging = "staging",
    Production = "production",
    Test = "test",
    Other = "other"
}
/**
 * sql-watch test options. A file is considered a test file if it matches
 * the one or more patterns in 'WatchOptions.testExtensions'.
 */
export declare enum TestOption {
    /**
     * Tests are always ran.
     */
    Always = "always",
    /**
     * Only tests are run. All other sql script is not run.
     */
    Only = "only",
    /**
     * Tests are not run.
     */
    Skip = "skip"
}
export interface ISqlWatch {
    run(ignoreLastRunTime: boolean, fileNameChanged: string): Promise<boolean>;
    doReset(): Promise<{
        startedAt: Date;
        skip: boolean;
    }>;
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
export declare const DirectoriesDefault: {
    rootDirectory: string;
    run: string;
    preRun: string;
    postRun: string;
    reset: string;
    seed: string;
};
/**
 * Default sql-watch options.
 */
export declare const WatchOptionsDefault: {
    reset: boolean;
    watch: boolean;
    bypass: boolean;
    alwaysRun: boolean;
    loggerOptions: {
        level: string;
    };
    verbose: boolean;
    seed: boolean;
    runTests: TestOption;
    extensions: string[];
    testExtensions: string[];
    directories: {
        rootDirectory: string;
        run: string;
        preRun: string;
        postRun: string;
        reset: string;
        seed: string;
    };
    sqlWatchSchemaName: string;
};
/**
 * SqlWatch watches for changes to sql files: running sql files as needed when
 * changes are made.
 */
export declare class SqlWatch implements ISqlWatch {
    private isSetup;
    private logger;
    private options;
    private sqlConnection;
    private runDirectories;
    private sql;
    private watcher;
    private dirWithRoot;
    /**
     * Sets up SqlWatch, verifying the configuration, setting up a logger and
     * a sql connection to the database.
     * TODO: Decouple the logger from SqlWatch.
     * @param options Configuration options.
     */
    constructor(options: WatchOptionsPartial, logger?: Logger | undefined);
    getSql(): postgres.Sql<{}>;
    /**
     * Checks if a file name should be ran based on the options.extension. If a
     * file has the extension, it is considered runnable.
     * @param filename The file name
     * @returns True if the file should be ran by sql-watch. False if the
     * file should not be run by sql-watch.
     */
    private isRunnableExtension;
    private isTestExtension;
    private getFilesToRun;
    private setupWatcher;
    private logPostgreSqlError;
    /**
     * Runs sql located in file on database
     * @param fileName Name of the file which contains sql script that the postgres
     * library will run on the database server.
     */
    private applyOnFile;
    private setupSqlWatch;
    private getLastRunTime;
    verifyInitialized(sql: postgres.Sql<{}>): Promise<boolean>;
    getEnvironment(sql: postgres.Sql<{}>): Promise<Environment>;
    private getRunMetaData;
    private setLastRunTime;
    private runSql;
    doReset(): Promise<{
        startedAt: Date;
        skip: boolean;
    }>;
    private doPreRun;
    private doRun;
    private doPostRun;
    private doSeed;
    private setEnvironment;
    private static createDir;
    private createDirs;
    private init;
    shutdown(): Promise<void>;
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
    run(ignoreLastRunTime?: boolean, fileNameChanged?: string): Promise<boolean>;
}
