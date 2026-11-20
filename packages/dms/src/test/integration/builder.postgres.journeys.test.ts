import {
  DestroyModule,
  LoadModule,
  StopModule,
} from "@antelopejs/interface-core/modules";
import { expect } from "chai";
import { Client } from "pg";
import { z } from "zod";
import { authorizedClient, registerUser } from "../helpers/auth";
import {
  CardBody,
  compileApp,
  daysAgo,
  ORDER_FIELDS,
  ORDER_SEEDS,
  PERIOD_BOUNDS,
  pointsOf,
  savedQueryRoute,
  SeriesBody,
  totalOf,
} from "../helpers/builder-orders";
import {
  type BuilderSession,
  useBuilderSession,
} from "../helpers/builder-session";
import { callTool } from "../helpers/mcp-bridge-process";
import { parseBody } from "../helpers/parse-body";
import {
  type Container,
  dockerAvailable,
  LIVE_SUITE_NOTE,
  removeContainer,
  secretOf,
  START_TIMEOUT_MS,
  startContainer,
  waitFor,
} from "../unit/builder/helpers/database-servers";

const OP_TIMEOUT = 120_000;
const HTTP_OK = 200;
const APP_MODULE = "builder-postgres-journeys-app";
/**
 * The core picks a default database provider by sorting module ids, so this id sorts after the
 * harness's `mongodb` and leaves the DMS on MongoDB.
 */
const POSTGRES_MODULE = "postgres";
const ORDER_SCHEMA = "builder-postgres-journeys";
const POSTGRES_PORT = 5432;
const ADMIN_SECRET = secretOf("admin");

/**
 * The interfaces the app declares. The core binds a module's interfaces together, so the
 * database one the app is pinned to reaches the decorators and the data API only when the app
 * declares each of them, as a project's `package.json` does.
 */
const APP_DEPENDENCIES = Object.fromEntries(
  [
    "interface-api",
    "interface-api-util",
    "interface-core",
    "interface-data-api",
    "interface-database",
    "interface-database-decorators",
  ].map((name) => [`@antelopejs/${name}`, "*"]),
);

/**
 * What the app does at its start, as the DMS does for its own schemas: it registers the schema
 * the order resource names, so that its tables and seeds go where the app's own context binds the
 * database interface, which a registration from the test's context would not reach.
 */
const REGISTER_SCHEMA = `import { RegisterSchema } from "@antelopejs/interface-database-decorators";

export async function start(): Promise<void> {
  await RegisterSchema(${JSON.stringify(ORDER_SCHEMA)});
}
`;

const ColumnsBody = z.array(z.object({ data_type: z.string() }));
const UncomparedCardBody = z
  .object({ value: z.number(), series: CardBody.shape.series })
  .strict();

const suite = dockerAvailable ? describe : describe.skip;

/** Starts a PostgreSQL server for the suite that calls it and removes it after the suite. */
function usePostgres(): () => string {
  let server: Container | undefined;
  let url: string | undefined;
  before(async () => {
    server = await startContainer("postgres:18", POSTGRES_PORT, [
      "-e",
      `POSTGRES_PASSWORD=${ADMIN_SECRET}`,
    ]);
    const address = `postgres://postgres:${ADMIN_SECRET}@127.0.0.1:${server.port}/postgres`;
    await waitFor("PostgreSQL", async () => {
      try {
        const client = new Client({ connectionString: address });
        await client.connect();
        await client.end();
        return true;
      } catch {
        return false;
      }
    });
    url = address;
  });
  after(async () => {
    await removeContainer(server);
  });
  return () => {
    if (url === undefined) throw new Error("PostgreSQL has not started");
    return url;
  };
}

/** The routes of a series query and of a card query that compares, both over the period bounds. */
async function saveStatsQueries({ shop, bridge }: BuilderSession) {
  const created = await callTool(bridge, "builder_create_resource", {
    name: "order",
    schema: ORDER_SCHEMA,
    fields: ORDER_FIELDS,
    seeds: ORDER_SEEDS,
  });
  expect(created.isError, created.text).to.equal(false);
  const query = { page: shop.PAGE, resource: "order", template: "series" };
  return {
    seriesRoute: await savedQueryRoute(bridge, {
      ...query,
      name: "periodOrders",
      params: { groupBy: "status", where: PERIOD_BOUNDS },
    }),
    cardRoute: await savedQueryRoute(bridge, {
      ...query,
      name: "periodRevenue",
      params: {
        op: "sum",
        field: "amount",
        groupBy: "createdAt",
        bucket: "month",
        where: PERIOD_BOUNDS,
      },
      response: "card",
      compare: true,
    }),
  };
}

/**
 * Compiles the app, loads `@antelopejs/postgres` against the server and loads the app with its
 * database interface bound to it. Adds each module's ids to `loaded` as soon as that module
 * loads, so a later failure still unloads it.
 */
async function loadAppOnPostgres(
  { shop }: BuilderSession,
  url: string,
  loaded: string[],
): Promise<void> {
  shop.writeShop("register-schema.ts", REGISTER_SCHEMA);
  shop.writeShop(
    "index.ts",
    `${shop.readShop("index.ts")}export * from "./register-schema";\n`,
  );
  compileApp(shop.shopRoot(), APP_MODULE, APP_DEPENDENCIES);
  loaded.push(
    ...(await LoadModule(
      POSTGRES_MODULE,
      {
        source: { type: "local", path: "node_modules/@antelopejs/postgres" },
        config: { url, migrations: "safe" },
      },
      true,
    )),
  );
  loaded.push(
    ...(await LoadModule(
      APP_MODULE,
      {
        source: { type: "local", path: shop.shopRoot() },
        config: {},
        importOverrides: {
          "@antelopejs/interface-database": [POSTGRES_MODULE],
        },
      },
      true,
    )),
  );
}

async function read(route: string, params: Record<string, string>) {
  const owner = authorizedClient(
    (await registerUser({ owner: true })).accessToken,
  );
  const answer = await owner.get(route, { params });
  expect(answer.status, JSON.stringify(answer.data)).to.equal(HTTP_OK);
  return answer;
}

/**
 * The app the builder writes, served over a real PostgreSQL server: the module under test loads
 * `@antelopejs/postgres` and the app reads its interface-database from it, so a `date` field is a
 * timestamp column PostgreSQL parses each bound of a query against. MongoDB takes any value for
 * a date bound and answers an invalid one with no rows, so only this server tells a route that
 * binds a malformed date from one that binds none.
 *
 * - `order-dates-are-timestamp-columns-in-postgres` fails when the app registers its schema with
 *   another database than the PostgreSQL server, such as the MongoDB of the test's own context,
 *   where the other tests would pass over a database that parses no timestamp.
 * - `stats-route-answers-the-period-without-comparison-bounds` fails when the card route a query
 *   saved with `compare` binds `new Date(String(compareFrom))` for a request that carries no
 *   `compareFrom` and `compareTo`: PostgreSQL refuses the Invalid Date it serializes and the route
 *   answers 500 "invalid input syntax for type timestamp", where the `comparison=none` request
 *   of the dashboard needs the period's own figures.
 * - `stats-route-answers-the-previous-period-with-comparison-bounds` fails when the route drops
 *   the comparison, or skips it for a request that does carry both bounds.
 * - `stats-series-route-answers-the-period-over-a-timestamp-column` fails when a route over
 *   PostgreSQL binds the period's bounds as anything but timestamps, so that the series answers
 *   500 or other orders than those between `from` and `to`.
 */
suite(
  `[integration] builder journeys: stats routes over a PostgreSQL timestamp column${LIVE_SUITE_NOTE}`,
  function () {
    this.timeout(START_TIMEOUT_MS + OP_TIMEOUT);
    const loaded: string[] = [];
    const routes = { seriesRoute: "", cardRoute: "" };
    after(async () => {
      for (const module of loaded.reverse()) {
        await StopModule(module);
        await DestroyModule(module);
      }
    });
    const postgres = usePostgres();
    const session = useBuilderSession();

    before(async () => {
      Object.assign(routes, await saveStatsQueries(session()));
      await loadAppOnPostgres(session(), postgres(), loaded);
    });

    it("order-dates-are-timestamp-columns-in-postgres", async () => {
      const database = new Client({ connectionString: postgres() });
      await database.connect();
      const columns = await database.query(
        `SELECT data_type FROM information_schema.columns WHERE column_name = 'createdAt'`,
      );
      await database.end();

      expect(
        ColumnsBody.parse(columns.rows).map(({ data_type }) => data_type),
      ).to.deep.equal(["timestamp with time zone"]);
    });

    it("stats-route-answers-the-period-without-comparison-bounds", async () => {
      const answered = await read(routes.cardRoute, {
        from: daysAgo(50),
        to: daysAgo(20),
      });

      const card = parseBody(UncomparedCardBody, answered);
      expect([card.value, totalOf(card.series)]).to.deep.equal([705, 705]);
    });

    it("stats-route-answers-the-previous-period-with-comparison-bounds", async () => {
      const card = parseBody(
        CardBody,
        await read(routes.cardRoute, {
          from: daysAgo(50),
          to: daysAgo(20),
          compareFrom: daysAgo(80),
          compareTo: daysAgo(50),
        }),
      );

      expect([card.value, totalOf(card.series)]).to.deep.equal([705, 705]);
      expect([
        card.previousValue,
        totalOf(card.comparisonSeries),
      ]).to.deep.equal([530, 530]);
    });

    it("stats-series-route-answers-the-period-over-a-timestamp-column", async () => {
      const ranged = await read(routes.seriesRoute, {
        from: daysAgo(50),
        to: daysAgo(20),
      });
      const recent = await read(routes.seriesRoute, {
        from: daysAgo(20),
        to: daysAgo(0),
      });

      expect(pointsOf(parseBody(SeriesBody, ranged))).to.equal(
        "paid=2,refunded=1",
      );
      expect(pointsOf(parseBody(SeriesBody, recent))).to.equal(
        "paid=2,pending=1",
      );
    });
  },
);
