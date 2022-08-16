# sql-watch

A [Lerna](https://lerna.js.org/) mono repo which contains:

* [sql-watch](./packages/sql-watch/README.md) - a command line utility that enables rapid SQL development by watching and automatically running idempotent SQL script on file change.
* [sql-watch-lib](./packages/sql-watch-lib/README.md) - a library that supports rapid SQL development by watching and automatically running idempotent SQL script on file change.

## Documentation

See [sql-watch](./packages/sql-watch/README.md) for documentation.

## Development

Development requirements:

* Node + Yarn
* [Docker](https://www.docker.com/)
* MacOs (TODO: Verify development works for windows)

```bash

# init
yarn

# Provides Postgresql instance to run integration tests against
# yarn docker:up --detach
yarn docker:up

# continuously build typescript projects
yarn build:watch

# continuously run integration tests
yarn test:watch

# need to cleanup?
yarn docker:destroy
```

## Testing Philosophy

`sql-watch` works closely with Postgresql: executing sql directly in Postgresql. `sql-watch` also creates files.

It's essential, then, to test `sql-watch` and how it interacts with the operating system file system and Postgresql server (more sql flavors supported in the future). We leverage integration tests to assure feature coverage.

Instead of mocking and unit tests, we prefer integration tests monitoring for the following side effects:

1) Check for any created files
2) Check logging output
3) Check for updates to the `sql-watch` state tables: `sql_watch.environment` and `sql-watch.run`.
4) Check for expected changes to the database

Every test has a basic structure:

1) Verify the initial state of the test. For example, no file exists
2) Run the test
3) Verify the final state

That isn't to say we don't value mocking and unit tests. We leverage these tools for robustness.

## License

Licensed under [MIT](./LICENSE.md).
