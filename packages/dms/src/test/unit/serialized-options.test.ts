import { expect } from "chai";
import {
  formOptionsOf,
  headerActionsOf,
  tableViewOptionsOf,
} from "../helpers/serialized-options";

describe("[unit] helpers/serialized-options", () => {
  it("reads the options of a served table view", () => {
    const options = { formComponents: {}, searchable: false };

    expect(tableViewOptionsOf({ options })).to.equal(options);
  });

  it("refuses table view options whose form components are not an object", () => {
    expect(() =>
      tableViewOptionsOf({
        options: { formComponents: "new", searchable: true },
      }),
    ).to.throw(/no table view options/);
  });

  it("refuses table view options whose searchable flag is not a boolean", () => {
    expect(() =>
      tableViewOptionsOf({
        options: { formComponents: {}, searchable: "yes" },
      }),
    ).to.throw(/no table view options/);
  });

  it("refuses a table view without a component", () => {
    expect(() => tableViewOptionsOf(undefined)).to.throw(
      /no table view options/,
    );
  });

  it("reads the header actions of a served layout with or without a query", () => {
    const withQuery = {
      headerActions: [],
      headerActionsQuery: { workspace: "web" },
    };
    const withoutQuery = { headerActions: [] };

    expect(headerActionsOf({ options: withQuery })).to.equal(withQuery);
    expect(headerActionsOf({ options: withoutQuery })).to.equal(withoutQuery);
  });

  it("refuses header actions whose query is not a record of strings", () => {
    expect(() =>
      headerActionsOf({
        options: { headerActions: [], headerActionsQuery: { workspace: 1 } },
      }),
    ).to.throw(/no header actions/);
    expect(() =>
      headerActionsOf({
        options: { headerActions: [], headerActionsQuery: "workspace" },
      }),
    ).to.throw(/no header actions/);
  });

  it("refuses form options without fields", () => {
    expect(() => formOptionsOf({ options: { fields: "name" } })).to.throw(
      /no form options/,
    );
  });
});
