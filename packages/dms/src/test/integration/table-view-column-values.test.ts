import { GetModel } from "@antelopejs/interface-database-decorators";
import type { AxiosInstance, AxiosResponse } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { applyTenantOwnership } from "@antelopejs/interface-dms/tenant-ownership";
import { authorizedClient, parseAuthBody, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";
import { parseBody } from "../helpers/parse-body";

const ORDERS_PAGE = "column-values-orders";
const UNREACHABLE_PAGE = "column-values-unreachable";
const NOTES_PAGE = "archive-notes";
const ORDERS = "/api/column-values/orders";
const NORTH = "column-values-north";
const SOUTH = "column-values-south";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

interface Order {
  title: string;
  status: string;
  currency: string;
  total: number;
  labels: string[];
}

/** What a page's table shows of its rows: the values of its status badges, its currency and its tabs. */
interface ServedTable {
  statuses: string[];
  labels: string[];
  currency?: string;
  tabs?: string[];
}

interface Tenant {
  tenantId: string;
  orders: Order[];
  served: ServedTable;
}

/** Two tenants whose orders share no status and no currency. */
const TENANTS: Tenant[] = [
  {
    tenantId: NORTH,
    orders: [
      {
        title: "North 1",
        status: "zq_paid",
        currency: "JPY",
        total: 10,
        labels: ["qv_red"],
      },
      {
        title: "North 2",
        status: "zq_held",
        currency: "JPY",
        total: 20,
        labels: ["qv_red", "qv_blue"],
      },
      {
        title: "North 3",
        status: "zq_paid",
        currency: "JPY",
        total: 30,
        labels: [],
      },
    ],
    served: {
      statuses: ["zq_held", "zq_paid"],
      labels: ["qv_blue", "qv_red"],
      currency: "JPY",
      tabs: ["all", "status-zq-held", "status-zq-paid"],
    },
  },
  {
    tenantId: SOUTH,
    orders: [
      {
        title: "South 1",
        status: "xk_open",
        currency: "CHF",
        total: 40,
        labels: ["wm_solo"],
      },
      {
        title: "South 2",
        status: "xk_shut",
        currency: "CHF",
        total: 50,
        labels: ["wm_solo"],
      },
    ],
    served: {
      statuses: ["xk_open", "xk_shut"],
      labels: ["wm_solo"],
      currency: "CHF",
      tabs: ["all", "status-xk-open", "status-xk-shut"],
    },
  },
];

const PLAIN: ServedTable = {
  statuses: [],
  labels: [],
  currency: undefined,
  tabs: undefined,
};

const Layout = z.object({
  components: z.object({
    content: z.object({
      options: z.object({
        columns: z.array(
          z.object({
            id: z.string(),
            type: z.object({
              inputComponent: z.object({
                options: z
                  .object({
                    items: z.array(z.object({ value: z.unknown().optional() })),
                    currency: z.string(),
                  })
                  .partial()
                  .optional(),
              }),
            }),
          }),
        ),
        tabs: z.array(z.object({ id: z.string() })).optional(),
        formPages: z.object({ new: z.string() }).optional(),
      }),
    }),
  }),
});

const Payload = z.object({ layout: Layout });

type ServedLayout = z.infer<typeof Layout>;

function inputOf(layout: ServedLayout, column: string) {
  return layout.components.content.options.columns.find(
    (entry) => entry.id === column,
  )?.type.inputComponent.options;
}

function valuesOf(layout: ServedLayout, column: string): string[] {
  return (inputOf(layout, column)?.items ?? []).map((item) =>
    String(item.value),
  );
}

function servedTable(layout: ServedLayout): ServedTable {
  return {
    statuses: valuesOf(layout, "status"),
    labels: valuesOf(layout, "labels").toSorted(),
    currency: inputOf(layout, "total")?.currency,
    tabs: layout.components.content.options.tabs?.map((tab) => tab.id),
  };
}

function servedText(response: AxiosResponse<unknown>): string {
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  return JSON.stringify(response.data);
}

/** The page's table as each route that serves a page layout serves it, with the text of each answer. */
async function servedOnEveryRoute(
  client: AxiosInstance,
  page: string,
): Promise<{ table: ServedTable; text: string }[]> {
  const payload = await client.get("/dms/page", {
    params: { path: `/${page}`, shared: "false" },
  });
  const runtimeLayout = await client.get("/dms/pagelayout", {
    params: { slug: `/${page}` },
  });
  const pageLayout = await client.get(pageRoutePath(page, "/pagelayout"));
  return [
    {
      text: servedText(payload),
      table: servedTable(parseBody(Payload, payload).layout),
    },
    {
      text: servedText(runtimeLayout),
      table: servedTable(parseBody(Layout, runtimeLayout)),
    },
    {
      text: servedText(pageLayout),
      table: servedTable(parseBody(Layout, pageLayout)),
    },
  ];
}

interface Session {
  client: AxiosInstance;
  refreshToken: string;
}

/** What a tenant's own users hold: adding and listing orders, and listing the other tables. */
const READER = [
  `${ORDERS_PAGE}.content.list`,
  `${ORDERS_PAGE}.content.add.form`,
  `${UNREACHABLE_PAGE}.content.list`,
  `${NOTES_PAGE}.content.list`,
];

/** A session of `userId` switched to `tenantId`, where its role holds `permissions`. */
async function memberOf(
  refreshToken: string,
  userId: string,
  tenantId: string,
  permissions: string[],
): Promise<Session> {
  const [roleId] = await GetModel(RoleModel, tenantId).insert({
    name: `role in ${tenantId}`,
    permissions: withPermissionAncestors(permissions),
  });
  await applyTenantOwnership(GetModel(UserModel), userId, tenantId, {
    roleIds: [roleId],
    isTenantOwner: false,
  });
  const switched = await createClient().post("/api/auth/switch-tenant", {
    refreshToken,
    tenantId,
  });
  expect(switched.status, JSON.stringify(switched.data)).to.equal(HTTP_OK);
  const session = parseAuthBody(switched);
  return {
    client: authorizedClient(session.access_token),
    refreshToken: session.refresh_token,
  };
}

/**
 * A select, a price and the tabs of a table view name a column instead of
 * listing its values. An implementation that reads them across tenants, for a
 * caller who may not list the rows, or that fails the page when the rows
 * cannot be read, fails here; so does a route that serves the layout outside
 * the request it answers.
 */
describe("[integration] a table view reads the values of the columns it references when it serves the page", () => {
  const owners = new Map<string, AxiosInstance>();

  before(async () => {
    await resetDatabase();
    const caller = await registerUser();
    let { refreshToken } = caller;
    for (const { tenantId, orders } of TENANTS) {
      const owner = await memberOf(
        refreshToken,
        caller.userId,
        tenantId,
        READER,
      );
      refreshToken = owner.refreshToken;
      owners.set(tenantId, owner.client);
      for (const order of orders) {
        const created = await owner.client.post(`${ORDERS}/new`, order);
        expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
      }
    }
  });

  it("serves each tenant the statuses, labels, currency and tabs of its own rows alone, on every route that serves the page", async () => {
    for (const { tenantId, served } of TENANTS) {
      const others = TENANTS.filter((other) => other.tenantId !== tenantId)
        .flatMap((other) => other.orders)
        .flatMap((order) => [order.status, order.currency, ...order.labels]);
      for (const { table, text } of await servedOnEveryRoute(
        owners.get(tenantId)!,
        ORDERS_PAGE,
      )) {
        expect(table, tenantId).to.deep.equal(served);
        for (const value of others) {
          expect(text, `${tenantId} is served ${value}`).to.not.include(value);
        }
        expect(text).to.not.include("itemsFrom");
        expect(text).to.not.include("currencyFrom");
      }
    }
  });

  it("serves the form the table view opens as a page with the statuses and currency of the tenant's rows", async () => {
    const client = owners.get(NORTH)!;
    const table = await client.get("/dms/pagelayout", {
      params: { slug: `/${ORDERS_PAGE}` },
    });
    const formPage = parseBody(Layout, table).components.content.options
      .formPages?.new;
    expect(formPage, "the page of the new form").to.be.a("string");
    const text = servedText(
      await client.get("/dms/pagelayout", { params: { slug: formPage } }),
    );
    expect(text).to.include('"value":"zq_paid"');
    expect(text).to.include('"currency":"JPY"');
    expect(text).to.not.include("xk_open");
    expect(text).to.not.include("itemsFrom");
    expect(text).to.not.include("currencyFrom");
  });

  it("serves a member who may not list the rows the page with no status, currency or tab", async () => {
    const caller = await registerUser();
    const { client } = await memberOf(
      caller.refreshToken,
      caller.userId,
      NORTH,
      [`${ORDERS_PAGE}.content.view`],
    );
    const listed = await client.get(`${ORDERS}/list`);
    expect(listed.status, JSON.stringify(listed.data)).to.equal(HTTP_FORBIDDEN);
    for (const { table, text } of await servedOnEveryRoute(
      client,
      ORDERS_PAGE,
    )) {
      expect(table).to.deep.equal(PLAIN);
      expect(text).to.not.include("zq_paid");
    }
  });

  it("serves the page of a table whose rows cannot be read, its badges plain and without tabs", async () => {
    for (const { table } of await servedOnEveryRoute(
      owners.get(NORTH)!,
      UNREACHABLE_PAGE,
    )) {
      expect(table).to.deep.equal(PLAIN);
    }
  });

  it("serves the few values of a multiple column whose rows hold them in many combinations", async () => {
    const caller = await registerUser();
    const { client } = await memberOf(
      caller.refreshToken,
      caller.userId,
      "column-values-combinations",
      READER,
    );
    const labels = ["pa", "pb", "pc", "pd", "pe"];
    const combinations = Array.from({ length: 31 }, (_unused, index) =>
      labels.filter((_label, bit) => ((index + 1) >> bit) & 1),
    );
    for (const held of combinations) {
      const created = await client.post(`${ORDERS}/new`, {
        title: held.join("+"),
        status: "zq_paid",
        currency: "JPY",
        total: 1,
        labels: held,
      });
      expect(created.status, JSON.stringify(created.data)).to.equal(HTTP_OK);
    }
    const layout = await client.get("/dms/pagelayout", {
      params: { slug: `/${ORDERS_PAGE}` },
    });
    expect(servedTable(parseBody(Layout, layout)).labels).to.deep.equal(labels);
  });

  it("keeps the items a select lists itself", async () => {
    const response = await owners
      .get(NORTH)!
      .get("/dms/pagelayout", { params: { slug: `/${NOTES_PAGE}` } });
    const topics = inputOf(parseBody(Layout, response), "topics");
    expect(topics?.items?.map((item) => item.value)).to.deep.equal([
      "grid",
      "solar",
    ]);
  });
});
