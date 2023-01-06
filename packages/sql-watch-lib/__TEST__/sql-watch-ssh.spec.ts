/* eslint-disable no-new */

import { rmSync, existsSync } from 'fs';

import {
  SqlWatch, DirectoriesDefault, Connection,
} from '../src/index';

const testConnection: Connection = {
  dbname: 'postgres',
  user: 'postgres',
  host: 'localhost',
  port: 5477,

  ssh: undefined,

  // committing to git because this is only for local testing
  password: 'localpassword',
};

const sqlWatchSchemaName = 'sql_watch_test';

describe('integration tests', () => {
  afterEach(() => {
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.PGDATABASE;
    delete process.env.PGSCHEMA;

    delete process.env.SSH_HOST;
    delete process.env.SSH_PORT;
    delete process.env.SSH_USER;
    delete process.env.SSH_PRIVATE_KEY_PATH;
  });

  const testRootDirectory = './test_unit_01';

  if (existsSync(testRootDirectory)) {
    rmSync(testRootDirectory, { recursive: true });
  }

  it('SqlWatch should throw an when ssh options are incomplete', () => {
    process.env.SSH_HOST = 'host2';

    expect(() => {
      new SqlWatch({
        connection: testConnection,
        directories: {
          ...DirectoriesDefault,
          ...{ rootDirectory: testRootDirectory },
        },
        sqlWatchSchemaName,
      });
    }).toThrow('When the ssh option is set, then the following options are also required: ssh port, ssh user, ssh private key path. Required ssh options can be set with environment variables or via the connection parameter');
  });

  it('SqlWatch should throw an error when the ssh private key file is not found', () => {
    process.env.SSH_HOST = 'host2';
    process.env.SSH_PORT = '22';
    process.env.SSH_USER = 'someUser';
    process.env.SSH_PRIVATE_KEY_PATH = 'no_such_file';

    expect(() => {
      new SqlWatch({
        connection: testConnection,
        directories: {
          ...DirectoriesDefault,
          ...{ rootDirectory: testRootDirectory },
        },
        sqlWatchSchemaName,
      });
    }).toThrow('ENOENT: no such file or directory, open \'no_such_file\'');
  });
});

describe('ssh tests', () => {
  const testRootDirectory = './test_unit_01';

  afterEach(() => {
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.PGDATABASE;
    delete process.env.PGSCHEMA;

    delete process.env.SSH_HOST;
    delete process.env.SSH_PORT;
    delete process.env.SSH_USER;
    delete process.env.SSH_PRIVATE_KEY_PATH;
  });

  // TODO TEST: Setup a test bastion host that we can connect to via ssh
  // and run this test against that bastion host.
  it.skip('SqlWatch should support connecting to a database via ssh tunnel', async () => {
    process.env.SSH_HOST = '{host}';
    process.env.SSH_PORT = '22';
    process.env.SSH_USER = 'ubuntu';
    process.env.SSH_PRIVATE_KEY_PATH = '{path}';

    process.env.PGHOST = '{host}';
    process.env.PGPORT = '5432';
    process.env.PGUSER = 'postgres';
    process.env.PGPASSWORD = '{password}';
    process.env.PGDATABASE = 'postgres';

    const sqlWatch = new SqlWatch({
      connection: testConnection,
      directories: {
        ...DirectoriesDefault,
        ...{ rootDirectory: testRootDirectory },
      },
      sqlWatchSchemaName,
    });
    const sql = sqlWatch.getSql();
    const result = await sql`SELECT 1 as one`;
    expect(result[0].one).toBe(1);
    await sqlWatch.shutdown();
  }, 20000);
});
