// What the details of a FullAgenda do: the occurrence or placement open,
// the switch between the read view and the form, saving the form as one
// change (asking which part of a recurring event it applies to), deleting
// with a confirmation, and the event actions an occurrence offers.

import { computed, ref } from "vue";
import AgendaRecurringPrompt from "../../components/agenda/AgendaRecurringPrompt.vue";
import { useConfirm } from "../../../composables/confirm/useConfirm";
import { useModal } from "../../../composables/containers/useModal";
import type {
  AgendaEventAction,
  AgendaEventPatch,
  AgendaRecurringScope,
} from "../../../types/full-agenda";
import type { AgendaContext, AgendaOccurrence } from "./agendaModel";
import {
  agendaActionRow,
  buildPatch,
  createChange,
  deleteChange,
  isOccurrenceEditable,
  meetsRowCondition,
  resolveFormFields,
  updateChange,
  validateForm,
  valuesFromOccurrence,
  valuesFromPlacement,
  type AgendaFormErrors,
  type AgendaFormValues,
} from "./agendaForm";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/** The scope a recurring edit applies to; `null` when the user backed out. */
export type AgendaScopeAnswer = AgendaRecurringScope | null;

/**
 * Asks whether an edit of a recurring occurrence changes it alone or its
 * series, in a small modal. Exported for the drag (`recurringEdit: "ask"`).
 */
export function useAgendaRecurringPrompt() {
  const { open } = useModal();
  const { t } = useI18n();

  async function ask(kind: "update" | "delete"): Promise<AgendaScopeAnswer> {
    const answer = await open<AgendaRecurringScope | undefined>({
      title: t("dms.agenda.details.recurring_title"),
      description: t(`dms.agenda.details.recurring_${kind}`),
      icon: "i-ph-repeat",
      component: AgendaRecurringPrompt,
      componentOptions: { kind },
    }).result;
    return answer ?? null;
  }

  return { ask };
}

/** What a form holds while it is open, and on what. */
interface AgendaDraft {
  key: string;
  values: AgendaFormValues;
}

// One open form per agenda. Kept beside the context, not in the form: the
// form mounts afresh when the details move between a panel and a drawer.
const drafts = new WeakMap<AgendaContext, AgendaDraft>();

/** Forgets the values typed in the agenda's form (closed, saved, cancelled). */
export function clearAgendaDraft(ctx: AgendaContext): void {
  drafts.delete(ctx);
}

/** The form's error that is no field's: the route refused the change. */
export const AGENDA_FORM_REFUSED = "_form";
const REFUSED_KEY = "$dms.agenda.details.status_error";

/** `apply` answers `false` when the change was refused or abandoned. */
const isRefused = (written: unknown) => written === false;

/** The details of the agenda `ctx`, as its details components use them. */
export function useAgendaDetails(ctx: AgendaContext) {
  const { t } = useI18n();
  const { processText } = useComposedText();
  const { confirm } = useConfirm();
  const recurring = useAgendaRecurringPrompt();

  const state = computed(() => ctx.details.value);
  const occurrence = computed(() => state.value?.occurrence ?? null);
  const isNew = computed(() => Boolean(state.value) && !occurrence.value);
  const timeZone = computed(() => ctx.options.value.timeZone);
  const fields = computed(() =>
    resolveFormFields({
      fields: ctx.options.value.fields,
      calendars: ctx.calendars.value,
      resources: ctx.resources.value,
      text: processText,
    }),
  );
  const canEdit = computed(() => {
    if (isNew.value) return ctx.options.value.canCreate;
    const open = occurrence.value;
    return open
      ? isOccurrenceEditable(open, ctx.options.value.editable)
      : false;
  });
  const canDelete = computed(
    () => canEdit.value && Boolean(occurrence.value?.canDelete),
  );
  const saving = ref(false);
  const errors = ref<AgendaFormErrors>({});
  const draftKey = computed(() => {
    const open = state.value;
    if (open?.occurrence) return open.occurrence.key;
    return `new@${open?.placement?.start ?? ""}`;
  });

  /** Keeps what the form holds, for a form mounted again on the same event. */
  function keepDraft(values: AgendaFormValues): void {
    drafts.set(ctx, { key: draftKey.value, values });
  }

  /** The values the form opens with: those typed before, else the event's or the placement's. */
  function initialValues(): AgendaFormValues {
    const draft = drafts.get(ctx);
    if (draft?.key === draftKey.value) return { ...draft.values };
    return freshValues();
  }

  function freshValues(): AgendaFormValues {
    const open = state.value;
    if (open?.occurrence)
      return valuesFromOccurrence(
        open.occurrence,
        fields.value,
        timeZone.value,
      );
    const create = ctx.options.value.raw.create;
    const calendarId =
      (typeof create === "object" ? create.calendarId : undefined) ??
      ctx.calendars.value.find(
        (calendar) => !ctx.hiddenCalendars.value.has(calendar.id),
      )?.id;
    if (!open?.placement) return {};
    return valuesFromPlacement(open.placement, fields.value, timeZone.value, {
      calendarId,
    });
  }

  function edit(): void {
    if (!state.value || !canEdit.value) return;
    errors.value = {};
    ctx.details.value = { ...state.value, mode: "edit" };
  }

  /** Leaves the form: back to the read view, or closed for a new event or a form opened directly. */
  function cancel(): void {
    errors.value = {};
    clearAgendaDraft(ctx);
    const open = state.value;
    if (!open?.occurrence || ctx.options.value.raw.details?.editDirectly) {
      ctx.closeDetails();
      return;
    }
    ctx.details.value = { ...open, mode: "view" };
  }

  /** The scope of a change of a recurring occurrence, as `recurringEdit` says. */
  async function scopeFor(
    target: AgendaOccurrence,
    kind: "update" | "delete",
  ): Promise<AgendaScopeAnswer | undefined> {
    if (!target.recurring) return undefined;
    const mode = ctx.options.value.raw.recurringEdit ?? "ask";
    if (mode !== "ask") return mode;
    return recurring.ask(kind);
  }

  /** Saves the form as one change; `false` when it was refused or abandoned. */
  async function save(values: AgendaFormValues): Promise<boolean> {
    errors.value = validateForm(fields.value, values, timeZone.value);
    if (Object.keys(errors.value).length > 0) return false;
    const patch = buildPatch(fields.value, values, timeZone.value);
    const target = occurrence.value;
    saving.value = true;
    try {
      const written = await place(patch, target);
      // Refused: the form stays open on what was typed, with the reason.
      if (isRefused(written)) {
        errors.value = { [AGENDA_FORM_REFUSED]: REFUSED_KEY };
        return false;
      }
      if (written === null) return false;
      clearAgendaDraft(ctx);
      ctx.closeDetails();
      return true;
    } finally {
      saving.value = false;
    }
  }

  /** Places the form's change; `null` when the scope prompt was abandoned. */
  async function place(
    patch: AgendaEventPatch,
    target: AgendaOccurrence | null,
  ): Promise<unknown> {
    if (!target) return ctx.apply(createChange(patch));
    const scope = await scopeFor(target, "update");
    if (scope === null) return null;
    const change = updateChange(target, patch, timeZone.value, scope);
    return change ? ctx.apply(change, target) : true;
  }

  function confirmDelete(target: AgendaOccurrence): Promise<boolean> {
    return confirm({
      title: t("dms.agenda.details.delete_title"),
      description: t("dms.agenda.details.delete_description", {
        title: target.event.title,
      }),
      color: "error",
      confirmLabel: t("dms.agenda.details.delete"),
      initialFocus: "cancel",
    });
  }

  /**
   * Deletes the open occurrence after a confirmation; on a recurring one
   * whose scope is asked, the scope prompt (with its Delete button) is it.
   */
  async function remove(): Promise<void> {
    const target = occurrence.value;
    if (!target || !canDelete.value) return;
    const asks =
      Boolean(target.recurring) &&
      (ctx.options.value.raw.recurringEdit ?? "ask") === "ask";
    const scope = await scopeFor(target, "delete");
    if (scope === null) return;
    if (!asks && !(await confirmDelete(target))) return;
    ctx.closeDetails();
    await ctx.apply(deleteChange(target, timeZone.value, scope), target);
  }

  /** The event actions offered on an occurrence (`visibleWhen` on its row). */
  function actionsOf(target: AgendaOccurrence): AgendaEventAction[] {
    const row = agendaActionRow(target, timeZone.value);
    return ctx.options.value.eventActions.filter((action) =>
      meetsRowCondition(action.visibleWhen, row),
    );
  }

  function runAction(action: AgendaEventAction, target: AgendaOccurrence) {
    ctx.runEventAction(action, target);
  }

  return {
    state,
    occurrence,
    isNew,
    fields,
    canEdit,
    canDelete,
    saving,
    errors,
    initialValues,
    keepDraft,
    timeZone,
    edit,
    cancel,
    save,
    remove,
    actionsOf,
    runAction,
    close: () => ctx.closeDetails(),
  };
}

export type AgendaDetailsApi = ReturnType<typeof useAgendaDetails>;
