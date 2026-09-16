<script setup lang="ts">
// Card frame around primary components (design .card). The visual style
// lives in the .dms-card class (dms-layout main.css) so non-template
// consumers (e.g. the table's tailwind-variants theme) can share it;
// this component is the template-facing API.
//
// - variant "elevated": stronger shadow for floating, full-page surfaces
//   (auth boxes, error/account panels) that sit on an empty backdrop.
// - interactive: hover affordances for clickable cards (border accent +
//   lift). See <DmsNavCard> for the icon/title/description link tile.
interface Props {
  as?: string;
  padded?: boolean;
  variant?: "default" | "elevated";
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  as: "div",
  padded: true,
  variant: "default",
  interactive: false,
});

const cardClass = computed(() => [
  "dms-card",
  props.variant === "elevated" && "dms-card--elevated",
  props.interactive && "dms-card--interactive",
  props.padded && "p-5 sm:p-6",
]);
</script>

<template>
  <component :is="as" :class="cardClass">
    <slot />
  </component>
</template>
