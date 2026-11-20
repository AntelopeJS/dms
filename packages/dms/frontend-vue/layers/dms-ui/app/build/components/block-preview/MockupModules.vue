<script setup lang="ts">
import type { MockupModule } from "../../utils/mockup";

/**
 * The DMS modules the mockup's app needs, a strip under the top bar in every
 * view, the Overview included, so a reviewer sees them before any page.
 * Each shows its icon and its name, the package building installs on
 * hover. Nothing is drawn while the spec lists none.
 */
defineProps<{ modules: readonly MockupModule[] }>();

const { t, te } = useI18n();

/** The module's name from the store's catalog strings; its id when the dashboard has none. */
function nameOf(module: MockupModule): string {
  const key = `modules.store.catalog.${module.id}.title`;
  return te(key) ? t(key) : module.id;
}
</script>

<template>
  <div
    v-if="modules.length"
    class="border-default bg-default flex flex-wrap items-center gap-2 border-b px-3 py-1.5"
    role="group"
    :aria-label="t('dms.mockup.modules_hint')"
    data-dms-mockup-modules
  >
    <span
      class="text-dimmed text-xs font-semibold tracking-wide uppercase"
      data-dms-mockup-modules-title
    >
      {{ t("dms.mockup.modules") }}
    </span>
    <span
      v-for="module in modules"
      :key="module.id"
      class="bg-elevated text-default inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
      :title="module.package"
      :data-dms-mockup-module="module.id"
    >
      <UIcon :name="module.icon" class="size-3.5 shrink-0" />
      {{ nameOf(module) }}
    </span>
  </div>
</template>
