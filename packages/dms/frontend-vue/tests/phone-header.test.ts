import { describe, expect, it } from "vitest";
import { keepHyphenatedWords } from "../layers/dms-ui/app/build/utils/eyebrow";
import { foldBreadcrumb } from "../layers/dms-layout/app/utils/breadcrumb";

const SLOT = "ellipsis";

describe("foldBreadcrumb", () => {
  it("keeps a single crumb between the first and the last", () => {
    expect(foldBreadcrumb(["home", "helio", "dashboard"], SLOT)).toEqual([
      "home",
      "helio",
      "dashboard",
    ]);
    expect(foldBreadcrumb(["home", "page"], SLOT)).toEqual(["home", "page"]);
  });

  it("folds two crumbs or more between them", () => {
    expect(
      foldBreadcrumb(["home", "helio", "operations", "project"], SLOT),
    ).toEqual([
      "home",
      { isFolded: true, slot: SLOT, children: ["helio", "operations"] },
      "project",
    ]);
  });
});

describe("keepHyphenatedWords", () => {
  it("joins a hyphenated word so it never breaks at its hyphen", () => {
    expect(keepHyphenatedWords("Encaissé ce mois-ci")).toBe(
      "Encaissé ce mois-⁠ci",
    );
  });

  it("leaves a dash between words and numbers alone", () => {
    expect(keepHyphenatedWords("Q1 - Q2")).toBe("Q1 - Q2");
    expect(keepHyphenatedWords("2024-2025")).toBe("2024-2025");
  });
});
