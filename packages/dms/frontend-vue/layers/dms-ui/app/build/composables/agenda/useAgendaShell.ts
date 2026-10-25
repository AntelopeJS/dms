// The state of the FullAgenda shell around the views: the toolbar, sidebar
// and legend it shows, how a container width lays them out, the sidebar
// sheet of a compact agenda, and the staged save (its review, Ctrl+S).

import { computed, ref, watch } from "vue";
import AgendaReviewList from "../../components/agenda/AgendaReviewList.vue";
import { useModal } from "../../../composables/containers/useModal";
import type { FullAgendaOptions } from "../../../types/full-agenda";
import type { AgendaContext } from "./agendaModel";
import {
  resolveLegend,
  resolveShellLayout,
  resolveSidebar,
  resolveToolbar,
  sidebarSections,
} from "./agendaShell";

const SAVE_KEY = "s";

/** The shell of the agenda `ctx`, built from the block's options. */
export function useAgendaShell(ctx: AgendaContext, props: FullAgendaOptions) {
  const { t } = useI18n();
  const { open: openModal } = useModal();

  const toolbar = computed(() => resolveToolbar(props.toolbar));
  const sidebar = computed(() => resolveSidebar(props));
  const sections = computed(() => {
    if (!sidebar.value) return [];
    return sidebarSections(sidebar.value, {
      calendars: ctx.calendars.value.length,
      pending: ctx.pending.value.length,
      notices:
        ctx.notices.value.length +
        ctx.occurrences.value.filter((item) => item.event.issues?.length)
          .length,
      hasUnscheduled: Boolean(props.unscheduled),
    });
  });
  const legend = computed(() =>
    resolveLegend(
      props.legend,
      ctx.calendars.value.length,
      sections.value.includes("calendars"),
    ),
  );

  // The sheet a compact agenda opens its sidebar in; the column's state is
  // the context's `sidebarOpen`.
  const overlayOpen = ref(false);
  watch(ctx.compact, (compact) => {
    if (!compact) overlayOpen.value = false;
  });

  const requestedDetails = computed(
    () => ctx.details.value?.container ?? props.details?.container ?? "drawer",
  );
  const layout = computed(() =>
    resolveShellLayout({
      width: ctx.width.value,
      compact: ctx.compact.value,
      sidebar: sidebar.value,
      sidebarOpen: ctx.sidebarOpen.value,
      overlayOpen: overlayOpen.value,
      details: requestedDetails.value,
      viewCount: ctx.views.value.length,
      viewSwitcher: Boolean(toolbar.value?.viewSwitcher),
    }),
  );
  const sidebarShown = computed(
    () =>
      layout.value.sidebar === "column" || layout.value.sidebar === "overlay",
  );

  function toggleSidebar(): void {
    if (ctx.compact.value) overlayOpen.value = !overlayOpen.value;
    else ctx.sidebarOpen.value = !ctx.sidebarOpen.value;
  }

  const stagedCount = computed(() => ctx.staged.value.length);
  const isStaged = computed(() => props.saveMode === "staged");
  const saveLabel = computed(() =>
    t(
      props.review
        ? "dms.agenda.details.review_changes"
        : "dms.agenda.details.save_changes",
      { count: stagedCount.value },
      stagedCount.value,
    ),
  );

  /** Writes the staged changes, after the review list with `review`. */
  async function requestSave(): Promise<void> {
    if (stagedCount.value === 0 || ctx.saving.value) return;
    if (props.review) {
      const confirmed = await openModal<boolean>({
        title: t("dms.agenda.details.review_title"),
        description: t("dms.agenda.details.review_description"),
        icon: "i-ph-list-checks",
        component: AgendaReviewList,
        componentOptions: { context: ctx },
      }).result;
      if (!confirmed) return;
    }
    await ctx.saveStaged();
  }

  /**
   * Ctrl+S (⌘S) inside the block with `review`: the review opens first. The
   * agenda's shortcuts save at once otherwise; they skip a key the block
   * already handled (`defaultPrevented`).
   */
  function onKeydown(event: KeyboardEvent): void {
    const isSave =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === SAVE_KEY;
    if (!isSave || !props.review || !isStaged.value) return;
    if (stagedCount.value === 0) return;
    event.preventDefault();
    void requestSave();
  }

  return {
    toolbar,
    sidebar,
    sections,
    legend,
    layout,
    overlayOpen,
    sidebarShown,
    toggleSidebar,
    isStaged,
    stagedCount,
    saveLabel,
    requestSave,
    onKeydown,
  };
}

export type AgendaShell = ReturnType<typeof useAgendaShell>;
