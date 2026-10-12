<script setup lang="ts">
/**
 * The body of the side panel a `sidePanel` action target opens on a row (see
 * `rowSidePanel.ts`). The DMS draws the header: the title, the row's position
 * among the rows the table shows, previous and next (J and K too) and close
 * (Escape too). Below it, the module's component receives the row as a
 * drawer's component does, mounted anew on each row. The position follows the
 * table: a refresh that moves or drops the row updates it. A row the link
 * names but its route answered 404 for shows the "not found" state instead,
 * with a close button.
 */
import { computed, onBeforeUnmount, onMounted } from "vue";
import DmsEmptyState from "#dms-ui/app/components/empty-state/EmptyState.vue";
import {
  listenRowPanelClose,
  listenRowSteps,
  rowNavigation,
} from "#dms-ui/app/build/composables/actions/rowNavigation";
import {
  closeRowSidePanel,
  useRowSidePanelContent,
} from "../../composables/layout/rowSidePanel";

const DEFAULT_POSITION_KEY = "side_panel.position";

const { t } = useI18n();
const { processI18n } = useTranslation();
const content = useRowSidePanelContent();

const navigation = computed(() => {
  const current = content.value;
  if (!current?.row || !current.source) return undefined;
  return rowNavigation(current.source, current.row, current.showRow);
});

const position = computed(() => {
  if (!navigation.value) return undefined;
  const params = {
    index: navigation.value.index + 1,
    total: navigation.value.total,
  };
  const label = content.value?.positionLabel;
  return label ? processI18n(label, params) : t(DEFAULT_POSITION_KEY, params);
});

const componentProps = computed(() => ({
  ...content.value?.componentOptions,
  rowData: content.value?.row,
  navigation: navigation.value,
}));

const heading = computed(() => content.value?.rowTitle || content.value?.title);

const close = () => closeRowSidePanel();

const notFoundActions = computed(() => [
  {
    label: t("side_panel.close"),
    icon: "i-ph-x",
    color: "neutral" as const,
    variant: "outline" as const,
    onClick: close,
  },
]);

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
  close();
});
</script>

<template>
  <div v-if="content" data-dms-row-side-panel class="flex min-h-0 flex-col">
    <header
      class="border-default flex shrink-0 items-start gap-2 border-b py-3 ps-4 pe-3"
    >
      <div class="min-w-0 flex-1 self-center">
        <h2
          class="text-highlighted truncate text-[15px] leading-[1.3] font-[650] tracking-[-0.015em]"
        >
          {{ heading }}
        </h2>
        <p
          v-if="position"
          data-dms-row-side-panel-position
          class="text-muted mt-0.5 text-[12.5px] tabular-nums"
        >
          {{ position }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-0.5">
        <template v-if="navigation">
          <UButton
            data-dms-row-side-panel-prev
            icon="i-ph-caret-up"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="t('side_panel.previous')"
            :disabled="!navigation.hasPrev"
            @click="navigation.prev()"
          />
          <UButton
            data-dms-row-side-panel-next
            icon="i-ph-caret-down"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="t('side_panel.next')"
            :disabled="!navigation.hasNext"
            @click="navigation.next()"
          />
        </template>
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
      </div>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <DmsEmptyState
        v-if="content.notFound"
        data-dms-row-side-panel-not-found
        variant="no-result"
        :title="content.notFound.title"
        :description="content.notFound.description"
        :actions="notFoundActions"
        class="py-10"
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
