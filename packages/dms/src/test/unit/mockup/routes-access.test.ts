import { Readable } from "node:stream";
import { getRegisteredRoutes } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { createClient } from "../../helpers/http";
import { MOCKUP_API, serveMockupRoutes } from "../../helpers/mockup-routes";

const ANNOTATIONS = `${MOCKUP_API}/desk/annotations`;
const NOTE = { page: "home", path: "/pages/0/tree/0", text: "Not mine" };

const SPEC = JSON.stringify({
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      fixtures: { orders: [{ _id: "o1" }] },
      tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
    },
  ],
});

/** A value for each route parameter, so every route resolves to a real path. */
const ROUTE_ARGUMENTS = new Map([
  ["name", "desk"],
  ["page", "home"],
  ["key", "orders"],
  ["id", "a1"],
]);

interface RegisteredRoute {
  method: string;
  location: string;
}

function mockupRoutes(): RegisteredRoute[] {
  return getRegisteredRoutes()
    .filter((route) => route.location.startsWith(MOCKUP_API))
    .map(({ method, location }) => ({ method, location }));
}

function pathOf(route: RegisteredRoute): string {
  return route.location.replace(
    /:(\w+)/g,
    (_, param: string) => ROUTE_ARGUMENTS.get(param) ?? param,
  );
}

function label(route: RegisteredRoute, status: number): string {
  return `${route.method.toUpperCase()} ${pathOf(route)} ${status}`;
}

/**
 * Sends one request to `route` and labels it with the status it got. The body
 * is dropped unread, so an event stream the route wrongly opens answers 200
 * instead of hanging the test.
 */
async function answerOf(
  client: AxiosInstance,
  route: RegisteredRoute,
): Promise<string> {
  const isRead = route.method.toUpperCase() === "GET";
  const response = await client.request({
    method: route.method,
    url: pathOf(route),
    responseType: "stream",
    ...(!isRead && { data: NOTE }),
  });
  const body: unknown = response.data;
  if (body instanceof Readable) body.destroy();
  return label(route, response.status);
}

async function answersOf(client: AxiosInstance): Promise<string[]> {
  return Promise.all(mockupRoutes().map((route) => answerOf(client, route)));
}

/** Each mockup route answering `status`, labelled as {@link answerOf} does. */
function everyRouteAnswering(status: number): string[] {
  return mockupRoutes().map((route) => label(route, status));
}

describe("[unit] mockup routes: platform owners only", () => {
  const served = serveMockupRoutes(SPEC);
  const anonymous = createClient();
  let owner: AxiosInstance;
  let member: AxiosInstance;

  before(async () => {
    ({ owner } = served());
    member = authorizedClient((await registerUser()).accessToken);
  });

  it("registers routes for the checks below to cover", () => {
    expect(mockupRoutes().length).to.be.greaterThan(0);
  });

  it("answers 401 on every route to a caller with no session", async () => {
    expect(await answersOf(anonymous)).to.deep.equal(everyRouteAnswering(401));
  });

  it("answers 403 on every route to a signed-in member who is not the platform owner", async () => {
    expect(await answersOf(member)).to.deep.equal(everyRouteAnswering(403));
  });

  it("answers 403 on every route to a member whose role lists every permission", async () => {
    const [role] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Holds *",
      permissions: ["*"],
    });
    const holder = authorizedClient(
      (await registerUser({ roles_ids: [role] })).accessToken,
    );

    expect(await answersOf(holder)).to.deep.equal(everyRouteAnswering(403));
  });

  it("writes no annotation for a refused caller, and writes the owner's", async () => {
    await anonymous.post(ANNOTATIONS, NOTE);
    await member.post(ANNOTATIONS, NOTE);
    const refused = await owner.get(ANNOTATIONS);
    const created = await owner.post(ANNOTATIONS, NOTE);
    const listed = await owner.get(ANNOTATIONS);

    expect(refused.data).to.deep.equal({ annotations: [] });
    expect(created.status).to.equal(200);
    expect(listed.data).to.deep.equal({ annotations: [created.data] });
  });
});
