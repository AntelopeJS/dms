const shortcutsMap = new Map<string, ComponentShortcuts>();
const registry = ref<ComponentShortcuts[]>([]);

const shortcutSignature = (metadata: ShortcutMetadata): string =>
  JSON.stringify([
    metadata.key,
    metadata.descriptionKey,
    metadata.condition?.descriptionKey,
  ]);

export function useShortcutRegistry() {
  function registerShortcut(component: string, metadata: ShortcutMetadata) {
    const componentKey = component.startsWith("$")
      ? component.slice(1)
      : component;

    let componentShortcuts = shortcutsMap.get(componentKey);
    if (!componentShortcuts) {
      componentShortcuts = { component, shortcuts: [] };
      shortcutsMap.set(componentKey, componentShortcuts);
    }

    const signature = shortcutSignature(metadata);
    if (
      componentShortcuts.shortcuts.some(
        (entry) => shortcutSignature(entry) === signature,
      )
    ) {
      return;
    }
    componentShortcuts.shortcuts.push(metadata);

    registry.value = Array.from(shortcutsMap.values());
  }

  function getRegistry() {
    return registry;
  }

  return {
    registerShortcut,
    getRegistry,
  };
}
