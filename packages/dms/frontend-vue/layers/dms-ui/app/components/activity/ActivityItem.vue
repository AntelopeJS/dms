<script setup lang="ts">
import { computed } from "vue";
import DmsListRow from "../list-row/ListRow.vue";
import type { Tone } from "../../types/tone";

// DMS activity / feed / history row (v2 .activity): the feed preset of
// DmsListRow — a 30px tinted well, a one-line title, a dimmed subtitle and a
// mono trailing time. Stack these in DmsActivityFeed or a card for activity
// feeds, "Recent requests", history panels… The title, subtitle and trailing
// accept slots so callers can inline badges or rich markup.
interface Props {
  icon?: string;
  /** Well tone (v2 .activity.is-*). */
  iconColor?: Tone;
  title?: string;
  subtitle?: string;
  /** Third line, dimmed and mono (an entry's evidence). */
  detail?: string;
  /** Trailing meta, usually the time. */
  trailing?: string;
  /** Render title/subtitle in mono (for paths, queries…). */
  mono?: boolean;
  /** Accent dot after the trailing meta. */
  unread?: boolean;
  /** Makes the whole row a link. */
  to?: string;
  /** Hover band; on by default. */
  interactive?: boolean;
  /**
   * The title, details and detail line wrap over as many lines as they
   * need, a long path or query breaking anywhere, instead of one line each
   * cut with an ellipsis.
   */
  wrap?: boolean;
}

interface Slots {
  default?: () => unknown;
  subtitle?: () => unknown;
  trailing?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  icon: undefined,
  iconColor: "neutral",
  title: undefined,
  subtitle: undefined,
  detail: undefined,
  trailing: undefined,
  mono: false,
  unread: false,
  to: undefined,
  interactive: true,
  wrap: false,
});
const slots = defineSlots<Slots>();

const meta = computed(() => (props.subtitle ? [props.subtitle] : undefined));
const hasTitle = computed(() => !!props.title || !!slots.default);
</script>

<template>
  <DmsListRow
    size="sm"
    icon-size="xs"
    marker="trailing"
    :truncate="!props.wrap"
    :class="props.wrap && '[overflow-wrap:anywhere]'"
    :icon="props.icon"
    :tone="props.iconColor"
    :meta="meta"
    :detail="props.detail"
    :mono="props.mono"
    :unread="props.unread || undefined"
    :trailing="props.trailing"
    :to="props.to"
    :interactive="props.interactive"
  >
    <template v-if="hasTitle" #default>
      <!-- One line on wide screens (the full text shows on hover); on a
           phone a sentence wraps rather than losing its end, while a mono
           path or query keeps its line. `wrap` keeps every word. -->
      <span
        class="min-w-0"
        :class="[
          props.mono && 'text-toned font-mono text-[12.5px]',
          !props.wrap && 'truncate',
          !props.wrap && !props.mono && 'max-sm:whitespace-normal',
        ]"
        :title="props.wrap ? undefined : props.title"
      >
        <slot>{{ props.title }}</slot>
      </span>
    </template>
    <template v-if="slots.subtitle" #meta>
      <slot name="subtitle" />
    </template>
    <template v-if="slots.trailing" #trailing>
      <slot name="trailing" />
    </template>
  </DmsListRow>
</template>
