/** @vitest-environment jsdom */
/**
 * Booking mode (`propose`) follows the page URL: the key that names a
 * proposal is read when the agenda mounts, and again when a link on the same
 * page adds it while the agenda stays on screen.
 */
import "./fixtures/agendaRuntime";
import { createApp, defineComponent, h, nextTick, reactive, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isString } from "../layers/dms-core/app/utils/type-check";
import { useAgendaPropose } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaPropose";

afterEach(() => vi.unstubAllGlobals());

function mountPropose(query: Record<string, string>) {
  const route = reactive({ query });
  const read = vi.fn(
    (_url: string, _request?: { query?: Record<string, string> }) =>
      Promise.resolve({
        start: "2026-11-18T08:00:00Z",
        end: "2026-11-18T09:00:00Z",
      }),
  );
  const createAt = vi.fn();
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({
    replace: vi.fn(async (to: { query: Record<string, string> }) => {
      route.query = to.query;
    }),
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: read }));
  const app = createApp(
    defineComponent({
      setup() {
        useAgendaPropose({
          raw: { propose: { param: "plan", url: "/api/proposal" } },
          timeZone: () => "UTC",
          goTo: vi.fn(),
          createAt,
          text: (value) => (isString(value) ? value : ""),
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return { app, route, read, createAt };
}

describe("booking mode and the page URL", () => {
  it("reads the proposal the URL names once the agenda is mounted (fails when the key is ignored)", async () => {
    const { app, read, createAt, route } = mountPropose({ plan: "next" });
    await vi.waitFor(() => expect(createAt).toHaveBeenCalledTimes(1));
    expect(read.mock.lastCall?.[1]?.query?.plan).toBe("next");
    expect(route.query.plan).toBeUndefined();
    app.unmount();
  });

  it("reads it when a link on the same page adds the key (fails when only the first mount reads the URL)", async () => {
    const { app, read, createAt, route } = mountPropose({});
    await nextTick();
    expect(read).not.toHaveBeenCalled();
    route.query = { plan: "next" };
    await vi.waitFor(() => expect(createAt).toHaveBeenCalledTimes(1));
    app.unmount();
  });
});
