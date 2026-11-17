import { optionObject } from "./agendaOptions";
import { isString } from "../../../../../dms-core/app/utils/type-check";

import { computed, ref, type ComputedRef, type Ref } from "vue";
import AgendaRecurringPrompt from "../../components/agenda/AgendaRecurringPrompt.vue";
import { useConfirm } from "../../../composables/confirm/useConfirm";
import { useModal } from "../../../composables/containers/useModal";
import type {
  AgendaEvent,
  AgendaEventAction,
  AgendaEventPatch,
  AgendaRecurringScope,
  AgendaDetailsTexts,
  AgendaRecurringTexts,
} from "../../../types/full-agenda";
import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import type {
  AgendaContext,
  AgendaDetailsState,
  AgendaOccurrence,
} from "./agendaModel";
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
  lengthOfForm,
  valuesAfterPick,
  valuesFromPlacement,
  formValue,
  type AgendaFormErrors,
  type AgendaFormField,
  type AgendaFormValue,
  type AgendaFormValues,
} from "./agendaForm";
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import { zonedDayKey } from "./agendaTime";
import { isPastDay, seriesChangeDay } from "./agendaApply";

/** The title of a new event's details: the agenda's own (`detailsTexts.newTitle`), else the block's. */
export function newEventTitle(
  texts: AgendaDetailsTexts | undefined,
  text: (value: BlockText) => string,
  fallback: string,
): string {
  return texts?.newTitle === undefined ? fallback : text(texts.newTitle);
}

/** The scope a recurring edit applies to; `null` when the user backed out. */
export type AgendaScopeAnswer = AgendaRecurringScope | null;

/**
 * Asks whether an edit of a recurring occurrence changes it alone or its
 * series, in a small modal. Exported for the drag (`recurringEdit: "ask"`).
 */
export function useAgendaRecurringPrompt() {
  const { open } = useModal();
  const { t } = useI18n();
  const { processText } = useComposedText();
  const word = (own: BlockText | undefined, fallback: string) =>
    own === undefined ? t(fallback) : processText(own);
  const dated = (
    own: BlockText | undefined,
    fallback: string,
    from?: string,
  ) =>
    from !== undefined && isString(own)
      ? processText({
          key: own,
          params: { from: { type: "date", value: from, format: "long" } },
        })
      : word(own, fallback);

  /**
   * Asks it, in the agenda's `texts` where it gives some; `from`, the day a change of the series would apply from,
   * is the `from` of the series hint, `null` when the series has no day left (its ended hint); `past`, the occurrence's
   * day is before it, gives the occurrence its past hint.
   */
  async function ask(
    kind: "update" | "delete",
    texts: AgendaRecurringTexts = {},
    from?: string | null,
    past = false,
  ): Promise<AgendaScopeAnswer> {
    const title = word(texts.title, "dms.agenda.details.recurring_title");
    const answer = await open<AgendaRecurringScope | undefined>({
      title,
      description: word(texts[kind], `dms.agenda.details.recurring_${kind}`),
      icon: "i-ph-repeat",
      component: AgendaRecurringPrompt,
      componentOptions: {
        kind,
        title,
        occurrenceLabel: word(
          texts.occurrence,
          "dms.agenda.details.scope_occurrence",
        ),
        occurrenceHint: word(
          past
            ? (texts.occurrencePastHint ?? texts.occurrenceHint)
            : texts.occurrenceHint,
          "dms.agenda.details.scope_occurrence_hint",
        ),
        seriesLabel: word(texts.series, "dms.agenda.details.scope_series"),
        seriesHint:
          from === null && texts.seriesEndedHint !== undefined
            ? word(
                texts.seriesEndedHint,
                "dms.agenda.details.scope_series_hint",
              )
            : dated(
                texts.seriesHint,
                "dms.agenda.details.scope_series_hint",
                from ?? undefined,
              ),
      },
    }).result;
    return answer ?? null;
  }

  return { ask };
}

/**
 * What the user typed in the open form, and on what: only the fields they
 * touched (laid over fresh values, so a move made meanwhile is kept), and
 * the refusal shown under it.
 */
interface AgendaDraft {
  key: string;
  touched: AgendaFormValues;
  refusal?: AgendaFormRefusal;
  /**
   * A new event's values as the form first showed them: its defaults (the
   * first shown calendar) must not follow the legend once the form is open.
   * An existing event's are read fresh (a move made meanwhile is kept).
   */
  base?: AgendaFormValues;
  /** The length the form last showed, in ms, for a start typed after one that did not read. */
  length?: number;
}

/**
 * One open form per agenda. Kept beside the context, not in the form: the
 * form mounts afresh when the details move between a popover and a drawer.
 */
const drafts = new WeakMap<AgendaContext, AgendaDraft>();

/** The key of the form the details show, `null` outside a form. */
function editKeyOf(state: AgendaDetailsState | null): string | null {
  if (!state || state.mode !== "edit") return null;
  if (state.occurrence) return state.occurrence.key;
  return `new@${state.placement?.start ?? ""}`;
}

/** Forgets the values typed in the agenda's form (closed, saved, cancelled). */
export function clearAgendaDraft(ctx: AgendaContext): void {
  drafts.delete(ctx);
}

/**
 * Forgets the draft once the details leave its form: another event, the
 * read view, closed. A popover turned drawer keeps it (same event, same mode).
 */
export function syncAgendaDraft(
  ctx: AgendaContext,
  state: AgendaDetailsState | null,
): void {
  const draft = drafts.get(ctx);
  if (draft && draft.key !== editKeyOf(state)) drafts.delete(ctx);
}

/** The form's error that is no field's: the route refused the change. */
export const AGENDA_FORM_REFUSED = "_form";
const REFUSED_KEY = "$dms.agenda.details.status_error";

/** `apply` answers `false` when the change was refused or abandoned. */
const isRefused = (written: boolean | null) => written === false;

/** The route's refusal as the form keeps it: its message, and the field it is about. */
interface AgendaFormRefusal {
  message: string;
  field?: string;
}

/**
 * The form's errors holding only a refusal, if any: under the field it names
 * when the form shows that field, else at the foot of the form.
 */
function refusalErrors(
  refusal: AgendaFormRefusal | undefined,
  fields: readonly AgendaFormField[],
): AgendaFormErrors {
  if (!refusal?.message) return {};
  const onField = fields.some((field) => field.id === refusal.field);
  return {
    [onField && refusal.field ? refusal.field : AGENDA_FORM_REFUSED]:
      refusal.message,
  };
}

/**
 * The question before a delete: the event's own (`deleteQuestion`), else the agenda's title and description where
 * `detailsTexts` gives them (a string description is a key that may name the event's `{title}`), else the block's.
 */
export function useDeleteQuestion() {
  const { t } = useI18n();
  const { processText } = useComposedText();
  return (
    texts: AgendaDetailsTexts | undefined,
    event: Pick<AgendaEvent, "title" | "deleteQuestion">,
  ) => {
    const own = event.deleteQuestion;
    if (own !== undefined)
      return {
        title: processText(own.title),
        description: processText(own.description),
      };
    return {
      title:
        texts?.deleteTitle === undefined
          ? t("dms.agenda.details.delete_title")
          : processText(texts.deleteTitle),
      description:
        texts?.deleteDescription === undefined
          ? t("dms.agenda.details.delete_description", { title: event.title })
          : processText(
              isString(texts.deleteDescription)
                ? {
                    key: texts.deleteDescription,
                    params: { title: event.title ?? "" },
                  }
                : texts.deleteDescription,
            ),
    };
  };
}

/** What the form of the details reads to keep its draft. */
interface AgendaDraftSetup {
  state: ComputedRef<AgendaDetailsState | null>;
  isNew: ComputedRef<boolean>;
  fields: ComputedRef<AgendaFormField[]>;
  timeZone: ComputedRef<string>;
}

/**
 * The draft of the form of the agenda `ctx`: the fields the user touched,
 * kept for a form mounted again on the same event, the length a new event
 * keeps, and the refusal the route gave.
 */
function useDetailsDraft(ctx: AgendaContext, setup: AgendaDraftSetup) {
  const { state, isNew, fields, timeZone } = setup;
  const draftKey = computed(() => editKeyOf(state.value));
  const ownDraft = () => {
    const draft = drafts.get(ctx);
    return draft && draft.key === draftKey.value ? draft : undefined;
  };
  const errors = ref<AgendaFormErrors>(
    refusalErrors(ownDraft()?.refusal, fields.value),
  );

  /** Keeps a field the user changed, for a form mounted again on the same event. */
  function touch(fieldId: string, value: AgendaFormValue): void {
    const key = draftKey.value;
    if (!key) return;
    const draft = ownDraft();
    drafts.set(ctx, {
      ...draft,
      key,
      touched: { ...draft?.touched, [fieldId]: value },
    });
  }

  function rememberLength(length: number | undefined): void {
    const draft = ownDraft();
    if (draft && length !== undefined) drafts.set(ctx, { ...draft, length });
  }

  /**
   * Sets a field of the form and gives the values it then holds: a choice
   * that presets a length also moves a new event's end, which is kept as
   * touched like the field.
   */
  function pick(
    fieldId: string,
    value: AgendaFormValue,
    values: AgendaFormValues,
  ): AgendaFormValues {
    const field = fields.value.find((entry) => entry.id === fieldId);
    const length = lengthOfForm(values, timeZone.value) ?? ownDraft()?.length;
    const next = field
      ? valuesAfterPick(field, value, values, {
          isNew: isNew.value,
          timeZone: timeZone.value,
          length,
        })
      : { ...values, [fieldId]: value };
    for (const [id, changed] of Object.entries(next))
      if (id === fieldId || changed !== formValue(values, id))
        touch(id, changed);
    rememberLength(lengthOfForm(next, timeZone.value) ?? length);
    return next;
  }

  /** What the touched fields are laid over: a new event's first values, an existing one's current ones. */
  function baseValues(): AgendaFormValues {
    return ownDraft()?.base ?? freshValues();
  }

  /** The values the form opens with: the event's or the placement's, the touched fields over them. */
  function initialValues(): AgendaFormValues {
    const key = draftKey.value;
    if (key && isNew.value && !ownDraft())
      drafts.set(ctx, { key, touched: {}, base: freshValues() });
    return { ...baseValues(), ...ownDraft()?.touched };
  }

  /** What a save sends: fresh values, only the fields the user touched taken from the form. */
  function valuesToSave(values: AgendaFormValues): AgendaFormValues {
    const touched = ownDraft()?.touched ?? {};
    const picked = Object.fromEntries(
      Object.keys(touched).map((id) => [id, values[id] ?? touched[id]]),
    );
    return { ...baseValues(), ...picked };
  }

  function rememberRefusal(refusal: AgendaFormRefusal): void {
    errors.value = refusalErrors(refusal, fields.value);
    const key = draftKey.value;
    if (key)
      drafts.set(ctx, {
        ...ownDraft(),
        key,
        touched: ownDraft()?.touched ?? {},
        refusal,
      });
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
      open?.calendarId ??
      optionObject(create)?.calendarId ??
      ctx.calendars.value.find(
        (calendar) => !ctx.hiddenCalendars.value.has(calendar.id),
      )?.id;
    if (!open?.placement) return {};
    return valuesFromPlacement(open.placement, fields.value, timeZone.value, {
      calendarId,
      title: open.title,
      data: open.data,
    });
  }

  return { errors, touch, pick, initialValues, valuesToSave, rememberRefusal };
}

/** What a save of the details form reads and keeps. */
interface AgendaDetailsSaveSetup {
  occurrence: ComputedRef<AgendaOccurrence | null>;
  fields: ComputedRef<AgendaFormField[]>;
  timeZone: ComputedRef<string>;
  saving: Ref<boolean>;
  draft: ReturnType<typeof useDetailsDraft>;
}

/** How the details form of the agenda `ctx` saves, asking first which part of a recurring event it changes. */
function useDetailsSave(ctx: AgendaContext, setup: AgendaDetailsSaveSetup) {
  const { occurrence, fields, timeZone, saving } = setup;
  const { errors, valuesToSave, rememberRefusal } = setup.draft;
  const recurring = useAgendaRecurringPrompt();

  /** The scope of a change of a recurring occurrence, as `recurringEdit` says. */
  async function scopeFor(
    target: AgendaOccurrence,
    kind: "update" | "delete",
  ): Promise<AgendaScopeAnswer | undefined> {
    if (!target.recurring) return undefined;
    const mode = ctx.options.value.raw.recurringEdit ?? "ask";
    if (mode !== "ask") return mode;
    return recurring.ask(
      kind,
      ctx.options.value.raw.recurringTexts,
      seriesChangeDay(target.event, target.startDay),
      isPastDay(target.event, target.startDay),
    );
  }

  /** Saves the form as one change; `false` when it was refused or abandoned. */
  async function save(values: AgendaFormValues): Promise<boolean> {
    const saved = valuesToSave(values);
    errors.value = validateForm(fields.value, saved, timeZone.value);
    if (Object.keys(errors.value).length > 0) return false;
    const patch = buildPatch(fields.value, saved, timeZone.value);
    const target = occurrence.value;
    const refusalBefore = ctx.lastRefusal?.value;
    saving.value = true;
    try {
      const written = await place(patch, target);
      if (isRefused(written)) {
        const refusal = ctx.lastRefusal?.value;
        rememberRefusal(
          refusal && refusal !== refusalBefore
            ? { message: refusal.message, field: refusal.field }
            : { message: REFUSED_KEY },
        );
        return false;
      }
      if (written === null) return false;
      clearAgendaDraft(ctx);
      ctx.closeDetails();
      showSavedDay(patch);
      return true;
    } finally {
      saving.value = false;
    }
  }

  /**
   * After a save, the day of the event when the range does not show it, so the event just made stays in sight.
   * An event saved on no resource of an agenda that has some is left where it is (a waiting request).
   */
  function showSavedDay(patch: AgendaEventPatch): void {
    if (patch.start === undefined) return;
    if (patch.resourceIds?.length === 0 && ctx.resources.value.length > 0)
      return;
    const day = zonedDayKey(Date.parse(patch.start), timeZone.value);
    const { from, to } = ctx.range.value;
    if (day < from || day > to) ctx.goTo(day);
  }

  /** Places the form's change; `null` when the scope prompt was abandoned. */
  async function place(
    patch: AgendaEventPatch,
    target: AgendaOccurrence | null,
  ): Promise<boolean | null> {
    if (!target) return ctx.apply(createChange(patch));
    const scope = await scopeFor(target, "update");
    if (scope === null) return null;
    const change = updateChange(target, patch, timeZone.value, scope);
    return change ? ctx.apply(change, target) : true;
  }

  return { scopeFor, save };
}

/** The details of the agenda `ctx`, as its details components use them. */
export function useAgendaDetails(ctx: AgendaContext) {
  const { t } = useI18n();
  const { processText } = useComposedText();
  const { confirm } = useConfirm();
  const deleteQuestion = useDeleteQuestion();

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
      fieldOptions: ctx.fieldOptions.value,
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
  const draft = useDetailsDraft(ctx, { state, isNew, fields, timeZone });
  const { errors, touch, pick, initialValues } = draft;

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

  const { scopeFor, save } = useDetailsSave(ctx, {
    occurrence,
    fields,
    timeZone,
    saving,
    draft,
  });

  function confirmDelete(target: AgendaOccurrence): Promise<boolean> {
    return confirm({
      ...deleteQuestion(ctx.options.value.raw.detailsTexts, target.event),
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
    touch,
    pick,
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
