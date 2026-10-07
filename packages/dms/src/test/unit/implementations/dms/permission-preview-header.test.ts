import { expect } from "chai";
import {
  findHeaderActionsHiddenByPreview,
  findQuickActionsHiddenByPreview,
  type HeaderActionAccess,
  readHeaderActions,
} from "../../../../implementations/dms/permission-preview";

const DOCS = {
  id: "docs",
  label: "Docs",
  target: { type: "external" as const, url: "https://example.com" },
};
const NEW_TASK = {
  id: "new-task",
  label: "New task",
  target: { type: "quickAction" as const, id: "playground:new-task" },
};
const AUDIT = {
  id: "audit",
  label: "Audit",
  target: { type: "page" as const, url: "/audit" },
};
// A table view's button placed in the header, served with the table.
const INVITE = {
  id: "table:invite",
  label: "Invite",
  componentId: "table",
  buttonId: "invite",
};

const ALL_QUICK_ACTIONS = {
  actions: { "playground:new-task": { id: "new-task" } },
};

function access(overrides: Partial<HeaderActionAccess>): HeaderActionAccess {
  return {
    headerActions: [DOCS, NEW_TASK, AUDIT, INVITE],
    quickActions: ALL_QUICK_ACTIONS,
    ...overrides,
  };
}

describe("[unit] implementations/dms/permission-preview — header and quick actions", () => {
  it("reads the header actions of a served layout", () => {
    expect(
      readHeaderActions({ options: { headerActions: [DOCS] } }),
    ).to.deep.equal([DOCS]);
    expect(readHeaderActions({ options: {} })).to.deep.equal([]);
    expect(readHeaderActions(undefined)).to.deep.equal([]);
  });

  it("changes nothing when the set is served what the viewer is", () => {
    expect(findHeaderActionsHiddenByPreview(access({}), access({}))).to.be
      .empty;
  });

  it("hides an action left out by its permission", () => {
    const preview = access({ headerActions: [DOCS, NEW_TASK, INVITE] });
    expect(findHeaderActionsHiddenByPreview(access({}), preview)).to.deep.equal(
      ["audit"],
    );
  });

  it("hides an action whose quick action the set is not served", () => {
    const preview = access({ quickActions: { actions: {} } });
    expect(findHeaderActionsHiddenByPreview(access({}), preview)).to.deep.equal(
      ["new-task"],
    );
  });

  it("hides a component's button the set is not served with the component", () => {
    const preview = access({ headerActions: [DOCS, NEW_TASK, AUDIT] });
    expect(findHeaderActionsHiddenByPreview(access({}), preview)).to.deep.equal(
      ["table:invite"],
    );
  });

  it("ignores an action the viewer is not shown either", () => {
    const viewer = access({ quickActions: { actions: {} } });
    const preview = access({ quickActions: { actions: {} } });
    expect(findHeaderActionsHiddenByPreview(viewer, preview)).to.be.empty;
  });

  it("lists the quick actions the set is not served", () => {
    const viewer = {
      actions: {
        "playground:new-task": { id: "new-task" },
        "playground:open-tabs": { id: "open-tabs" },
      },
    };
    const preview = {
      actions: { "playground:open-tabs": { id: "open-tabs" } },
    };
    expect(findQuickActionsHiddenByPreview(viewer, preview)).to.deep.equal([
      "playground:new-task",
    ]);
  });
});
