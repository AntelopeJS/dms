import { expect } from "chai";
import { MapResources } from "../../../implementations/dms-builder";
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
  compilerOptions: {
    moduleResolution: "bundler",
    target: "esnext",
    module: "commonjs",
    lib: ["ES2020"],
    types: ["node"],
    strict: true,
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    rootDir: "src",
  },
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
