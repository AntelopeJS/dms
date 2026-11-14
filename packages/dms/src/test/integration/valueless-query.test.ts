import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const NOTIFICATIONS = pageRoutePath("/settings/user/notifications");
const PAGE_PATH = "/settings/user/notifications";

let client: AxiosInstance;

/** What a route answers a request, status and body. */
async function answerOf(url: string) {
  const response = await client.get<unknown>(url);
  return { status: response.status, body: response.data };
}

/**
 * Asserts that `?name` with no value, the `true` interface-api reads it as,
 * answers exactly as the same request without that parameter.
 */
async function expectReadAsAbsent(valueless: string, without: string) {
  expect(await answerOf(valueless), valueless).to.deep.equal(
    await answerOf(without),
  );
}

describe("[integration] a query parameter given with no value", () => {
  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
  });

  it("serves the frontend manifest as without clientUrl, renderer and rendererVersion (fails when true reaches the manifest builder)", async () => {
    await expectReadAsAbsent(
      "/dms/frontend?clientUrl&renderer&rendererVersion",
      "/dms/frontend",
    );
  });

  it("refuses a page without a path as with no path, and reads a valueless shared as absent (fails when true is taken as the path)", async () => {
    const missing = await answerOf("/dms/page");
    expect(missing.status).to.equal(400);
    await expectReadAsAbsent("/dms/page?path", "/dms/page");
    await expectReadAsAbsent(
      `/dms/page?path=${PAGE_PATH}&shared`,
      `/dms/page?path=${PAGE_PATH}`,
    );
  });

  it("refuses a page layout without a slug as with no slug (fails when true is taken as the slug)", async () => {
    const missing = await answerOf("/dms/pagelayout");
    expect(missing.status).to.equal(400);
    await expectReadAsAbsent("/dms/pagelayout?slug", "/dms/pagelayout");
  });

  it("pages the notification feed and inbox as without limit and offset (fails when true reaches the page size or offset)", async () => {
    await expectReadAsAbsent(
      `${NOTIFICATIONS}/list?limit&offset`,
      `${NOTIFICATIONS}/list`,
    );
    await expectReadAsAbsent(
      `${NOTIFICATIONS}/inbox?limit&offset`,
      `${NOTIFICATIONS}/inbox`,
    );
  });

  it("refuses file metadata without a resource key as with none, and reads a valueless storage as absent (fails when true reaches the metadata schema)", async () => {
    const missing = await answerOf("/api/files/metadata");
    expect(missing.status).to.equal(400);
    await expectReadAsAbsent(
      "/api/files/metadata?resourceKey",
      "/api/files/metadata",
    );
    await expectReadAsAbsent(
      "/api/files/metadata?resourceKey=valueless-query/report.pdf&storage",
      "/api/files/metadata?resourceKey=valueless-query/report.pdf",
    );
  });
});
