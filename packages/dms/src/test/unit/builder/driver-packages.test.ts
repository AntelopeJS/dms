import { expect } from "chai";
import semver from "semver";
import {
  ConfigureProject,
  GetDatabaseProject,
} from "../../../implementations/dms-builder";
import { driverPackages } from "../../../implementations/dms-builder/engine";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 60_000;

/** The first release of each driver built for `@antelopejs/interface-database` 0.4. */
const BUILT_FOR_0_4: Record<"postgres" | "mongodb" | "rethinkdb", string> = {
  postgres: "0.4.0",
  mongodb: "1.8.0",
  rethinkdb: "1.10.0",
};

const ENGINES_ON_0_4: (keyof typeof BUILT_FOR_0_4)[] = [
  "postgres",
  "mongodb",
  "rethinkdb",
];

/** Fails on an open driver range, which resolves a release built for another line of the interface. */
describe("the driver range a project can install", () => {
  it("stops a 0.3 project before every driver release built for 0.4", () => {
    const drivers = driverPackages("0.3.4");
    for (const engine of ENGINES_ON_0_4) {
      const range = drivers[engine]?.version;
      expect(range, engine).to.be.a("string");
      expect(
        semver.satisfies(BUILT_FOR_0_4[engine], range ?? ""),
        engine,
      ).to.equal(false);
    }
    expect(drivers.mysql?.version).to.equal(">=0.1.0 <0.2.0");
  });

  it("leaves out the releases that need a later patch than the project's", () => {
    const drivers = driverPackages("0.3.1");
    expect(drivers.postgres?.version).to.equal(">=0.2.5 <0.3.0");
    expect(drivers.rethinkdb?.version).to.equal(">=1.7.0 <1.9.0");
    expect(drivers.mongodb?.version).to.equal(">=1.6.2 <1.8.0");
  });

  it("offers a 0.4 project only the drivers built for 0.4, and no engine without one", () => {
    const drivers = driverPackages("0.4.2");
    expect(drivers.postgres?.version).to.equal(">=0.4.0 <0.5.0");
    expect(drivers.mongodb?.version).to.equal(">=1.8.0 <1.9.0");
    expect(drivers.rethinkdb?.version).to.equal(">=1.10.0 <1.11.0");
    expect(drivers).to.not.have.property("mysql");
  });

  it("offers nothing when the project resolves no interface-database", () => {
    expect(driverPackages(undefined)).to.deep.equal({});
  });
});

/**
 * Fails on a project state that reads another interface-database than the one core resolves for
 * the project, or answers an open range. The test project resolves 0.3, through its MongoDB module.
 */
describe("connecting a driver to the project", function () {
  this.timeout(OP_TIMEOUT);

  let root = "";

  before(() => {
    root = createFixture({ modules: ["erp-tables"] }).root;
  });

  after(destroyFixture);

  it("answers and writes a range that excludes the drivers built for 0.4", async () => {
    const project = await GetDatabaseProject();
    const resolved = project.ok ? project.data.interfaceDatabase : undefined;
    expect(semver.satisfies(resolved ?? "", "0.3.x"), resolved).to.equal(true);
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
    expect(semver.satisfies(BUILT_FOR_0_4.postgres, written ?? "")).to.equal(
      false,
    );
  });
});
