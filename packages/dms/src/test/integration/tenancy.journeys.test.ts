import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;

/**
 * Two data controllers' lists, a controller guarded by `AuthTenantMember`, and the attachment host's
 * routes whose `AuthTenantMember` and `AuthTenantOwner` pass the tenant access gate by.
 */
const TENANT_ROUTES = [
  { method: "GET", url: "/api/tables/members/list" },
  { method: "GET", url: "/api/tables/admin-invites/list" },
  { method: "GET", url: "/api/tenant-guarded-roles/names" },
  { method: "GET", url: "/api/tenant-gate-bypass/member" },
  { method: "POST", url: "/api/tenant-gate-bypass/owner" },
] as const;

describe("[integration] tenancy journeys", () => {
  before(resetDatabase);

  it("tenant-routes-refuse-visitors (fails when a tenant guard serves a caller without a session, the gate bypass of `AuthTenantMember` and `AuthTenantOwner` included, or refuses the workspace owner too)", async () => {
    const owner = authorizedClient(
      (await registerUser({ owner: true })).accessToken,
    );
    const visitor = createClient();

    for (const route of TENANT_ROUTES) {
      const refused = await visitor.request(route);
      const served = await owner.request(route);

      expect(refused.status, route.url).to.equal(HTTP_UNAUTHORIZED);
      expect(
        served.status,
        `${route.url}: ${JSON.stringify(served.data)}`,
      ).to.equal(HTTP_OK);
    }
  });
});
