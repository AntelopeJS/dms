import { expect } from "chai";
import { Project } from "ts-morph";
import { findImporters } from "../../../implementations/dms-builder/engine/writable";

describe("findImporters", () => {
  it("finds the barrel that exports a file asked for by a Windows path", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/app/orders/index.ts", "export const a = 1;");
    const barrel = project.createSourceFile(
      "/app/index.ts",
      'export * from "./orders";',
    );

    const importers = findImporters(project, "\\app\\orders\\index.ts");

    expect(importers.map((importer) => importer.getSourceFile())).to.deep.equal(
      [barrel],
    );
  });
});
