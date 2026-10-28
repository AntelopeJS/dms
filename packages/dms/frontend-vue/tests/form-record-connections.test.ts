/** @vitest-environment jsdom */
import { expect, it, vi } from "vitest";
import { host, mountForm, unmountForm } from "./helpers/form-runtime";
import { engine } from "./helpers/api-data-runtime";

it("rejects a form cache shared across record URLs or a successful record reset to idle", async () => {
  await engine.setupFrontendModules([]);
  const runtime = engine.createDmsFrontendRuntime();
  vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
  const fetch = vi.fn(async (url: string) => ({
    name: url.endsWith("ada") ? "Ada" : "Grace",
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: fetch }));
  const setup = (app: Parameters<typeof engine.provideDmsFrontendRuntime>[0]) =>
    engine.provideDmsFrontendRuntime(app, runtime);
  await mountForm({ fetchUrl: "/api/people/ada" }, undefined, setup);
  expect(host.querySelector("input")?.value).toBe("Ada");
  unmountForm();
  await mountForm({ fetchUrl: "/api/people/grace" }, undefined, setup);
  expect(host.querySelector("input")?.value).toBe("Grace");
  expect(Object.values(engine.serializeDmsAsyncData(runtime))).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ values: { name: "Ada" } }),
      expect.objectContaining({ values: { name: "Grace" } }),
    ]),
  );
  unmountForm();
  await mountForm({ fetchUrl: "/api/people/ada" }, undefined, setup);
  expect(host.querySelector("input")?.value).toBe("Ada");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/people/ada",
    "/api/people/grace",
    "/api/people/ada",
  ]);
});
