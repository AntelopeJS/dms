<script setup lang="ts">
import { ref } from "vue";
import type { MockupBlockType } from "../../utils/mockupCatalog";
import type { MockupEdit } from "../../utils/mockupEdit";
import type { MockupOutlineRow } from "../../utils/mockupOutline";
import type { MockupSpecPage } from "../../utils/mockupSpec";
import MockupBlockCatalog from "./MockupBlockCatalog.vue";
import MockupLayers from "./MockupLayers.vue";
import MockupPagesList from "./MockupPagesList.vue";

type PanelTab = "add" | "layers" | "pages";

/** Edit mode's left panel: the block catalog, the page's layers, the pages. */
defineProps<{
  blocks: readonly MockupBlockType[];
  hasCatalogFailed: boolean;
  rows: readonly MockupOutlineRow[];
  selection: string | undefined;
  pages: readonly MockupSpecPage[];
  currentPage: string | undefined;
}>();
const emit = defineEmits<{
  add: [type: string];
  dragStart: [type: string];
  dragEnd: [];
  select: [pointer: string];
  open: [page: string];
  edit: [edit: MockupEdit];
}>();

const TABS: readonly PanelTab[] = ["add", "layers", "pages"];

const { t } = useI18n();
const tab = ref<PanelTab>("add");
</script>

<template>
  <aside
    class="border-default bg-default flex min-h-0 flex-col border-e"
    :aria-label="t('dms.mockup.edit_panel')"
    data-dms-mockup-edit-panel
  >
    <div class="border-default flex border-b" role="tablist">
      <button
        v-for="entry in TABS"
        :key="entry"
        type="button"
        role="tab"
        class="focus-visible:ring-primary -mb-px flex-1 border-b-2 px-2 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        :class="
          entry === tab
            ? 'border-primary text-highlighted'
            : 'text-muted hover:text-default border-transparent'
        "
        :aria-selected="entry === tab"
        :data-dms-mockup-panel-tab="entry"
        @click="tab = entry"
      >
        {{ t(`dms.mockup.tab_${entry}`) }}
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <template v-if="tab === 'add'">
        <p v-if="hasCatalogFailed" class="text-error text-xs">
          {{ t("dms.mockup.catalog_failed") }}
        </p>
        <p class="text-dimmed mb-3 text-xs">{{ t("dms.mockup.add_hint") }}</p>
        <MockupBlockCatalog
          :blocks="blocks"
          draggable
          @pick="emit('add', $event)"
          @drag-start="emit('dragStart', $event)"
          @drag-end="emit('dragEnd')"
        />
      </template>
      <MockupLayers
        v-else-if="tab === 'layers'"
        :rows="rows"
        :selection="selection"
        @select="emit('select', $event)"
      />
      <MockupPagesList
        v-else
        :pages="pages"
        :current="currentPage"
        @open="emit('open', $event)"
        @edit="emit('edit', $event)"
      />
    </div>
  </aside>
</template>
