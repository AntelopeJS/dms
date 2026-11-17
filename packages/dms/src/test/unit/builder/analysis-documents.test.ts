import { expect } from "chai";
import {
  impliedReferenceChecks,
  proposeMapping,
  nativeKind,
} from "../../../implementations/dms-builder/engine";
import { Column, Input, Profiled, Relation } from "./analysis-catalog";

const MIXED = "objectId 60% | string 40%";
const SPLIT = "int 60% | string 40%";

const ORDERS = Relation({
  relation: "erp.orders",
  key: ["_id"],
  columns: [
    Column("_id", "string", { nullable: false, hasDefault: true }),
    Column("name", "string"),
    Column("customer", "string", {
      native: SPLIT,
      accepts: [],
      unsupported: `no native type covers 80% of the sampled values: ${SPLIT}`,
    }),
    Column("password", "string", {
      native: SPLIT,
      accepts: [],
      unsupported: `no native type covers 80% of the sampled values: ${SPLIT}`,
    }),
    Column("payload", "string", {
      native: "binData 100%",
      accepts: [],
      unsupported: "binData",
    }),
  ],
});

describe("the analysis of a document source", () => {
  const proposal = proposeMapping(
    Input(
      [ORDERS],
      [
        Profiled("erp.orders", 500, {
          name: { traits: ["label-candidate"], avgLength: 10 },
        }),
      ],
    ),
  );

  it("asks which declaration reads a column of several native types, offering one per type and leaving it out", () => {
    const item = proposal.open.find(
      (candidate) => candidate.id === "field-type:erp.orders.customer",
    );
    expect(item?.kind).to.equal("field-type");
    expect(item?.options.map((option) => option.value)).to.deep.equal([
      "number",
      "string",
      null,
    ]);
  });

  it("leaves such a column out until it is answered, and asks nothing of a column of one unsupported type", () => {
    const orders = proposal.resources.find(
      (resource) => resource.relation === "erp.orders",
    );
    expect(orders?.fields.map((field) => field.column)).to.not.include(
      "customer",
    );
    expect(orders?.leftOut.map((entry) => entry.column)).to.include.members([
      "customer",
      "payload",
    ]);
    expect(proposal.open.map((candidate) => candidate.id)).to.not.include(
      "field-type:erp.orders.payload",
    );
  });

  it("asks nothing of a column named like a secret, whatever its values", () => {
    expect(proposal.open.map((candidate) => candidate.id)).to.not.include(
      "field-type:erp.orders.password",
    );
  });
});

describe("the questions of a relation whose purpose is asked", () => {
  const legacy = Relation({
    relation: "erp.t_ord",
    key: ["_id"],
    columns: [
      Column("_id", "string", { nullable: false, hasDefault: true }),
      Column("amt", "number"),
      Column("x1", "string", {
        native: "int 50% | string 50%",
        accepts: [],
        unsupported: "no native type covers 80% of the sampled values",
      }),
    ],
  });
  const mixedIds = Relation({
    relation: "erp.mixed_ids",
    columns: [
      Column("_id", "string", {
        native: MIXED,
        accepts: [],
        unsupported: "its _id values are of several types",
      }),
      Column("note", "string"),
    ],
  });
  const proposal = proposeMapping(Input([legacy, mixedIds], []));

  it("carries the field-type question of a relation it would map on the purpose item, not beside it", () => {
    const purpose = proposal.open.find(
      (candidate) => candidate.id === "purpose:erp.t_ord",
    );
    expect(purpose?.open?.map((item) => item.id)).to.deep.equal([
      "field-type:erp.t_ord.x1",
    ]);
    expect(proposal.open.map((item) => item.id)).to.not.include(
      "field-type:erp.t_ord.x1",
    );
  });

  it("asks nothing of the _id of a relation without a key, which is never declared", () => {
    const ids = [
      ...proposal.open,
      ...proposal.open.flatMap((item) => item.open ?? []),
    ].map((item) => item.id);
    expect(ids).to.not.include("field-type:erp.mixed_ids._id");
    const stats = proposal.resources.find(
      (resource) => resource.relation === "erp.mixed_ids",
    );
    expect(stats?.leftOut.map((entry) => entry.column)).to.include("_id");
  });
});

describe("the references a document source's names give away", () => {
  it("checks camelCase reference names as their snake_case spelling does", () => {
    const invoices = Relation({
      relation: "erp.invoices",
      key: ["_id"],
      columns: [
        Column("_id", "string"),
        Column("orderRef", "string"),
        Column("customerId", "string"),
      ],
    });
    const customers = Relation({
      relation: "erp.customers",
      key: ["_id"],
      columns: [Column("_id", "string")],
    });
    expect(impliedReferenceChecks([ORDERS, invoices, customers])).to.deep.equal(
      [
        {
          from: { relation: "erp.invoices", column: "orderRef" },
          to: { relation: "erp.orders", column: "_id" },
        },
        {
          from: { relation: "erp.invoices", column: "customerId" },
          to: { relation: "erp.customers", column: "_id" },
        },
      ],
    );
  });
});

describe("the kind of value a document source's column holds", () => {
  it("compares a sampled column by its dominant type, an ObjectId or a uuid with text", () => {
    const key = nativeKind("objectId 100%");
    expect(nativeKind("objectId 98% | string 2%")).to.equal(key);
    expect(nativeKind("string 100%")).to.equal(key);
    expect(nativeKind("STRING 100%")).to.equal(key);
    expect(nativeKind("NUMBER 100%")).to.equal(
      nativeKind("int 60% | long 40%"),
    );
    expect(nativeKind("NUMBER 100%")).to.not.equal(key);
  });
});
