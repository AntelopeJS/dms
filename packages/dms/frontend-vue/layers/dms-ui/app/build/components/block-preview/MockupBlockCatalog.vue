<script setup lang="ts">
import { computed, ref } from "vue";
import {
  catalogSections,
  type MockupBlockType,
} from "../../utils/mockupCatalog";

/**
 * The registered blocks, by palette group, searchable. A block is dragged
 * onto the preview, or picked with a click or Enter.
 */
const props = defineProps<{
  blocks: readonly MockupBlockType[];
  /** Whether a block can be dragged onto the preview. */
  draggable?: boolean;
}>();
const emit = defineEmits<{
  pick: [type: string];
  dragStart: [type: string];
  dragEnd: [];
}>();

const DEFAULT_ICON = "i-ph-square";
const DRAG_DATA_TYPE = "text/plain";

const { t } = useI18n();
const query = ref("");
const sections = computed(() => catalogSections(props.blocks, query.value));

function onDragStart(event: DragEvent, type: string): void {
  event.dataTransfer?.setData(DRAG_DATA_TYPE, type);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
  emit("dragStart", type);
}
</script>

<template>
  <div class="space-y-3" data-dms-mockup-catalog>
    <UInput
      v-model="query"
      size="sm"
      icon="i-ph-magnifying-glass"
      class="w-full"
      :placeholder="t('dms.mockup.search_blocks')"
      :aria-label="t('dms.mockup.search_blocks')"
    />
    <p v-if="!sections.length" class="text-muted text-xs">
      {{ t("dms.mockup.catalog_empty") }}
    </p>
    <section v-for="section in sections" :key="section.group" class="space-y-1">
      <h3
        class="text-dimmed px-1 text-[11px] font-semibold tracking-wider uppercase"
      >
        {{ t(`dms.mockup.group_${section.group}`) }}
      </h3>
      <button
        v-for="block in section.blocks"
        :key="block.type"
        type="button"
        class="border-default bg-default hover:bg-elevated focus-visible:ring-primary text-default flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-start text-sm focus-visible:ring-2 focus-visible:outline-none"
        :draggable="draggable"
        :title="block.meta.description"
        :data-dms-mockup-block-type="block.type"
        @click="emit('pick', block.type)"
        @dragstart="onDragStart($event, block.type)"
        @dragend="emit('dragEnd')"
      >
        <UIcon
          :name="block.meta.icon ?? DEFAULT_ICON"
          class="text-muted size-4 shrink-0"
        />
        <span class="truncate">{{ block.meta.name }}</span>
      </button>
    </section>
  </div>
</template>
