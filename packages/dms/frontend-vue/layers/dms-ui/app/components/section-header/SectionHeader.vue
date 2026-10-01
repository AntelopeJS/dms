<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import DmsEyebrow from "./Eyebrow.vue";

export type SectionHeaderSize = "section" | "card";

interface SectionHeaderProps {
  /** Heading text (the `title` slot overrides it). */
  title?: string;
  /** Mono count after the title ("Installed 12"). */
  count?: number | string;
  /** One line under the title (the `description` slot overrides it). */
  description?: string;
  /**
   * `section`: v2 .c-head / .st-block__head, a 15px title above a card.
   * `card`: v2 .card__head, the title as a muted eyebrow inside a card.
   */
  size?: SectionHeaderSize;
  /** Heading element of the title. */
  as?: string;
  /** Destructive section: the title turns to the error color. */
  danger?: boolean;
}

interface SectionHeaderSlots {
  title?: () => unknown;
  /** Inline after the title and the count (badge, tag, tooltip…). */
  badge?: () => unknown;
  description?: () => unknown;
  /** Right-aligned actions; they wrap under the heading on narrow screens. */
  trailing?: () => unknown;
}

const props = withDefaults(defineProps<SectionHeaderProps>(), {
  title: undefined,
  count: undefined,
  description: undefined,
  size: "section",
  as: undefined,
  danger: false,
});
const slots = defineSlots<SectionHeaderSlots>();

const theme = tv({
  slots: {
    root: "flex flex-wrap gap-3",
    heading: "min-w-0",
    title: "flex min-w-0 flex-wrap items-center gap-2",
    count: "text-dimmed font-mono text-[10.5px] font-medium",
    description: "",
    trailing: "flex items-center gap-2",
  },
  variants: {
    size: {
      section: {
        root: "items-end",
        title:
          "text-highlighted text-[15px] leading-[1.3] font-[650] tracking-[-0.01em]",
        description: "text-muted mt-0.5 max-w-[72ch] text-[13px]",
        trailing: "sm:ms-auto",
      },
      card: {
        root: "flex-nowrap items-start gap-2.5",
        heading: "flex-1",
        title: "flex-nowrap",
        description: "text-dimmed mt-1 truncate text-xs",
        trailing: "shrink-0",
      },
    },
    danger: {
      true: { title: "text-error" },
    },
  },
});

const ui = computed(() => theme({ size: props.size, danger: props.danger }));
const isCard = computed(() => props.size === "card");
const headingTag = computed(() => props.as ?? (isCard.value ? "p" : "h2"));
const hasCount = computed(
  () => props.count !== undefined && props.count !== null,
);
</script>

<template>
  <header :class="ui.root()">
    <div :class="ui.heading()">
      <component
        :is="headingTag"
        v-if="props.title || slots.title || slots.badge"
        :class="ui.title()"
      >
        <slot name="title">
          <DmsEyebrow
            v-if="isCard"
            as="span"
            tone="muted"
            class="min-w-0"
            truncate
            :label="props.title"
          />
          <template v-else>{{ props.title }}</template>
        </slot>
        <span v-if="hasCount" :class="ui.count()">{{ props.count }}</span>
        <slot name="badge" />
      </component>
      <p
        v-if="props.description || slots.description"
        :class="ui.description()"
      >
        <slot name="description">{{ props.description }}</slot>
      </p>
    </div>
    <div v-if="slots.trailing" :class="ui.trailing()">
      <slot name="trailing" />
    </div>
  </header>
</template>
