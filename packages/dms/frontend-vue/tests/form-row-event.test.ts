/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { host, mountForm, t } from "./helpers/form-runtime";
import { engine } from "./helpers/api-data-runtime";

interface WireRowEvent {
  type: string;
  payload: { ids: string | string[] | number[] };
  actorId: string | null;
}

type Delivered = WireRowEvent | null | undefined;

let deliver: (event: Delivered) => void;

beforeEach(() => {
  vi.stubGlobal(
    "useRealtimeTopic",
    (_topic: string, handler: (event: Delivered) => void) => {
      deliver = handler;
    },
  );
});

async function openRowForm() {
  await engine.setupFrontendModules([]);
  const runtime = engine.createDmsFrontendRuntime();
  vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: vi.fn(async () => ({ name: "Ada" })),
  }));
  await mountForm(
    { fetchUrl: "/api/invoices/get?id=r1&_presence=1" },
    undefined,
    (app) => engine.provideDmsFrontendRuntime(app, runtime),
  );
}

async function receive(event: Delivered) {
  deliver(event);
  await nextTick();
}

const bannerShown = () =>
  host.textContent?.includes(t("dms.realtime.concurrent_edit_banner_title"));

describe("a realtime event on the row a form edits", () => {
  it("warns of a concurrent edit when another user updated the row", async () => {
    await openRowForm();
    await receive({
      type: "updated",
      payload: { ids: ["r1"] },
      actorId: "u1",
    });
    expect(bannerShown()).toBe(true);
  });

  it("warns of a concurrent edit when the event names no actor", async () => {
    await openRowForm();
    await receive({ type: "updated", payload: { ids: ["r1"] }, actorId: null });
    expect(bannerShown()).toBe(true);
  });

  it("is ignored when there is no event", async () => {
    await openRowForm();
    await receive(null);
    await receive(undefined);
    expect(bannerShown()).toBe(false);
  });

  it("is ignored when its ids are not a list of ids", async () => {
    await openRowForm();
    await receive({ type: "updated", payload: { ids: "r1" }, actorId: "u1" });
    await receive({ type: "updated", payload: { ids: [1] }, actorId: "u1" });
    expect(bannerShown()).toBe(false);
  });
});
