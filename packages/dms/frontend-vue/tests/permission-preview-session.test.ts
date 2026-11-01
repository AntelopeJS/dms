/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { usePermissionPreview } from "../layers/dms-core/app/entries/composables/auth/usePermissionPreview";
import { useReadOnlyRefusal } from "../layers/dms-core/app/composables/useReadOnlyRefusal";
import {
  readOnlyFailure,
  unmarkedForbiddenFailure,
} from "./helpers/read-only-refusal";
import {
  PERMISSION_PREVIEW_STORAGE_PREFIX,
  PERMISSION_PREVIEW_TAB_KEY,
} from "../layers/dms-core/app/entries/utils/permission-preview";

const states = new Map<string, unknown>();

beforeEach(() => {
  states.clear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useDmsState", <T>(key: string, init: () => T) => {
    if (!states.has(key)) states.set(key, ref(init()));
    return states.get(key);
  });
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
  // SAFETY: purge discards this deliberately partial session without reading its fields.
  preview.session.value = { id: "a" } as NonNullable<
    typeof preview.session.value
  >;

  preview.purge();

  expect(preview.session.value).toBeNull();
  expect(sessionStorage.getItem(PERMISSION_PREVIEW_TAB_KEY)).toBeNull();
  expect(Object.keys(localStorage)).toEqual(["unrelated"]);
});

it("lets a preview tab's requests through untouched", () => {
  const nativeFetch = window.fetch;
  const nativeOpen = XMLHttpRequest.prototype.open;
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
  expect(XMLHttpRequest.prototype.open).toBe(nativeOpen);
});

it.each([true, false])(
  "cleans up preview reads without a second refusal banner, marked %s",
  async (marked) => {
    const add = vi.fn();
    vi.stubGlobal("useToast", () => ({ add }));
    vi.stubGlobal("getAppTranslation", () => ({
      processApiMessage: (key: string) => key,
    }));
    vi.stubGlobal("useReadOnlyRefusal", useReadOnlyRefusal);
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
    const failure = marked ? readOnlyFailure() : unmarkedForbiddenFailure();
    vi.stubGlobal("useAuthFetch", () => ({
      $authFetch: async () => {
        throw failure;
      },
    }));
    await preview.refresh("/home");
    expect(preview.loading.value).toBe(false);
    expect(preview.failed.value).toBe(!marked);
    expect(add).toHaveBeenCalledTimes(marked ? 1 : 0);
  },
);
