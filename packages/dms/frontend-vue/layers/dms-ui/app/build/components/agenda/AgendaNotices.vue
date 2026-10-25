<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { noticeItems, noticeTone } from "../../composables/agenda/agendaShell";
import type { AgendaNotice, AgendaTone } from "../../../types/full-agenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The problems of the agenda (`notices`, under-staffing on a Saturday) and
 * of its events (their `issues`), errors first. A click opens the event it
 * names, else moves the agenda to its day.
 */
const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const TONE_ICONS: Record<AgendaTone, string> = {
  error: "i-ph-warning-octagon",
  warning: "i-ph-warning",
  info: "i-ph-info",
  primary: "i-ph-info",
  success: "i-ph-check-circle",
  neutral: "i-ph-dot-outline",
};

// Whole class names, so Tailwind sees them.
const TONE_CLASSES: Record<AgendaTone, string> = {
  error: "bg-(--dms-error-tint) text-error",
  warning: "bg-(--dms-warning-tint) text-warning",
  info: "bg-(--dms-info-tint) text-info",
  primary: "bg-(--dms-info-tint) text-primary",
  success: "bg-(--dms-success-tint) text-success",
  neutral: "bg-(--dms-neutral-tint) text-muted",
};

const items = computed(() =>
  noticeItems(ctx.notices.value, ctx.occurrences.value),
);

const occurrenceOf = (notice: AgendaNotice) =>
  notice.eventId
    ? ctx.occurrences.value.find(
        (occurrence) =>
          occurrence.key === notice.eventId ||
          occurrence.event.id === notice.eventId,
      )
    : undefined;
const isActionable = (notice: AgendaNotice) =>
  Boolean(occurrenceOf(notice) || notice.date);
const pick = (notice: AgendaNotice) => {
  const occurrence = occurrenceOf(notice);
  if (occurrence) {
    ctx.open(occurrence);
    return;
  }
  if (notice.date) ctx.goTo(notice.date);
};
</script>

<template>
  <section
    :aria-label="t('dms.agenda.sidebar.notices')"
    class="flex flex-col gap-2"
    data-agenda-notices
  >
    <h3 class="text-muted text-xs font-semibold tracking-wide uppercase">
      {{ t("dms.agenda.sidebar.notices") }}
    </h3>
    <ul class="flex flex-col gap-1.5">
      <li v-for="{ key, notice, eventTitle } in items" :key="key">
        <component
          :is="isActionable(notice) ? 'button' : 'div'"
          :type="isActionable(notice) ? 'button' : undefined"
          :data-tone="noticeTone(notice)"
          :class="[
            'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start text-xs',
            TONE_CLASSES[noticeTone(notice)],
            isActionable(notice) &&
              'focus-visible:ring-primary hover:brightness-95 focus-visible:ring-2 focus-visible:outline-none',
          ]"
          @click="isActionable(notice) && pick(notice)"
        >
          <UIcon
            :name="TONE_ICONS[noticeTone(notice)]"
            class="mt-px size-4 shrink-0"
          />
          <span class="text-default min-w-0 flex-1">
            <span v-if="eventTitle" class="font-medium">
              {{ eventTitle }} ·
            </span>
            {{ processText(notice.message) }}
          </span>
        </component>
      </li>
    </ul>
  </section>
</template>
