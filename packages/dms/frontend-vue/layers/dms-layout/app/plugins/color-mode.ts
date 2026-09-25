import {
  type BasicColorSchema,
  useColorMode as useVueUseColorMode,
} from "@vueuse/core";
import { type Ref, watch } from "vue";
import type { ColorModePreference } from "../composables/general/types";
import {
  COLOR_MODE_COOKIE,
  useColorModePreference,
} from "../composables/general/useColorModePreference";

type ExplicitColorMode = Exclude<ColorModePreference, "system">;

/** The preferences that pin their class on `<html>`; any other follows the system. */
const EXPLICIT_COLOR_MODES: ExplicitColorMode[] = ["light", "dark"];
const SYSTEM_PREFERENCE: ColorModePreference = "system";
const VUEUSE_SYSTEM_MODE: BasicColorSchema = "auto";
/**
 * vueuse's default key. Nuxt UI's `useDark()`, installed with the app, and its
 * color-mode components (`UDashboardSearch`'s theme group…) all read it.
 */
const VUEUSE_STORAGE_KEY = "vueuse-color-scheme";
const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const PRE_PAINT_SCRIPT_ID = "dms-color-mode";

/**
 * Runs in `<head>` before first paint, and so before the entry module installs
 * Nuxt UI: it hands vueuse the cookie's mode, which `useDark()` reads on boot,
 * and sets the `<html>` class, resolving `system` itself. The cookie is read
 * the way `useDmsCookie` writes it (URI-encoded JSON), falling back to the raw
 * value. Source text rather than a serialized function, which a bundler could
 * fill with helpers the page does not have.
 */
const PRE_PAINT_SCRIPT = `(() => {
  const modes = ${JSON.stringify(EXPLICIT_COLOR_MODES)};
  const prefix = ${JSON.stringify(`${COLOR_MODE_COOKIE}=`)};
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix)) ?? "";
  let preference = "";
  try {
    preference = decodeURIComponent(entry.slice(prefix.length));
    preference = JSON.parse(preference);
  } catch {}
  const mode = modes.includes(preference) ? preference : ${JSON.stringify(VUEUSE_SYSTEM_MODE)};
  try {
    localStorage.setItem(${JSON.stringify(VUEUSE_STORAGE_KEY)}, mode);
  } catch {}
  const system = matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches ? "dark" : "light";
  document.documentElement.classList.remove(...modes);
  document.documentElement.classList.add(modes.includes(mode) ? mode : system);
})();`;

function explicitColorMode(value: string): ExplicitColorMode | undefined {
  return EXPLICIT_COLOR_MODES.find((mode) => mode === value);
}

/**
 * Mirrors the cookie, the source of truth, into the vueuse store Nuxt UI
 * shares, and a change made from a Nuxt UI component back into the cookie.
 * Each side is written only when it would change, so neither echoes the other.
 */
function syncWithVueUse(preference: Ref<ColorModePreference>): void {
  const { store } = useVueUseColorMode({ storageKey: VUEUSE_STORAGE_KEY });
  watch(
    preference,
    (next) => {
      const mode = explicitColorMode(next) ?? VUEUSE_SYSTEM_MODE;
      if (store.value !== mode) store.value = mode;
    },
    { immediate: true },
  );
  watch(store, (next) => {
    const nextPreference = explicitColorMode(next) ?? SYSTEM_PREFERENCE;
    if (preference.value !== nextPreference) preference.value = nextPreference;
  });
}

/**
 * The server renders an explicit preference's class, so the first paint is
 * right before any script runs, and the pre-paint script, which only matters
 * before that paint: inserted later by the browser head it would run after
 * boot and redo what the sync already did. In the browser the class belongs to
 * vueuse, which Nuxt UI already drives it with: were unhead tracking it as
 * well, it would remove it when `dark` gives way to a `system` that still
 * resolves dark, and vueuse, seeing no change, would not put it back. A page
 * rendered without the script (client-side fallback) is corrected by the sync,
 * which applies the cookie on boot.
 */
export default defineDmsPlugin(() => {
  const preference = useColorModePreference();

  if (!import.meta.env.SSR) {
    syncWithVueUse(preference);
    return;
  }
  const mode = explicitColorMode(preference.value);
  useHead({
    htmlAttrs: mode ? { class: mode } : {},
    script: [{ id: PRE_PAINT_SCRIPT_ID, innerHTML: PRE_PAINT_SCRIPT }],
  });
});
