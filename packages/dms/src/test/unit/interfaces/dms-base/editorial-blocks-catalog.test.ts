import { expect } from "chai";
import { Hero } from "@antelopejs/interface-dms/base/hero";
import { Prose } from "@antelopejs/interface-dms/base/prose";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

const ACTION = { label: "Open", to: "/orders" };

/**
 * The editorial blocks are placed from the page builder like the display
 * blocks: in the catalog with their options described, and their defaults
 * emitted so a page drawn from the descriptor alone looks the same.
 */
describe("[unit] interfaces/dms-base/editorial blocks — in the catalog", () => {
  describe("Hero", () => {
    it("declares the block with its component and its defaults", () => {
      const block = declared("Hero");

      expect(block.componentName).to.equal("dms-hero-block");
      expect(block.meta.group).to.equal("content");
      expect(block.defaults).to.include({
        align: "left",
        size: "lg",
        background: "plain",
        mediaPosition: "side",
      });
      expect(block.config.image?.ui?.widget).to.equal("url");
    });

    it("emits its defaults under the options a page sets", () => {
      const options = Hero({ title: "Hi", align: "center" }).serializeSync()
        .options as Record<string, unknown>;

      expect(options).to.include({
        title: "Hi",
        align: "center",
        size: "lg",
        background: "plain",
      });
    });

    it("takes composed texts and figures, and refuses a fourth action", () => {
      const title = { key: "home.hero.title", params: { name: "Ada" } };
      const proof = [{ value: "2 min", label: { key: "home.hero.setup" } }];

      expect(
        ValidateBlockOptions("Hero", { title, proof, actions: [ACTION] }).valid,
      ).to.equal(true);
      expect(
        ValidateBlockOptions("Hero", {
          actions: [ACTION, ACTION, ACTION, ACTION],
        }).valid,
      ).to.equal(false);
    });

    it("refuses a background or a size it does not draw", () => {
      expect(
        ValidateBlockOptions("Hero", { background: "photo" }).valid,
      ).to.equal(false);
      expect(ValidateBlockOptions("Hero", { size: "xl" }).valid).to.equal(
        false,
      );
    });
  });

  describe("Prose", () => {
    it("declares the block with its component and its defaults", () => {
      const block = declared("Prose");

      expect(block.componentName).to.equal("dms-prose-block");
      expect(block.defaults).to.include({ toc: false, width: "readable" });
      expect(block.config.fetchUrl?.ui?.widget).to.equal("dataSource");
    });

    it("emits its defaults under the options a page sets", () => {
      const options = Prose({ content: "# Hi", toc: true }).serializeSync()
        .options as Record<string, unknown>;

      expect(options).to.include({
        content: "# Hi",
        toc: true,
        width: "readable",
      });
    });

    it("takes Markdown, a $ key or one text per locale", () => {
      for (const content of [
        "## Title\n\nText",
        "$help.intro",
        { "en-GB": "Hello", "fr-FR": "Bonjour" },
      ]) {
        expect(
          ValidateBlockOptions("Prose", { content }).valid,
          JSON.stringify(content),
        ).to.equal(true);
      }
      expect(
        ValidateBlockOptions("Prose", { content: { "en-GB": 3 } }).valid,
      ).to.equal(false);
    });

    it("refuses a width it does not draw", () => {
      expect(ValidateBlockOptions("Prose", { width: "full" }).valid).to.equal(
        false,
      );
    });
  });
});
