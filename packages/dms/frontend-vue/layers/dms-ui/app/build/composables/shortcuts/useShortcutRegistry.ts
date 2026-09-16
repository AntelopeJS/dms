const shortcutsMap = new Map<string, ComponentShortcuts>();
const registry = ref<ComponentShortcuts[]>([]);

export function useShortcutRegistry() {
  function registerShortcut(component: string, metadata: ShortcutMetadata) {
    const componentKey = component.startsWith("$")
      ? component.slice(1)
      : component;

    if (!shortcutsMap.has(componentKey)) {
      shortcutsMap.set(componentKey, {
        component,
        shortcuts: [],
      });
    }

    const componentShortcuts = shortcutsMap.get(componentKey)!;
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
