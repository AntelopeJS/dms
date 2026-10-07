// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useCopyFeedback } from "../layers/dms-ui/app/build/composables/clipboard/useCopyFeedback";

const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  writeText.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function inScope<T>(setup: () => T): T {
  return effectScope().run(setup)!;
}

it("copies a text and marks its button copied for a moment", async () => {
  const clipboard = inScope(() => useCopyFeedback<string>());
  await clipboard.copyText("--ui-primary", "--ui-primary");

  expect(writeText).toHaveBeenCalledWith("--ui-primary");
  expect(clipboard.isCopied("--ui-primary")).toBe(true);
  expect(clipboard.isCopied("--ui-bg")).toBe(false);
  expect(clipboard.iconOf("--ui-primary")).toBe("i-ph-check");
  expect(clipboard.iconOf("--ui-bg")).toBe("i-ph-copy");

  vi.runAllTimers();
  expect(clipboard.isCopied("--ui-primary")).toBe(false);
});

it("keeps an acknowledging copy until it is reset", async () => {
  const clipboard = inScope(() => useCopyFeedback(Number.POSITIVE_INFINITY));
  await clipboard.copyText("codes", true);

  vi.runAllTimers();
  expect(clipboard.isCopied(true)).toBe(true);

  clipboard.reset();
  expect(clipboard.isCopied(true)).toBe(false);
});
