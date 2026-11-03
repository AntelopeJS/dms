/** @vitest-environment jsdom */
/**
 * `$authFetch` is typed and documented as a `$fetch.create` instance: besides
 * its call and `raw`, its `create` and `native` members are callable, through
 * the renderer's real `$fetch` and ofetch over the platform `fetch`.
 */
import { createApp, ref } from "vue";
import { beforeEach, expect, it, vi } from "vitest";

const engine = await import("#dms/frontend-module");
vi.stubGlobal("$fetch", engine.$fetch);
vi.stubGlobal("useDmsState", engine.useDmsState);
vi.stubGlobal("useDmsRuntimeConfig", () => ({
  public: { dms: { baseURL: "https://backend.test" } },
}));
vi.stubGlobal("useDmsApp", () => ({ $i18n: { locale: ref("fr") } }));
vi.stubGlobal("HTTP_UNAUTHORIZED", 401);
const addToast = vi.fn();
vi.stubGlobal("useToast", () => ({ add: addToast }));
vi.stubGlobal("getAppTranslation", () => ({
  processApiMessage: (key: string) => key,
}));
vi.stubGlobal("useDmsUserSession", () => ({ loggedIn: ref(true) }));
const refreshSession = vi.fn(async () => true);
vi.stubGlobal("useSessionRecovery", () => ({
  refreshSession,
  reconcileSession: vi.fn(),
  redirectToAuth: vi.fn(),
}));
const { useAuthFetch } = await import(
  "../layers/dms-core/app/composables/auth/useAuthFetch"
);

interface Sent {
  url: string;
  language: string | null;
  tenant: string | null;
  retry: string | null;
}

const sent: Sent[] = [];
const answers: Response[] = [];
const platformFetch = vi.fn(
  async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    sent.push({
      url: String(input),
      language: headers.get("x-content-language"),
      tenant: headers.get("x-tenant"),
      retry: headers.get("x-auth-retry"),
    });
    return answers.shift() ?? new Response(null, { status: 404 });
  },
);

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function authFetch(realtimeSessionId?: string) {
  const app = createApp({});
  engine.provideDmsFrontendRuntime(app, engine.createDmsFrontendRuntime());
  return app.runWithContext(() => {
    engine.useDmsState("dms.realtime.sessionId", () => realtimeSessionId);
    return useAuthFetch();
  }).$authFetch;
}

beforeEach(() => {
  sent.length = 0;
  answers.length = 0;
  platformFetch.mockClear();
  refreshSession.mockClear();
  addToast.mockClear();
  vi.stubGlobal("fetch", platformFetch);
});

it("derives with create a fetch that keeps the backend, the language header and the session retry; a wrapper attaching only raw throws that create is not a function", async () => {
  answers.push(json({ message: "expired" }, 401), json({ id: "order-1" }));
  const orders = authFetch().create({ query: { workspace: "acme" } });

  await expect(orders("/api/orders")).resolves.toEqual({ id: "order-1" });

  expect(refreshSession).toHaveBeenCalledOnce();
  expect(sent).toEqual([
    {
      url: "https://backend.test/api/orders?workspace=acme",
      language: "fr",
      tenant: null,
      retry: null,
    },
    {
      url: "https://backend.test/api/orders?workspace=acme",
      language: "fr",
      tenant: null,
      retry: "1",
    },
  ]);
});

const CREATE_HEADER_FORMS: Array<[string, HeadersInit]> = [
  ["a plain object", { "x-tenant": "acme" }],
  ["a Headers instance", new Headers({ "x-tenant": "acme" })],
  ["an entry list", [["x-tenant", "acme"]]],
];

it.each(CREATE_HEADER_FORMS)(
  "sends the headers given to create as %s on the retry after a 401 too; a retry passing only x-auth-retry as its headers drops them",
  async (_form, headers) => {
    answers.push(json({ message: "expired" }, 401), json({ id: "order-1" }));
    const orders = authFetch().create({ headers });

    await expect(orders("/api/orders")).resolves.toEqual({ id: "order-1" });

    expect(sent.map(({ tenant, retry }) => ({ tenant, retry }))).toEqual([
      { tenant: "acme", retry: null },
      { tenant: "acme", retry: "1" },
    ]);
  },
);

it("hands native calls to the platform fetch, as any $fetch.create instance does; a wrapper attaching only raw throws that native is not a function", async () => {
  const answer = new Response("id,total");
  answers.push(answer);

  await expect(
    authFetch().native("https://files.test/export.csv"),
  ).resolves.toBe(answer);

  expect(platformFetch).toHaveBeenCalledWith("https://files.test/export.csv");
});

it("leaves presentation to the caller after a 401 retry fails", async () => {
  const refusal = json(
    { message: "error.read_only_demo", severity: "warning" },
    403,
  );
  answers.push(json({ message: "expired" }, 401), refusal);
  await expect(
    authFetch().raw("/api/orders", { method: "PUT" }),
  ).rejects.toMatchObject({
    response: refusal,
  });
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(addToast).not.toHaveBeenCalled();
  expect(sent.map(({ retry }) => retry)).toEqual([null, "1"]);
});

it.each(["call", "raw", "create.raw"] as const)(
  "keeps %s refusals rejected with their response and no session recovery",
  async (member) => {
    const refusal = json({ message: "Forbidden" }, 403);
    answers.push(refusal);
    const api = authFetch();
    const invoke = {
      call: () => api("/api/orders", { method: "PUT" }),
      raw: () => api.raw("/api/orders", { method: "PUT" }),
      "create.raw": () => api.create({ method: "PUT" }).raw("/api/orders"),
    };
    await expect(invoke[member]()).rejects.toMatchObject({ response: refusal });
    expect(addToast).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  },
);

it("keeps raw success data and auth headers across a session retry", async () => {
  const api = authFetch("session-42");
  const answer = json({ id: "raw-order" });
  answers.push(json({ message: "expired" }, 401), answer);
  const result = await api.raw("/api/orders", {
    headers: { "x-content-language": "nl" },
  });
  expect(result).toBe(answer);
  expect(result._data).toEqual({ id: "raw-order" });
  expect(sent[0]).toMatchObject({
    url: "https://backend.test/api/orders",
    language: "nl",
  });
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(
    new Headers(platformFetch.mock.calls[1]?.[1]?.headers).get(
      "x-realtime-session",
    ),
  ).toBe("session-42");
});
