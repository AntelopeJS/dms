import { expect } from "chai";
import type { ColumnTrait } from "@antelopejs/interface-database-catalog";
import { proposeMapping } from "../../../implementations/dms-builder/engine";
import { Column, Input, Profiled, Relation } from "./analysis-catalog";

describe("labelling a row by a person's name rather than a code (L1)", () => {
  const people = (
    columns: Array<[ReturnType<typeof Column>, ColumnTrait[]]>,
  ) => {
    const relation = Relation({
      relation: "shop.people",
      key: ["person_id"],
      columns: [
        Column("person_id", "number", { nullable: false }),
        ...columns.map(([column]) => column),
      ],
    });
    const profile = Profiled("shop.people", 1687, {
      person_id: { traits: ["identifier-like"] },
      ...Object.fromEntries(
        columns.map(([column, traits]) => [column.name, { traits }]),
      ),
    });
    return proposeMapping(Input([relation], [profile])).resources[0];
  };

  it("prefers a name column whose values repeat over a unique email", () => {
    const proposed = people([
      [Column("email", "string"), ["label-candidate", "identifier-like"]],
      [Column("full_name", "string"), []],
    ]);
    expect(proposed.label).to.deep.equal({
      value: "full_name",
      rule: "L1",
      kind: "default",
    });
  });

  it("prefers a title over a unique code and asks nothing", () => {
    const proposed = people([
      [Column("code", "string"), ["label-candidate"]],
      [Column("title", "string"), []],
    ]);
    expect(proposed.label.value).to.equal("title");
  });

  it("keeps the unique email when no column names a person", () => {
    const proposed = people([
      [Column("email", "string"), ["label-candidate", "identifier-like"]],
      [Column("segment", "string"), ["enum-like"]],
    ]);
    expect(proposed.label.value).to.equal("email");
  });

  it("does not take a name column that holds no text", () => {
    const proposed = people([
      [Column("email", "string"), ["label-candidate"]],
      [Column("name", "number"), []],
    ]);
    expect(proposed.label.value).to.equal("email");
  });
});
