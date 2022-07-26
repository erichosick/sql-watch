/* eslint-disable no-new */

// TODO: Decouple pino from the library
import pino from 'pino';
import { SqlConnection } from '../src/index';

describe('connection options', () => {
  const logger = pino(pino.destination('/dev/null'));

  describe('unit tests', () => {
    describe('missing required arguments', () => {
      it('it should throw an error when no required options are set', () => {
        expect(() => { new SqlConnection(logger); }).toThrow('Connection missing required options: host, user, password, database. Required options can be set with environment variables or via the connection parameter');
      });
      it('it should an error when at least one option is missing', () => {
        expect(() => {
          new SqlConnection(logger, {
            host: 'host',
            user: 'user',
            password: 'password',
          });
        }).toThrow('Connection missing required options: database. Required options can be set with environment variables or via the connection parameter');
      });
    });

    describe('connection settings from parameters', () => {
      it('it should return the correct configuration when all options are set and no environment variables are provided', () => {
        const sql = new SqlConnection(logger, {
          host: 'host',
          port: 9855,
          user: 'user',
          password: 'password',
          dbname: 'database',
          schema: 'schema',
        });
        expect(sql.connectionOptions).toEqual({
          host: 'host',
          port: 9855,
          user: 'user',
          password: 'password',
          dbname: 'database',
          schema: 'schema',
        });
      });

      it('it should default port to 5432 and default schema to undefined (when no schema is provided)', () => {
        const sql = new SqlConnection(logger, {
          host: 'host',
          user: 'user',
          password: 'password',
          dbname: 'database',
        });

        expect(sql.connectionOptions).toEqual({
          host: 'host',
          port: 5432,
          user: 'user',
          password: 'password',
          dbname: 'database',
          schema: undefined,
        });
      });

      describe('connection settings from environment variables', () => {
        afterEach(() => {
          delete process.env.PGHOST;
          delete process.env.PGPORT;
          delete process.env.PGUSER;
          delete process.env.PGPASSWORD;
          delete process.env.PGDATABASE;
          delete process.env.PGSCHEMA;
        });

        it('it should use all environment variables, overriding options', () => {
          process.env.PGHOST = 'host2';
          process.env.PGPORT = '9999';
          process.env.PGUSER = 'user2';
          process.env.PGPASSWORD = 'password2';
          process.env.PGDATABASE = 'database2';
          process.env.PGSCHEMA = 'schema2';

          const sql = new SqlConnection(logger, {
            host: 'host',
            port: 9854,
            user: 'user',
            password: 'password',
            dbname: 'database',
            schema: 'schema',
          });

          expect(sql.connectionOptions).toEqual({
            host: 'host2',
            port: 9999,
            user: 'user2',
            password: 'password2',
            dbname: 'database2',
            schema: 'schema2',
          });
        });
      });

      describe('connection uri from settings', () => {
        it('it should create a uri connection from connection options with no schema', () => {
          const sql = new SqlConnection(logger, {
            host: 'host2',
            port: 9999,
            user: 'user2',
            password: 'password2',
            dbname: 'database2',
          });

          expect(sql.connectionUri).toEqual('postgresql://user2:password2@host2:9999/database2');
        });

        it('it should create a uri connection from connection options when schema is provided', () => {
          const sql = new SqlConnection(logger, {
            host: 'host3',
            port: 9998,
            user: 'user3',
            password: 'password3',
            dbname: 'database3',
            schema: 'schema3',
          });

          expect(sql.connectionUri).toEqual('postgresql://user3:password3@host3:9998/database3?search_path=schema3');
        });

        it('it should create a uri connection with password obfuscated', () => {
          const sql = new SqlConnection(logger, {
            host: 'host4',
            port: 9997,
            user: 'user4',
            password: 'password4',
            dbname: 'database4',
            schema: 'schema4',
          });

          expect(sql.connectionUriNoPwd).toEqual('postgresql://user4:*****@host4:9997/database4?search_path=schema4');
        });
      });
    });
  });

  describe('integration tests', () => {
    describe('connection is invalid', () => {
      it('it should not find the host', async () => {
        const sql = new SqlConnection(logger, {
          host: 'host',
          port: 9854,
          user: 'user',
          password: 'password',
          dbname: 'database',
          schema: 'schema',
        }).connection;
        expect(sql).toBeDefined();

        let error: Error | null = null;
        try {
          await sql`SELECT ran_at FROM sql_watch.last_run;`;
        } catch (err: unknown) {
          // Note: err instancezOf Error is false
          error = err as Error;
        }

        expect(error?.message).toEqual('getaddrinfo ENOTFOUND host');
      });
    });
  });
});
