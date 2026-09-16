<script setup lang="ts">
import KeyboardShortcut from "../../build/components/pages/settings/shortcut/KeyboardShortcut.vue";

const SKELETON_SECTION_COUNT = 3;
const META_KEYBOARD_TOKEN = "$keyboard.meta";
const META_KEY_LABELS = {
  mac: "⌘",
  other: "Ctrl",
};

// Per-group accent icon (design panel-title pill). Keyed by the lowercased
// component name; falls back to a keyboard glyph for unknown groups.
const GROUP_ICONS: Record<string, string> = {
  global: "i-ph-command",
  tab: "i-ph-browsers",
  tableview: "i-ph-table",
  tree: "i-ph-tree-structure",
  form: "i-ph-note-pencil",
};

const { t } = useI18n();
const { getRegistry } = useShortcutRegistry();
const shortcuts: Ref<ComponentShortcuts[]> = getRegistry();

const sortedShortcuts = computed(() => {
  return shortcuts.value.map((componentShortcuts: ComponentShortcuts) => ({
    ...componentShortcuts,
    shortcuts: [...componentShortcuts.shortcuts].sort((a, b) => {
      return a.key.join("+").localeCompare(b.key.join("+"));
    }),
  }));
});

function isMacPlatform(): boolean {
  if (typeof window === "undefined") return false;
  const navAny = window.navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    navAny.userAgentData?.platform ?? window.navigator.platform ?? "";
  return /Mac/i.test(platform);
}

function getMetaKeyLabel(): string {
  return isMacPlatform() ? META_KEY_LABELS.mac : META_KEY_LABELS.other;
}

function attemptTranslation(toTranslate: string): string {
  if (toTranslate === META_KEYBOARD_TOKEN) {
    return getMetaKeyLabel();
  }
  if (toTranslate.startsWith("$")) {
    return t(toTranslate.slice(1));
  }
  return toTranslate.toUpperCase();
}

function groupKey(component: string): string {
  return component.replace(/^\$/, "").toLowerCase();
}

function groupIcon(component: string): string {
  return GROUP_ICONS[groupKey(component)] ?? "i-ph-keyboard";
}

// Group title keeps its natural case (e.g. "TableView"), unlike keys/labels.
function groupTitle(component: string): string {
  return component.startsWith("$") ? t(component.slice(1)) : component;
}
</script>

<template>
  <DmsClientOnly>
    <div class="space-y-5 pb-16">
      <DmsCard
        v-for="(componentShortcuts, componentIndex) in sortedShortcuts"
        :key="componentIndex"
        as="section"
        :padded="false"
        class="overflow-hidden"
      >
        <div class="border-default flex items-center gap-3 border-b px-5 py-4">
          <span
            class="bg-primary/10 ring-primary/20 text-primary flex size-[34px] shrink-0 items-center justify-center rounded-md ring"
          >
            <UIcon
              :name="groupIcon(componentShortcuts.component)"
              class="size-[17px]"
            />
          </span>
          <h2 class="text-highlighted text-[17px] font-semibold tracking-tight">
            {{ groupTitle(componentShortcuts.component) }}
          </h2>
        </div>

        <div class="p-2">
          <div
            v-for="(shortcut, shortcutIndex) in componentShortcuts.shortcuts"
            :key="shortcutIndex"
            class="hover:bg-default flex items-center justify-between gap-4 rounded-md px-4 py-3.5 transition-colors"
            :class="{ 'border-muted border-t': shortcutIndex > 0 }"
          >
            <span class="text-muted text-sm">
              {{ attemptTranslation(shortcut.descriptionKey) }}
            </span>

            <KeyboardShortcut :keys="shortcut.key.map(attemptTranslation)" />
          </div>
        </div>
      </DmsCard>
    </div>

    <template #fallback>
      <div class="space-y-5 pb-16">
        <DmsCard
          v-for="i in SKELETON_SECTION_COUNT"
          :key="i"
          as="section"
          :padded="false"
          class="overflow-hidden"
        >
          <div
            class="border-default flex items-center gap-3 border-b px-5 py-4"
          >
            <USkeleton class="size-[34px] rounded-md" />
            <USkeleton class="h-5 w-28" />
          </div>
          <div class="space-y-2 p-2">
            <USkeleton class="h-11 w-full rounded-md" />
            <USkeleton class="h-11 w-full rounded-md" />
          </div>
        </DmsCard>
      </div>
    </template>
  </DmsClientOnly>
</template>
