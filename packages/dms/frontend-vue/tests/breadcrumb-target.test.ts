import { describe, expect, it } from "vitest";
import { buildBreadcrumbTarget } from "../layers/dms-layout/app/utils/breadcrumb";

const PAGE = { layoutUrl: "/projects/project/pagelayout" };
const PROJECT_PAGE = {
  ...PAGE,
  validation: { requiredQueryParams: ["project"] },
};

describe("buildBreadcrumbTarget", () => {
  it("links a page without query requirements to its bare path", () => {
    expect(
      buildBreadcrumbTarget("/projects", PAGE, { project: "p1" }),
    ).to.equal("/projects");
  });

  it("gives a category without a page no link", () => {
    expect(buildBreadcrumbTarget("/projects", {}, {})).to.equal(undefined);
  });

  it("carries only the query values an ancestor page requires", () => {
    expect(
      buildBreadcrumbTarget("/projects/project", PROJECT_PAGE, {
        project: "p 1&x",
        service: "s1",
      }),
    ).to.equal("/projects/project?project=p+1%26x");
  });

  it("gives no link when a required query value is missing", () => {
    expect(
      buildBreadcrumbTarget("/projects/project", PROJECT_PAGE, {
        service: "s1",
      }),
    ).to.equal(undefined);
  });

  it("gives no link when a required query value is empty or repeated", () => {
    expect(
      buildBreadcrumbTarget("/projects/project", PROJECT_PAGE, {
        project: "",
      }),
    ).to.equal(undefined);
    expect(
      buildBreadcrumbTarget("/projects/project", PROJECT_PAGE, {
        project: ["a", "b"],
      }),
    ).to.equal(undefined);
  });
});
