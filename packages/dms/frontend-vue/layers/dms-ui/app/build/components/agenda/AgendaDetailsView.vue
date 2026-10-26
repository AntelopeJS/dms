<script setup lang="ts">
import { computed } from "vue";
import DOMPurify from "isomorphic-dompurify";
import MatrixCellValue from "../matrix/MatrixCellValue.vue";
import type {
  AgendaContext,
  AgendaOccurrence,
} from "../../composables/agenda/agendaModel";
import type { AgendaDetailsApi } from "../../composables/agenda/useAgendaDetails";
import type { AgendaFormField } from "../../composables/agenda/agendaForm";
import { noticeTone } from "../../composables/agenda/agendaShell";
import { zonedDayKey } from "../../composables/agenda/agendaTime";
import type { AgendaEventAction } from "../../../types/full-agenda";
import type { MatrixCellKind, MatrixColumn } from "../../../types/matrix";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The read view of an event: when, its calendar, resources and place, its
 * description (HTML sanitized as a rich text display does), the custom
 * fields drawn as the Matrix draws their kind, its issues and badges, then
 * its actions, Edit and Delete.
 */
interface AgendaDetailsViewProps {
  ctx: AgendaContext;
  details: AgendaDetailsApi;
  occurrence: AgendaOccurrence;
}

const props = defineProps<AgendaDetailsViewProps>();
const { t } = useI18n();
const { processText } = useComposedText();

const HTML_PATTERN = /<[a-z][\s\S]*>/i;

const event = computed(() => props.occurrence.event);
const format = computed(() => props.ctx.format);
const when = computed(() => {
  const { startDay, endDay, allDay, start, end } = props.occurrence;
  const day = format.value.day;
  const sameDay = startDay === endDay;
  if (allDay)
    return sameDay
      ? day(startDay, "long")
      : `${day(startDay, "medium")} – ${day(endDay, "medium")}`;
  if (sameDay)
    return `${day(startDay, "long")} · ${format.value.timeRange(start, end)}`;
  return `${day(startDay, "medium")} ${format.value.time(start)} – ${day(endDay, "medium")} ${format.value.time(end)}`;
});
const calendar = computed(() => props.occurrence.calendar);
const resourceLabels = computed(() =>
  props.occurrence.resourceIds.map((id) => {
    const resource = props.ctx.resources.value.find((item) => item.id === id);
    return resource ? processText(resource.label) : id;
  }),
);
const description = computed(() => event.value.description ?? "");
const isHtml = computed(() => HTML_PATTERN.test(description.value));
const safeHtml = computed(() =>
  isHtml.value ? DOMPurify.sanitize(description.value) : "",
);
const customFields = computed(() =>
  props.details.fields.value.filter((field) => !field.builtIn),
);
/** A custom `datetime` value in the agenda's zone ("Mon 26 Oct · 09:30"). */
const dateTimeText = (value: unknown): string => {
  const epoch = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(epoch)) return value ? String(value) : "";
  const day = zonedDayKey(epoch, props.ctx.options.value.timeZone);
  return `${format.value.day(day, "medium")} · ${format.value.time(epoch)}`;
};
const columnOf = (field: AgendaFormField): MatrixColumn => ({
  id: field.id,
  label: field.label,
  // A time of day reads as written ("09:30").
  kind: (field.kind === "time" ? "text" : field.kind) as MatrixCellKind,
  options: field.options,
});
const row = computed(() => ({
  id: props.occurrence.key,
  values: event.value.data ?? {},
}));
const actions = computed(() => props.details.actionsOf(props.occurrence));
const actionColor = (action: AgendaEventAction) => action.tone ?? "neutral";
/** The change of this event the route answered a conflict for, if any. */
const conflict = computed(() => {
  if (props.occurrence.state !== "conflict") return null;
  const id = props.occurrence.recurring?.seriesId ?? props.occurrence.event.id;
  return (
    props.ctx.stagedEdits.value.find(
      (edit) =>
        edit.status === "conflict" &&
        (edit.change.id === id || edit.change.tempId === id),
    ) ?? null
  );
});
const conflictMessage = computed(
  () =>
    props.occurrence.stateMessage ||
    conflict.value?.message ||
    t("dms.agenda.details.status_conflict"),
);
/** Writes over the route's version, or takes it; the details close on the event as it now is. */
async function resolveConflict(choice: "overwrite" | "discard") {
  const edit = conflict.value;
  if (!edit) return;
  await props.ctx.resolveConflict(edit.key, choice);
  props.details.close();
}
const statusLabel = computed(() =>
  event.value.status && event.value.status !== "confirmed"
    ? t(`dms.agenda.details.status_${event.value.status}`)
    : "",
);
</script>

<template>
  <div class="flex flex-col gap-4" data-agenda-details-view>
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-if="calendar"
          class="text-default inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
          :style="{ backgroundColor: props.occurrence.paint.background }"
          data-agenda-details-calendar
        >
          <span
            class="size-2 rounded-full"
            :style="{ backgroundColor: props.occurrence.paint.bar }"
            aria-hidden="true"
          />
          {{ processText(calendar.label) }}
        </span>
        <UBadge
          v-if="statusLabel"
          color="neutral"
          variant="outline"
          size="sm"
          :label="statusLabel"
        />
        <UBadge
          v-if="props.occurrence.recurring"
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-ph-repeat"
          :label="t('dms.agenda.details.recurring')"
        />
        <UBadge
          v-for="(badge, index) in event.badges ?? []"
          :key="index"
          :color="badge.tone ?? 'neutral'"
          :icon="badge.icon"
          variant="soft"
          size="sm"
          :label="processText(badge.label)"
        />
      </div>
      <p v-if="event.subtitle" class="text-muted text-sm">
        {{ event.subtitle }}
      </p>
    </div>

    <dl class="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2.5 text-sm">
      <dt class="text-muted pt-0.5">
        <UIcon name="i-ph-clock" class="size-4" />
        <span class="sr-only">{{ t("dms.agenda.details.when") }}</span>
      </dt>
      <dd class="text-default" data-agenda-details-when>{{ when }}</dd>
      <template v-if="resourceLabels.length">
        <dt class="text-muted pt-0.5">
          <UIcon name="i-ph-users" class="size-4" />
          <span class="sr-only">{{ t("dms.agenda.form.resourceIds") }}</span>
        </dt>
        <dd class="text-default">{{ resourceLabels.join(", ") }}</dd>
      </template>
      <template v-if="event.location">
        <dt class="text-muted pt-0.5">
          <UIcon name="i-ph-map-pin" class="size-4" />
          <span class="sr-only">{{ t("dms.agenda.form.location") }}</span>
        </dt>
        <dd class="text-default">{{ event.location }}</dd>
      </template>
    </dl>

    <!-- Sanitized with DOMPurify, as the rich text display does. -->
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-if="isHtml"
      class="prose prose-neutral dark:prose-invert max-w-none text-sm"
      v-html="safeHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
    <p v-else-if="description" class="text-default text-sm whitespace-pre-line">
      {{ description }}
    </p>

    <dl v-if="customFields.length" class="flex flex-col gap-2.5 text-sm">
      <div
        v-for="field in customFields"
        :key="field.id"
        class="grid grid-cols-[minmax(7rem,auto)_1fr] gap-3"
        :data-agenda-details-field="field.id"
      >
        <dt class="text-muted">{{ processText(field.label) }}</dt>
        <dd class="min-w-0">
          <span v-if="field.kind === 'datetime'" class="text-default">
            {{ dateTimeText(row.values[field.id]) }}
          </span>
          <MatrixCellValue
            v-else
            :column="columnOf(field)"
            :value="row.values[field.id]"
            :row="row"
          />
        </dd>
      </div>
    </dl>

    <div
      v-if="conflict"
      class="flex flex-col gap-2 rounded-md bg-(--dms-error-tint) p-3 text-sm"
      role="alert"
      data-agenda-details-conflict
    >
      <p class="text-error flex items-start gap-2">
        <UIcon name="i-ph-warning" class="mt-0.5 size-4 shrink-0" />
        <span>{{ conflictMessage }}</span>
      </p>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('dms.agenda.details.take_theirs')"
          data-agenda-conflict-discard
          @click="resolveConflict('discard')"
        />
        <UButton
          size="xs"
          color="error"
          variant="outline"
          :label="t('dms.agenda.details.overwrite')"
          data-agenda-conflict-overwrite
          @click="resolveConflict('overwrite')"
        />
      </div>
    </div>

    <ul v-if="event.issues?.length" class="flex flex-col gap-1.5">
      <li
        v-for="(issue, index) in event.issues"
        :key="index"
        :class="[
          'flex items-start gap-2 text-sm',
          noticeTone(issue) === 'error' ? 'text-error' : 'text-warning',
        ]"
      >
        <UIcon name="i-ph-warning" class="mt-0.5 size-4 shrink-0" />
        <span>{{ processText(issue.message) }}</span>
      </li>
    </ul>

    <div
      v-if="
        actions.length ||
        props.details.canEdit.value ||
        props.details.canDelete.value
      "
      class="border-default flex flex-wrap items-center gap-2 border-t pt-3"
    >
      <UButton
        v-for="action in actions"
        :key="action.id"
        size="sm"
        variant="outline"
        :color="actionColor(action)"
        :icon="action.icon"
        :label="processText(action.label)"
        :data-agenda-event-action="action.id"
        @click="props.details.runAction(action, props.occurrence)"
      />
      <span class="flex-1" />
      <UButton
        v-if="props.details.canDelete.value"
        size="sm"
        color="error"
        variant="ghost"
        icon="i-ph-trash"
        :label="t('dms.agenda.details.delete')"
        @click="props.details.remove()"
      />
      <UButton
        v-if="props.details.canEdit.value"
        size="sm"
        icon="i-ph-pencil-simple"
        :label="t('dms.agenda.details.edit')"
        data-agenda-details-edit
        @click="props.details.edit()"
      />
    </div>
  </div>
</template>
