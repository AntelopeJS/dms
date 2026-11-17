import path from "node:path";
import { expect } from "chai";
import {
  isInsideFolder,
  posixRelative,
} from "../../../implementations/dms-builder/engine";

const MODULE_ROOT = "D:\\a\\app\\modules\\erp-tables";

describe("a path the builder compares or stores, as Windows spells it", () => {
  it("finds a file ts-morph names with forward slashes inside a module folder node:path names with backslashes", () => {
    expect(
      isInsideFolder(
        MODULE_ROOT,
        "D:/a/app/modules/erp-tables/src/sales/orders/database.ts",
        path.win32,
      ),
    ).to.equal(true);
    expect(
      isInsideFolder(MODULE_ROOT, "d:/a/app/modules/erp-tables", path.win32),
    ).to.equal(true);
  });

  it("keeps a sibling whose name starts with the module's, the parent and another drive outside", () => {
    expect(
      isInsideFolder(
        MODULE_ROOT,
        "D:/a/app/modules/erp-tables-old/src/index.ts",
        path.win32,
      ),
    ).to.equal(false);
    expect(
      isInsideFolder(MODULE_ROOT, "D:/a/app/modules", path.win32),
    ).to.equal(false);
    expect(
      isInsideFolder(
        MODULE_ROOT,
        "C:\\a\\app\\modules\\erp-tables\\src\\index.ts",
        path.win32,
      ),
    ).to.equal(false);
  });

  it("writes a module's path in the project configuration with forward slashes", () => {
    expect(posixRelative("D:\\a\\app", MODULE_ROOT, path.win32)).to.equal(
      "modules/erp-tables",
    );
  });
});
