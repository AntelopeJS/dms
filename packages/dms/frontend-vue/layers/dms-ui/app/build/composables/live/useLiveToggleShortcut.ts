import { onBeforeUnmount, onMounted } from "vue";

// The toggles mounted on the page, in mount order: the first one owns the L
// key, so a page showing two toggles still switches once per press.
const claims: symbol[] = [];

/**
 * Binds L to `toggle` for the first LiveToggle mounted on the page; the next
 * one takes over when it goes.
 *
 * @internal
 */
export function useLiveToggleShortcut(toggle: () => void): void {
  const claim = Symbol("live-toggle");
  onMounted(() => claims.push(claim));
  onBeforeUnmount(() => {
    const index = claims.indexOf(claim);
    if (index >= 0) claims.splice(index, 1);
  });
  defineShortcuts({
    l: () => {
      if (claims[0] === claim) toggle();
    },
  });
}
