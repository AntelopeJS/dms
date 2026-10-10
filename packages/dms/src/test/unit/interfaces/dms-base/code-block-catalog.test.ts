import { expect } from "chai";
import { CodeBlock } from "@antelopejs/interface-dms/base/code-block";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

/**
 * A code block is placed from the page builder like the display blocks: in
 * the catalog with its options described, read-only code with a copy button
 * by default, its code written in place or read from a route.
 */
describe("[unit] interfaces/dms-base/code block — in the catalog", () => {
  it("declares the block with its component and its defaults", () => {
    const block = declared("CodeBlock");

    expect(block.componentName).to.equal("dms-code-block");
    expect(block.defaults.language).to.equal("text");
    expect(block.defaults.copy).to.equal(true);
    expect(block.config.code?.ui?.widget).to.equal("textarea");
    expect(block.config.fetchUrl?.ui?.widget).to.equal("dataSource");
    expect(block.config.fetchUrl?.ui?.advanced).to.equal(true);
  });

  it("emits the copy button on unless the page turns it off", () => {
    const options = CodeBlock({ code: "{}", language: "json" }).serializeSync()
      .options as Record<string, unknown>;

    expect(options.copy).to.equal(true);
    expect(options.language).to.equal("json");
  });

  it("accepts each language it highlights and refuses the others", () => {
    for (const language of ["json", "typescript", "html", "sql", "shell"]) {
      expect(
        ValidateBlockOptions("CodeBlock", { code: "x", language }).valid,
        language,
      ).to.equal(true);
    }
    expect(
      ValidateBlockOptions("CodeBlock", { code: "x", language: "cobol" }).valid,
    ).to.equal(false);
  });

  it("takes a composed text as its title", () => {
    const title = { key: "media.snippet.title", params: { count: 3 } };

    expect(ValidateBlockOptions("CodeBlock", { title }).valid).to.equal(true);
  });

  it("lets an empty state carry a snippet to start with", () => {
    const code = { content: "await mail.send({ to })", language: "typescript" };

    expect(
      ValidateBlockOptions("EmptyState", { title: "No email yet", code }).valid,
    ).to.equal(true);
    expect(
      ValidateBlockOptions("EmptyState", {
        title: "No email yet",
        code: { language: "json" },
      }).valid,
    ).to.equal(false);
  });
});
