import { expect } from "chai";
import type {
  ColumnPresentation,
  OpResult,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import {
  AddField,
  ConfigureColumnGroups,
  ConfigureField,
  CreateResource,
  GetResourceStructure,
} from "../../../implementations/dms-builder";
import {
  CELL_DISPLAYS,
  defaultDisplayIds,
} from "../../../implementations/dms-builder/engine/cell-displays";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const DATA_API_FILE = "ticket/data-api.ts";

let app: Fixture;

async function fieldNamed(name: string): Promise<ResourceFieldStructure> {
  const structure = expectOk(
    await GetResourceStructure("ticket"),
    "GetResourceStructure",
  );
  const found = structure.fields.find((field) => field.name === name);
  if (!found) {
    throw new Error(`no field named ${name} on ticket`);
  }
  return found;
}

function presentation(field: ResourceFieldStructure): ColumnPresentation {
  const { description, group, isVisible, size, cellWrap, display } = field;
  return { description, group, isVisible, size, cellWrap, display };
}

function refusalOf(result: OpResult<unknown>): string {
  if (result.ok || result.error.code !== "invalid_config") {
    throw new Error(`expected invalid_config, got ${JSON.stringify(result)}`);
  }
  return result.error.issues.map((issue) => issue.message).join("\n");
}

function writesEachOption(): void {
  it("has an options schema for every cell display the DMS draws", () => {
    expect([...CELL_DISPLAYS.keys()].sort()).to.deep.equal(
      defaultDisplayIds().sort(),
    );
  });

  it("writes each option on an added field, typechecked, and reads it back", async function () {
    this.timeout(OP_TIMEOUT);
    const options: ColumnPresentation = {
      description: "Who asked",
      group: "requester",
      isVisible: false,
      size: 240,
      cellWrap: true,
      display: {
        type: "identity",
        options: {
          avatarFrame: "square",
          subtitleField: "title",
          badges: [{ field: "title", label: "VIP", tone: "primary" }],
        },
      },
    };
    expectOk(
      await AddField("ticket", {
        name: "requester",
        dataType: { $dataType: "string" },
        ...options,
      }),
      "AddField",
    );
    const written = app.read(DATA_API_FILE);
    expect(written).to.contain("new DefaultDisplays.IdentityDisplay(");
    expect(written).to.match(/import \{[^}]*\bDefaultDisplays\b[^}]*\}/);
    expect(presentation(await fieldNamed("requester"))).to.deep.equal(options);
  });
}

function patchesEachOption(): void {
  it("configures, replaces and removes each option on an existing field", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureField("ticket#createdAt", {
        description: "When it was opened",
        group: "dates",
        isVisible: false,
        size: 180,
        cellWrap: false,
        display: { type: "relative_date", options: { style: "day" } },
      }),
      "set",
    );
    expect(presentation(await fieldNamed("createdAt"))).to.deep.equal({
      description: "When it was opened",
      group: "dates",
      isVisible: false,
      size: 180,
      cellWrap: false,
      display: { type: "relative_date", options: { style: "day" } },
    });
    expectOk(
      await ConfigureField("ticket#createdAt", {
        size: 200,
        display: { type: "bytes" },
      }),
      "replace",
    );
    const replaced = await fieldNamed("createdAt");
    expect(replaced.size).to.equal(200);
    expect(replaced.display).to.deep.equal({ type: "bytes" });
    expect(replaced.group).to.equal("dates");
    expect(app.read(DATA_API_FILE)).to.contain(
      "new DefaultDisplays.BytesDisplay()",
    );
    expectOk(
      await ConfigureField("ticket#createdAt", {
        description: null,
        group: null,
        isVisible: null,
        size: null,
        cellWrap: null,
        display: null,
      }),
      "remove",
    );
    expect(presentation(await fieldNamed("createdAt"))).to.deep.equal({
      description: undefined,
      group: undefined,
      isVisible: undefined,
      size: undefined,
      cellWrap: undefined,
      display: undefined,
    });
    expect(app.read(DATA_API_FILE)).to.not.match(/\bDefaultDisplays\b/);
  });
}

function refusesWhatItCannotWrite(): void {
  it("refuses a display option its class does not take, and writes nothing", async function () {
    this.timeout(OP_TIMEOUT);
    const before = app.read(DATA_API_FILE);
    expect(
      refusalOf(
        await ConfigureField("ticket#title", {
          display: { type: "two_line", options: { subField: 3 } },
        }),
      ),
    ).to.match(/two_line display refuses its options: options\.subField: /);
    expect(
      refusalOf(
        await ConfigureField("ticket#title", {
          display: { type: "identity", options: { avatarFrame: "oval" } },
        }),
      ),
    ).to.match(/identity display refuses its options: options\.avatarFrame: /);
    expect(
      refusalOf(
        await ConfigureField("ticket#title", {
          display: { type: "mono", options: { colour: "red" } },
        }),
      ),
    ).to.match(/mono display refuses its options: .*colour/);
    expect(
      refusalOf(
        await AddField("ticket", {
          name: "done",
          dataType: { $dataType: "number" },
          display: { type: "progress", options: { doneField: "done" } },
        }),
      ),
    ).to.match(/options\.totalField: /);
    expect(
      refusalOf(
        await ConfigureField("ticket#title", { display: { type: "gauge" } }),
      ),
    ).to.match(/"gauge" is not a cell display of the DMS; it draws .*identity/);
    expect(app.read(DATA_API_FILE)).to.equal(before);
  });

  it("refuses a resource created with a field whose display it cannot write", async function () {
    this.timeout(OP_TIMEOUT);
    expect(
      refusalOf(
        await CreateResource({
          name: "invoice",
          fields: [
            {
              name: "amount",
              dataType: { $dataType: "number" },
              display: { type: "sparkline", options: { tone: "loud" } },
            },
          ],
        }),
      ),
    ).to.match(/^amount: the sparkline display refuses its options/);
    expect(app.exists("invoice/data-api.ts")).to.equal(false);
  });
}

describe("the presentation options of a resource field", () => {
  beforeEach(async function () {
    this.timeout(120_000);
    app = createFixture({ compilerOptions: { noUnusedLocals: true } });
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [
          { name: "title", dataType: { $dataType: "string" } },
          { name: "createdAt", dataType: { $dataType: "date" } },
        ],
      }),
      "CreateResource",
    );
  });

  afterEach(() => destroyFixture());

  writesEachOption();
  patchesEachOption();
  refusesWhatItCannotWrite();
});

describe("the column groups of a resource", () => {
  beforeEach(async function () {
    this.timeout(120_000);
    app = createFixture({ compilerOptions: { noUnusedLocals: true } });
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
  });

  afterEach(() => destroyFixture());

  async function groups() {
    return expectOk(
      await GetResourceStructure("ticket"),
      "GetResourceStructure",
    ).columnGroups;
  }

  it("adds, replaces and removes @ColumnGroup decorators", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureColumnGroups("ticket", {
        requester: { label: "Requester", orientation: "horizontal" },
        dates: { label: "Dates", description: "When", order: 2 },
      }),
      "add",
    );
    expect(await groups()).to.deep.equal({
      requester: { label: "Requester", orientation: "horizontal" },
      dates: { label: "Dates", description: "When", order: 2 },
    });
    expect(app.read(DATA_API_FILE)).to.contain('@ColumnGroup("requester", ');

    expectOk(
      await ConfigureColumnGroups("ticket", {
        requester: { label: "Asked by", orientation: "vertical" },
        dates: null,
      }),
      "replace and remove",
    );
    expect(await groups()).to.deep.equal({
      requester: { label: "Asked by", orientation: "vertical" },
    });

    expectOk(
      await ConfigureColumnGroups("ticket", { requester: null }),
      "remove the last",
    );
    expect(await groups()).to.equal(undefined);
    expect(app.read(DATA_API_FILE)).to.not.match(/\bColumnGroup\b/);
  });

  it("refuses a group without a label", async function () {
    this.timeout(OP_TIMEOUT);
    expect(
      refusalOf(
        await ConfigureColumnGroups("ticket", { requester: { label: "" } }),
      ),
    ).to.match(/requester\.label: /);
  });
});
