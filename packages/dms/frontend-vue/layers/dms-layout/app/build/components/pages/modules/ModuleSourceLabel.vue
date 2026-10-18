<script setup lang="ts">
import type { ModuleSourceKind } from "../../../../types/module-store";
import { MODULE_SOURCE_ICONS } from "../../../utils/module-store-catalog";

// Where a module's code comes from, as a tile's footer names it: an icon
// and a short name (npm, GitHub, GitLab, Git, Local).

interface ModuleSourceLabelProps {
  source: ModuleSourceKind;
}

const props = defineProps<ModuleSourceLabelProps>();
const { t } = useI18n();
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
    <UIcon
      :name="MODULE_SOURCE_ICONS[props.source]"
      class="size-3.5"
      :aria-hidden="true"
    />
    {{ t(`modules.source.${props.source}`) }}
  </span>
</template>
