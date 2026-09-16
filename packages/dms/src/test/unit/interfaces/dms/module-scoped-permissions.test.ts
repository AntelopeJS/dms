import { expect } from "chai";
import {
  IsModuleScopedPermission,
  MarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";

describe("[unit] interfaces/dms/permissions — module-scoped ids", () => {
  it("matches a marked id exactly", () => {
    MarkModuleScopedPermission("msp-exact");
    expect(IsModuleScopedPermission("msp-exact")).to.equal(true);
  });

  it("matches every dot-separated descendant of a marked id", () => {
    MarkModuleScopedPermission("msp-tree.page");
    expect(IsModuleScopedPermission("msp-tree.page.table")).to.equal(true);
    expect(IsModuleScopedPermission("msp-tree.page.table.add")).to.equal(true);
  });

  it("does not match a sibling whose id merely starts with the marked string", () => {
    MarkModuleScopedPermission("msp-prefix.page");
    expect(IsModuleScopedPermission("msp-prefix.pagex")).to.equal(false);
    expect(IsModuleScopedPermission("msp-prefix.pagex.table")).to.equal(false);
  });

  it("does not match the parent of a marked id", () => {
    MarkModuleScopedPermission("msp-parent.child");
    expect(IsModuleScopedPermission("msp-parent")).to.equal(false);
  });

  it("does not match unmarked ids", () => {
    expect(IsModuleScopedPermission("msp-unmarked.page")).to.equal(false);
  });
});
