interface UseAppOverlayReturn {
  overlays: Readonly<Ref<string[]>>;
  register: (name: string) => void;
  unregister: (name: string) => void;
}

/**
 * Registry of persistent, self-positioned global overlays rendered on every
 * page (inside `UApp`, outside the routed page). Modules register a
 * globally-available component by name; the component is rendered nakedly and
 * is responsible for its own placement (typically `position: fixed`), e.g. a
 * floating action button or a status badge.
 *
 * This is the "free" widget mode. For a framed widget that the DMS positions,
 * opacifies, stacks and animates for you, see {@link useAppWidgets}.
 */
export const useAppOverlay = (): UseAppOverlayReturn => {
  const overlays = useDmsState<string[]>("dms-app-overlays", () => []);

  function register(name: string): void {
    if (!overlays.value.includes(name)) {
      overlays.value = [...overlays.value, name];
    }
  }

  function unregister(name: string): void {
    overlays.value = overlays.value.filter((entry) => entry !== name);
  }

  return { overlays, register, unregister };
};
