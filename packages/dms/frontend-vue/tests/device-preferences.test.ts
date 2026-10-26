// @vitest-environment jsdom
/**
 * "Reset this device's preferences": the cookies and `localStorage` keys the
 * DMS keeps a user's choices in go, the session, the favorite pages and what
 * other code stores stay.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  DEVICE_PREFERENCE_COOKIES,
  resetDevicePreferences,
} from "../layers/dms-layout/app/build/utils/devicePreferences";

const cookieNames = () =>
  document.cookie
    .split(/;\s*/)
    .filter(Boolean)
    .map((entry) => entry.split("=")[0]);

const setCookie = (name: string) => {
  document.cookie = `${name}=1; path=/`;
};

afterEach(() => {
  for (const name of cookieNames())
    document.cookie = `${name}=; path=/; max-age=0`;
  localStorage.clear();
});

describe("resetDevicePreferences", () => {
  it("forgets the tables, the drawers' sizes and the appearance", () => {
    for (const name of DEVICE_PREFERENCE_COOKIES) setCookie(name);
    localStorage.setItem("dms-table-preferences:v1:abc", "{}");
    localStorage.setItem("dms.live.paused:dashboard", "1");
    localStorage.setItem("dms-notification-group:billing", "folded");
    localStorage.setItem("dms-github-star-prompt:dismissed", "1");
    localStorage.setItem("vueuse-color-scheme", "dark");

    resetDevicePreferences();

    expect(cookieNames()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("forgets the sidebar's width whatever id Nuxt UI gave it", () => {
    setCookie("dms-dashboard-sidebar-v-0-1");

    resetDevicePreferences();

    expect(cookieNames()).toEqual([]);
  });

  it("keeps the session, the favorite pages, the language and other keys", () => {
    setCookie("dms-drawer-sizes");
    setCookie("dms-session");
    setCookie("dms-favorite-pages");
    setCookie("dms_locale");
    setCookie("dms-time-zone");
    setCookie("dms-keyboard-platform");
    localStorage.setItem("dms-table-preferences:v1:abc", "{}");
    localStorage.setItem("my-module:draft", "kept");

    resetDevicePreferences();

    expect(cookieNames().sort()).toEqual([
      "dms-favorite-pages",
      "dms-keyboard-platform",
      "dms-session",
      "dms-time-zone",
      "dms_locale",
    ]);
    expect(localStorage.getItem("my-module:draft")).toBe("kept");
    expect(localStorage.length).toBe(1);
  });
});
