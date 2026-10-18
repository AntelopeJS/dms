<script setup lang="ts">
import type { ModuleSourceKind } from "../../../../types/module-store";
import { MODULE_SOURCE_ICONS } from "../../../utils/module-store-catalog";

// Where a module's code comes from, as a tile's footer names it: an icon
// and a short name (npm, GitHub, GitLab, Git, Local). Icon only, the name
// moves to a tooltip and the screen reader.

interface ModuleSourceLabelProps {
  source: ModuleSourceKind;
  isIconOnly?: boolean;
}

const props = withDefaults(defineProps<ModuleSourceLabelProps>(), {
  isIconOnly: false,
});
const { t } = useI18n();

const TOOLTIP_CONTENT = { side: "top", sideOffset: 6 } as const;

const name = computed(() => t(`modules.source.${props.source}`));
</script>

<template>
  <UTooltip
    :text="name"
    :disabled="!props.isIconOnly"
    :content="TOOLTIP_CONTENT"
  >
    <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      <UIcon
        :name="MODULE_SOURCE_ICONS[props.source]"
        class="size-3.5"
        :aria-hidden="true"
      />
      <span :class="{ 'sr-only': props.isIconOnly }">{{ name }}</span>
    </span>
  </UTooltip>
</template>
