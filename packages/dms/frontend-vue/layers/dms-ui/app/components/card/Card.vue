<script setup lang="ts">
import DmsEyebrow from "../section-header/Eyebrow.vue";

// Card frame around primary components (design .card). The visual style
// lives in the .dms-card class (dms-layout main.css) so non-template
// consumers (e.g. the table's tailwind-variants theme) can share it;
// this component is the template-facing API.
//
// - variant "elevated": stronger shadow for floating, full-page surfaces
//   (auth boxes, error/account panels) that sit on an empty backdrop.
// - interactive: hover affordances for clickable cards (accent border +
//   lift). See <DmsNavCard> for the icon/title/description link tile.
// - selected: the picked option of a card picker (accent border + glow).
// - title / #header / #actions: the 48px head with the mono eyebrow title;
//   #footer: the muted band. With either, `padded` only pads the body.
interface Props {
  as?: string;
  padded?: boolean;
  variant?: "default" | "elevated";
  interactive?: boolean;
  selected?: boolean;
  /** Eyebrow title of the card head. */
  title?: string;
  /** Count shown next to the title, as a mono chip. */
  count?: number | string;
}

interface Slots {
  default?: () => unknown;
  /** Replaces the head content (title and count). */
  header?: () => unknown;
  /** Right-aligned head actions. */
  actions?: () => unknown;
  /** Muted footer band. */
  footer?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  as: "div",
  padded: true,
  variant: "default",
  interactive: false,
  selected: false,
  title: undefined,
  count: undefined,
});

const slots = defineSlots<Slots>();

const BODY_PADDING = "p-[18px] sm:p-5";

const hasHead = computed(
  () => !!props.title || !!slots.header || !!slots.actions,
);
const isSectioned = computed(() => hasHead.value || !!slots.footer);

const cardClass = computed(() => [
  "dms-card",
  props.variant === "elevated" && "dms-card--elevated",
  props.interactive && "dms-card--interactive",
  props.selected && "dms-card--selected",
  isSectioned.value && "flex flex-col overflow-hidden",
  props.padded && !isSectioned.value && BODY_PADDING,
]);
</script>

<template>
  <component :is="as" :class="cardClass">
    <template v-if="isSectioned">
      <div
        v-if="hasHead"
        class="border-default @container flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b py-2 ps-[18px] pe-4"
      >
        <slot name="header">
          <!-- One line on wide screens; wraps on a phone, where the count
               and the actions leave it little room. -->
          <DmsEyebrow
            as="span"
            tone="muted"
            truncate
            class="max-sm:whitespace-normal"
            :label="title"
          />
          <UBadge
            v-if="count !== undefined"
            :label="String(count)"
            color="neutral"
            size="sm"
            square
            class="font-mono"
          />
        </slot>
        <!-- A header under 24rem (a phone, a narrow column) puts the actions
             on their own line under the title instead of squeezing it. -->
        <div
          v-if="slots.actions"
          class="ms-auto flex shrink-0 items-center gap-1 @max-sm:ms-0 @max-sm:basis-full @max-sm:flex-wrap"
        >
          <slot name="actions" />
        </div>
      </div>
      <div class="min-w-0 flex-1" :class="padded && BODY_PADDING">
        <slot />
      </div>
      <div
        v-if="slots.footer"
        class="border-default flex items-center gap-2 border-t bg-(--dms-bg-muted) px-4 py-2.5"
      >
        <slot name="footer" />
      </div>
    </template>
    <slot v-else />
  </component>
</template>
