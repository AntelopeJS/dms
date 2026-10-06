import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { createClient } from "../helpers/http";

// A page's payload names the frontend module that owns its component tree,
// the one the module registering the page added: dms-frontend resolves that
// module's private components in this page only.

const HTTP_OK = 200;
const DMS_FRONTEND_MODULE = "@antelopejs/dms-frontend-vue";
// Added by the test host (src/test/attachment-host/index.ts), which also
// registers the page below.
const TEST_HOST_FRONTEND_MODULE = "@antelopejs/dms-test-host-frontend";
const TEST_HOST_PAGE = "/capability-invoices";
const DMS_PAGE_ID_PREFIX = "settings.";

interface RouteEntry {
  fullId: string;
  fullSlug: string;
}

interface SiteLayoutResponse {
  siteLayout: { pages: Record<string, RouteEntry> };
}

async function pageModule(
  client: AxiosInstance,
  path: string,
): Promise<string | undefined> {
  const response = await client.get("/dms/page", {
    params: { path, shared: "false" },
  });
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  return response.data.module;
}

describe("[integration] the frontend module owning a page", () => {
  let client: AxiosInstance;

  before(() => {
    client = createClient();
  });

  it("is the DMS frontend on a page the DMS registers", async () => {
    const layout = await client.get<SiteLayoutResponse>("/dms/sitelayout");
    const page = Object.values(layout.data.siteLayout.pages).find((route) =>
      route.fullId.startsWith(DMS_PAGE_ID_PREFIX),
    );
    expect(page).to.not.equal(undefined);

    expect(await pageModule(client, page!.fullSlug)).to.equal(
      DMS_FRONTEND_MODULE,
    );
  });

  it("is the module's own frontend on a page another module registers", async () => {
    expect(await pageModule(client, TEST_HOST_PAGE)).to.equal(
      TEST_HOST_FRONTEND_MODULE,
    );
  });
});
