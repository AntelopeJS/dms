import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { sign } from "jsonwebtoken";
import { authorizedClient } from "../helpers/auth";
import { createClient } from "../helpers/http";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const SESSION_EXPIRED_ERROR = "error.session_expired";
const FOREIGN_SECRET = "not-the-dms-secret";

interface RouteEntry {
  fullSlug: string;
  hasAccess?: boolean;
  publicAccess?: boolean;
}

interface SiteLayoutResponse {
  siteLayout: { pages: Record<string, RouteEntry> };
}

// A token of the DMS's own shape, signed with a key the DMS does not hold:
// what a browser still sends once its session was revoked or its key rotated.
function rejectedToken(): string {
  return sign(
    { id: "missing-user", tenantId: "default", purpose: "access" },
    FOREIGN_SECRET,
  );
}

async function findPage(
  client: AxiosInstance,
  matches: (route: RouteEntry) => boolean,
): Promise<string> {
  const response = await client.get<SiteLayoutResponse>("/dms/sitelayout");
  const route = Object.values(response.data.siteLayout.pages).find(matches);
  if (!route) throw new Error("no registered page matches");
  return route.fullSlug;
}

function fetchPage(client: AxiosInstance, path: string) {
  return client.get("/dms/page", { params: { path, shared: "false" } });
}

describe("[integration] dms page with a stale session", () => {
  let anonymous: AxiosInstance;
  let privatePath: string;
  let publicPath: string;

  before(async () => {
    anonymous = createClient();
    privatePath = await findPage(
      anonymous,
      (route) => route.hasAccess === false && !route.publicAccess,
    );
    publicPath = await findPage(anonymous, (route) => !!route.publicAccess);
  });

  it("keeps serving a denied private page to an anonymous visitor", async () => {
    const response = await fetchPage(anonymous, privatePath);
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.route.hasAccess).to.equal(false);
  });

  it("answers 401 when a rejected bearer is what denies the page", async () => {
    const response = await fetchPage(
      authorizedClient(rejectedToken()),
      privatePath,
    );
    expect(response.status).to.equal(HTTP_UNAUTHORIZED);
    expect(response.data).to.equal(SESSION_EXPIRED_ERROR);
  });

  it("answers 401 for a bearer that is not a token at all", async () => {
    const response = await fetchPage(authorizedClient("garbage"), privatePath);
    expect(response.status).to.equal(HTTP_UNAUTHORIZED);
  });

  it("still serves a public page to a rejected bearer", async () => {
    const response = await fetchPage(
      authorizedClient(rejectedToken()),
      publicPath,
    );
    expect(response.status).to.equal(HTTP_OK);
  });
});
