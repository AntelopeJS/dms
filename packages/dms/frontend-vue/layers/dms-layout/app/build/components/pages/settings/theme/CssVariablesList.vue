<script setup lang="ts">
import { useClipboard } from "@vueuse/core";

const CSS_LOAD_DELAY_MS = 100;
const COPIED_RESET_MS = 1500;
const UI_VARIABLE_PREFIX = "--ui-";
const SKELETON_ROW_COUNT = 6;
const ROW_CLASS =
  "border-muted grid h-10 grid-cols-[22px_minmax(0,1.2fr)_minmax(0,1fr)_90px] items-center gap-3 ps-[18px] pe-3 text-sm transition-colors not-first:border-t max-sm:h-auto max-sm:grid-cols-[22px_minmax(0,1fr)_auto] max-sm:gap-y-0.5 max-sm:py-2";
const EXPORT_FILE_NAME = "dms-ui-variables.css";
const OTHER_CATEGORY = "other";
const ALL_CATEGORIES = "all";

type VariableCategory =
  | "colors"
  | "text"
  | "background"
  | "border"
  | "radius"
  | "shadow"
  | typeof OTHER_CATEGORY;

/** The category switch: one category, or every variable. */
type CategoryFilter = VariableCategory | typeof ALL_CATEGORIES;

interface CSSVariable {
  name: string;
  value: string;
  category: VariableCategory;
}

// First match wins: `--ui-border-…` is a border colour, `--ui-radius` a radius.
const CATEGORY_PATTERNS: Array<[string, VariableCategory]> = [
  ["-color-", "colors"],
  ["-text", "text"],
  ["-bg", "background"],
  ["-border", "border"],
  ["-radius", "radius"],
  ["-shadow", "shadow"],
];
const CATEGORY_ORDER: VariableCategory[] = [
  "colors",
  "text",
  "background",
  "border",
  "radius",
  "shadow",
  OTHER_CATEGORY,
];
// Colour-valued categories draw their swatch as a filled square.
const COLOR_CATEGORIES = new Set<VariableCategory>([
  "colors",
  "text",
  "background",
  "border",
]);

/** Emits the number of variables once they are read, for the block summary. */
const emit = defineEmits<{ loaded: [count: number] }>();

const { t } = useI18n();
const cssVariables = ref<CSSVariable[]>([]);
const isLoading = ref(true);
const query = ref("");
const category = ref<CategoryFilter>(ALL_CATEGORIES);
const copiedName = ref<string | null>(null);

function categoryOf(name: string): VariableCategory {
  for (const [pattern, match] of CATEGORY_PATTERNS) {
    if (name.includes(pattern)) return match;
  }
  return OTHER_CATEGORY;
}

function collectNames(rules: CSSRuleList, names: Set<string>): void {
  for (const rule of Array.from(rules)) {
    if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) {
      collectNames((rule as CSSGroupingRule).cssRules, names);
    }
    if (rule instanceof CSSStyleRule) {
      for (const property of Array.from(rule.style)) {
        if (property.startsWith(UI_VARIABLE_PREFIX)) names.add(property);
      }
    }
  }
}

// Reads every `--ui-*` property the stylesheets declare, valued for the
// current theme (the computed value on <html>).
function readVariables(): CSSVariable[] {
  const names = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectNames(sheet.cssRules, names);
    } catch {
      /* cross-origin stylesheets throw on cssRules access */
    }
  }
  const rootStyles = getComputedStyle(document.documentElement);
  return (
    Array.from(names)
      .map((name) => ({
        name,
        value: rootStyles.getPropertyValue(name).trim(),
        category: categoryOf(name),
      }))
      .filter((variable) => variable.value !== "")
      // Natural order, so `-50` comes before `-100` and `-400`.
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      )
  );
}

function refresh(): void {
  cssVariables.value = readVariables();
  isLoading.value = false;
  emit("loaded", cssVariables.value.length);
}

const categoryItems = computed(() => [
  {
    value: ALL_CATEGORIES,
    label: t(`page.settings.appearance.css_vars.categories.${ALL_CATEGORIES}`),
  },
  ...CATEGORY_ORDER.filter((id) =>
    cssVariables.value.some((variable) => variable.category === id),
  ).map((id) => ({
    value: id,
    label: t(`page.settings.appearance.css_vars.categories.${id}`),
  })),
]);

const inCategory = computed(() =>
  category.value === ALL_CATEGORIES
    ? cssVariables.value
    : cssVariables.value.filter(
        (variable) => variable.category === category.value,
      ),
);

const shown = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  if (!needle) return inCategory.value;
  return inCategory.value.filter((variable) =>
    `${variable.name} ${variable.value}`.toLocaleLowerCase().includes(needle),
  );
});

function swatchStyle(variable: CSSVariable): Record<string, string> {
  if (COLOR_CATEGORIES.has(variable.category)) {
    return { background: `var(${variable.name})` };
  }
  if (variable.category === "radius") {
    return { borderTopLeftRadius: `var(${variable.name})` };
  }
  if (variable.category === "shadow") {
    return { boxShadow: `var(${variable.name})` };
  }
  return {};
}

const { copy } = useClipboard();
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copyName(name: string): Promise<void> {
  await copy(name);
  copiedName.value = name;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copiedName.value = null;
  }, COPIED_RESET_MS);
}

function exportAsCss(): void {
  const body = cssVariables.value
    .map((variable) => `  ${variable.name}: ${variable.value};`)
    .join("\n");
  const blob = new Blob([`:root {\n${body}\n}\n`], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

// Values follow the theme: re-read them when the light/dark class changes.
let themeObserver: MutationObserver | undefined;

onMounted(() => {
  setTimeout(refresh, CSS_LOAD_DELAY_MS);
  themeObserver = new MutationObserver(refresh);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  clearTimeout(copiedTimer);
});
</script>

<template>
  <div>
    <!-- v2 .cs-dev__tools: filter, category switch, theme hint. -->
    <div
      class="border-muted flex flex-wrap items-center gap-2.5 border-b bg-(--dms-bg-muted) py-2.5 ps-[18px] pe-3.5"
    >
      <DmsSearchInput
        v-model="query"
        size="sm"
        :placeholder="t('page.settings.appearance.css_vars.filter_placeholder')"
        class="w-full sm:w-60"
      />
      <!-- Phones: the six categories wrap onto a second line. -->
      <DmsSegmented
        v-if="cssVariables.length"
        v-model="category"
        class="max-sm:h-auto max-sm:flex-wrap max-sm:[&>button]:h-6"
        :items="categoryItems"
        size="xs"
        :aria-label="t('page.settings.appearance.css_vars.category_label')"
      />
      <span class="text-dimmed ms-auto text-xs">
        {{ t("page.settings.appearance.css_vars.theme_hint") }}
      </span>
    </div>

    <div v-if="isLoading" aria-busy="true">
      <div
        v-for="i in SKELETON_ROW_COUNT"
        :key="i"
        class="border-muted grid h-10 grid-cols-[22px_minmax(0,1.2fr)_minmax(0,1fr)_90px] items-center gap-3 ps-[18px] pe-3 not-first:border-t"
      >
        <USkeleton class="size-[18px] rounded-[5px]" />
        <USkeleton class="h-3 w-40" />
        <USkeleton class="h-3 w-32" />
        <span />
      </div>
    </div>

    <div v-else class="max-h-[440px] overflow-y-auto">
      <!-- v2 .cs-var: swatch, name, value, copy. Phones: the value goes
           under the name and the copy button keeps only its icon. -->
      <div
        v-for="variable in shown"
        :key="variable.name"
        :class="[
          ROW_CLASS,
          copiedName === variable.name && 'bg-(--dms-success-tint)',
        ]"
      >
        <span
          v-if="variable.category === 'radius'"
          class="border-muted size-[18px] border-[1.5px] border-r-0 border-b-0 max-sm:row-span-2"
          :style="swatchStyle(variable)"
        />
        <span
          v-else-if="variable.category !== 'other'"
          class="size-[18px] rounded-[5px] shadow-[inset_0_0_0_1px_var(--ui-border-accented)] max-sm:row-span-2"
          :style="swatchStyle(variable)"
        />
        <span v-else class="max-sm:row-span-2" />
        <code
          class="text-highlighted truncate font-mono text-xs font-[550]"
          :title="variable.name"
        >
          {{ variable.name }}
        </code>
        <span
          class="text-muted truncate font-mono text-xs font-medium max-sm:col-start-2 max-sm:row-start-2"
          :title="variable.value"
        >
          {{ variable.value }}
        </span>
        <UButton
          :icon="copiedName === variable.name ? 'i-ph-check' : 'i-ph-copy'"
          :label="
            copiedName === variable.name
              ? t('page.settings.appearance.css_vars.copied')
              : t('page.settings.appearance.css_vars.copy')
          "
          :color="copiedName === variable.name ? 'success' : 'neutral'"
          variant="ghost"
          size="xs"
          class="justify-self-end max-sm:row-span-2"
          :ui="{ label: 'max-sm:hidden' }"
          :aria-label="`${t('page.settings.appearance.css_vars.copy')} ${variable.name}`"
          @click="copyName(variable.name)"
        />
      </div>

      <p
        v-if="shown.length === 0"
        class="text-muted px-[18px] py-6 text-center text-[12.5px]"
      >
        {{ t("page.settings.appearance.css_vars.no_results") }}
      </p>
    </div>

    <!-- v2 .cs-foot: count and export. -->
    <div
      class="border-default text-muted flex items-center gap-2.5 border-t bg-(--dms-bg-muted) py-2.5 ps-[18px] pe-4 text-[12.5px]"
    >
      <span>
        {{
          t("page.settings.appearance.css_vars.showing", {
            shown: shown.length,
            total: inCategory.length,
          })
        }}
      </span>
      <UButton
        icon="i-ph-download-simple"
        :label="t('page.settings.appearance.css_vars.export')"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ms-auto"
        :disabled="isLoading || cssVariables.length === 0"
        @click="exportAsCss"
      />
    </div>
  </div>
</template>
