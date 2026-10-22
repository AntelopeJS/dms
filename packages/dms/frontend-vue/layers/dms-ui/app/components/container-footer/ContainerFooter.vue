<script setup lang="ts">
/**
 * The footer band of a drawer's or a modal's body component: its buttons
 * under a hairline, flush with the container's edges. It sticks to the
 * bottom of the container while the content runs past it. In a drawer, whose
 * body is a flex column, a body component whose root grows (`flex-1`, and
 * `flex flex-col` to lay its own content out) keeps it at the bottom of the
 * drawer while its content is short.
 */
interface ContainerFooterProps {
  /** Where the buttons sit along the band; `end` by default. */
  justify?: "start" | "end" | "between";
}

const props = withDefaults(defineProps<ContainerFooterProps>(), {
  justify: "end",
});

// Same band as a form's footer in a container (FORM_SURFACE_CLASSES), but
// pushed to the bottom (`mt-auto`) rather than set under the fields.
const FOOTER_CLASS =
  "border-default bg-default sticky bottom-[calc(var(--dms-form-foot-pb,0px)*-1)] z-10 mt-auto -mx-[var(--dms-form-foot-px,0px)] -mb-[var(--dms-form-foot-pb,0px)] flex flex-wrap items-center gap-2 border-t px-[var(--dms-form-foot-px,0px)] pt-3 pb-[var(--dms-form-foot-pb,12px)]";
const JUSTIFY_CLASSES = {
  start: "justify-start",
  end: "justify-end",
  between: "justify-between",
} as const;
</script>

<template>
  <footer :class="[FOOTER_CLASS, JUSTIFY_CLASSES[props.justify]]">
    <slot />
  </footer>
</template>
