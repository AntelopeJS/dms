<script setup lang="ts">
import { computed, nextTick } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  attributeSelector,
  noticeItems,
  noticeTone,
} from "../../composables/agenda/agendaShell";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";
import type { AgendaNotice, AgendaTone } from "../../../types/full-agenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The problems of the agenda (`notices`, under-staffing on a Saturday) and
 * of its events (their `issues`), errors first. A click opens the event it
 * names, else moves the agenda to its day and brings its resource into view.
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

/** A notice with the occurrence it names, found once per change of the lists. */
interface NoticeLine {
  key: string;
  notice: AgendaNotice;
  eventTitle?: string;
  occurrence?: AgendaOccurrence;
  actionable: boolean;
}

const items = computed<NoticeLine[]>(() => {
  const byId = new Map<string, AgendaOccurrence>();
  for (const occurrence of ctx.occurrences.value) {
    byId.set(occurrence.key, occurrence);
    if (!byId.has(occurrence.event.id))
      byId.set(occurrence.event.id, occurrence);
  }
  return noticeItems(ctx.notices.value, ctx.occurrences.value).map((item) => {
    const occurrence = item.notice.eventId
      ? byId.get(item.notice.eventId)
      : undefined;
    return {
      ...item,
      occurrence,
      actionable: Boolean(occurrence || item.notice.date),
    };
  });
});

/** Scrolls the resource's column or row into view, once the view drew the day. */
async function showResource(resourceId: string): Promise<void> {
  await nextTick();
  const selector = attributeSelector("data-agenda-resource", resourceId);
  ctx.rootEl.value
    ?.querySelector<HTMLElement>(selector)
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

const pick = (line: NoticeLine) => {
  if (line.occurrence) {
    ctx.open(line.occurrence);
    return;
  }
  if (line.notice.date) ctx.goTo(line.notice.date);
  if (line.notice.resourceId) void showResource(line.notice.resourceId);
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
      <li v-for="line in items" :key="line.key">
        <component
          :is="line.actionable ? 'button' : 'div'"
          :type="line.actionable ? 'button' : undefined"
          :data-tone="noticeTone(line.notice)"
          :class="[
            'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start text-xs',
            TONE_CLASSES[noticeTone(line.notice)],
            line.actionable &&
              'focus-visible:ring-primary hover:brightness-95 focus-visible:ring-2 focus-visible:outline-none',
          ]"
          @click="line.actionable && pick(line)"
        >
          <UIcon
            :name="TONE_ICONS[noticeTone(line.notice)]"
            class="mt-px size-4 shrink-0"
          />
          <span class="text-default min-w-0 flex-1">
            <span v-if="line.eventTitle" class="font-medium">
              {{ line.eventTitle }} ·
            </span>
            {{ processText(line.notice.message) }}
          </span>
        </component>
      </li>
    </ul>
  </section>
</template>
