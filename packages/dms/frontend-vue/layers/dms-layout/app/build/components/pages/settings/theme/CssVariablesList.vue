<script setup lang="ts">
import { useClipboard } from "@vueuse/core";

const CSS_LOAD_DELAY_MS = 100;
const UI_VARIABLE_PREFIX = "--ui-";
const SKELETON_GROUP_COUNT = 3;
const SKELETON_ITEM_COUNT = 4;

interface CSSVariable {
  name: string;
  value: string;
}

const cssVariables = ref<CSSVariable[]>([]);
const isLoading = ref(true);

const processRules = (
  rules: CSSRuleList,
  rootStyles: CSSStyleDeclaration,
  variablesMap: Map<string, string>,
) => {
  Array.from(rules).forEach((rule) => {
    if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) {
      processRules(
        (rule as CSSGroupingRule).cssRules,
        rootStyles,
        variablesMap,
      );
    }

    if (rule instanceof CSSStyleRule) {
      Array.from(rule.style).forEach((property) => {
        if (property.startsWith(UI_VARIABLE_PREFIX)) {
          const value = rootStyles.getPropertyValue(property).trim();
          if (value) {
            variablesMap.set(property, value);
          }
        }
      });
    }
  });
};

const getCSSVariablesFromStyleSheets = (): CSSVariable[] => {
  const rootStyles = getComputedStyle(document.documentElement);
  const variablesMap = new Map<string, string>();

  try {
    Array.from(document.styleSheets).forEach((styleSheet) => {
      try {
        processRules(styleSheet.cssRules, rootStyles, variablesMap);
      } catch {
        /* ignore — cross-origin stylesheets throw on cssRules access */
      }
    });
  } catch {
    return [];
  }

  return Array.from(variablesMap, ([name, value]) => ({ name, value }));
};

const getCSSVariables = (): CSSVariable[] => {
  try {
    return getCSSVariablesFromStyleSheets().sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return [];
  }
};

const categoryMap = new Map([
  ["-color-", "Colors"],
  ["-text", "Text"],
  ["-bg", "Background"],
  ["-border", "Border"],
  ["-radius", "Radius"],
  ["-shadow", "Shadow"],
]);

const getVariableCategory = (varName: string) => {
  for (const [pattern, category] of categoryMap) {
    if (varName.includes(pattern)) return category;
  }
  return "Other";
};

const groupedVariables = computed(() => {
  const groups: Record<string, CSSVariable[]> = {};

  cssVariables.value.forEach((variable) => {
    const category = getVariableCategory(variable.name);
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(variable);
  });

  return groups;
});

const { copy } = useClipboard();

const refreshVariables = () => {
  isLoading.value = true;
  cssVariables.value = getCSSVariables();
  isLoading.value = false;
};

onMounted(() => {
  setTimeout(() => {
    refreshVariables();
  }, CSS_LOAD_DELAY_MS);
});
</script>

<template>
  <div class="space-y-6">
    <section class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h2 class="text-default text-base font-semibold sm:text-sm">
          {{ $t("page.settings.appearance.css_variables") }}
        </h2>
        <p class="text-dimmed text-base sm:text-sm">
          {{ $t("page.settings.appearance.css_variables_description") }}
        </p>
      </div>
    </section>

    <div v-if="isLoading" class="space-y-6">
      <section v-for="i in SKELETON_GROUP_COUNT" :key="i" class="space-y-3">
        <USkeleton class="h-5 w-24" />
        <div class="bg-default ring-default rounded-lg ring">
          <div
            v-for="j in SKELETON_ITEM_COUNT"
            :key="j"
            class="border-default flex items-center justify-between gap-4 p-3"
            :class="{ 'border-b': j < SKELETON_ITEM_COUNT }"
          >
            <div class="min-w-0 flex-1 space-y-2">
              <USkeleton class="h-4 w-48" />
              <USkeleton class="h-3 w-64" />
            </div>
            <USkeleton class="size-8 shrink-0 rounded" />
          </div>
        </div>
      </section>
    </div>

    <div v-else class="space-y-6">
      <section
        v-for="(variables, category) in groupedVariables"
        :key="category"
        class="space-y-3"
      >
        <h3 class="text-highlighted text-sm font-semibold">
          {{ category }}
        </h3>

        <div class="bg-default ring-default rounded-lg ring">
          <div
            v-for="(variable, index) in variables"
            :key="variable.name"
            class="border-default hover:bg-muted group flex items-center justify-between gap-4 p-3 transition-colors"
            :class="{ 'border-b': index < variables.length - 1 }"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center gap-2">
                <code
                  class="text-default font-mono text-xs font-medium break-all"
                >
                  {{ variable.name }}
                </code>
                <UButton
                  icon="i-lucide-copy"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  square
                  class="opacity-0 transition-opacity group-hover:opacity-100"
                  :title="`${$t('button.copy')} ${variable.name}`"
                  @click="copy(variable.name)"
                />
              </div>
              <div class="flex items-center gap-2">
                <code class="text-muted font-mono text-xs break-all">
                  {{ variable.value }}
                </code>
              </div>
            </div>

            <div
              v-if="
                variable.value.startsWith('oklch') ||
                variable.value.startsWith('rgb') ||
                variable.value.startsWith('#') ||
                variable.value.startsWith('hsl')
              "
              class="ring-default size-8 shrink-0 rounded ring"
              :style="{ backgroundColor: variable.value }"
              :title="variable.value"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
