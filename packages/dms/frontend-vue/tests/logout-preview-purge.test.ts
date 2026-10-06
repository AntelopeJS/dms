// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { usePermissionPreview } from "../layers/dms-core/app/composables/auth/usePermissionPreview";
import {
  PERMISSION_PREVIEW_STORAGE_PREFIX,
  PERMISSION_PREVIEW_TAB_KEY,
} from "../layers/dms-core/app/utils/permission-preview";

// Signing out forgets every "Preview as role" this browser holds: the next
// account must not find the previous one's role name and draft permissions.

const states = new Map<string, unknown>();

beforeEach(() => {
  states.clear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useDmsState", (key: string, init: () => unknown) => {
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
  preview.session.value = {
    id: "a",
  } as unknown as typeof preview.session.value;

  preview.purge();

  expect(preview.session.value).toBeNull();
  expect(sessionStorage.getItem(PERMISSION_PREVIEW_TAB_KEY)).toBeNull();
  expect(Object.keys(localStorage)).toEqual(["unrelated"]);
});
