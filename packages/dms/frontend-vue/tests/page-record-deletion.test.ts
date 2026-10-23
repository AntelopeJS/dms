// @vitest-environment jsdom
/**
 * A detail page whose record is deleted leaves for its list, in every tab:
 * on an event of one of its topics it asks its layout again, and a record the
 * server had found that it now finds missing was deleted. A toast says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref, type EffectScope } from "vue";
import { usePageRecordDeletion } from "../layers/dms-layout/app/composables/page/usePageRecordDeletion";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";

const LAYOUT_URL = "/dms/pages/sites/site/:id/pagelayout";
const route = reactive<{ path: string; query: Record<string, unknown> }>({
  path: "/sites/site/s1",
  query: {},
});
const authFetch = vi.fn();
const navigate = vi.fn();
const toastAdd = vi.fn();
const handlers = new Map<string, RealtimeTopicHandler>();
let parentSlug: string | undefined;
let scope: EffectScope;

const layoutWith = (recordStatus?: string, id = "s1") => ({
  components: {},
  layout: {
    componentName: "dms-default-layout",
    options: recordStatus
      ? { recordStatus, headerActionsQuery: {}, headerActionsParams: { id } }
      : {},
  },
});

function start(served = layoutWith("found")) {
  scope = effectScope();
  scope.run(() =>
    usePageRecordDeletion({
      pageLayout: () => served as never,
      pageTopics: ref(["tableview:row:/api/sites"]),
      subscribe: (topic, handler) => {
        handlers.set(topic, handler);
        return () => handlers.delete(topic);
      },
    }),
  );
}

async function publish(event: object = { type: "deleted" }) {
  handlers.get("tableview:row:/api/sites")?.(event as never);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await nextTick();
}

beforeEach(() => {
  route.path = "/sites/site/s1";
  route.query = {};
  parentSlug = "/sites";
  vi.stubEnv("SSR", false);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useToast", () => ({ add: toastAdd }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("navigateDms", navigate);
  vi.stubGlobal("useSiteLayout", () => ({
    findMatchingRoute: (path: string) =>
      path === "/sites"
        ? { metadata: { layoutUrl: "/dms/pages/sites/pagelayout" }, params: {} }
        : {
            metadata: { layoutUrl: LAYOUT_URL, parentSlug },
            params: { id: path.split("/").at(-1) },
          },
  }));
});

afterEach(() => {
  scope.stop();
  handlers.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("a detail page whose record is deleted", () => {
  it("says so and opens its list once the server finds it missing", async () => {
    start();
    authFetch.mockResolvedValue(layoutWith("missing"));
    await publish();
    expect(authFetch).toHaveBeenCalledWith(
      "/dms/pages/sites/site/s1/pagelayout",
    );
    expect(toastAdd).toHaveBeenCalledOnce();
    expect(toastAdd.mock.calls[0][0]).toMatchObject({
      title: "page.record_deleted.title",
    });
    expect(navigate).toHaveBeenCalledWith("/sites", { replace: true });
  });

  it("stays while the record is still there", async () => {
    start();
    authFetch.mockResolvedValue(layoutWith("found"));
    await publish({ type: "updated" });
    expect(toastAdd).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not take a failed read for a deletion", async () => {
    start();
    authFetch.mockResolvedValueOnce(layoutWith("error"));
    await publish();
    authFetch.mockRejectedValueOnce(new Error("network"));
    await publish();
    expect(navigate).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  // A page opened on a record that was never there shows its not-found
  // blocks: it was not deleted under the reader.
  it("stays on a record it never found", async () => {
    start(layoutWith("missing"));
    authFetch.mockResolvedValue(layoutWith("missing"));
    await publish();
    expect(navigate).not.toHaveBeenCalled();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it("reads once where another record of the page stands", async () => {
    start();
    authFetch.mockResolvedValueOnce(layoutWith("found", "s2"));
    route.path = "/sites/site/s2";
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve));
    expect(authFetch).toHaveBeenCalledWith(
      "/dms/pages/sites/site/s2/pagelayout",
    );
    authFetch.mockResolvedValueOnce(layoutWith("missing", "s2"));
    await publish();
    expect(navigate).toHaveBeenCalledWith("/sites", { replace: true });
  });

  it("only says so without a list to open", async () => {
    parentSlug = undefined;
    start();
    authFetch.mockResolvedValue(layoutWith("missing"));
    await publish();
    expect(toastAdd).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never asks on a page reading no record, nor on a presence snapshot", async () => {
    start(layoutWith(undefined));
    await publish();
    scope.stop();
    start();
    await publish({ topic: "x", sessions: [] });
    expect(authFetch).not.toHaveBeenCalled();
  });
});
