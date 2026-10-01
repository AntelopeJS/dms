import { computed } from "vue";
import { accessibilityHtmlClasses } from "#dms-ui/app/utils/accessibilityPreferences";
import { useAccessibilityPreferences } from "../composables/general/useAccessibilityPreferences";

/**
 * Puts the accessibility classes on `<html>`, on the server too: the cookie is
 * read there, so the first paint has reduced motion, contrast and underlined
 * links without a flash. `auto` motion needs no class (the CSS reads
 * `prefers-reduced-motion`). unhead adds and removes only these class tokens,
 * leaving the color-mode class to vueuse.
 */
export default defineDmsPlugin(() => {
  const { preferences } = useAccessibilityPreferences();

  // No `class` key at all for the defaults, rather than an empty `class=""`.
  useHead(
    computed(() => {
      const classes = accessibilityHtmlClasses(preferences.value);
      return { htmlAttrs: classes.length > 0 ? { class: classes } : {} };
    }),
  );
});
