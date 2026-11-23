import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  PageController,
  PageMetadata,
  pagesCategory,
} from "@antelopejs/interface-dms/page";

describe("[unit] interfaces/dms/page — a detail page names its parent page: a hidden detail page names the list it belongs to (`parent`) and carries the list's full slug, which the breadcrumb shows before it", () => {
  it("resolves the parent controller to its full slug", () => {
    const list = PageController("pp-projects", {
      displayName: "Projects",
      category: pagesCategory,
    });
    const detail = PageController("pp-project", {
      displayName: "Project",
      category: pagesCategory,
      urlSlug: "pp-project/:id",
      hidden: true,
      parent: list,
    });
    const listInfo = GetMetadata(list, PageMetadata).pageInfo;
    const detailInfo = GetMetadata(detail, PageMetadata).pageInfo;
    expect(detailInfo?.parentSlug).to.equal(listInfo?.fullSlug);
    expect(detailInfo).to.not.have.property("parent");
    expect(listInfo?.parentSlug).to.equal(undefined);
  });
});
