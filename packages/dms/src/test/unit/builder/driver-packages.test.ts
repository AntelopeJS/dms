import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import semver from "semver";
import {
  ConfigureProject,
  GetDatabaseProject,
} from "../../../implementations/dms-builder";
import * as implementation from "../../../implementations/dms-builder";
import {
  DATABASE_ENGINES,
  driverPackages,
} from "../../../implementations/dms-builder/engine";
import { mockupTool, run } from "../../helpers/mockup-mcp";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 60_000;

/**
 * The first release of each driver that exports `probe` and provides
 * `@antelopejs/interface-database-catalog` 0.1, released on 2026-11-15. It answers a cursor one row
 * per read, as `@antelopejs/interface-database` 0.4.0 asks.
 */
const FIRST_WITH_PROBE: Record<Builder.DatabaseEngine, string> = {
  postgres: "0.4.1",
  mysql: "0.2.3",
  mongodb: "1.8.3",
  rethinkdb: "1.10.2",
};

/** The release of each driver after it, which answers a cursor in batches, as 0.4.1 asks. */
const FIRST_IN_BATCHES: Record<Builder.DatabaseEngine, string> = {
  postgres: "0.4.2",
  mysql: "0.2.4",
  mongodb: "1.8.4",
  rethinkdb: "1.10.3",
};

/** The last release of each driver before `probe`, which provides the catalog 0.0 line. */
const LAST_WITHOUT_PROBE: Record<Builder.DatabaseEngine, string> = {
  postgres: "0.4.0",
  mysql: "0.2.2",
  mongodb: "1.8.2",
  rethinkdb: "1.10.1",
};

/** The first postgres release past the 0.4 line, which a closed range refuses. */
const NEXT_POSTGRES_LINE = "0.5.0";

describe("the driver range a project can install (fails on an open driver range, which resolves a release built for another line of an interface)", () => {
  it("offers a 0.4.1 or later project each driver from its release in batches, closed before its next minor", () => {
    const drivers = driverPackages("0.4.2");
    expect(drivers.postgres?.version).to.equal(">=0.4.2 <0.5.0");
    expect(drivers.mysql?.version).to.equal(">=0.2.4 <0.3.0");
    expect(drivers.mongodb?.version).to.equal(">=1.8.4 <1.9.0");
    expect(drivers.rethinkdb?.version).to.equal(">=1.10.3 <1.11.0");
  });

  it("never offers a driver release core refuses beside this module", () => {
    const drivers = driverPackages("0.4.0");
    for (const engine of DATABASE_ENGINES) {
      const range = drivers[engine]?.version ?? "<0.0.0";
      expect(
        semver.satisfies(FIRST_WITH_PROBE[engine], range),
        engine,
      ).to.equal(true);
      expect(
        semver.satisfies(LAST_WITHOUT_PROBE[engine], range),
        engine,
      ).to.equal(false);
    }
  });

  it("offers a 0.4.0 project the release with probe that reads one row per read, and not the one in batches", () => {
    const drivers = driverPackages("0.4.0");
    for (const engine of DATABASE_ENGINES) {
      const range = drivers[engine]?.version ?? "<0.0.0";
      expect(
        semver.satisfies(FIRST_IN_BATCHES[engine], range),
        engine,
      ).to.equal(false);
    }
    expect(drivers.postgres?.version).to.equal(">=0.4.1 <0.4.2");
  });

  it("offers a project on interface-database 0.3 no driver, since none built for it exports probe", () => {
    expect(driverPackages("0.3.4")).to.deep.equal({});
  });

  it("offers nothing when the project resolves no interface-database", () => {
    expect(driverPackages(undefined)).to.deep.equal({});
  });
});

describe("connecting a driver to the project (fails on a project state that reads another interface-database than the one core resolves, or answers an open range)", function () {
  this.timeout(OP_TIMEOUT);

  let root = "";

  before(() => {
    root = createFixture({ modules: ["erp-tables"] }).root;
    ImplementInterface(Builder, implementation);
  });

  after(destroyFixture);

  it("answers and writes the range of the drivers built for the 0.4 line the fixture's MongoDB module resolves, closed before the next line", async () => {
    const project = await GetDatabaseProject();
    const resolved = project.ok ? project.data.interfaceDatabase : undefined;
    expect(semver.satisfies(resolved ?? "", "0.4.x"), resolved).to.equal(true);
    const postgres = project.ok ? project.data.drivers.postgres : undefined;
    expect(postgres).to.deep.equal(driverPackages(resolved).postgres);
    expectOk(
      await ConfigureProject([
        {
          op: "AddModule",
          id: "postgres-erp",
          entry: {
            source: {
              type: "package",
              package: postgres?.package ?? "",
              version: postgres?.version ?? "",
            },
            config: { mode: "external" },
          },
        },
      ]),
      "AddModule",
    );
    const config = projectFile(root, "antelope.config.ts");
    const written = /version: "([^"]+)"/.exec(
      config.slice(config.indexOf("postgres-erp")),
    )?.[1];
    expect(written).to.equal(postgres?.version);
    const first = semver.gte(resolved ?? "0.0.0", "0.4.1")
      ? FIRST_IN_BATCHES.postgres
      : FIRST_WITH_PROBE.postgres;
    expect(semver.satisfies(first, written ?? ""), written).to.equal(true);
    expect(semver.satisfies(NEXT_POSTGRES_LINE, written ?? "")).to.equal(false);
  });

  it("answers the same project state to an MCP client, so the driver range it writes can start", async () => {
    const project = await GetDatabaseProject();
    expect(project.ok, JSON.stringify(project)).to.equal(true);
    const { text, isError } = await run(mockupTool("database_project"), {});
    expect(isError, text).to.equal(false);
    expect(JSON.parse(text)).to.deep.equal(JSON.parse(JSON.stringify(project)));
  });
});
