import { expect } from "chai";
import { diffText } from "../../../implementations/dms-builder/engine";

const UNCHANGED = Array.from({ length: 20 }, (_, index) => `  line ${index};`);

function lines(...parts: string[][]): string {
  return `${parts.flat().join("\n")}\n`;
}

/** The diff the integrator reads before confirming: only what changed, with a little around it. */
describe("the diff of a written file", () => {
  it("is empty when nothing changed", () => {
    expect(diffText("a\nb\n", "a\nb\n")).to.equal("");
  });

  it("shows two edits far apart as two hunks, and the lines between them nowhere", () => {
    const before = lines(["top"], UNCHANGED, ["bottom"]);
    const after = lines(["top", "added near the top"], UNCHANGED, [
      "bottom",
      "added at the end",
    ]);
    const diff = diffText(before, after);
    expect(diff.match(/^@@ /gm)).to.have.length(2);
    expect(diff)
      .to.include("+added near the top")
      .and.to.include("+added at the end");
    expect(diff).to.not.include("line 10;");
    expect(
      diff.split("\n").filter((line) => line.startsWith("-")),
    ).to.deep.equal([]);
  });

  it("marks every line of a new file as added", () => {
    expect(diffText("", "a\nb\n").split("\n").slice(1)).to.deep.equal([
      "+a",
      "+b",
    ]);
  });

  it("starts an empty side at line 0, as unified diffs do", () => {
    expect(diffText("", "a\nb\n").split("\n")[0]).to.equal("@@ -0,0 +1,2 @@");
    expect(diffText("a\nb\n", "").split("\n")[0]).to.equal("@@ -1,2 +0,0 @@");
  });
});
