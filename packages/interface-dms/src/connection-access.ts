import { HTTPResult } from "@antelopejs/interface-api";
import {
  GetMetadata,
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import {
  type DecoratorTarget,
  MakeClassDecorator,
} from "@antelopejs/interface-core/decorators";

const HTTP_FORBIDDEN_STATUS = 403;

/** What a project lets the DMS do on an external connection: read its rows, or write them too. */
export type ConnectionAccess = "read" | "read-write";

/**
 * Answers the access of an external connection, or nothing for a connection the registering
 * module does not own.
 */
export type ConnectionAccessSource = (
  connection: string,
) => ConnectionAccess | undefined | Promise<ConnectionAccess | undefined>;

/**
 * @internal
 */
export namespace internal {
  export const RegisterConnectionAccessSource = new RegisteringProxy<
    (id: string, source: ConnectionAccessSource) => void
  >();
}

/**
 * Registers the module that answers the access of external connections, as dms-database does
 * from `config.externalConnections`. Call it during `construct()`, so the source answers before
 * the API serves a write. The registration is removed when the registering module is unloaded.
 *
 * @param id The source's id; a second registration under it replaces the first
 * @param source Answers each connection the module owns
 */
export function RegisterConnectionAccessSource(
  id: string,
  source: ConnectionAccessSource,
): void {
  internal.RegisterConnectionAccessSource.register(id, source);
}

/**
 * The access of an external connection: `"read-write"` when a registered source answers it and
 * none answers `"read"`, and `"read"` otherwise, with no source registered for it too. A source
 * that throws rejects the call.
 */
export const GetConnectionAccess =
  InterfaceFunction<(connection: string) => Promise<ConnectionAccess>>();

/** The external connection a data controller writes to. */
class ExternalConnectionMeta {
  public static key = Symbol();

  public connection: string | undefined;

  constructor(public readonly target: DecoratorTarget) {}

  /** A controller derived from this one writes to the same connection. */
  public inherit(parent: ExternalConnectionMeta): void {
    this.connection ??= parent.connection;
  }
}

/**
 * Marks a data controller as one that writes to the tables of an external connection, as the
 * builder does on each resource it maps. Its TableView write routes (`new`, `edit`, `delete`,
 * `archive`, `restore`) answer 403 while the connection's access is `"read"`, whichever page or
 * form posts to them.
 *
 * @param connection The connection id, as `config.externalConnections` of dms-database names it
 */
export const ExternalConnection = MakeClassDecorator(
  (target, connection: string) => {
    GetMetadata(target, ExternalConnectionMeta).connection = connection;
  },
);

/**
 * Throws a 403 when the data controller writes to an external connection whose access is
 * `"read"`; a controller not marked with {@link ExternalConnection} passes.
 *
 * @param controller The data controller's class
 */
export async function AssertConnectionWritable(
  controller: DecoratorTarget,
): Promise<void> {
  const { connection } = GetMetadata(controller, ExternalConnectionMeta);
  if (connection === undefined) {
    return;
  }
  if ((await GetConnectionAccess(connection)) !== "read-write") {
    throw new HTTPResult(
      HTTP_FORBIDDEN_STATUS,
      `Connection "${connection}" is read-only: the project allows no changes to its tables.`,
    );
  }
}
