/** @vitest-environment jsdom */
import { http, router, usePage } from "@inertiajs/vue3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installShellRuntime } from "./helpers/live-shell-runtime";
import { useSiteLayout } from "../layers/dms-core/app/composables/page/useSiteLayout";

type Request = Parameters<ReturnType<typeof http.getClient>["request"]>[0];
type Response = Awaited<
  ReturnType<ReturnType<typeof http.getClient>["request"]>
>;
let requests: Request[];
let respond: (request: Request) => Promise<Response>;
const originalClient = http.getClient();
let disposeRuntime: () => void;

function answer(request: Request, label = "Fresh", status = 200): Response {
  return {
    status,
    headers: { "x-inertia": "true" },
    data: JSON.stringify({
      component: "Fixture",
      url: new URL(request.url).pathname,
      version: "1",
      props: { shared: { menu: label }, page: { title: label } },
      clearHistory: false,
      encryptHistory: false,
    }),
  };
}

beforeEach(async () => {
  window.history.replaceState(null, "", "/projects");
  disposeRuntime = await installShellRuntime("/projects");
  await vi.waitFor(() => expect(usePage().url).toBe("/projects"));
  requests = [];
  respond = async (request) => answer(request);
  http.setClient({
    request: async (request) => {
      requests.push(request);
      return respond(request);
    },
  });
});

afterEach(() => {
  router.flushAll();
  http.setClient(originalClient);
  disposeRuntime();
  vi.unstubAllGlobals();
});

describe("useSiteLayout resync", () => {
  it("reloads the site layout and the page through Inertia", async () => {
    await useSiteLayout().resync();
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).pathname).toBe("/projects");
    expect(requests[0]!.headers?.["X-Inertia-Partial-Data"]).toBe(
      "shared,page",
    );
    expect(usePage().props).toMatchObject({
      shared: { menu: "Fresh" },
      page: { title: "Fresh" },
    });
  });

  it("drops the pages prefetched with the previous menu before reloading", async () => {
    router.prefetch("/tasks", {}, { cacheFor: "1m" });
    await vi.waitFor(() => expect(router.getCached("/tasks")).not.toBeNull());
    respond = async (request) => {
      expect(router.getCached("/tasks")).toBeNull();
      return answer(request);
    };
    await useSiteLayout().resync();
    expect(router.getCached("/tasks")).toBeNull();
  });

  it("rejects a failed reload and keeps the page on screen", async () => {
    const before = usePage().props;
    respond = async (request) => answer(request, "Unavailable", 502);
    await expect(useSiteLayout().resync()).rejects.toThrow("502");
    expect(usePage().props).toEqual(before);
    expect(document.querySelector("iframe")).toBeNull();

    respond = async () => {
      throw new Error("offline");
    };
    await expect(useSiteLayout().resync()).rejects.toThrow("offline");
    expect(usePage().props).toEqual(before);
    expect(window.location.pathname).toBe("/projects");
  });

  it("reloads the page a navigation opened while the reload was in flight", async () => {
    let finishReload: ((response: Response) => void) | undefined;
    respond = (request) =>
      requests.length === 1
        ? new Promise((resolve) => {
            finishReload = resolve;
          })
        : Promise.resolve(answer(request, "Tasks"));
    const resync = useSiteLayout().resync();
    await vi.waitFor(() => expect(finishReload).toBeTypeOf("function"));
    router.push({ url: "/tasks", preserveScroll: true });
    await vi.waitFor(() => expect(usePage().url).toBe("/tasks"));
    finishReload!(answer(requests[0]!));
    await resync;
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/projects",
      "/tasks",
    ]);
    expect(usePage().props).toMatchObject({
      shared: { menu: "Tasks" },
      page: { title: "Tasks" },
    });
  });
});
