<script setup lang="ts">
import { computed, inject } from "vue";
import { DMS_CONTAINER_KEY } from "../../composables/containers/context";
import { isDayKey, zonedDayKey } from "../../composables/agenda/agendaTime";
import type {
  AgendaContext,
  AgendaStagedEdit,
} from "../../composables/agenda/agendaModel";
import type {
  AgendaChangeKind,
  AgendaEventPatch,
} from "../../../types/full-agenda";

/**
 * The staged changes before they are written (`review`): what each does,
 * to which event, its time before → after, and a refused or conflicting
 * one's message with Retry, or Overwrite / Take theirs. The body of a modal:
 * Save answers `true`, Back closes it.
 */
interface AgendaReviewListProps {
  context: AgendaContext;
  containerId?: string;
}

const props = defineProps<AgendaReviewListProps>();
const emit = defineEmits<{ success: [save: boolean] }>();
const container = inject(DMS_CONTAINER_KEY, undefined);
const { t } = useI18n();

const ctx = props.context;

const KIND_ICONS: Record<AgendaChangeKind, string> = {
  create: "i-ph-plus-circle",
  update: "i-ph-pencil-simple",
  move: "i-ph-arrows-out-cardinal",
  resize: "i-ph-arrows-out-line-vertical",
  delete: "i-ph-trash",
  schedule: "i-ph-calendar-plus",
  unschedule: "i-ph-tray-arrow-down",
};

const titleOf = ({ change, base }: AgendaStagedEdit): string => {
  const named = base?.title ?? change.patch?.title ?? change.previous?.title;
  if (named) return named;
  const pending = ctx.pending.value.find((item) => item.id === change.id);
  return pending?.title ?? change.id ?? change.tempId ?? "";
};

const dayAndTime = (value: string): string => {
  const { format, options } = ctx;
  if (isDayKey(value)) return format.day(value, "medium");
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) return value;
  const day = zonedDayKey(epoch, options.value.timeZone);
  return `${format.day(day, "medium")} ${format.time(epoch)}`;
};

/** When a patch puts the event, "" when it does not say. */
const momentOf = (patch: AgendaEventPatch | undefined): string => {
  if (!patch?.start) return "";
  const start = dayAndTime(patch.start);
  if (!patch.end || patch.end === patch.start) return start;
  return `${start} – ${dayAndTime(patch.end)}`;
};

/** The bounds a change touches, before and after; a bound it leaves is the event's own. */
interface ReviewMoments {
  before: string;
  after: string;
}

function momentsOf({ change, base }: AgendaStagedEdit): ReviewMoments {
  const patch = change.patch ?? {};
  const previous = change.previous ?? {};
  const touchesTime = "start" in patch || "end" in patch;
  if (change.kind === "delete")
    return {
      before: momentOf(touchesTime ? previous : (base ?? previous)),
      after: "",
    };
  if (!touchesTime) return { before: "", after: "" };
  const was = {
    start: previous.start ?? base?.start,
    end: previous.end ?? base?.end,
  };
  const now = {
    start: patch.start ?? was.start,
    end: patch.end === null ? undefined : (patch.end ?? was.end),
  };
  return {
    before: change.kind === "create" ? "" : momentOf(was as AgendaEventPatch),
    after: momentOf(now as AgendaEventPatch),
  };
}

/** A line of the review. */
interface ReviewLine {
  key: string;
  icon: string;
  kind: string;
  title: string;
  before: string;
  after: string;
  status: AgendaStagedEdit["status"];
  message?: string;
}

const lines = computed<ReviewLine[]>(() =>
  ctx.stagedEdits.value.map((edit) => ({
    key: edit.key,
    icon: KIND_ICONS[edit.change.kind],
    kind: t(`dms.agenda.details.change_${edit.change.kind}`),
    title: titleOf(edit),
    ...momentsOf(edit),
    status: edit.status,
    message: edit.message,
  })),
);
// A conflict waits for its own answer: Save sends the others.
const sendable = computed(() => ctx.sendableCount.value);
const saveLabel = computed(() =>
  t("dms.agenda.save.save_label", { count: sendable.value }, sendable.value),
);
</script>

<template>
  <div class="flex flex-col gap-4" data-agenda-review>
    <ul class="divide-default flex flex-col divide-y text-sm">
      <li
        v-for="line in lines"
        :key="line.key"
        class="flex items-start gap-3 py-2.5"
      >
        <UIcon :name="line.icon" class="text-muted mt-0.5 size-4 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-highlighted font-medium">
            {{ line.title }}
            <span class="text-muted font-normal">· {{ line.kind }}</span>
          </p>
          <p
            v-if="line.before || line.after"
            class="text-muted flex flex-wrap items-center gap-1.5 text-xs"
          >
            <span v-if="line.before" class="line-through">
              {{ line.before }}
            </span>
            <UIcon
              v-if="line.before && line.after"
              name="i-ph-arrow-right"
              class="size-3"
            />
            <span v-if="line.after" class="text-default">{{ line.after }}</span>
          </p>
          <p
            v-if="line.status === 'error' || line.status === 'conflict'"
            class="text-error mt-1 text-xs"
            role="alert"
          >
            {{ line.message || t(`dms.agenda.details.status_${line.status}`) }}
          </p>
        </div>
        <div
          v-if="line.status === 'error' || line.status === 'conflict'"
          class="flex shrink-0 flex-wrap justify-end gap-1"
        >
          <UButton
            v-if="line.status === 'error'"
            size="xs"
            color="neutral"
            variant="outline"
            :label="t('dms.agenda.details.retry')"
            @click="ctx.retry(line.key)"
          />
          <template v-else>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('dms.agenda.details.overwrite')"
              @click="ctx.resolveConflict(line.key, 'overwrite')"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :label="t('dms.agenda.details.take_theirs')"
              @click="ctx.resolveConflict(line.key, 'discard')"
            />
          </template>
        </div>
      </li>
    </ul>
    <div class="flex justify-end gap-2">
      <UButton
        color="neutral"
        variant="outline"
        :label="t('dms.agenda.details.back')"
        @click="container?.close()"
      />
      <UButton
        :label="saveLabel"
        :disabled="sendable === 0"
        data-agenda-review-save
        @click="emit('success', true)"
      />
    </div>
  </div>
</template>
