"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlWatch = exports.WatchOptionsDefault = exports.DirectoriesDefault = exports.TestOption = exports.Environment = exports.SqlConnection = exports.loggerDefault = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const chokidar_1 = __importDefault(require("chokidar"));
const postgres_1 = __importStar(require("postgres")); // https://github.com/porsager/postgres
const prompt_sync_1 = __importDefault(require("prompt-sync"));
// TODO: Decouple pino from the library
const pino_1 = __importDefault(require("pino"));
/**
 * sql-watch uses itself to setup create the sql_watch schema used to maintain
 * state. We don't want any logging to occur at time of setup.
 * Set this to value to false if you need to debug the sql_watch schema setup
 * process.
 */
const SQL_WATCH_SCRIPT_SILENT = true;
/**
 * By default, pino logs are a json format. Example:
 * {"level":30,"msg":"APPLIED ./db/scripts/prerun/20_session-two.sql"}
 *
 * pino-pretty provides a more human friendly format:
 * INFO: APPLIED ./db/scripts/prerun/20_session-two.sql
 */
exports.loggerDefault = {
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
class SqlConnection {
    constructor(logger, connection = {}) {
        this._logger = logger;
        // Environment variables override connection options.
        const { env } = process;
        const host = env.PGHOST || (connection === null || connection === void 0 ? void 0 : connection.host);
        const port = Number(env.PGPORT) || (connection === null || connection === void 0 ? void 0 : connection.port) || 5432;
        const user = env.PGUSER || (connection === null || connection === void 0 ? void 0 : connection.user);
        const password = env.PGPASSWORD || (connection === null || connection === void 0 ? void 0 : connection.password);
        const dbname = env.PGDATABASE || (connection === null || connection === void 0 ? void 0 : connection.dbname);
        const schema = env.PGSCHEMA || (connection === null || connection === void 0 ? void 0 : connection.schema);
        if (!host || !user || !password || !dbname) {
            const missingOptions = [];
            if (!host) {
                missingOptions.push('host');
            }
            if (!user) {
                missingOptions.push('user');
            }
            if (!password) {
                missingOptions.push('password');
            }
            if (!dbname) {
                missingOptions.push('database');
            }
            const errorMessage = `Connection missing required options: ${missingOptions.join(', ')}. Required options can be set with environment variables or via the connection parameter`;
            throw Error(errorMessage);
        }
        this._connectionOptions = {
            host, port, user, password, dbname, schema,
        };
        this._connection = this.createConnection();
    }
    /**
     * Creates and returns a postgres connection.
     * @returns A postgres connection (see https://github.com/porsager/postgres)
     */
    createConnection() {
        const finalConnection = this._connectionOptions;
        // https://github.com/porsager/postgres#all-postgres-options
        return (0, postgres_1.default)(Object.assign(Object.assign({}, finalConnection), { 
            // If we get the error "UNDEFINED_VALUE: Undefined values are not allowed"
            // then it probably means we have something like
            // select * from x where y = ${ undefined }. So, we aren't going to enable
            // the transform option.
            // transform: { undefined: null },
            onnotice: (notice) => {
                var _a;
                // Let's not pollute sql-watch's output by showing postgresql messages
                // that will be common with idempotent sql such as already exists,
                // does not exist, etc.
                if (!notice.message.includes('already exists') // CREATE IF NOT EXIST ...
                    && (notice.severity !== 'INFO')
                    && (!notice.message.includes('does not exist')) // DROP IF EXISTS ...
                ) {
                    const severity = notice.severity.includes('NOTICE') ? '' : `${notice.severity}: `;
                    this._logger.info(`${severity}${notice.message}`);
                    const noticeDetails = (_a = notice.detail) === null || _a === void 0 ? void 0 : _a.split('\n');
                    if (noticeDetails) {
                        for (const noticeDetail of noticeDetails) {
                            this._logger.info(`${severity}  ${noticeDetail}`);
                        }
                    }
                }
            } }));
    }
    /**
     * Build at the query part of the uri.
     * @returns Database connection query part (what follows after ? in uri)
     */
    getConnectionParams() {
        const con = this._connectionOptions;
        return con.schema ? `?search_path=${con.schema}` : '';
    }
    /**
     * Returns the active connection to the database.
     */
    get connection() {
        return this._connection;
    }
    /**
     * Generates a uri connection which includes the password
     * @returns A postgresql uri connection of the form:
     * postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
     */
    get connectionUri() {
        const con = this._connectionOptions;
        return `postgresql://${con.user}:${con.password}@${con.host}:${con.port}/${con.dbname}${this.getConnectionParams()}`;
    }
    /**
     * Generates a uri connection without the password. Useful for logging.
     * @param connection Connection options.
     * @returns A postgresql uri connection of the form:
     * postgresql://[user[:*****]@][netloc][:port][/dbname][?param1=value1&...]
     */
    get connectionUriNoPwd() {
        const con = this._connectionOptions;
        return `postgresql://${con.user}:*****@${con.host}:${con.port}/${con.dbname}${this.getConnectionParams()}`;
    }
    /**
     * Returns final connection options
     */
    get connectionOptions() {
        return this._connectionOptions;
    }
}
exports.SqlConnection = SqlConnection;
/**
 * Supported development environments.
 */
var Environment;
(function (Environment) {
    Environment["Development"] = "development";
    Environment["Staging"] = "staging";
    Environment["Production"] = "production";
    Environment["Test"] = "test";
    Environment["Other"] = "other";
})(Environment = exports.Environment || (exports.Environment = {}));
/**
 * sql-watch test options. A file is considered a test file if it matches
 * the one or more patterns in 'WatchOptions.testExtensions'.
 */
var TestOption;
(function (TestOption) {
    /**
     * Tests are always ran.
     */
    TestOption["Always"] = "always";
    /**
     * Only tests are run. All other sql script is not run.
     */
    TestOption["Only"] = "only";
    /**
     * Tests are not run.
     */
    TestOption["Skip"] = "skip";
})(TestOption = exports.TestOption || (exports.TestOption = {}));
exports.DirectoriesDefault = {
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
exports.WatchOptionsDefault = {
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
    directories: Object.assign({}, exports.DirectoriesDefault),
    sqlWatchSchemaName: 'sql_watch',
};
/**
 * SqlWatch watches for changes to sql files: running sql files as needed when
 * changes are made.
 */
class SqlWatch {
    /**
     * Sets up SqlWatch, verifying the configuration, setting up a logger and
     * a sql connection to the database.
     * TODO: Decouple the logger from SqlWatch.
     * @param options Configuration options.
     */
    constructor(options, logger = undefined) {
        // if (options === undefined || options === null) {
        //   throw new Error('The SqlWatch parameter \'option\' was null or undefined');
        // }
        var _a, _b;
        this.isSetup = false;
        // Set up the logger
        const loggerConfig = Object.assign(Object.assign({}, exports.loggerDefault), {
            level: ((_a = options.loggerOptions) === null || _a === void 0 ? void 0 : _a.level)
                ? (_b = options.loggerOptions) === null || _b === void 0 ? void 0 : _b.level : 'info',
        });
        this.logger = logger || (0, pino_1.default)(loggerConfig);
        this.options = Object.assign(Object.assign({}, exports.WatchOptionsDefault), options);
        this.sqlConnection = new SqlConnection(this.logger, options.connection);
        const dirs = this.options.directories;
        this.runDirectories = {
            rootDirectory: dirs.rootDirectory,
            reset: dirs.reset ? (0, path_1.resolve)(this.dirWithRoot(dirs.reset)) : undefined,
            preRun: dirs.preRun ? (0, path_1.resolve)(this.dirWithRoot(dirs.preRun)) : undefined,
            run: (0, path_1.resolve)(this.dirWithRoot(dirs.run)),
            postRun: dirs.postRun ? (0, path_1.resolve)(this.dirWithRoot(dirs.postRun)) : undefined,
            seed: dirs.seed ? (0, path_1.resolve)(this.dirWithRoot(dirs.seed)) : undefined,
        };
        this.createDirs();
        this.sql = this.sqlConnection.connection;
        // Don't setup the watcher when we are initializing
        if (options.watch && !options.init) {
            this.watcher = this.setupWatcher();
        }
        else {
            this.watcher = undefined;
        }
    }
    dirWithRoot(directory) {
        return `${this.options.directories.rootDirectory}${directory}`;
    }
    /**
     * Checks if a file name should be ran based on the options.extension. If a
     * file has the extension, it is considered runnable.
     * @param filename The file name
     * @returns True if the file should be ran by sql-watch. False if the
     * file should not be run by sql-watch.
     */
    isRunnableExtension(filename) {
        for (const extension of this.options.extensions) {
            if (filename.endsWith(`${extension}`))
                return true;
        }
        return false;
    }
    isTestExtension(filename) {
        for (const extension of this.options.testExtensions) {
            if (filename.endsWith(`${extension}`))
                return true;
        }
        return false;
    }
    getFilesToRun(files) {
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
    setupWatcher() {
        this.logger.debug(`Watching ${this.options.directories.rootDirectory}`);
        const watcher = chokidar_1.default.watch(this.options.directories.rootDirectory, { persistent: true, awaitWriteFinish: true, ignoreInitial: true });
        watcher
            .on('add', (path) => __awaiter(this, void 0, void 0, function* () {
            this.logger.debug(`File ${path} has been added`);
            yield this.run(false, path);
        }))
            .on('change', (path) => __awaiter(this, void 0, void 0, function* () {
            this.logger.debug(`File ${path} has been changed`);
            yield this.run(false, path);
        }))
            .on('unlink', () => __awaiter(this, void 0, void 0, function* () {
            // removed something, so we should re-run everything. This does not
            yield this.run(true);
        }))
            .on('error', (error) => __awaiter(this, void 0, void 0, function* () {
            this.logger.debug('There was an error ', error);
            // NOTE: User is already notified of the error
        }));
        return watcher;
    }
    // TODO: Refactor this a bit
    // Try our best to show where the error is
    logPostgreSqlError(file, error) {
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
                }
                else {
                    this.logger.info(`${numLines[line]}`);
                }
            }
        }
        else if (errorLineNumber > 0) {
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
    applyOnFile(fileName) {
        return __awaiter(this, void 0, void 0, function* () {
            // await this.sql.begin(async () => {
            yield this.sql.file(fileName)
                .catch((err) => {
                if (err instanceof postgres_1.PostgresError) {
                    this.logPostgreSqlError(fileName, err);
                }
                // rethrow the error so we don't try to run anymore files.
                throw err;
            });
            // }).catch((err: unknown) => {
            //   throw err;
            // });
        });
    }
    setupSqlWatch(environment) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isSetup) {
                try {
                    // Setup schema that Sql Watch requires using itself. We use __dirname
                    // because the sql files are located within the installation (the library)
                    // itself
                    this.logger.debug(`Running Sql Watch setup. ${process.cwd()} ${__dirname}`);
                    yield this.runSql(`${__dirname}/db/scripts/run`, './db/scripts/run', new Date(0), true, SQL_WATCH_SCRIPT_SILENT);
                    yield this.setEnvironment(environment);
                }
                catch (err) {
                    if (err instanceof Error) {
                        const error = err;
                        this.logger.error(`${error.name} ${error.message}`);
                    }
                }
                finally {
                    this.isSetup = true;
                }
            }
        });
    }
    getLastRunTime() {
        return __awaiter(this, void 0, void 0, function* () {
            const { sql } = this;
            try {
                const ranAt = yield sql `SELECT ran_at FROM ${sql(this.options.sqlWatchSchemaName)}.last_run;`;
                // If ranAt result was empty, then it means that this is the first time
                // anything was ran successfully, so we set that last run time to "0".
                return ranAt.length === 0 ? new Date(0) : ranAt[0].ran_at;
            }
            catch (err) {
                if (err instanceof postgres_1.PostgresError) {
                    this.logPostgreSqlError('', err);
                }
                throw err;
            }
        });
    }
    verifyInitialized(sql) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield sql `SELECT environment FROM ${sql(this.options.sqlWatchSchemaName)}.environment`;
            }
            catch (err) {
                if (err instanceof postgres_1.PostgresError && err.code === '42P01') {
                    this.logger.error(`SqlWatch has not been initialized. Did you set the init option? If you feel this is in error please check and verify that the ${this.options.sqlWatchSchemaName}.environment table exists and has a valid environment entry`);
                    return false;
                }
                // Have no idea why there was an error so we need to re-throw it.
                throw err;
            }
            return true;
        });
    }
    getEnvironment(sql) {
        return __awaiter(this, void 0, void 0, function* () {
            const environment = yield sql `SELECT environment FROM ${sql(this.options.sqlWatchSchemaName)}.environment`;
            if (environment.length === 0) {
                this.logger.warn(`${this.options.sqlWatchSchemaName}.environment had no records when it should contain at least one record. Defaulting environment setting to production`);
                return Environment.Production;
            }
            return environment[0].environment;
        });
    }
    getRunMetaData() {
        return __awaiter(this, void 0, void 0, function* () {
            return {
                username: process.env.USER || process.env.LOGNAME || process.env.npm_package_author_name || 'unknown',
                email: process.env.npm_config_email || process.env.npm_package_author_email || 'unknown',
                node_environment: process.env.NODE_ENV || 'not set',
                environment: yield this.getEnvironment(this.sql),
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
        });
    }
    setLastRunTime(ranAt) {
        return __awaiter(this, void 0, void 0, function* () {
            const { sql } = this;
            const metaData = sql.json(yield this.getRunMetaData());
            yield sql `
      INSERT INTO ${sql(this.options.sqlWatchSchemaName)}.run(ran_at, meta_data)
      VALUES (${ranAt}, ${metaData});
    `;
        });
    }
    runSql(resolvedDir, directory, lastRunTime, ignoreLastRunTime = false, silent = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const applied = false;
            if (!silent) {
                this.logger.debug(`Running ${ignoreLastRunTime ? 'all ' : ''}sql in directory ${resolvedDir}`);
            }
            const files = (0, fs_1.readdirSync)(resolvedDir).sort();
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
                const file = (0, path_1.resolve)(resolvedDir, filename);
                const stat = (0, fs_1.statSync)(file);
                const fileDate = new Date(stat.mtime);
                if (!startMigrating && fileDate >= lastRunTime) {
                    startMigrating = true;
                }
                if (startMigrating || ignoreLastRunTime) {
                    // eslint-disable-next-line no-await-in-loop
                    yield this.applyOnFile(file);
                    if (!silent) {
                        this.logger.info(`APPLIED ${directory}/${filename}`);
                    }
                }
                else if (!silent && this.options.verbose) {
                    this.logger.info(`SKIPPED ${directory}/${filename}`);
                }
            }
            return applied;
        });
    }
    doReset() {
        return __awaiter(this, void 0, void 0, function* () {
            let startedAt = new Date();
            let skip = false;
            if (this.options.reset) {
                let doReset = true;
                const environment = yield this.getEnvironment(this.sql);
                // We really want to make sure that the developer has explicitly set the
                // environment to a "non production" environment. So, we check for each
                // of these known environments instead of just checking for
                // environment === Environment.Production.
                if (environment !== Environment.Development
                    && environment !== Environment.Staging
                    && environment !== Environment.Other
                    && environment !== Environment.Test) {
                    const inputPrompt = environment === Environment.Production ? 'Resetting database in PRODUCTION environment!!!'
                        : `Resetting database in the '${environment}' environment.`;
                    const prompt = (0, prompt_sync_1.default)({ sigint: true });
                    const input = prompt(`WARNING! ${inputPrompt} Type 'DESTROY IT ALL' to continue. `);
                    if (input !== 'DESTROY IT ALL') {
                        doReset = false;
                        skip = true;
                        this.logger.info('Reset cancelled');
                    }
                    else {
                        this.logger.info('Resetting database in production');
                    }
                }
                else {
                    this.logger.info('Resetting database');
                }
                if (doReset) {
                    startedAt = new Date();
                    const resetDir = this.runDirectories.reset;
                    const resetRoot = this.dirWithRoot(this.options.directories.reset || '');
                    if (!resetDir) {
                        this.logger.warn('The sql reset directory (defaulted to ./db/reset) must be defined for reset to work. Please review the options provided.');
                    }
                    else {
                        // Date(0) because we always run all the reset sql
                        yield this.runSql(resetDir, resetRoot, new Date(0));
                        // We need to reset the last run time because we have cleaned out the
                        // database.
                        yield this.setLastRunTime(new Date(0));
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
        });
    }
    doPreRun() {
        return __awaiter(this, void 0, void 0, function* () {
            const preRunDir = this.runDirectories.preRun;
            if (preRunDir) {
                const preRunRoot = this.dirWithRoot(this.options.directories.preRun || '');
                // Date(0) because we always run all the pre run sql
                yield this.runSql(preRunDir, preRunRoot, new Date(0));
            }
        });
    }
    doRun(lastRunTime, ignoreLastRunTime = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const runDir = this.runDirectories.run;
            if (!runDir) {
                this.logger.warn('The Sql Watch directory (defaulted to ./db/run) must be provided within the options.');
            }
            else {
                const runRoot = this.dirWithRoot(this.options.directories.run);
                return yield this.runSql(runDir, runRoot, lastRunTime, ignoreLastRunTime);
            }
            return false;
        });
    }
    doPostRun() {
        return __awaiter(this, void 0, void 0, function* () {
            const postRunDir = this.runDirectories.postRun;
            if (postRunDir) {
                const postRunRoot = this.dirWithRoot(this.options.directories.postRun || '');
                // Date(0) because we always run all the post run sql
                yield this.runSql(postRunDir, postRunRoot, new Date(0));
            }
        });
    }
    doSeed(lastRunTime, ignoreLastRunTime = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const seedDir = this.runDirectories.seed;
            const seedRoot = this.dirWithRoot(this.options.directories.seed || '');
            if (this.options.seed && seedDir) {
                yield this.runSql(seedDir, seedRoot, lastRunTime, ignoreLastRunTime);
            }
            else if (this.options.verbose) {
                this.logger.info(`SKIPPED ${seedRoot}: all (seed option was false)`);
            }
        });
    }
    setEnvironment(environment) {
        return __awaiter(this, void 0, void 0, function* () {
            const { sql } = this;
            yield sql `
      UPDATE ${sql(this.options.sqlWatchSchemaName)}.environment
      SET environment = ${environment};
      `;
        });
    }
    static createDir(root, directory) {
        if (directory && !(0, fs_1.existsSync)(`${root}/${directory}`)) {
            (0, fs_1.mkdirSync)(`${root}/${directory}`);
        }
    }
    createDirs() {
        const root = (0, path_1.resolve)(this.options.directories.rootDirectory);
        if (!(0, fs_1.existsSync)(root)) {
            (0, fs_1.mkdirSync)(root, { recursive: true });
        }
        SqlWatch.createDir(root, this.options.directories.postRun);
        SqlWatch.createDir(root, this.options.directories.preRun);
        SqlWatch.createDir(root, this.options.directories.reset);
        SqlWatch.createDir(root, this.options.directories.run);
        SqlWatch.createDir(root, this.options.directories.seed);
    }
    init(environment) {
        return __awaiter(this, void 0, void 0, function* () {
            this.createDirs();
            yield this.setupSqlWatch(environment);
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sql.end({ timeout: 5 });
            if (this.watcher) {
                yield this.watcher.close();
            }
        });
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
    run(ignoreLastRunTime = false, fileNameChanged = '') {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.options.init) {
                    yield this.init(this.options.init);
                    this.logger.info('Sql Watch successfully:');
                    this.logger.info(`  * created/updated the ${this.options.sqlWatchSchemaName} schema in ${this.sqlConnection.connectionUriNoPwd}`);
                    this.logger.info(`  * set the environment in ${this.options.sqlWatchSchemaName}.environment to '${yield this.getEnvironment(this.sql)}'.`);
                    this.logger.info(`  * created/updated required script directories in '${this.options.directories.rootDirectory}'.`);
                }
                else {
                    const isInitialized = yield this.verifyInitialized(this.sql);
                    if (!isInitialized) {
                        // not initialized so can't run at this time.
                        yield this.shutdown();
                        return this.options.watch;
                    }
                    const lastRunTime = yield this.getLastRunTime();
                    let lastRunTimeIgnored = ignoreLastRunTime;
                    if (this.options.directories.preRun
                        && fileNameChanged.includes(this.options.directories.preRun)) {
                        // Something was changed in the prerun, so should re-run everything.
                        lastRunTimeIgnored = true;
                    }
                    if (this.options.directories.seed
                        && fileNameChanged.includes(this.options.directories.seed)
                        && (this.options.seed === false)) {
                        this.logger.warn(`Seed file ./${fileNameChanged} was edited but seed option was file changes was not applied`);
                    }
                    // If reset is selected, then we always need to re-run everything.
                    if (this.options.reset) {
                        lastRunTimeIgnored = true;
                    }
                    const { startedAt, skip } = yield this.doReset();
                    if (!skip) {
                        yield this.doPreRun();
                        const appliedRun = yield this.doRun(lastRunTime, lastRunTimeIgnored);
                        // We may have run scripts and made changes to see files when the seed
                        // flag was not set. This assures that on the first run
                        // (aka: fileNameChanged = ''), the seeds files are ran.
                        // If there were changes in the run directory, then we also need to
                        // re-run all the files in the seeds directory (if the flag is set).
                        const seedLastRunTimeIgnore = (fileNameChanged === '' || appliedRun) ? true : lastRunTimeIgnored;
                        yield this.doSeed(lastRunTime, seedLastRunTimeIgnore);
                        yield this.doPostRun();
                        yield this.setLastRunTime(new Date());
                    }
                    const finishedAt = new Date();
                    const finishedMessage = `Finished in ${finishedAt.getTime() - startedAt.getTime()} ms`;
                    this.logger.info(finishedMessage);
                }
            }
            catch (err) {
                if (!(err instanceof postgres_1.PostgresError)) {
                    const error = err;
                    this.logger.error(`${error.name} ${error.message}`);
                    // stop running sql-watcher
                    yield this.shutdown();
                    throw err;
                } // else error logged already. We may not want't to stop sql-watch
                // if the watch option is true.
            }
            if (this.options.init || !this.options.watch) {
                yield this.shutdown();
            }
            else {
                this.logger.info('Waiting for changes');
            }
            return this.options.watch;
        });
    }
}
exports.SqlWatch = SqlWatch;
