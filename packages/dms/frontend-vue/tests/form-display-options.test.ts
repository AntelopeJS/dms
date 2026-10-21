// @vitest-environment jsdom
import { computed, createApp, h, useAttrs } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Display from "../layers/dms-ui/app/components/form/components/Display.vue";

interface StatusOptions {
  onlineLabel?: string;
  offlineLabel?: string;
}

// A status type worded from its options, as the registered one is: the
// fallback labels show when the options do not reach the formatter.
const statusType = {
  id: "status",
  formatter: {
    default: (value: unknown, _locale: string, options?: unknown) => {
      const opts = options as StatusOptions | undefined;
      return value
        ? (opts?.onlineLabel ?? "Online")
        : (opts?.offlineLabel ?? "Offline");
    },
  },
};

/** A read-only field as a form renders it: its options spread on it. */
function mountDisplay(modelValue: unknown, options: Record<string, unknown>) {
  const app = createApp({
    render: () => h(Display, { modelValue, type: "status", ...options }),
  });
  const container = document.createElement("div");
  app.mount(container);
  return { app, container };
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useAttrs", useAttrs);
  vi.stubGlobal("useI18n", () => ({
    locale: { value: "en" },
    t: (key: string) => key,
  }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => statusType }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("words a read-only status with the labels its column sets", () => {
  const options = {
    onlineLabel: "Pending",
    offlineLabel: "Expired",
    onlineColor: "warning",
    offlineColor: "neutral",
  };

  const pending = mountDisplay(true, options);
  const expired = mountDisplay(false, options);

  expect(pending.container.textContent).toBe("Pending");
  expect(expired.container.textContent).toBe("Expired");
  pending.app.unmount();
  expired.app.unmount();
});
