<script setup lang="ts">
import { gridColumnsTemplate } from "../grid/columns";
import {
  useCategoryNavCards,
  usePreviewEntryVeil,
} from "#dms-layout/app/build/composables/navigation/useCategoryNavCards";
import { computed } from "vue";
import DmsNavCard from "../card/NavCard.vue";
import DmsPermissionVeil from "../../build/components/permission/PermissionVeil.vue";
import DmsSectionHeader from "../section-header/SectionHeader.vue";
import DmsBlockStatus, {
  type BlockEmptyText,
} from "../../build/components/blocks/BlockStatus.vue";
import { useBlockItems } from "../../build/composables/blocks/useBlockItems";
import type { IconWellTone } from "../icon-well/IconWell.vue";
import type { Tone } from "../../types/tone";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `NavCardGrid` block (interface-dms `base/nav-card-grid`): a responsive grid
// of navigation cards (v2 settings overview, a module's home), static or from
// `fetchUrl` (`{ items }`) so each card can carry its target's live state.
interface NavCardGridItem {
  id?: string;
  title: string;
  description?: string;
  icon: string;
  iconTone?: IconWellTone;
  to: string;
  state?: string;
  stateTone?: Tone;
  tag?: string;
  readout?: string[];
}

interface NavCardGridBlockProps extends DefaultComponentProps {
  items?: NavCardGridItem[];
  /**
   * Full id of a category: a card per page of it the viewer can open, with
   * its navigation badge, in place of `items` and `fetchUrl`.
   */
  categoryId?: string;
  /** Columns on wide screens (1–4); fewer on narrow ones. */
  columns?: number;
  /** Section title above the grid. */
  title?: string;
  description?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** Shown when there is nothing to list. */
  empty?: BlockEmptyText;
  /**
   * Placeholder cards while `fetchUrl` loads: the length it usually answers.
   * Optional. Defaults to `columns` (one row), or 3.
   */
  skeletonCount?: number;
}

const props = withDefaults(defineProps<NavCardGridBlockProps>(), {
  items: () => [],
  categoryId: undefined,
  columns: 3,
  title: undefined,
  description: undefined,
  fetchUrl: undefined,
  fetchUrlMethod: undefined,
  empty: undefined,
  skeletonCount: undefined,
});

const MAX_COLUMNS = 4;
// Narrowest card before the grid drops a column, and the `gap-3` between
// cards the column width leaves room for.
const MIN_CARD_WIDTH = "16rem";
const CARD_GAP = "0.75rem";

const { processI18n } = useTranslation();

const { cards: categoryCards } = useCategoryNavCards(() => props.categoryId);
const veil = usePreviewEntryVeil();

const {
  items: blockItems,
  isPending,
  hasError,
  refresh,
} = useBlockItems<NavCardGridItem>({
  items: () => props.items,
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  routeParams: () => props.routeParams,
  watchActions: props.watchActions,
  componentId: props.componentId,
});

const columnCount = computed(() =>
  Math.min(MAX_COLUMNS, Math.max(1, Math.round(props.columns))),
);
const placeholders = computed(() => props.skeletonCount ?? columnCount.value);

// As many cards per row as the grid's own width holds, never more than
// `columns`: viewport breakpoints squeezed three cards into a column next to
// a navigation (the settings pages) and truncated their titles.
const gridStyle = computed(() => ({
  gridTemplateColumns: gridColumnsTemplate(
    columnCount.value,
    CARD_GAP,
    MIN_CARD_WIDTH,
  ),
}));

const items = computed<NavCardGridItem[]>(() =>
  props.categoryId ? categoryCards.value : blockItems.value,
);

const cards = computed(() =>
  items.value.map((item, index) => ({
    ...item,
    key: item.id ?? `${index}-${item.to}`,
    title: processI18n(item.title ?? ""),
    description: item.description ? processI18n(item.description) : undefined,
    state: item.state ? processI18n(item.state) : undefined,
    readout: item.readout?.map((line) => processI18n(line)),
  })),
);
// v2 .sx-grid: cards closing on a state line run a tighter rhythm, the whole
// grid at once so the rows stay aligned.
const hasStates = computed(() => cards.value.some((card) => !!card.state));
// A category the viewer opens no page of is left out, title included, as the
// navigation leaves out an empty group: the settings overview of a member
// without a role shows no Workspace section. `empty` shows a message instead.
const isLeftOut = computed(
  () => !!props.categoryId && !props.empty && cards.value.length === 0,
);
</script>

<template>
  <section v-if="!isLeftOut">
    <DmsSectionHeader
      v-if="props.title || props.description"
      class="mb-3"
      :title="props.title ? processI18n(props.title) : undefined"
      :description="
        props.description ? processI18n(props.description) : undefined
      "
    />
    <DmsBlockStatus v-if="hasError" state="error" @retry="refresh()" />
    <DmsBlockStatus
      v-else-if="!isPending && cards.length === 0"
      state="empty"
      :empty="props.empty"
    />
    <div
      v-else
      class="grid gap-3"
      :style="gridStyle"
      :aria-busy="isPending || undefined"
    >
      <template v-if="isPending">
        <!-- The loaded card's shape at its boxes: the head (36px), a two-line
             description (39px) and the live state line (17px) a fetched card
             closes on, in the tighter rhythm such cards run. -->
        <div
          v-for="index in placeholders"
          :key="index"
          class="dms-card flex flex-col gap-2.5 p-[18px]"
        >
          <div class="flex items-center gap-3">
            <USkeleton class="size-9 rounded-[10px]" />
            <USkeleton class="h-3.5 w-28" />
          </div>
          <div class="grid h-[39px] content-center gap-[7.5px]">
            <USkeleton class="h-3 w-4/5" />
            <USkeleton class="h-3 w-3/5" />
          </div>
          <USkeleton class="my-[2.5px] h-3 w-28" />
        </div>
      </template>
      <template v-else>
        <!-- A card leading to a page carries the role preview's veil, like
             the page's entry in the navigation. -->
        <DmsPermissionVeil
          v-for="card in cards"
          :key="card.key"
          :state="props.categoryId && card.id ? veil.state(card.id) : null"
          :label="card.id ? veil.label(card.id) : ''"
          :detail="card.id ? veil.detail(card.id) : undefined"
          :persistent="veil.isActive.value"
        >
          <DmsNavCard
            class="h-full"
            :to="card.to"
            :icon="card.icon"
            :icon-tone="card.iconTone"
            :title="card.title"
            :description="card.description"
            :state="card.state"
            :state-tone="card.stateTone"
            :tag="card.tag"
            :readout="card.readout"
            :class="hasStates && 'gap-2.5'"
          />
        </DmsPermissionVeil>
      </template>
    </div>
  </section>
</template>
