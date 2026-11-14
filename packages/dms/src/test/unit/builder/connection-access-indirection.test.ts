import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import * as implementation from "../../../implementations/dms-builder";
import {
  ConfigureModule,
  MapResources,
} from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  confirmedCall,
  countries,
  RAISE_REFUSED,
  READ_ONLY,
  refusalOf,
  useErpFixture,
} from "./helpers/connection-access";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

const DMS_DATABASE_SOURCE =
  'source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }';

/** A dms-database entry with this `config` body, verbatim. */
function dmsDatabase(config: string): string {
  return `"dms-database": { ${DMS_DATABASE_SOURCE}, config: { ${config} } },`;
}

const TEMPLATED = dmsDatabase(
  'externalConnections: { erp: { access: "${erpAccess}" } }',
);

/** What an agent's one ConfigureModule step answers: the refusal, or "accepted". */
async function agentStep(id: string, entry: JsonValue): Promise<string> {
  const answer = await confirmedCall({
    steps: [{ op: "ConfigureModule", id, entry }],
  });
  return answer.isError === true ? (answer.content[0]?.text ?? "") : "accepted";
}

function restatement(): Promise<string> {
  return agentStep("dms-database", {
    config: { externalConnections: { erp: { access: "read-write" } } },
  });
}

describe("[unit] builder_configure_project refuses a key a templated access reads", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  it("raises the access when an owner writes the key on another module, so the probe is real", async () => {
    erp.writeModules([TEMPLATED]);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expectOk(
      await ConfigureModule(MODULE, { config: { erpAccess: "read-write" } }),
      "an owner's write",
    );
    expectOk(await MapResources(countries(true)), "writable through it");
  });

  it("refuses an agent writing the key on the module that holds the template", async () => {
    erp.writeModules([
      dmsDatabase(
        'erpAccess: "read", externalConnections: { erp: { access: "${erpAccess}" } }',
      ),
    ]);
    const answer = await agentStep("dms-database", {
      config: { erpAccess: "read-write" },
    });
    expect(answer).to.include("write `modules.dms-database.config.erpAccess`");
    expect(answer).to.include(RAISE_REFUSED);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses an agent writing it on another module, which core reads it from by its last key", async () => {
    erp.writeModules([TEMPLATED]);
    expect(
      await agentStep(MODULE, { config: { erpAccess: "read-write" } }),
    ).to.include(`write \`modules.${MODULE}.config.erpAccess\``);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses an agent writing it nested under another key", async () => {
    erp.writeModules([TEMPLATED]);
    expect(
      await agentStep(MODULE, { config: { erp: { erpAccess: "read-write" } } }),
    ).to.include(`write \`modules.${MODULE}.config.erp.erpAccess\``);
  });

  it("refuses an agent binding it to a variable, which core applies before the template", async () => {
    erp.writeModules([TEMPLATED]);
    expect(
      await agentStep(MODULE, { env: { erpAccess: "ERP_ACCESS" } }),
    ).to.include(`write \`modules.${MODULE}.config.erpAccess\``);
  });

  it("refuses an agent writing a key whose own name holds the dot a template reads", async () => {
    erp.writeModules([
      dmsDatabase('externalConnections: { erp: { access: "${erp.access}" } }'),
    ]);
    expect(
      await agentStep(MODULE, { config: { "erp.access": "read-write" } }),
    ).to.include(`write \`modules.${MODULE}.config.erp.access\``);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("still lets an agent write a key no template reads", async () => {
    erp.writeModules([TEMPLATED]);
    expect(await agentStep(MODULE, { config: { pollSeconds: 5 } })).to.equal(
      "accepted",
    );
  });
});

describe("[unit] builder_configure_project finds a template wherever core reads one", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  it("refuses an agent adding a module whose key is named as the full path a template reads", async () => {
    erp.writeModules([
      dmsDatabase(
        'erpAccess: "read", externalConnections: { erp: { access: "${modules.dms-database.config.erpAccess}" } }',
      ),
    ]);
    const answer = await confirmedCall({
      steps: [
        {
          op: "AddModule",
          id: "zz-helper",
          entry: {
            source: { type: "package", package: "zz-helper", version: "1.0.0" },
            config: { "modules.dms-database.config.erpAccess": "read-write" },
          },
        },
      ],
    });
    expect(answer.isError).to.equal(true);
    expect(answer.content[0]?.text).to.include(RAISE_REFUSED);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses a key a template reads in the JSON file of a scoped module id", async () => {
    const scope = path.join(erp.app().root, "antelope.@antelopejs");
    fs.mkdirSync(scope);
    try {
      erp.writeModules([
        `"@antelopejs/dms-database": { ${DMS_DATABASE_SOURCE} },`,
      ]);
      erp
        .app()
        .write(
          "../antelope.@antelopejs/dms-database.json",
          '{ "externalConnections": { "erp": { "access": "${erpAccess}" } } }',
        );
      expect(
        await agentStep(MODULE, { config: { erpAccess: "read-write" } }),
      ).to.include(`write \`modules.${MODULE}.config.erpAccess\``);
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        READ_ONLY,
      );
    } finally {
      fs.rmSync(scope, { recursive: true, force: true });
    }
  });

  it("refuses a key a template reads in a scoped module's JSON file behind a symbolic link", async () => {
    const shared = path.join(erp.app().root, "shared-config");
    const scope = path.join(erp.app().root, "antelope.@antelopejs");
    fs.mkdirSync(shared);
    fs.symlinkSync(shared, scope);
    try {
      erp.writeModules([
        `"@antelopejs/dms-database": { ${DMS_DATABASE_SOURCE} },`,
      ]);
      erp
        .app()
        .write(
          "../shared-config/dms-database.json",
          '{ "externalConnections": { "erp": { "access": "${erpAccess}" } } }',
        );
      expect(
        await agentStep(MODULE, { config: { erpAccess: "read-write" } }),
      ).to.include(`write \`modules.${MODULE}.config.erpAccess\``);
    } finally {
      fs.rmSync(scope, { force: true });
      fs.rmSync(shared, { recursive: true, force: true });
    }
  });

  it("reads a template key in a module's JSON file as core decodes it", async () => {
    const file = path.join(erp.app().root, "antelope.dms-database.json");
    erp.writeModules([`"dms-database": { ${DMS_DATABASE_SOURCE} },`]);
    fs.writeFileSync(
      file,
      '{ "externalConnections": { "erp": { "access": "${erp\\u0041ccess}" } } }',
    );
    try {
      expect(
        await agentStep(MODULE, { config: { erpAccess: "read-write" } }),
      ).to.include(`write \`modules.${MODULE}.config.erpAccess\``);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("lets an agent write a key only a TypeScript template literal reads", async () => {
    erp.writeModules(
      [
        dmsDatabase(
          'url: `mongodb://${host}:27017`, externalConnections: { erp: { access: "read" } }',
        ),
      ],
      [],
      ['const host = "localhost";'],
    );
    expect(
      await agentStep(MODULE, { config: { host: "db.internal" } }),
    ).to.equal("accepted");
  });
});

describe("[unit] builder_configure_project refuses a key written twice or computed along the access path", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  it("refuses replacing connections that hold one twice, the last read", async () => {
    erp.writeModules([
      dmsDatabase(
        'externalConnections: { erp: { access: "read-write" }, erp: { access: "read" } }',
      ),
    ]);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expect(await restatement()).to.include(RAISE_REFUSED);
  });

  it("refuses replacing connections that hold one under a computed key", async () => {
    erp.writeModules([
      dmsDatabase(
        'externalConnections: { erp: { access: "read-write" }, ["erp"]: { access: "read" } }',
      ),
    ]);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expect(await restatement()).to.include(RAISE_REFUSED);
  });

  it("refuses an agent when the dms-database module is written twice, the last read", async () => {
    erp.writeModules([
      dmsDatabase('externalConnections: { erp: { access: "read-write" } }'),
      dmsDatabase('externalConnections: { erp: { access: "read" } }'),
    ]);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expect(await restatement()).to.include(RAISE_REFUSED);
  });

  it("refuses configuring a module written twice, naming it", async () => {
    erp.writeModules([
      dmsDatabase('externalConnections: { erp: { access: "read-write" } }'),
      dmsDatabase('externalConnections: { erp: { access: "read" } }'),
    ]);
    expect(
      refusalOf(
        await ConfigureModule("dms-database", { config: { pollSeconds: 5 } }),
      ),
    ).to.include(
      '"modules.dms-database" is written 2 times in the configuration',
    );
  });
});
