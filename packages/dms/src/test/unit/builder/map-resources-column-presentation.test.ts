import { expect } from "chai";
import type { MappedField } from "@antelopejs/interface-dms-builder";
import { MapResources } from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  bareInput,
  closeShop,
  moduleFile,
  openShop,
} from "./helpers/display-defaults-shop";
import { OP_TIMEOUT } from "./mapped-database";

const ORDERS = "shop/orders/data-api.ts";

function withReference(reference: Partial<MappedField>) {
  return bareInput({
    fields: [
      { column: "reference", ...reference },
      { column: "status", filterable: true },
      { column: "total" },
    ],
  });
}

describe("mapping a column with its presentation", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(openShop);

  afterEach(closeShop);

  it("writes a cell display and the presentation options a field sends, and keeps them on a remap that leaves them out", async () => {
    expectOk(
      await MapResources(
        withReference({
          display: { type: "mono", options: { copy: true } },
          size: 160,
          group: "ids",
          isVisible: false,
          cellWrap: true,
          description: "The order's reference",
        }),
      ),
      "first mapping",
    );
    const written = moduleFile(ORDERS);
    expect(written).to.include(
      "new DefaultDisplays.MonoDisplay({ copy: true })",
    );
    for (const option of [
      "size: 160",
      'group: "ids"',
      "isVisible: false",
      "cellWrap: true",
      `description: "The order's reference"`,
    ]) {
      expect(written).to.include(option);
    }

    expectOk(await MapResources(withReference({})), "remap");
    const kept = moduleFile(ORDERS);
    expect(kept).to.include("new DefaultDisplays.MonoDisplay({ copy: true })");
    expect(kept).to.include("size: 160");

    expectOk(
      await MapResources(withReference({ display: null, size: 200 })),
      "remap with the display removed",
    );
    const replaced = moduleFile(ORDERS);
    expect(replaced).to.not.include("DefaultDisplays");
    expect(replaced).to.include("size: 200");
    expect(replaced).to.include('group: "ids"');
  });

  it("skips the relation of a cell display whose options its class does not take, saying why", async () => {
    const answer = await MapResources(
      withReference({ display: { type: "progress", options: {} } }),
    );
    expectOk(answer, "MapResources");
    const skipped = (answer.ok ? (answer.warnings ?? []) : []).filter(
      (warning) => warning.code === "relation_skipped",
    );
    expect(skipped.map((warning) => warning.message).join("\n")).to.match(
      /reference: the progress display refuses its options: options\.doneField/,
    );
  });
});
