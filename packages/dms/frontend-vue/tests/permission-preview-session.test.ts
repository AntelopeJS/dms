// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, type Ref } from "vue";
import { stubDmsState } from "./helpers/dms-state-stub";
import { usePermissionPreview } from "../layers/dms-core/app/entries/composables/auth/usePermissionPreview";
import {
  PERMISSION_PREVIEW_STORAGE_PREFIX,
  PERMISSION_PREVIEW_TAB_KEY,
} from "../layers/dms-core/app/entries/utils/permission-preview";

const states = new Map<string, Ref<unknown>>();

beforeEach(() => {
  states.clear();
  vi.stubGlobal("computed", computed);
  stubDmsState(states);
  localStorage.setItem(`${PERMISSION_PREVIEW_STORAGE_PREFIX}a`, "{}");
  localStorage.setItem(`${PERMISSION_PREVIEW_STORAGE_PREFIX}b`, "{}");
  localStorage.setItem("unrelated", "kept");
  sessionStorage.setItem(PERMISSION_PREVIEW_TAB_KEY, "a");
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it("removes the previews of every tab and the session in memory", () => {
  const preview = usePermissionPreview();
  preview.session.value = {
    id: "a",
    roleId: null,
    roleName: "Support",
    permissions: [],
    unsaved: false,
    returnTo: "/settings/workspace/roles",
    updatedAt: Date.now(),
  };

  preview.purge();

  expect(preview.session.value).toBeNull();
  expect(sessionStorage.getItem(PERMISSION_PREVIEW_TAB_KEY)).toBeNull();
  expect(Object.keys(localStorage)).toEqual(["unrelated"]);
});

const xhrOpen = () => {
  const open: unknown = Object.getOwnPropertyDescriptor(
    XMLHttpRequest.prototype,
    "open",
  )?.value;
  return open;
};

it("lets a preview tab's requests through untouched", () => {
  const nativeFetch = window.fetch;
  const nativeOpen = xhrOpen();
  localStorage.setItem(
    `${PERMISSION_PREVIEW_STORAGE_PREFIX}a`,
    JSON.stringify({
      id: "a",
      roleId: null,
      roleName: "Support",
      permissions: [],
      unsaved: false,
      returnTo: "/settings/workspace/roles",
      updatedAt: Date.now(),
    }),
  );
  const preview = usePermissionPreview();

  expect(preview.activate()).toBe(true);
  expect(window.fetch).toBe(nativeFetch);
  expect(xhrOpen()).toBe(nativeOpen);
});
