import type { ResourceFieldStructure } from "@antelopejs/interface-dms-builder";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
  type CompiledQuery,
  queryRouteMethodText,
  seriesNaming,
  registerBuiltinQueryTemplates,
  interfaceNamesBuckets,
} from "../../../implementations/dms-builder/engine";

const PARAMS = {
  op: "sum",
  field: "amount",
  groupBy: "createdAt",
  bucket: "month",
};
const FIELDS: ResourceFieldStructure[] = [{ name: "amount", label: "Amount" }];

function routeOf(namesBuckets: boolean): string {
  const spec: CompiledQuery = {
    name: "revenue",
    endpoint: "/stats/revenue",
    template: "series",
    params: PARAMS,
    chain: { body: "{}", parameters: [] },
    naming: seriesNaming(PARAMS, FIELDS, "order", namesBuckets),
    response: "card",
  };
  return queryRouteMethodText(spec, "OrderModel", "shop", "revenue", "Page")
    .text;
}

function interfaceWith(declaration: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bucket-naming-"));
  const base = path.join(
    root,
    "node_modules/@antelopejs/interface-dms/dist/base",
  );
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "query-response.d.ts"), declaration);
  fs.mkdirSync(path.join(root, "src/orders"), { recursive: true });
  return path.join(root, "src/orders/data-api.ts");
}

describe("naming the periods of a bucketed series", () => {
  before(registerBuiltinQueryTemplates);

  it("hands the helper the bucket when the interface takes it", () => {
    expect(routeOf(true)).to.contain(
      'chartCardData(await model.revenue().run(), { measure: "sum", label: "Amount", bucket: "month" })',
    );
  });

  it("leaves the bucket out when the interface does not take it", () => {
    expect(routeOf(false)).to.not.contain("bucket");
  });

  it("finds out from the declared options of the interface the file is compiled against", () => {
    expect(
      interfaceNamesBuckets(
        interfaceWith("interface SeriesOptions { bucket?: string }"),
      ),
    ).to.equal(true);
    expect(
      interfaceNamesBuckets(
        interfaceWith("interface SeriesOptions { label?: string }"),
      ),
    ).to.equal(false);
  });

  it("names a week only when the declared periods list one", () => {
    const withoutWeek = interfaceWith(
      'interface SeriesOptions { bucket?: "day" | "month" }',
    );
    const withWeek = interfaceWith(
      'interface SeriesOptions { bucket?: "day" | "week" | "month" }',
    );
    expect(interfaceNamesBuckets(withoutWeek, "month")).to.equal(true);
    expect(interfaceNamesBuckets(withoutWeek, "week")).to.equal(false);
    expect(interfaceNamesBuckets(withWeek, "week")).to.equal(true);
  });

  it("takes an interface it cannot find for one that does not", () => {
    expect(
      interfaceNamesBuckets("/nonexistent/src/orders/data-api.ts"),
    ).to.equal(false);
  });
});
