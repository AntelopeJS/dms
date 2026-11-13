import { expect } from "chai";
import type {
  MappedResource,
  MapResourcesInput,
  MappingProposal,
} from "@antelopejs/interface-dms-builder";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { GetMapping, MapResources } from "../../../implementations/dms-builder";
import {
  proposeMapping,
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import {
  Column as AnalysedColumn,
  INFO,
  Input,
  Profiled,
  Relation as AnalysedRelation,
} from "./analysis-catalog";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { Column, Relation } from "./helpers/shop-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const SAME_KIND: [reference: string, key: string][] = [
  ["int", "int unsigned"],
  ["int(11)", "bigint(20) unsigned"],
  ["smallint(6) unsigned zerofill", "mediumint"],
  ["tinyint(1)", "int signed"],
  ["decimal(10,2) unsigned", "double"],
  ["float", "decimal(20,0)"],
  ["varchar(36)", "char(36)"],
  ["tinytext", "longtext"],
  ["mediumtext", "varchar(255)"],
];

const DIFFERENT_KIND: [reference: string, key: string][] = [
  ["char(36)", "int unsigned"],
  ["int", "enum('a','b')"],
  ["datetime(3)", "int unsigned"],
  ["varchar(36)", "uuid"],
];

function customers(key: string): RelationDescription {
  return Relation("customers", [
    Column("id", "number", { native: key, nullable: false }),
    Column("name", "string", { native: "varchar(100)" }),
  ]);
}

function orders(reference: string): RelationDescription {
  return Relation("orders", [
    Column("id", "number", { native: "int", nullable: false }),
    Column("reference", "string", { native: "varchar(40)" }),
    Column("customer_id", "number", {
      native: reference,
      accepts: [{ declared: "number" }, { declared: "string" }],
    }),
  ]);
}

function mapping(...resources: MappedResource[]): MapResourcesInput {
  return { module: MODULE, connection: "shop", resources };
}

const CUSTOMERS_RESOURCE: MappedResource = {
  relation: "shop.customers",
  label: "name",
  tableView: true,
  writable: false,
  fields: [{ column: "name" }],
};

const ORDERS_RESOURCE: MappedResource = {
  relation: "shop.orders",
  label: "reference",
  tableView: true,
  writable: false,
  fields: [
    { column: "reference" },
    { column: "customer_id", relation: "shop.customers" },
  ],
};

function proposed(reference: string, key: string): MappingProposal {
  const target = AnalysedRelation({
    relation: "shop.customers",
    key: ["id"],
    columns: [
      AnalysedColumn("id", "number", { native: key, nullable: false }),
      AnalysedColumn("name", "string", { native: "varchar(100)" }),
    ],
  });
  const source = AnalysedRelation({
    relation: "shop.orders",
    key: ["id"],
    columns: [
      AnalysedColumn("id", "number", { native: "int", nullable: false }),
      AnalysedColumn("reference", "string", { native: "varchar(40)" }),
      AnalysedColumn("customer_id", "number", { native: reference }),
    ],
  });
  return proposeMapping(
    Input(
      [target, source],
      [
        Profiled("shop.customers", 120, {
          name: { traits: ["label-candidate"] },
        }),
        Profiled("shop.orders", 5000, {
          reference: { traits: ["label-candidate"] },
        }),
      ],
      {
        references: [
          {
            from: { relation: "shop.orders", column: "customer_id" },
            to: { relation: "shop.customers", column: "id" },
            match: {
              status: "ok",
              value: {
                containment: 1,
                checkedRows: 5000,
                sampled: false,
                targetIsKey: true,
              },
            },
          },
        ],
      },
    ),
  );
}

function relationOf(proposal: MappingProposal): string | undefined {
  return proposal.resources
    .find((resource) => resource.relation === "shop.orders")
    ?.fields.find((field) => field.column === "customer_id")?.relation?.value;
}

describe("the analysis of a MySQL or MariaDB catalog", () => {
  for (const [reference, key] of SAME_KIND) {
    it(`proposes a relation column for ${reference} against the key ${key}`, () => {
      expect(relationOf(proposed(reference, key))).to.equal("shop.customers");
    });
  }

  for (const [reference, key] of DIFFERENT_KIND) {
    it(`proposes no relation column for ${reference} against the key ${key}`, () => {
      expect(relationOf(proposed(reference, key))).to.equal(undefined);
    });
  }
});

describe("mapping a MySQL or MariaDB relation column", function () {
  this.timeout(OP_TIMEOUT);

  let described: RelationDescription[] = [];

  beforeEach(() => {
    createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      shop: {
        async Info() {
          return INFO;
        },
        async ListRelations() {
          return described;
        },
        async DescribeRelations(relations: string[]) {
          return described.filter((description) =>
            relations.includes(`${description.schema}.${description.name}`),
          );
        },
        async Profile() {
          throw new Error("the profile timed out");
        },
      },
    });
    setModuleReloadForTests(reloadedAtOnce);
  });

  afterEach(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  async function ordersMapped() {
    const read = await GetMapping("shop", MODULE);
    expectOk(read, "GetMapping");
    return (read.ok ? read.data : []).find(
      (candidate) => candidate.resource.relation === "shop.orders",
    )?.resource;
  }

  for (const [reference, key] of SAME_KIND) {
    it(`maps ${reference} onto the key ${key}, which no foreign key declares`, async () => {
      described = [customers(key), orders(reference)];
      const result = await MapResources(
        mapping(CUSTOMERS_RESOURCE, ORDERS_RESOURCE),
      );
      expectOk(result, "MapResources");
      expect(
        (result.ok ? (result.warnings ?? []) : []).map(
          (warning) => warning.code,
        ),
      ).to.not.include("relation_skipped");
      const written = await ordersMapped();
      expect(
        written?.fields.find((field) => field.column === "customer_id")
          ?.relation?.value,
      ).to.equal("shop.customers");
    });
  }

  for (const [reference, key] of DIFFERENT_KIND) {
    it(`leaves orders out for ${reference} onto the key ${key}, saying no value of one can find a row of the other`, async () => {
      described = [customers(key), orders(reference)];
      const result = await MapResources(
        mapping(CUSTOMERS_RESOURCE, ORDERS_RESOURCE),
      );
      expectOk(result, "MapResources");
      const skipped = (result.ok ? (result.warnings ?? []) : []).filter(
        (warning) => warning.code === "relation_skipped",
      );
      expect(skipped.map((warning) => warning.message).join("\n")).to.include(
        "so no value of one can find a row of the other",
      );
      expect(await ordersMapped()).to.equal(undefined);
    });
  }
});
