import { expect } from "chai";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import {
  collectCustomButtonIds,
  findHeaderActionsHiddenByPreview,
  findQuickActionsHiddenByPreview,
  type HeaderActionAccess,
  readHeaderActions,
} from "../../../../implementations/dms/permission-preview";

const DOCS = { id: "docs", label: "Docs", to: "https://example.com" };
const NEW_TASK = { id: "new-task", quickAction: "playground:new-task" };
const AUDIT = { id: "audit", to: "/audit", permission: "audit.read" };
const INVITE = { id: "invite", button: "invite" };

const ALL_QUICK_ACTIONS = {
  actions: { "playground:new-task": { id: "new-task" } },
};

function access(overrides: Partial<HeaderActionAccess>): HeaderActionAccess {
  return {
    headerActions: [DOCS, NEW_TASK, AUDIT, INVITE],
    quickActions: ALL_QUICK_ACTIONS,
    buttonIds: new Set(["invite"]),
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

  it("collects custom button ids at any depth", () => {
    const components = {
      table: {
        componentName: "dms-table-view",
        options: { customButtons: [{ id: "invite" }, { label: "no id" }] },
        children: [
          {
            id: "nested",
            component: {
              componentName: "dms-table-view",
              options: { customButtons: [{ id: "export-all" }] },
            },
          },
        ],
      },
    } as unknown as Record<string, ComponentInfoSerialized>;
    expect([...collectCustomButtonIds(components)]).to.deep.equal([
      "invite",
      "export-all",
    ]);
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

  it("hides an action pressing a custom button the set is not served", () => {
    const preview = access({ buttonIds: new Set() });
    expect(findHeaderActionsHiddenByPreview(access({}), preview)).to.deep.equal(
      ["invite"],
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
