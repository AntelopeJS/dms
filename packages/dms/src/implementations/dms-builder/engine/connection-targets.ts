import type {
  ConfigValue,
  DatabaseEngine,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { localPackageName } from "./dms-database";
import { hasUnreadableMember } from "./literal-overrides";
import { propertyKey } from "./modules";
import { MODULES, stringOf } from "./project-config";
import { readableConfig, writtenModules } from "./project-config-readers";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./plain-object";

/**
 * A driver option that takes a connection target (`true`), or an object the driver hands its
 * client, by the members of it that do.
 */
interface TargetFields {
  readonly [option: string]: true | TargetFields;
}

interface Driver {
  engine: DatabaseEngine;
  package: string;
  targets: TargetFields;
}

/** The option every driver reads its whole connection target from, and the one `env` supplies. */
const URL_OPTION = "url";

const RETHINKDB_SERVER: TargetFields = {
  server: true,
  host: true,
  port: true,
  user: true,
  password: true,
};

/**
 * Where each driver's config takes a server or an account, from the driver's own `SetOptions` and
 * the client it builds: `url` for each, and the members of the client options it passes on.
 * `@antelopejs/postgres` spreads `pool` over `{ connectionString: url }`, so its `connectionString`
 * wins over the URL, which pg parses over any `host`, `port`, `user` or `password` beside it;
 * `@antelopejs/mysql` passes `pool` with `uri: url`, and mysql2 keeps each member set beside
 * `uri`; `@antelopejs/mongodb` passes `options` to `MongoClient`, which routes through its proxy,
 * signs in with its credentials or client certificate, and resolves SRV records by its service
 * name; `@antelopejs/rethinkdb` connects with `pool` (its `servers` before any host) or, with
 * neither `url` nor `pool`, with `connection`. Members match whatever their case, as MongoDB reads
 * its options.
 */
const DRIVER_TABLE = {
  postgres: {
    engine: "postgres",
    package: "@antelopejs/postgres",
    targets: { [URL_OPTION]: true, pool: { connectionString: true } },
  },
  mysql: {
    engine: "mysql",
    package: "@antelopejs/mysql",
    targets: {
      [URL_OPTION]: true,
      pool: {
        host: true,
        port: true,
        socketPath: true,
        user: true,
        password: true,
        password1: true,
        password2: true,
        password3: true,
        passwordSha1: true,
      },
    },
  },
  mongodb: {
    engine: "mongodb",
    package: "@antelopejs/mongodb",
    targets: {
      [URL_OPTION]: true,
      options: {
        auth: true,
        authMechanism: true,
        authMechanismProperties: true,
        authSource: true,
        tlsCertificateKeyFile: true,
        tlsCertificateKeyFilePassword: true,
        cert: true,
        key: true,
        pfx: true,
        passphrase: true,
        proxyHost: true,
        proxyPort: true,
        proxyUsername: true,
        proxyPassword: true,
        srvServiceName: true,
        autoEncryption: true,
      },
    },
  },
  rethinkdb: {
    engine: "rethinkdb",
    package: "@antelopejs/rethinkdb",
    targets: {
      [URL_OPTION]: true,
      pool: { ...RETHINKDB_SERVER, servers: true },
      connection: RETHINKDB_SERVER,
    },
  },
} satisfies Record<DatabaseEngine, Driver>;

const DRIVERS: readonly Driver[] = Object.values(DRIVER_TABLE);

const UNKNOWN = "unknown";

/** What a module is: one of the drivers, `UNKNOWN` when its entry or source cannot be read, or nothing. */
type Identity = Driver | typeof UNKNOWN | undefined;

/** The drivers a module may be, or `UNKNOWN`: every driver, since nothing tells which. */
type Candidates = readonly Driver[] | typeof UNKNOWN;

const SOURCE_FIELDS: ReadonlySet<string> = new Set(["type", "package", "path"]);
const READ_SOURCE_TYPES: ReadonlySet<string> = new Set(["package", "local"]);

type SourceFields = Partial<Record<string, string>>;

function driverNamed(name: string | undefined): Driver | undefined {
  return DRIVERS.find((driver) => driver.package === name);
}

/**
 * The driver a source names: by its package, or by the `package.json` of its local folder. A
 * source of another type, such as `git`, names no package the builder can read, so it may be one.
 */
function sourceDriver(fields: SourceFields): Identity {
  if (fields.package !== undefined) {
    return driverNamed(fields.package);
  }
  if (fields.type === "local" && fields.path !== undefined) {
    return driverNamed(localPackageName(fields.path));
  }
  return fields.type === undefined || READ_SOURCE_TYPES.has(fields.type)
    ? undefined
    : UNKNOWN;
}

/** A step's `source`, as JSON: `UNKNOWN` when its type, package or path is not a string. */
function stepSourceDriver(source: ConfigValue): Identity {
  if (source === undefined) {
    return undefined;
  }
  if (!isPlainObject(source)) {
    return UNKNOWN;
  }
  const fields: SourceFields = {};
  for (const name of SOURCE_FIELDS) {
    const value = source[name];
    if (value !== undefined && !isString(value)) {
      return UNKNOWN;
    }
    fields[name] = value;
  }
  return sourceDriver(fields);
}

/**
 * The last member of an object literal named `name`: its initializer, `UNKNOWN` when it is a
 * shorthand whose value the builder cannot read, or nothing when no member has that name.
 */
function memberNamed(
  owner: ObjectLiteralExpression,
  name: string,
): Node | typeof UNKNOWN | undefined {
  const member = owner
    .getProperties()
    .findLast((property) =>
      Node.isPropertyAssignment(property)
        ? propertyKey(property.getNameNode()) === name
        : Node.isShorthandPropertyAssignment(property) &&
          property.getName() === name,
    );
  if (member === undefined) {
    return undefined;
  }
  return Node.isPropertyAssignment(member) ? member.getInitializer() : UNKNOWN;
}

/** A written `source`, which must spell its type, package and path as string literals to be read. */
function writtenSourceDriver(source: Node | typeof UNKNOWN): Identity {
  if (
    source === UNKNOWN ||
    !Node.isObjectLiteralExpression(source) ||
    hasUnreadableMember(source)
  ) {
    return UNKNOWN;
  }
  const fields: SourceFields = {};
  for (const name of SOURCE_FIELDS) {
    const member = memberNamed(source, name);
    if (member === undefined) {
      continue;
    }
    const value = member === UNKNOWN ? undefined : stringOf(member);
    if (value === undefined) {
      return UNKNOWN;
    }
    fields[name] = value;
  }
  return sourceDriver(fields);
}

/** The driver an entry of `antelope.config.ts` is, by its version string's id or its `source`. */
function writtenDriver(id: string, entry: Node | undefined): Identity {
  if (stringOf(entry) !== undefined) {
    return driverNamed(id);
  }
  if (!Node.isObjectLiteralExpression(entry) || hasUnreadableMember(entry)) {
    return UNKNOWN;
  }
  const source = memberNamed(entry, "source");
  return source === undefined ? undefined : writtenSourceDriver(source);
}

/**
 * The drivers each module a batch configures may be: the one its id, the configuration or a step
 * of the batch names as its source, or every driver when one of them cannot be read.
 */
function driversByModule(
  steps: readonly ProjectConfigStep[],
  written: ReadonlyMap<string, Node | undefined> | undefined,
): Map<string, Candidates> {
  const candidates = new Map<string, Candidates>();
  for (const step of steps) {
    if (step.op === "RemoveModule" || step.op === "RemoveConnection") {
      continue;
    }
    const before = candidates.get(step.id) ?? [];
    const named: Identity[] = [
      driverNamed(step.id),
      stepSourceDriver(step.entry?.source),
      written === undefined ? UNKNOWN : undefined,
      written?.has(step.id)
        ? writtenDriver(step.id, written.get(step.id))
        : undefined,
    ];
    if (before === UNKNOWN || named.includes(UNKNOWN)) {
      candidates.set(step.id, UNKNOWN);
      continue;
    }
    const drivers = named.filter(
      (driver): driver is Driver => driver !== undefined && driver !== UNKNOWN,
    );
    candidates.set(step.id, [...new Set([...before, ...drivers])]);
  }
  return candidates;
}

/** The field `fields` holds for a member named `key`, whatever the case of either. */
function fieldFor(
  fields: TargetFields,
  key: string,
): true | TargetFields | undefined {
  const wanted = key.toLowerCase();
  return Object.entries(fields).find(
    ([name]) => name.toLowerCase() === wanted,
  )?.[1];
}

/** The paths below `path` where `value` writes a connection target `fields` names. */
function writtenTargets(
  path: string,
  value: ConfigValue,
  fields: TargetFields,
): string[] {
  if (!isPlainObject(value)) {
    return [path];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const field = fieldFor(fields, key);
    if (field === undefined) {
      return [];
    }
    return field === true
      ? [`${path}.${key}`]
      : writtenTargets(`${path}.${key}`, child, field);
  });
}

/**
 * The paths below `path` where a config written in `antelope.config.ts` holds a connection target
 * `fields` names; an object the builder cannot read, or a value that is not one, may hold any.
 */
function heldTargets(
  path: string,
  node: Node | typeof UNKNOWN,
  fields: TargetFields,
): string[] {
  if (
    node === UNKNOWN ||
    !Node.isObjectLiteralExpression(node) ||
    hasUnreadableMember(node)
  ) {
    return [path];
  }
  return node.getProperties().flatMap((property) => {
    const key = Node.isPropertyAssignment(property)
      ? propertyKey(property.getNameNode())
      : Node.isShorthandPropertyAssignment(property)
        ? property.getName()
        : "";
    const field = fieldFor(fields, key);
    if (field === undefined) {
      return [];
    }
    if (field === true) {
      return [`${path}.${key}`];
    }
    const value = Node.isPropertyAssignment(property)
      ? (property.getInitializer() ?? UNKNOWN)
      : UNKNOWN;
    return heldTargets(`${path}.${key}`, value, field);
  });
}

/**
 * The connection target a module's written config already holds when a step names a driver as its
 * source: a literal written before the module was a driver, which the source would hand it.
 */
function heldBySourcedEntry(
  step: ProjectConfigStep,
  written: ReadonlyMap<string, Node | undefined> | undefined,
): string | undefined {
  if (step.op === "RemoveModule" || step.op === "RemoveConnection") {
    return undefined;
  }
  const named = stepSourceDriver(step.entry?.source);
  const entry = written?.get(step.id);
  if (named === undefined || !Node.isObjectLiteralExpression(entry)) {
    return undefined;
  }
  const config = memberNamed(entry, "config");
  if (config === undefined) {
    return undefined;
  }
  for (const driver of named === UNKNOWN ? DRIVERS : [named]) {
    const [held] = heldTargets(
      `${MODULES}.${step.id}.config`,
      config,
      driver.targets,
    );
    if (held !== undefined) {
      return `refused to give \`${MODULES}.${step.id}\` the source of a database driver: its config already holds \`${held}\`, where ${named === UNKNOWN ? "a driver" : `the ${driver.engine} driver ${driver.package}`} reads the database it connects to, and an agent never hands a database's URL, host, account or password to a driver. Remove it, or have the person map it with \`env: { ${URL_OPTION}: "<VARIABLE>" }\`, first.`;
    }
  }
  return undefined;
}

function literalTargetMessage(
  path: string,
  driver: Driver | undefined,
): string {
  const reader = driver
    ? `it is where the ${driver.engine} driver ${driver.package} reads the database it connects to`
    : "the builder cannot read this module's source, so it may be a database driver, and a driver reads the database it connects to there";
  return `refused to write \`${path}\`: ${reader}, and an agent never writes a database's URL, host, account or password into a configuration. Map the variable that holds the URL instead, with \`env: { ${URL_OPTION}: "<VARIABLE>" }\` on the step, and leave its value to the person, in the project's .env or the assistant's connect step (dms-assistant's \`POST /database/project\`).`;
}

/**
 * Why an agent's configuration steps are refused because one writes a database driver's
 * connection target as a literal: any value, at any member a driver reads a server or an account
 * from, in the config of a module the batch, its id or `antelope.config.ts` names as that driver,
 * or of a module whose entry or source the builder cannot read. A database address reaches a
 * driver only as the name of a variable, in `env`. Every MCP tool that writes project or module
 * configuration calls this first; the builder interface does not, since the owner's connect step
 * writes the URL the owner typed through it.
 */
export function literalTargetRefusal(
  steps: readonly ProjectConfigStep[],
): string | undefined {
  const draft = readableConfig();
  const written = draft ? new Map(writtenModules(draft)) : undefined;
  const candidates = driversByModule(steps, written);
  for (const step of steps) {
    const held = heldBySourcedEntry(step, written);
    if (held !== undefined) {
      return held;
    }
    if (step.op === "RemoveModule" || step.op === "RemoveConnection") {
      continue;
    }
    const config = step.entry?.config;
    const drivers = candidates.get(step.id) ?? [];
    if (config === undefined) {
      continue;
    }
    for (const driver of drivers === UNKNOWN ? DRIVERS : drivers) {
      const [target] = writtenTargets(
        `${MODULES}.${step.id}.config`,
        config,
        driver.targets,
      );
      if (target !== undefined) {
        return literalTargetMessage(
          target,
          drivers === UNKNOWN ? undefined : driver,
        );
      }
    }
  }
  return undefined;
}
