<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import { tv } from "tailwind-variants";
import DmsIconWell from "../icon-well/IconWell.vue";
import DmsStatusPill from "../status-pill/StatusPill.vue";
import type { DmsTone } from "../../build/utils/tone";

/** The pill at the card's top right ("Builder", "Local", "Legacy"). */
export interface RecordCardBadge {
  label: string;
  tone?: DmsTone;
}

interface RecordCardProps {
  /** Icon drawn in a tinted well before the title. */
  icon?: string;
  /** Tone of the icon well. Defaults to `accent`. */
  tone?: DmsTone;
  title: string;
  /** Mono line under the title (a package, a slug, an order). */
  subtitle?: string;
  badge?: RecordCardBadge;
  description?: string;
  /** Small chips in the card's footer. */
  tags?: string[];
  /** Mono note at the footer's end ("31 uses"). */
  meta?: string;
  /** Buttons in the footer, after the tags. */
  actions?: ButtonProps[];
  /** Draws the card selected (accent ring). */
  selected?: boolean;
  /** Draws the card dimmed (a record set aside). */
  muted?: boolean;
  /**
   * The whole card opens the record: hover state, keyboard focus, `open`
   * emitted on a click or Enter.
   */
  interactive?: boolean;
}

interface RecordCardSlots {
  /** Content between the description and the footer. */
  default?: () => unknown;
  /** Replaces the badge (a switch, a menu). */
  aside?: () => unknown;
  /** Replaces the footer's buttons. */
  actions?: () => unknown;
}

const props = withDefaults(defineProps<RecordCardProps>(), {
  icon: undefined,
  tone: "accent",
  subtitle: undefined,
  badge: undefined,
  description: undefined,
  tags: () => [],
  meta: undefined,
  actions: () => [],
  selected: false,
  muted: false,
  interactive: false,
});
const emit = defineEmits<{ open: [] }>();
const slots = defineSlots<RecordCardSlots>();

// v2 record card (ai skills, saas plans): icon well and mono identity on top,
// a short description, then tags, a mono note and actions on a ruled footer.
const theme = tv({
  slots: {
    root: "dms-card flex min-w-0 flex-col gap-3 p-[18px] text-start transition-colors",
    head: "flex min-w-0 items-start gap-3",
    identity: "flex min-w-0 flex-1 flex-col gap-0.5",
    title: "truncate font-mono text-[13.5px] font-semibold text-highlighted",
    subtitle: "truncate font-mono text-[11.5px] text-dimmed",
    description: "line-clamp-3 text-[13px] leading-5 text-muted",
    footer:
      "mt-auto flex min-w-0 items-center gap-2 border-t border-default pt-3",
    tags: "flex min-w-0 flex-1 flex-wrap items-center gap-1.5",
    tag: "rounded-[5px] bg-elevated px-1.5 py-0.5 text-[11.5px] font-medium text-toned",
    meta: "ms-auto shrink-0 font-mono text-[11.5px] text-dimmed",
    actions: "flex shrink-0 items-center gap-1",
  },
  variants: {
    interactive: {
      true: {
        root: "cursor-pointer hover:border-accented focus-visible:outline-2 focus-visible:outline-(--dms-accent-line)",
      },
    },
    selected: {
      true: { root: "ring-2 ring-(--dms-accent-line)" },
    },
    muted: {
      true: { root: "opacity-70" },
    },
  },
});

const ui = computed(() =>
  theme({
    interactive: props.interactive,
    selected: props.selected,
    muted: props.muted,
  }),
);

const hasFooter = computed(
  () =>
    props.tags.length > 0 ||
    !!props.meta ||
    props.actions.length > 0 ||
    !!slots.actions,
);

const open = () => {
  if (props.interactive) emit("open");
};
</script>

<template>
  <article
    :class="ui.root()"
    :tabindex="interactive ? 0 : undefined"
    :aria-selected="interactive ? selected : undefined"
    @click="open"
    @keydown.enter.self="open"
  >
    <div :class="ui.head()">
      <DmsIconWell v-if="icon" :icon="icon" :tone="tone" size="sm" />
      <div :class="ui.identity()">
        <span :class="ui.title()" :title="title">{{ title }}</span>
        <span v-if="subtitle" :class="ui.subtitle()">{{ subtitle }}</span>
      </div>
      <slot name="aside">
        <DmsStatusPill
          v-if="badge"
          :label="badge.label"
          :tone="badge.tone ?? 'neutral'"
          dot="none"
          size="sm"
        />
      </slot>
    </div>
    <p v-if="description" :class="ui.description()">{{ description }}</p>
    <slot />
    <div v-if="hasFooter" :class="ui.footer()">
      <div v-if="tags.length > 0" :class="ui.tags()">
        <span v-for="tag in tags" :key="tag" :class="ui.tag()">{{ tag }}</span>
      </div>
      <span v-if="meta" :class="ui.meta()">{{ meta }}</span>
      <!-- A button acts on the record without opening it. -->
      <div
        v-if="actions.length > 0 || slots.actions"
        :class="ui.actions()"
        @click.stop
        @keydown.enter.stop
      >
        <slot name="actions">
          <UButton
            v-for="(action, index) in actions"
            :key="index"
            size="xs"
            color="neutral"
            variant="outline"
            v-bind="action"
          />
        </slot>
      </div>
    </div>
  </article>
</template>
