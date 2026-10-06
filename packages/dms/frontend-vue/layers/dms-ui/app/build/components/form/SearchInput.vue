<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import {
  buildNavSearchShortcuts,
  buildPageSearchShortcuts,
  NAV_SEARCH_SHORTCUT,
  PAGE_SEARCH_HINT_KEYS,
  pageSearchAriaKeyshortcuts,
} from "../../../composables/global/searchShortcuts";
import {
  keyboardKeyLabel,
  type KeyboardPlatform,
  useKeyboardPlatform,
} from "../../../composables/global/keyboardPlatform";

// The one search field of the DMS (settings menu, pages, lists, tables): a
// UInput with the magnifier, named by its placeholder, and the keys that
// focus it as a hint. Attributes (`id`, `size`, `class`, listeners) go to
// the UInput.

/**
 * The keys that focus the field: `nav` is "/" (the navigation search, one
 * per page), `page` is ⌘ / or Ctrl / (a page's own search).
 */
export type SearchInputShortcut = "nav" | "page";

interface SearchInputProps {
  /** Placeholder, already translated; also the field's accessible name. */
  placeholder: string;
  shortcut?: SearchInputShortcut;
  /** Platform the key hint is drawn for, when the page lets one be picked. */
  hintPlatform?: KeyboardPlatform;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SearchInputProps>(), {
  shortcut: undefined,
  hintPlatform: undefined,
});

const query = defineModel<string>({ default: "" });

const SEARCH_ICON = "i-ph-magnifying-glass";
const SHORTCUT_BINDINGS: Record<
  SearchInputShortcut,
  (focus: () => void) => Record<string, () => void>
> = {
  nav: buildNavSearchShortcuts,
  page: buildPageSearchShortcuts,
};

const input = useTemplateRef<{ inputRef?: HTMLInputElement }>("input");
const { platform, isMac } = useKeyboardPlatform();

function focus(): void {
  input.value?.inputRef?.focus();
}

if (props.shortcut) defineShortcuts(SHORTCUT_BINDINGS[props.shortcut](focus));

const hintKeys = computed(() => {
  if (props.shortcut === "nav") return [NAV_SEARCH_SHORTCUT];
  if (props.shortcut !== "page") return [];
  const hintPlatform = props.hintPlatform ?? platform.value;
  return PAGE_SEARCH_HINT_KEYS.map((key) =>
    keyboardKeyLabel(key, hintPlatform),
  );
});
const ariaKeyshortcuts = computed(() => {
  if (props.shortcut === "nav") return NAV_SEARCH_SHORTCUT;
  return props.shortcut === "page"
    ? pageSearchAriaKeyshortcuts(isMac.value)
    : undefined;
});

defineExpose({
  focus,
  get inputRef() {
    return input.value?.inputRef;
  },
});
</script>

<template>
  <UInput
    ref="input"
    v-model="query"
    :icon="SEARCH_ICON"
    :placeholder="props.placeholder"
    :aria-label="props.placeholder"
    :aria-keyshortcuts="ariaKeyshortcuts"
    v-bind="$attrs"
  >
    <!-- No key hint on phones: it covered the placeholder there. -->
    <template v-if="hintKeys.length" #trailing>
      <span class="flex items-center gap-0.5 max-sm:hidden">
        <UKbd v-for="key in hintKeys" :key="key" :value="key" size="sm" />
      </span>
    </template>
  </UInput>
</template>
