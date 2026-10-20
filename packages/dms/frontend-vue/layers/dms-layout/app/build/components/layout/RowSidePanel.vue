<script setup lang="ts">
/**
 * The body of the side panel a `sidePanel` action target opens on a row (see
 * `rowSidePanel.ts`). The DMS draws the header (`RowHeader`, shared with a
 * row drawer): the title, the row's position among the rows the table shows,
 * previous and next (J and K too) and close (Escape too). Below it, the
 * module's component receives the row as a drawer's component does, mounted
 * anew on each row. The position follows the table: a refresh or live rows
 * that move it update it, and a row past the rows loaded (a deep link) is
 * located in the table's whole result. A row the link names but its route answered 404
 * for shows the "not found" state instead, with a close button.
 */
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import DmsRowHeader from "#dms-ui/app/build/components/containers/row/RowHeader.vue";
import DmsRowNotFound from "#dms-ui/app/build/components/containers/row/RowNotFound.vue";
import {
  listenRowPanelClose,
  listenRowSteps,
  type RowNavigation,
  trackRowNavigation,
} from "#dms-ui/app/build/composables/actions/rowNavigation";
import {
  closeRowSidePanel,
  useRowSidePanelContent,
} from "../../composables/layout/rowSidePanel";

const { t } = useI18n();
const content = useRowSidePanelContent();

const navigation = shallowRef<RowNavigation>();
let stopNavigation: (() => void) | undefined;
watch(
  content,
  (current) => {
    stopNavigation?.();
    stopNavigation = undefined;
    navigation.value = undefined;
    if (!current?.row || !current.source) return;
    stopNavigation = trackRowNavigation(
      current.source,
      current.row,
      current.showRow,
      (next) => {
        navigation.value = next;
      },
    );
  },
  // At once: a second J right after the first steps from the row it opened.
  { immediate: true, flush: "sync" },
);

const componentProps = computed(() => ({
  ...content.value?.componentOptions,
  rowData: content.value?.row,
  navigation: navigation.value,
}));

const heading = computed(() => content.value?.rowTitle || content.value?.title);

const close = () => closeRowSidePanel();

let stopKeys: Array<() => void> = [];

onMounted(() => {
  stopKeys = [
    listenRowSteps(() => navigation.value),
    listenRowPanelClose(close),
  ];
});

// Another side panel took its place, or the user signed out: the row is no
// longer open.
onBeforeUnmount(() => {
  stopKeys.forEach((stop) => stop());
  stopNavigation?.();
  close();
});
</script>

<template>
  <div v-if="content" data-dms-row-side-panel class="flex min-h-0 flex-col">
    <header
      class="border-default flex shrink-0 items-start gap-2 border-b py-3 ps-4 pe-3"
    >
      <DmsRowHeader
        part="dms-row-side-panel"
        :heading="heading"
        :position-label="content.positionLabel"
        :navigation="navigation"
      >
        <UButton
          data-dms-row-side-panel-close
          icon="i-ph-x"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('side_panel.close')"
          @click="close"
        />
      </DmsRowHeader>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <DmsRowNotFound
        v-if="content.notFound"
        data-dms-row-side-panel-not-found
        :title="content.notFound.title"
        :description="content.notFound.description"
        @close="close"
      />
      <Suspense v-else>
        <component
          :is="content.component"
          :key="content.rowKey"
          v-bind="componentProps"
        />
      </Suspense>
    </div>
  </div>
</template>
