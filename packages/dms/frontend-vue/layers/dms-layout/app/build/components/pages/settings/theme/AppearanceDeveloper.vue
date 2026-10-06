<script setup lang="ts">
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import CssVariablesList from "./CssVariablesList.vue";

// Number of `--ui-*` variables, shown in the summary.
const cssVariableCount = ref<number | null>(null);

const { t } = useI18n();
</script>

<template>
  <!-- Collapsed by default: only module authors need the tokens. -->
  <details class="group">
    <summary
      class="hover:bg-elevated/60 flex cursor-pointer list-none items-center gap-3 px-[18px] py-3.5"
    >
      <DmsIconWell icon="i-ph-brackets-curly" tone="muted" size="md" />
      <span class="min-w-0 flex-1">
        <span class="text-highlighted block text-[13px] font-semibold">
          {{ t("page.settings.appearance.css_variables") }}
        </span>
        <span class="text-muted block text-[12.5px]">
          {{ t("page.settings.appearance.css_variables_description") }}
          ·
          <!-- The variables are read after mount: a placeholder holds
               the count's place until then. -->
          <USkeleton
            v-if="cssVariableCount === null"
            aria-hidden="true"
            class="inline-block h-2.5 w-20 align-middle"
          />
          <span v-else class="font-mono tabular-nums">
            {{
              t("page.settings.appearance.css_vars.count", {
                count: cssVariableCount,
              })
            }}
          </span>
        </span>
      </span>
      <UIcon
        name="i-ph-caret-down"
        class="text-dimmed size-4 transition-transform group-open:rotate-180"
      />
    </summary>
    <div class="border-default border-t">
      <CssVariablesList @loaded="cssVariableCount = $event" />
    </div>
  </details>
</template>
