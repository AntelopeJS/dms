import aggregatedShortcuts from "#shortcuts-aggregated";
import { useShortcutRegistry } from "../build/composables/shortcuts/useShortcutRegistry";

export default defineDmsPlugin(() => {
  const { registerShortcut } = useShortcutRegistry();

  for (const componentShortcuts of aggregatedShortcuts) {
    for (const shortcut of componentShortcuts.shortcuts) {
      registerShortcut(componentShortcuts.component, shortcut);
    }
  }
});
