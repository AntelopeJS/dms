/**
 * The part of `rethinkdb-ts` the probe calls, named here because its own declarations do not
 * compile with this module's `lib`: its `Cursor` lacks `Symbol.asyncDispose`, and the lib check
 * cannot be skipped.
 */
export interface RethinkdbConnection {
  close(): Promise<void>;
  on(event: "error", listener: () => void): void;
}

interface Query<Result> {
  run(connection: RethinkdbConnection): Promise<Result>;
}

interface TableQuery {
  info(): Query<unknown>;
  get(key: string): { delete(): Query<unknown> };
}

interface DatabaseQuery {
  tableList(): Query<string[]>;
  table(name: string): TableQuery;
}

export interface RethinkdbConnectOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Seconds to wait for the server. */
  timeout: number;
  silent: boolean;
}

export interface RethinkdbClient {
  r: {
    connect(options: RethinkdbConnectOptions): Promise<RethinkdbConnection>;
    db(name: string): DatabaseQuery;
    expr(value: number): Query<number>;
  };
  isRethinkDBError(error: unknown): error is Error;
}
