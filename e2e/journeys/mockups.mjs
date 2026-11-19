import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fieldOf, itemsOf, parseJson } from "../mcp-bridge.mjs";
import { createRole, joinedMember } from "./settings-members/steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const ROUTES = ["/api/mockup", "/api/mockup/schema", "/api/mockup/orders/annotations"];
const NOTE = {
  page: "home",
  path: "/pages/0/tree/0",
  offset: { x: 0.5, y: 0.5 },
  text: "Not mine",
};
const SAMPLE_MOCKUP = "sample-live-routes";
/** Live routes of the playground, each named directly by a block of the sample mockup. */
const LIVE = { kpi: "/api/dashboard/kpi/revenue", chart: "/api/dashboard/sales", table: "/api/user/list" };
const ROWS_FIXTURE = "users";
/** Sample rows whose image and file cells name a live route and file keys, as the AI could write them. */
const SAMPLE_ROWS = [{ _id: "s1", name: "Sample row", pic: LIVE.kpi, doc: "probe-resource-key", gallery: [{ key: "probe-image-key" }] }];
/** A record whose read-only rich text carries styles that import a live route and load a font from another. */
const RECORD_FIXTURE = "record";
const SAMPLE_RECORD = {
  notes: `<p>Notes</p><style>@import url('${LIVE.chart}');</style>`,
  bio: `<p>Bio</p><style>@font-face{font-family:Probe;src:url('${LIVE.table}')} p{font-family:Probe}</style>`,
};
/** The file metadata route an image or file cell reads a key from. */
const FILE_METADATA = "/api/files/metadata";
const PREVIEW_PATH = "/dms-preview";
const DRAW_TIMEOUT_MS = 30_000;
const POLL_MS = 500;
const SETTLE_MS = 3_000;
/**
 * The dashboard's own API requests on any page, which read no block's data: its icons, its realtime session and
 * the page topics it subscribes to, and the onboarding and system state its shell checks.
 */
const SHELL_ROUTES = [
  /^GET \/api\/_dms\//,
  /^GET \/api\/realtime\/connection$/,
  /^POST \/api\/realtime\/session$/,
  /^POST \/api\/realtime\/subscribe\/pages\.[\w.-]+$/,
  /^GET \/api\/onboarding\/informations$/,
  /^GET \/api\/system-state$/,
];
/**
 * The request of the playground's command palette plugin, which every page of the dashboard runs, the preview frame
 * included: it reads the playground's feature index and draws nothing in the preview.
 */
const PLUGIN_ROUTES = [/^GET \/api\/playground-features$/];
/** The mockup whose Overview labels the label journey zooms out on. */
const OVERVIEW_MOCKUP = "overview-labels";
/** The Overview's narrowest zoom, `OVERVIEW_ZOOM.min` of the viewer. */
const OVERVIEW_MIN_ZOOM = 0.02;
/** One Ctrl+wheel notch of the zoom-out sweep, in pixels of wheel. */
const WHEEL_STEP_PX = 60;
/** More notches than it takes to reach the narrowest zoom from the fitted one. */
const ZOOM_OUT_STEPS = 16;
/** How long the camera rests after a notch, past the Overview's 250 ms rest. */
const ZOOM_SETTLE_MS = 400;
/** The frame width, on the screen, from which a label has room for its icons, its truncated titles and the marker. */
const MARKER_WHOLE_FROM_PX = 64;

/**
 * Writes a mockup's spec under the run's `mockups/`, which the development backend watches.
 *
 * @param {Ctx} ctx
 * @param {string} name
 * @param {{ title: string, pages: unknown[] }} spec
 */
function writeSpec(ctx, name, spec) {
  const folder = join(ctx.state.runPlayground ?? ctx.state.playground, "mockups", name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "spec.json"), JSON.stringify({ version: 1, ...spec }));
}

/**
 * Writes the sample mockup's spec.
 *
 * @param {Ctx} ctx
 * @param {unknown[]} tree
 */
function writeSampleSpec(ctx, tree) {
  const page = { id: "live", title: "Live", fixtures: { [ROWS_FIXTURE]: SAMPLE_ROWS, [RECORD_FIXTURE]: SAMPLE_RECORD }, tree };
  writeSpec(ctx, SAMPLE_MOCKUP, { title: "Sample on live routes", pages: [page] });
}

/**
 * The compiled sample tree of the mockup once it holds `count` nodes, polled while the backend recompiles.
 *
 * @param {Ctx} ctx
 * @param {number} count
 */
async function compiledTree(ctx, count) {
  const deadline = Date.now() + DRAW_TIMEOUT_MS;
  for (;;) {
    const state = await ctx.api("GET the sample mockup", { method: "GET", path: `/api/mockup/${SAMPLE_MOCKUP}` });
    const tree = itemsOf(fieldOf(itemsOf(fieldOf(state.body, "pages"))[0], "tree"));
    if (tree.length === count || Date.now() > deadline) return { tree, issues: fieldOf(state.body, "issues") };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}


/**
 * The data state each block of the preview frame reports, once none is loading.
 *
 * @param {import("playwright-core").Page} page
 */
async function previewStates(page) {
  const deadline = Date.now() + DRAW_TIMEOUT_MS;
  /** @type {string[]} */
  let states = [];
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes(PREVIEW_PATH));
    states = frame
      ? await frame
          .evaluate(() => [...document.querySelectorAll("[data-dms-block-state]")].map((element) => element.getAttribute("data-dms-block-state") ?? ""))
          .catch(() => [])
      : [];
    if (states.length >= Object.keys(LIVE).length && !states.includes("loading")) break;
    await page.waitForTimeout(POLL_MS);
  }
  await page.waitForTimeout(SETTLE_MS);
  return states;
}

/**
 * Waits until the backend compiled `count` pages of the mockup `name`.
 *
 * @param {Ctx} ctx
 * @param {string} name
 * @param {number} count
 */
async function compiledPages(ctx, name, count) {
  const deadline = Date.now() + DRAW_TIMEOUT_MS;
  for (;;) {
    const state = await ctx.api(`GET the ${name} mockup`, { method: "GET", path: `/api/mockup/${name}` });
    const pages = itemsOf(fieldOf(state.body, "pages"));
    if (pages.length === count || Date.now() > deadline) return pages.length;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Where each Overview frame's label is painted at the current zoom: each part's box cut to the ancestors that clip
 * it, against its frame's right edge, and how much of the hidden-page marker is painted.
 *
 * @param {import("playwright-core").Page} page
 */
function overviewLabels(page) {
  return page.evaluate(() => {
    const PARTS = ["title-icon", "parent", "title", "hidden", "count"].map((part) => `[data-dms-mockup-overview-${part}]`).join(", ");
    /** @param {Element} element */
    const painted = (element) => {
      const box = element.getBoundingClientRect();
      let { left, right } = box;
      for (let at = element.parentElement; at; at = at.parentElement) {
        if (getComputedStyle(at).overflowX === "visible") continue;
        const clip = at.getBoundingClientRect();
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      return { left, right, width: Math.max(0, right - left), drawnWidth: box.width };
    };
    const world = document.querySelector("[data-dms-mockup-overview-world]");
    const zoom = Number(/scale\(([^)]+)\)/.exec(world instanceof HTMLElement ? world.style.transform : "")?.[1] ?? NaN);
    const frames = [...document.querySelectorAll("[data-dms-mockup-overview-frame]")].map((frame) => {
      const edge = frame.getBoundingClientRect().right;
      const past = [...frame.querySelectorAll(PARTS)]
        .map((part) => ({ part: [...part.attributes].find((attribute) => attribute.name.startsWith("data-dms-mockup-overview-"))?.name, box: painted(part) }))
        .filter(({ box }) => box.width > 0 && box.right > edge + 0.5)
        .map(({ part, box }) => `${part} ends at ${Math.round(box.right)}, past ${Math.round(edge)}`);
      const marker = frame.querySelector("[data-dms-mockup-overview-hidden]");
      return {
        id: frame.getAttribute("data-dms-mockup-overview-frame"),
        width: Math.round(frame.getBoundingClientRect().width),
        past,
        marker: marker ? painted(marker) : undefined,
      };
    });
    return { zoom, frames };
  });
}

/**
 * Sends every mockup route's request as `as`, a read for each route and a
 * comment on the `orders` mockup.
 *
 * @param {Ctx} ctx
 * @param {string} as The account, or `anon`
 */
async function everyRoute(ctx, as) {
  const answers = [];
  for (const path of ROUTES) {
    answers.push(await ctx.api(`GET ${path} as ${as}`, { method: "GET", path, as }));
  }
  answers.push(
    await ctx.api(`POST a comment as ${as}`, { method: "POST", path: ROUTES[2], body: NOTE, as }),
  );
  return answers;
}

/** The development-only mockup engine, seen from a run's backend. */
export const journeys = [
  {
    id: "mockup-absent-outside-dev",
    title: "a backend started from a build serves no mockup route",
    entryPoint: "/api/mockup",
    backend: "production",
    async run(/** @type {Ctx} */ ctx) {
      const answers = [];
      for (const path of ROUTES) {
        answers.push(await ctx.api(`GET ${path} as the admin`, { method: "GET", path }));
      }
      await ctx.verify(
        "every mockup route answers 404",
        answers.map((answer) => ctx.status(answer, 404)),
      );
    },
  },
  {
    id: "mockup-owner-only-in-dev",
    title: "in development, the mockup routes serve the platform owner and refuse anyone else",
    entryPoint: "/api/mockup",
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const owner = await ctx.api("GET /api/mockup as the owner", { method: "GET", path: ROUTES[0] });
      const schema = await ctx.api("GET /api/mockup/schema as the owner", { method: "GET", path: ROUTES[1] });
      await ctx.verify("the owner reads the mockup list and the spec schema", [
        ctx.status(owner, 200),
        ctx.status(schema, 200),
      ]);

      const visitor = await everyRoute(ctx, "anon");
      await ctx.verify(
        "a caller with no session gets 401 on every route",
        visitor.map((answer) => ctx.status(answer, 401)),
      );

      const roleName = ctx.unique("Designer");
      await createRole(ctx, roleName);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await joinedMember(ctx, admin, { firstName: "Mia", roleName });
      const member = await everyRoute(ctx, "mia");
      await ctx.verify(
        "a signed-in member who is not the owner gets 403 on every route",
        member.map((answer) => ctx.status(answer, 403)),
      );
    },
  },
  {
    id: "mockup-sample-reads-no-live-route",
    title: "with Real data off, the /mockup viewer requests no live route, even for a KPI, a chart and a serialized table that name one directly, or image, file and rich text values of its fixtures do",
    entryPoint: "/mockup?data=sample",
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      writeSampleSpec(ctx, [
        { type: "TableView", options: { caption: "Users", fetchUrl: `fixture:${ROWS_FIXTURE}`, rowIdKey: "_id", columns: { name: { name: "Name", type: "string" } } } },
      ]);
      const built = await compiledTree(ctx, 1);
      const rowsRoute = `/api/mockup/${SAMPLE_MOCKUP}/pages/live/fixtures/${ROWS_FIXTURE}/rows`;
      const serialized = parseJson(JSON.stringify(fieldOf(built.tree[0], "options") ?? {}).replaceAll(rowsRoute, LIVE.table));
      await ctx.verify("the table serializes to options that read a route", [
        ctx.holds("the serialized table reads the live route", JSON.stringify(serialized).includes(LIVE.table), JSON.stringify(serialized).slice(0, 300)),
      ], { critical: true });
      writeSampleSpec(ctx, [
        { type: "KpiCard", options: { title: "Revenue", fetchUrl: LIVE.kpi, valueFormat: "currency" } },
        { type: "ChartCard", options: { title: "Sales", fetchUrl: LIVE.chart, valueFormat: "currency" }, children: [{ id: "chart", type: "ChartArea" }] },
        { type: "TableView", options: serialized },
        {
          type: "TableView",
          options: {
            caption: "Cells",
            fetchUrl: `fixture:${ROWS_FIXTURE}`,
            rowIdKey: "_id",
            columns: {
              name: { name: "Name", type: "string" },
              pic: { name: "Picture", type: "image" },
              doc: { name: "Document", type: "file" },
              gallery: { name: "Gallery", type: "image" },
            },
          },
        },
        {
          type: "ResourceForm",
          options: {
            fetchUrl: `fixture:${RECORD_FIXTURE}`,
            fields: [
              { id: "notes", type: "rich_text", label: "Notes", readonly: true },
              { id: "bio", type: "rich_text", label: "Bio", readonly: true },
            ],
          },
        },
      ]);
      const compiled = await compiledTree(ctx, 5);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      /** Every request the server answered, by method and path: one the frame's policy refused never leaves the browser. */
      /** @type {{ entry: string, inPreview: boolean }[]} */
      const requests = [];
      const viewer = await admin.page.context().newPage();
      /** @type {string[]} */
      const refused = [];
      viewer.on("console", (message) => {
        if (message.text().includes("Content Security Policy")) refused.push(message.text().slice(0, 160));
      });
      viewer.on("response", (response) => {
        const request = response.request();
        requests.push({ entry: `${request.method()} ${new URL(request.url()).pathname}`, inPreview: request.frame().url().includes(PREVIEW_PATH) });
      });
      await viewer.goto(new URL(`/mockup?name=${SAMPLE_MOCKUP}&page=live&data=sample`, admin.page.url()).href);
      const states = await previewStates(viewer);
      const frame = viewer.frames().find((candidate) => candidate.url().includes(PREVIEW_PATH));
      const policy = await frame
        ?.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "")
        .catch(() => "");
      const frameUrl = frame?.url() ?? "";
      await viewer.close();
      const apiOf = (/** @type {boolean} */ inPreview) =>
        [...new Set(requests.filter((request) => request.inPreview === inPreview).map((request) => request.entry))].filter((entry) => entry.includes(" /api/"));
      const live = requests
        .filter(({ entry }) => Object.values(LIVE).some((route) => entry.endsWith(` ${route}`)) || entry.endsWith(` ${FILE_METADATA}`))
        .map(({ entry }) => entry);
      const previewOutsideMockup = apiOf(true).filter((entry) => !entry.includes(" /api/mockup/") && ![...SHELL_ROUTES, ...PLUGIN_ROUTES].some((route) => route.test(entry)));
      await ctx.verify("the viewer reads only the mockup's own routes in sample mode", [
        ctx.holds("the preview frame draws on fixtures under a policy", (policy ?? "").includes("connect-src"), `${frameUrl} ${policy ?? ""}`),
        ctx.holds("the preview drew the data blocks", states.length >= Object.keys(LIVE).length, JSON.stringify(states)),
        ctx.equal("no request of the page or its frames reads a live route a block or a fixture cell names", live, []),
        ctx.equal("every API request of the preview frame is a mockup route or the dashboard's own", previewOutsideMockup, []),
        ctx.holds("what each block shows", true, JSON.stringify({ states, issues: compiled.issues })),
        ctx.holds("the API requests of the preview frame", requests.length > 0, JSON.stringify(apiOf(true))),
        ctx.holds("the API requests of the page around it", true, JSON.stringify(apiOf(false))),
        ctx.holds("what the preview's policy refused", true, JSON.stringify(refused)),
      ]);
    },
  },
  {
    id: "mockup-overview-labels-stay-in-their-frames",
    title: "zoomed out to the end, no Overview label paints past its frame, and a hidden page keeps its marker whole while its frame is wide enough",
    entryPoint: `/mockup?name=${OVERVIEW_MOCKUP}`,
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const page = (/** @type {string} */ id, /** @type {object} */ extra = {}) => ({
        id,
        title: id[0].toUpperCase() + id.slice(1).replace("-", " "),
        ...extra,
        tree: [{ id: "facts", type: "KeyValueList", options: { items: [{ label: "Account", value: "ACME-0042" }] } }],
      });
      writeSpec(ctx, OVERVIEW_MOCKUP, {
        title: "Overview labels",
        pages: [page("customers"), page("customer-detail", { parent: "customers", menu: false }), page("invoices")],
      });
      const compiled = await compiledPages(ctx, OVERVIEW_MOCKUP, 3);
      await ctx.verify("the mockup compiled", [ctx.equal("its pages", compiled, 3)], { critical: true });
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await admin.goto(`/mockup?name=${OVERVIEW_MOCKUP}`);
      const { page: viewer } = admin;
      await viewer.locator("[data-dms-mockup-overview-hidden]").waitFor({ timeout: DRAW_TIMEOUT_MS });
      const area = await viewer.locator("[data-dms-mockup-overview]").boundingBox();
      if (area) await viewer.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
      /** @type {Awaited<ReturnType<typeof overviewLabels>>[]} */
      const zooms = [await overviewLabels(viewer)];
      for (let step = 0; step < ZOOM_OUT_STEPS && zooms.at(-1)?.zoom !== OVERVIEW_MIN_ZOOM; step += 1) {
        await viewer.keyboard.down("Control");
        await viewer.mouse.wheel(0, WHEEL_STEP_PX);
        await viewer.keyboard.up("Control");
        await viewer.waitForTimeout(ZOOM_SETTLE_MS);
        zooms.push(await overviewLabels(viewer));
      }
      const past = zooms.flatMap(({ zoom, frames }) => frames.flatMap(({ id, past: parts }) => parts.map((part) => `zoom ${zoom}, ${id}: ${part}`)));
      const cutMarkers = zooms.flatMap(({ zoom, frames }) =>
        frames
          .filter(({ width, marker }) => marker && width >= MARKER_WHOLE_FROM_PX && marker.width < marker.drawnWidth - 0.5)
          .map(({ id, width, marker }) => `zoom ${zoom}, ${id} ${width} px wide: marker painted ${marker?.width} of ${marker?.drawnWidth} px`),
      );
      await ctx.verify("every label stays in its frame's column", [
        ctx.holds("the camera reached the narrowest zoom", zooms.at(-1)?.zoom === OVERVIEW_MIN_ZOOM, JSON.stringify(zooms.map(({ zoom }) => zoom))),
        ctx.equal("no part of a label is painted past its frame's right edge", past, []),
        ctx.equal(`the hidden-page marker is painted whole on a frame at least ${MARKER_WHOLE_FROM_PX} px wide`, cutMarkers, []),
      ]);
    },
  },
];
