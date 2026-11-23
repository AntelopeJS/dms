<script setup lang="ts">
import type { MockupOutlineRow } from "../../utils/mockupOutline";

defineProps<{
  rows: readonly MockupOutlineRow[];
  selection: string | undefined;
}>();
const emit = defineEmits<{ select: [pointer: string] }>();

const INDENT_REM = 0.75;
const DEFAULT_ICON = "i-ph-square";

const { t } = useI18n();
</script>

<template>
  <p v-if="!rows.length" class="text-muted text-xs">
    {{ t("dms.mockup.layers_empty") }}
  </p>
  <ul v-else class="space-y-0.5" data-dms-mockup-layers>
    <li v-for="row in rows" :key="row.pointer">
      <button
        type="button"
        class="hover:bg-elevated flex w-full items-center gap-1.5 rounded-md py-1 pe-2 text-start text-sm"
        :class="
          row.pointer === selection
            ? 'bg-elevated text-highlighted'
            : 'text-default'
        "
        :style="{ paddingInlineStart: `${0.5 + row.depth * INDENT_REM}rem` }"
        :aria-current="row.pointer === selection || undefined"
        :data-dms-mockup-layer="row.pointer"
        @click="emit('select', row.pointer)"
      >
        <UIcon
          :name="row.icon ?? DEFAULT_ICON"
          class="text-muted size-3.5 shrink-0"
        />
        <span class="truncate">{{ row.label }}</span>
        <span
          v-if="row.heldBy"
          class="text-dimmed ms-auto flex shrink-0 items-center gap-1 text-[11px]"
          :title="t('dms.mockup.locked_by', { name: row.heldBy })"
          data-dms-mockup-layer-holder
        >
          <UIcon name="i-ph-lock-simple" class="size-3" />
          {{ row.heldBy }}
        </span>
      </button>
    </li>
  </ul>
</template>
