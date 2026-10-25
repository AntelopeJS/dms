<script setup lang="ts">
import { computed } from "vue";
import type {
  AgendaResource,
  AgendaResourceGroup,
} from "../../../types/full-agenda";
import { agendaColorCss } from "../../composables/agenda/agendaPaint";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The name cell of a timeline row: a resource (avatar or initials, label,
 * dimmed description, read-only lock), or a resource group as a folding
 * header with its count. Sticky on the left of the timeline.
 */
const props = defineProps<{
  resource?: AgendaResource | null;
  group?: AgendaResourceGroup;
  count?: number;
  folded?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();
const { processText } = useComposedText();

const INITIALS_LENGTH = 2;

const label = computed(() => {
  if (props.group) return processText(props.group.label);
  if (props.resource) return processText(props.resource.label);
  return t("dms.agenda.timeline.unassigned");
});

const description = computed(() => {
  const text = props.group?.description ?? props.resource?.description;
  return text ? processText(text) : "";
});

const initials = computed(() => {
  const avatar = props.resource?.avatar;
  if (avatar?.initials) return avatar.initials;
  return label.value
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, INITIALS_LENGTH)
    .toUpperCase();
});

const avatarColor = computed(() =>
  agendaColorCss(
    props.resource?.avatar?.color ?? props.resource?.color ?? "neutral",
  ),
);

const avatarStyle = computed(() => ({
  backgroundColor: `color-mix(in oklab, ${avatarColor.value} 18%, var(--ui-bg))`,
  color: `color-mix(in oklab, ${avatarColor.value} 75%, var(--ui-text-highlighted))`,
}));

const groupLabel = computed(() =>
  t(
    props.folded
      ? "dms.agenda.timeline.expand_group"
      : "dms.agenda.timeline.collapse_group",
    { name: label.value },
  ),
);
</script>

<template>
  <button
    v-if="group"
    type="button"
    class="text-highlighted hover:bg-elevated focus-visible:outline-primary flex h-full w-full min-w-0 items-center gap-1.5 px-2 text-start text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
    :aria-expanded="!folded"
    :aria-label="groupLabel"
    @click="emit('toggle')"
  >
    <UIcon
      name="i-ph-caret-right"
      class="text-muted size-3.5 shrink-0 transition-transform"
      :class="folded ? '' : 'rotate-90'"
    />
    <span class="min-w-0 truncate">{{ label }}</span>
    <span
      class="bg-elevated text-muted shrink-0 rounded-full px-1.5 text-[11px] leading-4 font-medium tabular-nums"
    >
      {{ count ?? 0 }}
    </span>
    <span
      v-if="description && !compact"
      class="text-dimmed min-w-0 truncate font-normal"
    >
      {{ description }}
    </span>
  </button>
  <div
    v-else
    class="flex h-full min-w-0 items-center gap-2 px-2"
    :title="description || label"
  >
    <template v-if="resource && !compact">
      <img
        v-if="resource.avatar?.src"
        :src="resource.avatar.src"
        alt=""
        class="size-7 shrink-0 rounded-full object-cover"
      />
      <span
        v-else
        aria-hidden="true"
        class="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        :style="avatarStyle"
      >
        {{ initials }}
      </span>
    </template>
    <span class="flex min-w-0 flex-col">
      <span
        class="truncate text-sm leading-5 font-medium"
        :class="resource ? 'text-highlighted' : 'text-muted italic'"
      >
        {{ label }}
      </span>
      <span v-if="description" class="text-dimmed truncate text-xs leading-4">
        {{ description }}
      </span>
    </span>
    <UIcon
      v-if="resource?.editable === false"
      name="i-ph-lock-simple"
      class="text-dimmed ms-auto size-3.5 shrink-0"
      :aria-label="t('dms.agenda.timeline.read_only')"
    />
  </div>
</template>
