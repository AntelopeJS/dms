<script setup lang="ts">
/**
 * Renders framed app widgets (see `useAppWidgets`) as a vertical stack of
 * low-opacity icon chips anchored in the bottom-left corner of the content
 * panel, inset 0.625rem (10px at the default interface scale) from its
 * edges. A chip lights up to full opacity on hover or keyboard focus and its
 * `body` component unfolds into an animated card that overlays the page to
 * the right — the other chips stay put.
 *
 * Meant to be dropped into the `#footer` slot of the dashboard panel, whose
 * root is `relative`, so the absolute positioning anchors to the content panel
 * (it does not scroll with the body).
 */
const { widgets } = useAppWidgets();

const { processI18n } = useTranslation();
</script>

<template>
  <div
    v-if="widgets.length"
    class="pointer-events-none absolute bottom-2.5 left-2.5 z-40 flex flex-col-reverse items-start gap-2"
  >
    <div
      v-for="widget in widgets"
      :key="widget.id"
      class="group/widget pointer-events-auto relative flex items-center"
    >
      <button
        type="button"
        :aria-label="processI18n(widget.label)"
        :title="processI18n(widget.label)"
        class="border-default bg-default text-muted focus-visible:ring-primary group-hover/widget:text-highlighted group-focus-within/widget:text-highlighted flex size-10 items-center justify-center rounded-xl border opacity-50 shadow-lg transition-all duration-200 group-focus-within/widget:scale-105 group-focus-within/widget:opacity-100 group-hover/widget:scale-105 group-hover/widget:opacity-100 focus:outline-none focus-visible:ring-2 motion-reduce:transition-none"
      >
        <UIcon :name="widget.icon" class="size-5" />
      </button>

      <div
        class="pointer-events-none invisible absolute bottom-0 left-full z-10 -translate-x-2 pl-2 opacity-0 transition-all duration-200 ease-out group-focus-within/widget:pointer-events-auto group-focus-within/widget:visible group-focus-within/widget:translate-x-0 group-focus-within/widget:opacity-100 group-hover/widget:pointer-events-auto group-hover/widget:visible group-hover/widget:translate-x-0 group-hover/widget:opacity-100 motion-reduce:transition-none"
      >
        <div
          class="dms-widget-card border-default bg-default relative w-max max-w-sm rounded-xl border shadow-2xl"
        >
          <component :is="widget.body" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dms-widget-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.group\/widget:hover .dms-widget-card::after,
.group\/widget:focus-within .dms-widget-card::after {
  animation: dms-widget-frame-in 0.4s ease-out;
}

@keyframes dms-widget-frame-in {
  0% {
    box-shadow: 0 0 0 0
      color-mix(in oklab, var(--ui-primary, currentColor) 55%, transparent);
  }
  100% {
    box-shadow: 0 0 0 6px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .group\/widget:hover .dms-widget-card::after,
  .group\/widget:focus-within .dms-widget-card::after {
    animation: none;
  }
}
</style>
