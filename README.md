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

## License

Licensed under [MIT](./LICENSE.md).
