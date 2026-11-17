import { detach } from "../detach";

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

/** What the save bar of the agenda `ctx` shows and does in `staged` mode. */
function useAgendaShellSave(ctx: AgendaContext, props: FullAgendaOptions) {
  const { t } = useI18n();
  const { open: openModal } = useModal();

  /** Every change not written yet, conflicts and refusals included: the bar shows while there is one. */
  const stagedCount = computed(() => ctx.staged.value.length);
  /** The changes Save sends (a conflict waits for its own answer). */
  const sendableCount = computed(() => ctx.sendableCount.value);
  const conflictCount = computed(
    () =>
      ctx.stagedEdits.value.filter((edit) => edit.status === "conflict").length,
  );
  /** Nothing Save could send, conflicts left: the bar leads to them. */
  const onlyConflicts = computed(
    () => sendableCount.value === 0 && conflictCount.value > 0,
  );
  const isStaged = computed(() => props.saveMode === "staged");
  const saveLabel = computed(() => {
    if (onlyConflicts.value)
      return t(
        "dms.agenda.details.conflicts_to_resolve",
        { count: conflictCount.value },
        conflictCount.value,
      );
    return t(
      props.review
        ? "dms.agenda.save.review_label"
        : "dms.agenda.save.save_label",
      { count: sendableCount.value },
      sendableCount.value,
    );
  });

  /** Writes the staged changes, after the review list with `review`. */
  async function requestSave(): Promise<void> {
    if (ctx.saving.value) return;
    const reviews =
      (props.review && stagedCount.value > 0) || onlyConflicts.value;
    if (!reviews && sendableCount.value === 0) return;
    if (reviews) {
      const confirmed = await openModal<boolean>({
        title: t("dms.agenda.details.review_title"),
        description: t("dms.agenda.details.review_description"),
        icon: "i-ph-list-checks",
        component: AgendaReviewList,
        componentOptions: { context: ctx },
      }).result;
      if (!confirmed || sendableCount.value === 0) return;
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
    detach(requestSave());
  }

  return {
    isStaged,
    stagedCount,
    sendableCount,
    onlyConflicts,
    saveLabel,
    requestSave,
    onKeydown,
  };
}

/** The shell of the agenda `ctx`, built from the block's options. */
export function useAgendaShell(ctx: AgendaContext, props: FullAgendaOptions) {
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
      sidebarOpen:
        sidebar.value?.collapsible === false || ctx.sidebarOpen.value,
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

  const save = useAgendaShellSave(ctx, props);

  return {
    toolbar,
    sidebar,
    sections,
    legend,
    layout,
    overlayOpen,
    sidebarShown,
    toggleSidebar,
    ...save,
  };
}

export type AgendaShell = ReturnType<typeof useAgendaShell>;
