// @vitest-environment jsdom
/**
 * `useApiData` through the runtime's real async data and the real
 * `$authFetch`: a server render reads, renders and hands over the data, the
 * browser hydrates with it and follows reactive requests, and every request
 * keeps `$authFetch`'s headers and session retry.
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendRuntime, DmsPayload } from "#dms/frontend-module";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("$fetch", engine.$fetch);
vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("useDmsRuntimeConfig", () => ({
  public: { dms: { baseURL: "" } },
}));
// The app's language, which a test may switch.
const appLocale = ref("fr");
vi.stubGlobal("useDmsApp", () => ({ $i18n: { locale: appLocale } }));
vi.stubGlobal("HTTP_UNAUTHORIZED", 401);
vi.stubGlobal("useUserSession", () => ({ loggedIn: { value: true } }));
const refreshSession = vi.fn(async () => true);
vi.stubGlobal("useSessionRecovery", () => ({
  refreshSession,
  reconcileSession: vi.fn(),
  redirectToAuth: vi.fn(),
}));
const { useAuthFetch } = await import(
  "../layers/dms-core/app/composables/auth/useAuthFetch"
);
vi.stubGlobal("useAuthFetch", useAuthFetch);
const { useApiData, useApiPagedData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
vi.stubGlobal("useApiData", useApiData);
vi.stubGlobal("useDmsPagedData", engine.useDmsPagedData);

interface Sent {
  url: string;
  query?: Record<string, unknown>;
  headers: Headers;
  signal?: AbortSignal;
}

const sent: Sent[] = [];
let failNextWith: number | undefined;

/** The transport under `$fetch`: what reaches the backend. */
const transport = (async (
  url: string,
  options: {
    query?: Record<string, unknown>;
    headers?: HeadersInit;
    signal?: AbortSignal;
    onRequest?: (context: { options: { headers: Headers } }) => void;
  } = {},
) => {
  const headers = new Headers(options.headers);
  options.onRequest?.({ options: { headers } });
  sent.push({ url, query: options.query, headers, signal: options.signal });
  if (failNextWith) {
    const status = failNextWith;
    failNextWith = undefined;
    throw Object.assign(new Error("Unauthorized"), {
      statusCode: status,
      response: { status },
    });
  }
  return { url, page: options.query?.page ?? null };
}) as never;

const mounted: App[] = [];

beforeEach(() => {
  sent.length = 0;
  failNextWith = undefined;
  refreshSession.mockClear();
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

async function serverRender(
  root: Component,
): Promise<{ html: string; payload: DmsPayload }> {
  const runtime = engine.createDmsFrontendRuntime(transport, {}, true);
  const app = createSSRApp(root);
  engine.provideDmsFrontendRuntime(app, runtime);
  const html = await renderToString(app);
  return { html, payload: engine.serializeDmsPayload(runtime) };
}

function hydrate(root: Component, html: string, payload: DmsPayload) {
  const runtime: DmsFrontendRuntime = engine.createDmsFrontendRuntime(
    transport,
    {},
  );
  engine.restoreDmsPayload(runtime, structuredClone(payload));
  const container = document.createElement("div");
  container.innerHTML = html;
  const app = createSSRApp(root);
  engine.provideDmsFrontendRuntime(app, runtime);
  app.mount(container);
  mounted.push(app);
  return container;
}

const settle = async () => {
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  await nextTick();
};

describe("useApiData", () => {
  it("reads in the server render, and the browser hydrates without asking again", async () => {
    const page = ref(1);
    const Orders = defineComponent({
      setup() {
        const { data } = useApiData<{ page: number }>("/api/orders", {
          query: () => ({ page: page.value }),
        });
        return () => h("p", `page:${data.value?.page}`);
      },
    });

    const { html, payload } = await serverRender(Orders);
    expect(html).toBe("<p>page:1</p>");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.headers.get("x-content-language")).toBe("fr");
    expect(sent[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(payload.data).toEqual({
      [engine.dmsRequestKey("/api/orders", { query: { page: 1 } })!]: {
        url: "/api/orders",
        page: 1,
      },
    });

    sent.length = 0;
    const container = hydrate(Orders, html, payload);
    await settle();
    expect(sent).toEqual([]);

    page.value = 2;
    await settle();
    expect(sent.map(({ query }) => query)).toEqual([{ page: 2 }]);
    expect(container.textContent).toBe("page:2");
  });

  it("reads nothing while its URL is null", async () => {
    const id = ref<string | null>(null);
    const Detail = defineComponent({
      setup() {
        const { data } = useApiData<{ url: string }>(() =>
          id.value ? `/api/orders/${id.value}` : null,
        );
        return () => h("p", data.value?.url ?? "none");
      },
    });

    const { html, payload } = await serverRender(Detail);
    expect(html).toBe("<p>none</p>");
    const container = hydrate(Detail, html, payload);
    await settle();
    expect(sent).toEqual([]);

    id.value = "7";
    await settle();
    expect(container.textContent).toBe("/api/orders/7");
  });

  it("loads data made of several requests under one key", async () => {
    const Summary = defineComponent({
      setup() {
        const { data } = useApiData(
          "orders-summary",
          async ({ $authFetch, signal }) => {
            const [orders, stats] = await Promise.all([
              $authFetch<{ url: string }>("/api/orders", { signal }),
              $authFetch<{ url: string }>("/api/stats", { signal }),
            ]);
            return `${orders.url}+${stats.url}`;
          },
        );
        return () => h("p", String(data.value));
      },
    });

    const { html, payload } = await serverRender(Summary);
    expect(html).toBe("<p>/api/orders+/api/stats</p>");
    expect(payload.data["orders-summary"]).toBe("/api/orders+/api/stats");
    expect(sent.every(({ signal }) => signal instanceof AbortSignal)).toBe(
      true,
    );
  });

  it("refreshes an expired session and reads again", async () => {
    failNextWith = 401;
    const Orders = defineComponent({
      setup() {
        const { data } = useApiData<{ url: string }>("/api/orders");
        return () => h("p", data.value?.url ?? "none");
      },
    });

    const { html } = await serverRender(Orders);
    expect(html).toBe("<p>/api/orders</p>");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sent.map(({ headers }) => headers.get("x-auth-retry"))).toEqual([
      null,
      "1",
    ]);
  });

  it("waits for execute() with immediate: false, as a dialog does", async () => {
    let execute: (() => Promise<void>) | undefined;
    const Dialog = defineComponent({
      setup() {
        const result = useApiData<{ url: string }>("/api/invoice", {
          immediate: false,
        });
        execute = () => result.execute();
        return () => h("p", result.data.value?.url ?? "closed");
      },
    });
    const container = document.createElement("div");
    const runtime = engine.createDmsFrontendRuntime(transport);
    const dialog = createApp(Dialog);
    engine.provideDmsFrontendRuntime(dialog, runtime);
    dialog.mount(container);
    mounted.push(dialog);
    await settle();
    expect(sent).toEqual([]);
    expect(container.textContent).toBe("closed");

    await execute!();
    await settle();
    expect(sent.map(({ url }) => url)).toEqual(["/api/invoice"]);
    expect(container.textContent).toBe("/api/invoice");
  });

  it("polls with refreshInterval while a component shows the data", async () => {
    const Status = defineComponent({
      setup() {
        const { data } = useApiData<{ url: string }>("/api/status", {
          refreshInterval: 20,
        });
        return () => h("p", data.value?.url ?? "none");
      },
    });
    const runtime = engine.createDmsFrontendRuntime(transport);
    const app = createApp(Status);
    engine.provideDmsFrontendRuntime(app, runtime);
    app.mount(document.createElement("div"));
    await settle();
    expect(sent).toHaveLength(1);
    await new Promise((done) => setTimeout(done, 70));
    expect(sent.length).toBeGreaterThan(1);

    app.unmount();
    const afterUnmount = sent.length;
    await new Promise((done) => setTimeout(done, 70));
    expect(sent).toHaveLength(afterUnmount);
  });

  it("follows a reactive refreshInterval, and stops at 0", async () => {
    const interval = ref(20);
    const Install = defineComponent({
      setup() {
        useApiData("/api/install-check", { refreshInterval: interval });
        return () => h("p");
      },
    });
    const runtime = engine.createDmsFrontendRuntime(transport);
    const app = createApp(Install);
    engine.provideDmsFrontendRuntime(app, runtime);
    app.mount(document.createElement("div"));
    mounted.push(app);
    await new Promise((done) => setTimeout(done, 70));
    expect(sent.length).toBeGreaterThan(1);

    interval.value = 0;
    await settle();
    const stopped = sent.length;
    await new Promise((done) => setTimeout(done, 70));
    expect(sent).toHaveLength(stopped);
  });

  it("polls from a plugin, outside any component", async () => {
    const runtime = engine.createDmsFrontendRuntime(transport);
    const app = createApp({ render: () => null });
    engine.provideDmsFrontendRuntime(app, runtime);
    const polling = ref(true);
    await settle();
    app.runWithContext(() =>
      useApiData("/api/_ai/status", {
        refreshInterval: () => (polling.value ? 20 : null),
      }),
    );
    await new Promise((done) => setTimeout(done, 70));
    expect(sent.length).toBeGreaterThan(1);

    polling.value = false;
    await settle();
    const stopped = sent.length;
    await new Promise((done) => setTimeout(done, 70));
    expect(sent).toHaveLength(stopped);
    runtime.scope.stop();
  });

  it("asks in the language current when each request leaves", async () => {
    const runtime = engine.createDmsFrontendRuntime(transport);
    const app = createApp({ render: () => null });
    engine.provideDmsFrontendRuntime(app, runtime);
    const { $authFetch } = app.runWithContext(() => useAuthFetch());
    try {
      appLocale.value = "de";
      await app.runWithContext(() => $authFetch("/api/orders"));
      expect(sent[0]!.headers.get("x-content-language")).toBe("de");
    } finally {
      appLocale.value = "fr";
      runtime.scope.stop();
    }
  });

  it("is the one read helper: useAuthFetch returns $authFetch alone", () => {
    expect(Object.keys(useAuthFetch())).toEqual(["$authFetch"]);
  });
});

describe("useApiPagedData", () => {
  interface Listing {
    url: string;
    page: number | null;
  }
  const LAST_PAGE = 3;

  function listing() {
    let list: ReturnType<typeof useApiPagedData<Listing, number>> | undefined;
    const Explorer = defineComponent({
      setup() {
        list = useApiPagedData<Listing, number>(
          "media:root",
          ({ $authFetch, cursor, signal }) =>
            $authFetch<Listing>("/api/media", {
              query: { page: cursor },
              signal,
            }),
          {
            initialCursor: 1,
            nextCursor: (page) =>
              (page.page ?? LAST_PAGE) < LAST_PAGE ? page.page! + 1 : null,
          },
        );
        return () =>
          h("p", list!.pages.value.map((page) => page.page).join(","));
      },
    });
    return { Explorer, list: () => list! };
  }

  it("renders the first page on the server, then loads more in the browser", async () => {
    const server = listing();
    const { html, payload } = await serverRender(server.Explorer);
    expect(html).toBe("<p>1</p>");
    expect(sent[0]!.headers.get("x-content-language")).toBe("fr");

    sent.length = 0;
    const browser = listing();
    const container = hydrate(browser.Explorer, html, payload);
    await settle();
    expect(sent).toEqual([]);

    await browser.list().loadMore();
    await browser.list().loadMore();
    await settle();
    expect(sent.map(({ query }) => query)).toEqual([{ page: 2 }, { page: 3 }]);
    expect(container.textContent).toBe("1,2,3");
    expect(browser.list().hasMore.value).toBe(false);
  });

  it("reads every loaded page again on a refresh", async () => {
    const { Explorer, list } = listing();
    const runtime = engine.createDmsFrontendRuntime(transport);
    const app = createApp(Explorer);
    engine.provideDmsFrontendRuntime(app, runtime);
    app.mount(document.createElement("div"));
    mounted.push(app);
    await settle();
    await list().loadMore();
    sent.length = 0;

    await list().refresh();
    expect(sent.map(({ query }) => query)).toEqual([{ page: 1 }, { page: 2 }]);
    expect(list().pages.value).toHaveLength(2);
  });
});
