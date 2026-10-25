<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { agendaPaint } from "../../composables/agenda/agendaPaint";
import { matchesPending } from "../../composables/agenda/agendaShell";
import type { AgendaPendingItem } from "../../../types/full-agenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The things to plan (`unscheduled`): each item is dragged onto a day, a
 * slot or a resource (`ctx.drag.startPending`); the list itself is a drop
 * surface, an event dragged onto it goes back to the pending items
 * (`acceptDrop`, on by default).
 */
const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const settings = computed(() => ctx.options.value.raw.unscheduled ?? {});
const title = computed(() =>
  settings.value.title
    ? processText(settings.value.title)
    : t("dms.agenda.sidebar.unscheduled"),
);
const search = ref("");
const items = computed(() =>
  ctx.pending.value.filter((item) => matchesPending(item, search.value)),
);
const emptyLabel = computed(() => {
  if (search.value.trim()) return t("dms.agenda.sidebar.no_match");
  return settings.value.emptyLabel
    ? processText(settings.value.emptyLabel)
    : t("dms.agenda.sidebar.unscheduled_empty");
});
const canDrag = computed(() => ctx.options.value.editable);
const acceptsDrop = computed(
  () => canDrag.value && settings.value.acceptDrop !== false,
);
/** An event is dragged over the list: the drop unschedules it. */
const isDropTarget = computed(
  () => Boolean(ctx.drag.preview.value?.toPending) && acceptsDrop.value,
);

const listEl = ref<HTMLElement | null>(null);
let unregister: (() => void) | undefined;
onMounted(() => {
  if (!acceptsDrop.value || !listEl.value) return;
  unregister = ctx.drag.registerSurface({
    el: listEl.value,
    resolve: () => ({ day: ctx.anchor.value, pending: true }),
  });
});
onBeforeUnmount(() => unregister?.());

const calendarOf = (item: AgendaPendingItem) =>
  ctx.calendars.value.find((calendar) => calendar.id === item.calendarId);
const barStyle = (item: AgendaPendingItem) => ({
  backgroundColor: agendaPaint(item.color ?? calendarOf(item)?.color).bar,
});
const startDrag = (event: PointerEvent, item: AgendaPendingItem) => {
  if (!canDrag.value || event.button > 0) return;
  ctx.drag.startPending(event, item);
};
</script>

<template>
  <section
    ref="listEl"
    :aria-label="title"
    data-agenda-pending
    :data-drop-target="isDropTarget || undefined"
    :class="[
      'flex min-h-0 flex-col gap-2 rounded-lg transition-colors',
      isDropTarget && 'ring-primary ring-dashed bg-(--ui-primary)/8 ring-2',
    ]"
  >
    <div class="flex items-center gap-2">
      <h3
        class="text-muted flex-1 text-xs font-semibold tracking-wide uppercase"
      >
        {{ title }}
      </h3>
      <UBadge
        color="neutral"
        variant="soft"
        size="sm"
        :label="String(ctx.pending.value.length)"
      />
    </div>
    <UInput
      v-if="settings.search"
      v-model="search"
      icon="i-ph-magnifying-glass"
      size="sm"
      :placeholder="t('dms.agenda.sidebar.search_pending')"
      :aria-label="t('dms.agenda.sidebar.search_pending')"
    />
    <p
      v-if="isDropTarget"
      class="text-primary text-xs font-medium"
      role="status"
    >
      {{ t("dms.agenda.sidebar.drop_to_unschedule") }}
    </p>
    <ul v-if="items.length" class="flex flex-col gap-1.5">
      <li
        v-for="item in items"
        :key="item.id"
        :data-agenda-pending-item="item.id"
        :tabindex="canDrag ? 0 : undefined"
        :aria-roledescription="
          canDrag ? t('dms.agenda.sidebar.draggable') : undefined
        "
        :class="[
          'border-default bg-default relative flex touch-none items-start gap-2 overflow-hidden rounded-md border py-1.5 ps-3 pe-2 text-sm select-none',
          canDrag && 'hover:border-accented cursor-grab active:cursor-grabbing',
        ]"
        @pointerdown="startDrag($event, item)"
      >
        <span
          class="absolute inset-y-0 start-0 w-1"
          :style="barStyle(item)"
          aria-hidden="true"
        />
        <UIcon
          v-if="item.icon"
          :name="item.icon"
          class="text-muted mt-0.5 size-4 shrink-0"
        />
        <span class="min-w-0 flex-1">
          <span class="text-highlighted block truncate font-medium">
            {{ item.title }}
          </span>
          <span v-if="item.subtitle" class="text-muted block truncate text-xs">
            {{ item.subtitle }}
          </span>
        </span>
        <UBadge
          v-for="(badge, index) in item.badges ?? []"
          :key="index"
          :color="badge.tone ?? 'neutral'"
          :icon="badge.icon"
          variant="soft"
          size="sm"
          :label="processText(badge.label)"
        />
      </li>
    </ul>
    <p v-else class="text-dimmed py-3 text-center text-xs">{{ emptyLabel }}</p>
  </section>
</template>
