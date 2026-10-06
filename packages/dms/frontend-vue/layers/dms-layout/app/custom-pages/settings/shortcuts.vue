<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/build/utils/monoChip";
import KeyboardShortcut from "../../build/components/pages/settings/shortcut/KeyboardShortcut.vue";
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import { usePageHeaderActions } from "../../composables/layout/usePageHeaderActions";
import DmsSearchInput from "#dms-ui/app/build/components/form/SearchInput.vue";
import {
  keyboardKeyLabel,
  type KeyboardPlatform,
  useKeyboardPlatform,
} from "#dms-ui/app/composables/global/keyboardPlatform";

interface ShortcutGroupView {
  key: string;
  title: string;
  description: string;
  shortcuts: ShortcutMetadata[];
}

const I18N_PREFIX = "$";
const KEYBOARD_I18N_PREFIX = "$keyboard.";
const GROUP_I18N = "page.settings.shortcuts.groups";

const { t, te } = useI18n();
const { getRegistry } = useShortcutRegistry();
const shortcuts: Ref<ComponentShortcuts[]> = getRegistry();

// The layout the dashboard detected (the one every other hint uses); the
// header switch previews the other one on this page only.
const { platform: detectedPlatform, isMac } = useKeyboardPlatform();
const platform = ref<KeyboardPlatform>(detectedPlatform.value);
watch(detectedPlatform, (next) => {
  platform.value = next;
});
const query = ref("");

const platformItems = computed(() => [
  {
    value: "mac",
    label: t("page.settings.shortcuts.os_mac"),
    icon: "i-ph-apple-logo",
  },
  {
    value: "other",
    label: t("page.settings.shortcuts.os_other"),
    icon: "i-ph-windows-logo",
  },
]);

usePageHeaderActions(() =>
  h(DmsSegmented, {
    items: platformItems.value,
    modelValue: platform.value,
    size: "xs",
    ariaLabel: t("page.settings.shortcuts.layout_label"),
    "onUpdate:modelValue": (value: string | number | undefined) => {
      if (value !== undefined) platform.value = value as KeyboardPlatform;
    },
  }),
);

function translate(token: string): string {
  if (token.startsWith(I18N_PREFIX)) return t(token.slice(I18N_PREFIX.length));
  return token.toUpperCase();
}

/**
 * A `$keyboard.*` key takes the platform's label when it has one (⌘, Ctrl,
 * ⇧…, shared with every other hint); any other keeps its translated name.
 */
function keyLabel(token: string): string {
  if (token.startsWith(KEYBOARD_I18N_PREFIX)) {
    const key = token.slice(KEYBOARD_I18N_PREFIX.length);
    const label = keyboardKeyLabel(key, platform.value);
    if (label !== key) return label;
  }
  return translate(token);
}

function groupKey(component: string): string {
  return component.replace(/^\$/, "").split(".").pop()!.toLowerCase();
}

function groupText(component: string, field: "title" | "description"): string {
  const key = `${GROUP_I18N}.${groupKey(component)}.${field}`;
  if (te(key)) return t(key);
  return field === "title" ? translate(component) : "";
}

function matchesQuery(shortcut: ShortcutMetadata, needle: string): boolean {
  const haystack = [
    translate(shortcut.descriptionKey),
    shortcut.condition ? translate(shortcut.condition.descriptionKey) : "",
    ...shortcut.key.map(keyLabel),
  ];
  return haystack.some((text) => text.toLocaleLowerCase().includes(needle));
}

const groups = computed<ShortcutGroupView[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return shortcuts.value
    .map((group) => ({
      key: group.component,
      title: groupText(group.component, "title"),
      description: groupText(group.component, "description"),
      shortcuts: group.shortcuts.filter(
        (shortcut) => !needle || matchesQuery(shortcut, needle),
      ),
    }))
    .filter((group) => group.shortcuts.length > 0);
});

const shortcutCount = computed(() =>
  shortcuts.value.reduce((total, group) => total + group.shortcuts.length, 0),
);

const detectedLabel = computed(() =>
  isMac.value
    ? t("page.settings.shortcuts.os_mac")
    : t("page.settings.shortcuts.os_other"),
);
</script>

<!-- Rendered on the server too: the list is static, and the platform comes
     from the cookie both sides read, so only the key labels can change once
     the browser has detected its own layout. -->
<template>
  <div>
    <div class="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2">
      <!-- "/" stays with the settings menu search (SettingsNav): this page's
        own search takes ⌘ / or Ctrl /, its hint drawn for the layout picked
        in the header. -->
      <DmsSearchInput
        id="shortcuts-search"
        v-model="query"
        :placeholder="t('page.settings.shortcuts.search_placeholder')"
        shortcut="page"
        :hint-platform="platform"
        class="w-full max-w-[420px]"
      />
      <span class="text-muted inline-flex items-center gap-1.5 text-xs">
        <UIcon name="i-ph-info" class="size-3.5 shrink-0" />
        {{
          t("page.settings.shortcuts.detected", {
            os: detectedLabel,
            count: shortcutCount,
            groups: shortcuts.length,
          })
        }}
      </span>
    </div>

    <DmsSection
      v-for="group in groups"
      :key="group.key"
      :title="group.title"
      :description="group.description"
    >
      <template #badge>
        <span
          :class="[
            MONO_CHIP_CLASS,
            'bg-elevated text-dimmed text-[10.5px] font-semibold',
          ]"
        >
          {{ group.shortcuts.length }}
        </span>
      </template>

      <div
        v-for="(shortcut, index) in group.shortcuts"
        :key="`${group.key}-${index}`"
        class="border-muted flex items-center gap-4 border-t px-[18px] py-3 first:border-t-0"
      >
        <div class="min-w-0 flex-1">
          <div class="text-highlighted text-[13px] font-medium">
            {{ translate(shortcut.descriptionKey) }}
          </div>
          <div v-if="shortcut.condition" class="text-muted mt-0.5 text-[12px]">
            {{ translate(shortcut.condition.descriptionKey) }}
          </div>
        </div>
        <KeyboardShortcut :keys="shortcut.key.map(keyLabel)" />
      </div>
    </DmsSection>

    <p v-if="query && groups.length === 0" class="text-muted text-[13px]">
      {{ t("page.settings.shortcuts.no_results") }}
    </p>
  </div>
</template>
