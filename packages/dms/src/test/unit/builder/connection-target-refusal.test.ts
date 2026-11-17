import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import { confirmedCall, useErpFixture } from "./helpers/connection-access";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

type JsonObject = Record<string, JsonValue>;

const ENV_FIELD = 'env: { url: "<VARIABLE>" }';
const ADDRESS = "db.example.com";
const UNREAD_SOURCE = "it may be a database driver";

const SERVER_MEMBERS = ["host", "port"];
const ACCOUNT_MEMBERS = ["user", "password"];
const SPARE_SECRET_MEMBERS = [
  "password1",
  "password2",
  "password3",
  "passwordSha1",
];

/** The MongoDB proxy option for a server or account member: `host` is `proxyHost`, `user` is `proxyUsername`. */
function proxied(member: string): string {
  const name = member === ACCOUNT_MEMBERS[0] ? `${member}name` : member;
  return `proxy${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** Each member under the client options `owner`. */
function membersOf(owner: string, members: string[]): string[] {
  return members.map((member) => `${owner}.${member}`);
}

const RefusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), detail: z.string() }),
});

interface DriverCase {
  engine: string;
  package: string;
  version: string;
  url: string;
  /** Every member the driver's client reads a server or an account from, below `config`. */
  targets: string[];
  /** A member of the same client options that names no server, which a step may write. */
  setting: string;
}

const POSTGRES: DriverCase = {
  engine: "postgres",
  package: "@antelopejs/postgres",
  version: ">=0.4.0 <0.5.0",
  url: `postgres://erp@${ADDRESS}:5432/erp`,
  targets: ["pool.connectionString", "pool.ConnectionString"],
  setting: "pool.max",
};

const MYSQL: DriverCase = {
  engine: "mysql",
  package: "@antelopejs/mysql",
  version: ">=0.2.0 <0.3.0",
  url: `mysql://erp@${ADDRESS}:3306/erp`,
  targets: membersOf("pool", [
    ...SERVER_MEMBERS,
    "socketPath",
    ...ACCOUNT_MEMBERS,
    ...SPARE_SECRET_MEMBERS,
  ]),
  setting: "pool.connectionLimit",
};

const MONGODB: DriverCase = {
  engine: "mongodb",
  package: "@antelopejs/mongodb",
  version: ">=1.8.0 <1.9.0",
  url: `mongodb://${ADDRESS}:27017`,
  targets: [
    ...membersOf("options", [
      "auth",
      "authMechanism",
      "authMechanismProperties",
      "authSource",
      "AuthSource",
      "tlsCertificateKeyFile",
      "tlsCertificateKeyFilePassword",
      "cert",
      "key",
      "pfx",
      "passphrase",
      "srvServiceName",
      "autoEncryption",
    ]),
    ...membersOf(
      "options",
      [...SERVER_MEMBERS, ...ACCOUNT_MEMBERS].map(proxied),
    ),
  ],
  setting: "options.maxPoolSize",
};

const RETHINKDB: DriverCase = {
  engine: "rethinkdb",
  package: "@antelopejs/rethinkdb",
  version: ">=1.10.0 <1.11.0",
  url: `rethinkdb://${ADDRESS}:28015/erp`,
  targets: [
    ...membersOf("pool", [
      "servers",
      "server",
      ...SERVER_MEMBERS,
      ...ACCOUNT_MEMBERS,
    ]),
    ...membersOf("connection", [
      "server",
      ...SERVER_MEMBERS,
      ...ACCOUNT_MEMBERS,
    ]),
  ],
  setting: "pool.max",
};

const DRIVERS = [POSTGRES, MYSQL, MONGODB, RETHINKDB];

function sourceOf(driver: DriverCase) {
  return { type: "package", package: driver.package, version: driver.version };
}

function writtenEntry(driver: DriverCase): string {
  return `"${driver.engine}": { source: { type: "package", package: "${driver.package}", version: "${driver.version}" }, config: { mode: "external" } },`;
}

/** A config holding `value` at the dotted `path`. */
function configAt(path: string, value: JsonValue): JsonValue {
  return path
    .split(".")
    .reduceRight<JsonValue>((inner, key) => ({ [key]: inner }), value);
}

/** The detail of the refusal one batch of steps answers, or "accepted". */
async function answerTo(steps: JsonObject[]): Promise<string> {
  const answer = await confirmedCall({ steps });
  if (answer.isError !== true) {
    return "accepted";
  }
  const text = answer.content[0]?.text ?? "";
  try {
    return RefusalSchema.parse(JSON.parse(text)).error.detail;
  } catch {
    return text;
  }
}

function configure(id: string, config: JsonValue) {
  return answerTo([{ op: "ConfigureModule", id, entry: { config } }]);
}

describe("[unit] builder_configure_project refuses a database driver's connection target written as a value", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  for (const driver of DRIVERS) {
    it(`refuses adding ${driver.package} with a literal url, and names the env field`, async () => {
      erp.writeModules([]);
      const refusal = await answerTo([
        {
          op: "AddModule",
          id: driver.engine,
          entry: {
            source: sourceOf(driver),
            config: { mode: "external", url: driver.url },
          },
        },
      ]);
      expect(refusal).to.include(
        `write \`modules.${driver.engine}.config.url\``,
      );
      expect(refusal).to.include(ENV_FIELD);
      expect(erp.app().read("../antelope.config.ts")).not.to.include(ADDRESS);
    });

    it(`refuses each member ${driver.package} reads a server or an account from, and keeps ${driver.setting}`, async () => {
      erp.writeModules([writtenEntry(driver)]);
      for (const target of driver.targets) {
        expect(
          await configure(driver.engine, configAt(target, ADDRESS)),
          target,
        ).to.include(`write \`modules.${driver.engine}.config.${target}\``);
      }
      expect(erp.app().read("../antelope.config.ts")).not.to.include(ADDRESS);
      expect(
        await configure(driver.engine, configAt(driver.setting, 4)),
      ).to.equal("accepted");
    });
  }
});

describe("[unit] builder_configure_project tells a database driver by its source, not by a key's name", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  it("accepts a driver whose url comes from a variable, so the refusal is not of the driver itself", async () => {
    erp.writeModules([]);
    expect(
      await answerTo([
        {
          op: "AddModule",
          id: "postgres",
          entry: {
            source: sourceOf(POSTGRES),
            config: { mode: "external", pool: { max: 4 } },
            env: { url: "ERP_DATABASE_URL" },
          },
        },
      ]),
    ).to.equal("accepted");
  });

  it("accepts a url on a module that is no database driver, since the key alone decides nothing", async () => {
    erp.writeModules([]);
    expect(
      await configure(MODULE, { url: "https://api.example.com/hooks" }),
    ).to.equal("accepted");
  });

  it("refuses a driver entry written as a version string under its package name", async () => {
    erp.writeModules(['"@antelopejs/mysql": ">=0.2.0 <0.3.0",']);
    expect(await configure("@antelopejs/mysql", { url: MYSQL.url })).to.include(
      "write `modules.@antelopejs/mysql.config.url`",
    );
  });

  it("refuses a url on a module an earlier step of the batch adds as a driver", async () => {
    erp.writeModules([]);
    expect(
      await answerTo([
        {
          op: "AddModule",
          id: "erp-driver",
          entry: { source: sourceOf(RETHINKDB), config: { mode: "external" } },
        },
        {
          op: "ConfigureModule",
          id: "erp-driver",
          entry: { config: { url: RETHINKDB.url } },
        },
      ]),
    ).to.include("write `modules.erp-driver.config.url`");
  });

  it("refuses a url on a module a later step of the batch gives a driver source", async () => {
    erp.writeModules([
      '"erp-driver": { source: { type: "package", package: "left-pad" } },',
    ]);
    expect(
      await answerTo([
        {
          op: "ConfigureModule",
          id: "erp-driver",
          entry: { config: { url: MYSQL.url } },
        },
        {
          op: "ConfigureModule",
          id: "erp-driver",
          entry: { source: sourceOf(MYSQL) },
        },
      ]),
    ).to.include("write `modules.erp-driver.config.url`");
  });

  it("refuses giving a driver source to a module whose config already holds a url", async () => {
    erp.writeModules([
      `"erp-driver": { source: { type: "package", package: "left-pad" }, config: { url: "${POSTGRES.url}" } },`,
    ]);
    expect(
      await answerTo([
        {
          op: "ConfigureModule",
          id: "erp-driver",
          entry: { source: sourceOf(POSTGRES) },
        },
      ]),
    ).to.include("its config already holds `modules.erp-driver.config.url`");
    expect(erp.app().read("../antelope.config.ts")).not.to.include(
      "@antelopejs/postgres",
    );
  });

  it("refuses a url on a module added from a git source, whose package the builder cannot read", async () => {
    erp.writeModules([]);
    expect(
      await answerTo([
        {
          op: "AddModule",
          id: "erp-driver",
          entry: {
            source: {
              type: "git",
              remote: "https://github.com/AntelopeJS/postgres.git",
            },
            config: { url: POSTGRES.url },
          },
        },
      ]),
    ).to.include(UNREAD_SOURCE);
  });
});

describe("[unit] builder_configure_project counts a driver it cannot read as any driver", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();
  const PACKAGE_CONSTANT =
    'const driverPackage = "@antelopejs/postgres"; const driverSource = { type: "package", package: driverPackage };';

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  for (const [form, entry] of [
    ["a variable as its source", '"erp-driver": { source: driverSource },'],
    ["a shorthand source", '"erp-driver": { source },'],
    [
      "a variable as its package",
      '"erp-driver": { source: { type: "package", package: driverPackage } },',
    ],
  ]) {
    it(`refuses a url on a module written with ${form}`, async () => {
      erp.writeModules(
        [entry],
        [],
        [PACKAGE_CONSTANT, "const source = driverSource;"],
      );
      expect(await configure("erp-driver", { url: POSTGRES.url })).to.include(
        "write `modules.erp-driver.config.url`",
      );
    });
  }

  it("refuses a value that is not an object where a driver takes its client options", async () => {
    erp.writeModules([writtenEntry(POSTGRES)]);
    expect(await configure("postgres", { pool: POSTGRES.url })).to.include(
      "write `modules.postgres.config.pool`",
    );
  });

  it("refuses writing a key a template on a driver's url reads", async () => {
    erp.writeModules([
      '"postgres": { source: { type: "package", package: "@antelopejs/postgres" }, config: { mode: "external", url: "${erpUrl}" } },',
    ]);
    expect(await configure(MODULE, { erpUrl: POSTGRES.url })).to.include(
      `write \`modules.${MODULE}.config.erpUrl\``,
    );
    expect(erp.app().read("../antelope.config.ts")).not.to.include(ADDRESS);
  });
});
