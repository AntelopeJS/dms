// @vitest-environment jsdom
import { createApp, inject, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPlugin } from "../lazy-plugin";

const KEY = Symbol("provided");

let app: App | undefined;

afterEach(() => {
  app = undefined;
  vi.restoreAllMocks();
});

function runtimeContext() {
  app = createApp({});
  app.provide(KEY, "from-the-app");
  const current = app;
  return {
    runWithContext: <T>(callback: () => T): T =>
      current.runWithContext(callback),
  };
}

describe("lazyPlugin", () => {
  it("lets a plugin that loads on demand inject what the app provides", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const context = runtimeContext();
    let injected: unknown;
    const plugin = lazyPlugin(async () => ({
      default: () => {
        injected = inject(KEY, undefined);
      },
    }));

    await context.runWithContext(() => plugin(context));

    expect(injected).toBe("from-the-app");
    expect(warn).not.toHaveBeenCalled();
  });

  it("passes the context to the loaded plugin and waits for it", async () => {
    const context = runtimeContext();
    const order: string[] = [];
    const plugin = lazyPlugin<typeof context>(async () => ({
      default: async (received) => {
        await Promise.resolve();
        order.push(received === context ? "same context" : "other context");
      },
    }));

    await plugin(context);
    order.push("done");

    expect(order).toEqual(["same context", "done"]);
  });
});
