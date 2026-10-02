import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBOARD_PLATFORM,
  detectKeyboardPlatform,
  formatKeyboardShortcut,
  keyboardKeyLabel,
} from "../layers/dms-ui/app/composables/global/keyboardPlatform";
import { PAGE_SEARCH_HINT_KEYS } from "../layers/dms-ui/app/composables/global/searchShortcuts";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("detectKeyboardPlatform", () => {
  it.each([
    ["client hint macOS", { userAgentData: { platform: "macOS" } }, "mac"],
    [
      "client hint Windows",
      { userAgentData: { platform: "Windows" } },
      "other",
    ],
    ["client hint Linux", { userAgentData: { platform: "Linux" } }, "other"],
    ["platform MacIntel", { platform: "MacIntel" }, "mac"],
    ["platform iPhone", { platform: "iPhone" }, "mac"],
    ["platform iPad", { platform: "iPad" }, "mac"],
    ["platform Win32", { platform: "Win32" }, "other"],
    ["platform Linux x86_64", { platform: "Linux x86_64" }, "other"],
    ["mac user agent only", { userAgent: MAC_UA }, "mac"],
    ["iPhone user agent only", { userAgent: IPHONE_UA }, "mac"],
    ["windows user agent only", { userAgent: WINDOWS_UA }, "other"],
  ] as const)("reads %s", (_case, navigator, expected) => {
    expect(detectKeyboardPlatform(navigator)).toBe(expected);
  });

  it("prefers the client hint over the legacy platform", () => {
    expect(
      detectKeyboardPlatform({
        userAgentData: { platform: "Windows" },
        platform: "MacIntel",
      }),
    ).toBe("other");
  });

  it("falls back to the server default without a navigator", () => {
    expect(detectKeyboardPlatform(undefined)).toBe(DEFAULT_KEYBOARD_PLATFORM);
    expect(DEFAULT_KEYBOARD_PLATFORM).toBe("other");
  });
});

describe("keyboard labels", () => {
  it("prints meta as ⌘ on macOS and Ctrl elsewhere", () => {
    expect(keyboardKeyLabel("meta", "mac")).toBe("⌘");
    expect(keyboardKeyLabel("meta", "other")).toBe("Ctrl");
  });

  it("prints the other modifiers per platform", () => {
    expect(keyboardKeyLabel("shift", "mac")).toBe("⇧");
    expect(keyboardKeyLabel("alt", "mac")).toBe("⌥");
    expect(keyboardKeyLabel("alt", "other")).toBe("Alt");
  });

  it("uppercases letters and keeps unknown key names", () => {
    expect(keyboardKeyLabel("k", "mac")).toBe("K");
    expect(keyboardKeyLabel("/", "other")).toBe("/");
    expect(keyboardKeyLabel("letter_placeholder", "other")).toBe(
      "letter_placeholder",
    );
  });

  it("runs a mac combination together and spaces a PC one", () => {
    expect(formatKeyboardShortcut(["meta", "k"], "mac")).toBe("⌘K");
    expect(formatKeyboardShortcut(["meta", "k"], "other")).toBe("Ctrl K");
    expect(formatKeyboardShortcut(["meta", "v"], "other")).toBe("Ctrl V");
  });

  it("prints the page search hint as ⌘ / or Ctrl /", () => {
    expect(
      PAGE_SEARCH_HINT_KEYS.map((k) => keyboardKeyLabel(k, "mac")),
    ).toEqual(["⌘", "/"]);
    expect(
      PAGE_SEARCH_HINT_KEYS.map((k) => keyboardKeyLabel(k, "other")),
    ).toEqual(["Ctrl", "/"]);
  });
});
