import { describe, expect, it } from "vitest";
import {
  richTextFormatter,
  richTextToPlainText,
} from "../layers/dms-ui/app/entries/composables/data-types/richTextCell";

describe("richTextToPlainText", () => {
  it("strips the tags, keeping blocks and line breaks apart", () => {
    expect(
      richTextToPlainText(
        "<p>Back in stock in <strong>March</strong>.</p><ul><li>Oak</li><li>Ash</li></ul>Line<br>break",
      ),
    ).toBe("Back in stock in March. Oak Ash Line break");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(
      richTextToPlainText(
        "<p>Tom &amp; Jerry&nbsp;&lt;3 &#233;t&#xE9;\n\n  &copy;&#99999999;</p>",
      ),
    ).toBe("Tom & Jerry <3 été &copy;&#99999999;");
  });

  it("reads a value that is not a text as empty", () => {
    expect(richTextToPlainText(undefined)).toBe("");
    expect(richTextToPlainText(42)).toBe("");
  });
});

describe("the rich_text formatter", () => {
  it("draws the text of a document in a cell and in a record", () => {
    expect(richTextFormatter.cell("<p>Sold by packs of four.</p>", "en")).toBe(
      "Sold by packs of four.",
    );
    expect(richTextFormatter.default("<h2>Notes</h2>", "en")).toBe("Notes");
  });

  it("reads an empty document as any empty value", () => {
    expect(richTextFormatter.cell("<p></p>", "en")).toBe("-");
    expect(richTextFormatter.default("<p> </p>", "en")).toBe("—");
    expect(richTextFormatter.cell("<p></p>", "en", { fallback: "None" })).toBe(
      "None",
    );
  });
});
