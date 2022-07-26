#!/usr/bin/env node
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
const commander_1 = __importDefault(require("commander"));
const sql_watch_lib_1 = require("sql-watch-lib");
const jsonPackage = __importStar(require("../package.json"));
(() => __awaiter(void 0, void 0, void 0, function* () {
    const program = new commander_1.default.Command();
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
    const sqlWatch = new sql_watch_lib_1.SqlWatch(options);
    try {
        const watching = yield sqlWatch.run();
        if (!watching) {
            process.exit(0);
        } // else we shouldn't exit the process and letter the watcher
    }
    catch (err) {
        // if we are here, then a major error occurred like bad code
        const error = err;
        // eslint-disable-next-line no-console
        console.log(error.stack || '');
        process.exit(1);
    }
}))();
