import { computed, type Ref, type Slots } from "vue";
import { readableNumberFormat } from "#dms-core/app/utils/formatter";
import { normalizeActionConfig } from "#dms-core/app/utils/row-action-rule-evaluator";
import { formatArchivedCount } from "../../composables/table/utils/archivedCount";
import {
  FULL_TABLE_CHROME,
  type ResolvedTableChrome,
} from "../../composables/table-view/utils/chrome";
import { HEADER_PLACEMENT } from "./tableComponentTheme";
import type { Data, TableProps } from "./Table.types";

export function useTableComponentHeader<T extends Data>(
  props: TableProps<T>,
  slots: Slots,
  rowCount: Ref<number>,
  isShowingArchived: Ref<boolean>,
  intl: Pick<ReturnType<typeof useI18n>, "t" | "locale">,
) {
  const { t, locale } = intl;
  const formattedRowCount = computed(() =>
    readableNumberFormat(locale.value).format(rowCount.value),
  );

  const captionCountLabel = computed(() =>
    isShowingArchived.value
      ? formatArchivedCount(
          t,
          rowCount.value,
          formattedRowCount.value,
          props.archivedCountLabel,
        )
      : formattedRowCount.value,
  );

  const hasTabs = computed(() => (props.tabs?.length ?? 0) > 0);
  const hasViewsBand = computed(
    () => !!slots.views && props.viewsPlacement === "band",
  );
  const hasViewsInHeader = computed(
    () => !!slots.views && props.viewsPlacement === "header",
  );

  const resolvedChrome = computed<ResolvedTableChrome>(
    () => props.chrome ?? FULL_TABLE_CHROME,
  );

  const tabsInline = computed(
    () => hasTabs.value && !resolvedChrome.value.caption,
  );

  const toolbarButtons = computed(() =>
    (props.customButtons ?? []).filter(
      (button) => button.placement !== HEADER_PLACEMENT,
    ),
  );
  const canAddFromToolbar = computed(() => {
    const add = normalizeActionConfig(props.rowActions?.add);
    return !!add.isEnabled && add.placement !== HEADER_PLACEMENT;
  });

  const addLabel = computed(
    () => normalizeActionConfig(props.rowActions?.add).label,
  );
  const addIcon = computed(
    () => normalizeActionConfig(props.rowActions?.add).icon,
  );

  const hasBulkActions = computed(
    () =>
      normalizeActionConfig(props.rowActions?.delete).isEnabled ||
      normalizeActionConfig(props.rowActions?.archive).isEnabled ||
      normalizeActionConfig(props.rowActions?.restore).isEnabled ||
      !!props.canExport ||
      (props.bulkActions?.length ?? 0) > 0,
  );

  return {
    captionCountLabel,
    hasTabs,
    hasViewsBand,
    hasViewsInHeader,
    resolvedChrome,
    tabsInline,
    toolbarButtons,
    canAddFromToolbar,
    addLabel,
    addIcon,
    hasBulkActions,
  };
}
