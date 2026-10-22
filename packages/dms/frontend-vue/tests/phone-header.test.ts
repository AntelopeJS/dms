import { describe, expect, it } from "vitest";
import { keepHyphenatedWords } from "../layers/dms-ui/app/build/utils/eyebrow";
import {
  foldBreadcrumb,
  withParentCrumb,
} from "../layers/dms-layout/app/utils/breadcrumb";

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

describe("withParentCrumb", () => {
  const home = { label: "Home", to: "/" };
  const project = { label: "Solar farm" };
  const projects = { label: "Projects", to: "/operations/projects" };

  it("puts the parent page before the current one", () => {
    expect(
      withParentCrumb([home, { label: "Operations" }, project], projects),
    ).toEqual([home, { label: "Operations" }, projects, project]);
  });

  it("adds nothing when a crumb already opens the parent, or without one", () => {
    expect(withParentCrumb([home, projects, project], projects)).toEqual([
      home,
      projects,
      project,
    ]);
    expect(withParentCrumb([home, project], null)).toEqual([home, project]);
  });
});
