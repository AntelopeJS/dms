import { expect } from "chai";
import { MapResources } from "../../../implementations/dms-builder";
import { DEFAULT_COMPILER_OPTIONS } from "../../../implementations/dms-builder/engine/project";
import { expectOk, setConnectionAccess } from "./harness";
import {
  COUNTRIES_API,
  countries,
  useErpFixture,
} from "./helpers/connection-access";
import { OP_TIMEOUT } from "./mapped-database";

/**
 * The DMS template's options, which check declaration files, in a project that resolves
 * `@antelopejs/interface-dms` to its real path outside `node_modules`, as a workspace linking the
 * interface does. Its table-view routes name `Buffer<ArrayBufferLike>`, which a checker older than
 * TypeScript 5.7 rejects.
 */
const LIB_CHECKED_TSCONFIG = {
  compilerOptions: { ...DEFAULT_COMPILER_OPTIONS, rootDir: "src" },
  include: ["src"],
};

describe("[unit] a writable mapping in a project that checks its declaration files", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    erp
      .app()
      .write("../tsconfig.json", `${JSON.stringify(LIB_CHECKED_TSCONFIG)}\n`);
  });

  it("writes the table's write routes", async () => {
    setConnectionAccess({ erp: "read-write" });
    expectOk(await MapResources(countries(true)), "writable mapping");
    expect(erp.moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.All");
  });
});
