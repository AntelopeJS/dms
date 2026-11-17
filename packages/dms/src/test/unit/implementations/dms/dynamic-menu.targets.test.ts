import { expect } from "chai";
import { type DynamicMenuItem } from "@antelopejs/interface-dms/page";
import {
  cleanups,
  OWNER,
  PAGE_SLUG,
  PARAM_PAGE_SLUG,
  registerMenuFixtures,
  registerProvider,
  resolveCategoryNode,
  runCleanups,
  runSuiteCleanups,
  TENANT_A,
} from "../../../helpers/dynamic-menu-fixtures";

describe("[unit] implementations/dms/page — dynamic menu providers, targets and route parameters", () => {
  before(registerMenuFixtures);

  afterEach(runCleanups);

  after(runSuiteCleanups);

  it("skips an entry whose id would alias a nested path", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "team.project",
          displayName: "Dotted id",
          fullSlug: PAGE_SLUG,
        },
        {
          id: "plain",
          displayName: "Plain id",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["plain"]);
  });

  it("skips an entry whose target page is not registered", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "orphan",
          displayName: "Orphan",
          fullSlug: "/does-not-exist",
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("links an entry to its target page with the route parameters filled", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "acme",
          displayName: "Acme",
          fullSlug: PARAM_PAGE_SLUG,
          params: { projectId: "acme/1" },
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.children.acme?.fullSlug).to.equal(
      "/dyn-projects/acme%2F1/services",
    );
    expect(node?.children.acme).to.not.have.property("params");
  });

  it("skips an entry that does not fill exactly its target's route parameters", async () => {
    cleanups.push(
      registerProvider((): DynamicMenuItem[] => [
        { id: "unfilled", displayName: "Unfilled", fullSlug: PARAM_PAGE_SLUG },
        {
          id: "empty",
          displayName: "Empty",
          fullSlug: PARAM_PAGE_SLUG,
          params: { projectId: "" },
        },
        {
          id: "misnamed",
          displayName: "Misnamed",
          fullSlug: PARAM_PAGE_SLUG,
          params: { project: "acme" },
        },
        {
          id: "extra",
          displayName: "Extra",
          fullSlug: PAGE_SLUG,
          params: { projectId: "acme" },
        },
        {
          id: "filled",
          displayName: "Filled",
          fullSlug: PARAM_PAGE_SLUG,
          params: { projectId: "acme" },
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["filled"]);
  });

  it("resolves the rest of the menu when a resolver throws", async () => {
    cleanups.push(
      registerProvider(() => {
        throw new Error("resolver exploded");
      }),
    );
    cleanups.push(
      registerProvider((): DynamicMenuItem[] => [
        {
          id: "survivor",
          displayName: "Survivor",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["survivor"]);
  });
});
