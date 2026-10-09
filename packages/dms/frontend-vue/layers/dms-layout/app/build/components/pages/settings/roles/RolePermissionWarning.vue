<script setup lang="ts">
interface RolePermissionWarningProps {
  /** i18n keys of the warnings (see the editor tree's `warning`). */
  warnings: string[];
  /**
   * A chip naming the warnings in its tooltip, for a closed row hiding the
   * permissions they come from; otherwise each warning in full.
   */
  compact?: boolean;
}

const props = withDefaults(defineProps<RolePermissionWarningProps>(), {
  compact: false,
});
const { t } = useI18n();
const { processI18n } = useTranslation();

const texts = computed(() =>
  props.warnings.map((warning) => processI18n(warning)),
);
</script>

<template>
  <!-- Amber, not red: these permissions are fine to grant, as long as the
       admin knows they amount to owner-level access. -->
  <span
    v-if="props.compact"
    class="bg-warning/10 text-warning inline-flex h-[18px] items-center gap-1 rounded px-1.5 font-mono text-[10.5px] font-medium whitespace-nowrap"
    :title="texts.join('\n')"
    data-permission-warning-below
  >
    <UIcon name="i-ph-warning" class="size-[11px]" />
    {{ t("page.settings.roles.editor.owner_level") }}
  </span>
  <span v-else class="mt-1 flex flex-col gap-1">
    <span
      v-for="text in texts"
      :key="text"
      class="text-warning flex items-start gap-1.5 text-xs"
      data-permission-warning
    >
      <UIcon name="i-ph-warning" class="mt-px size-3.5 shrink-0" />
      <span>{{ text }}</span>
    </span>
  </span>
</template>
