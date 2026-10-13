<script setup lang="ts">
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › App widgets & overlays: the framed
 * dock the DMS draws (`useAppWidgets`) and the free overlay a module places
 * itself (`useAppOverlay`), both added and removed from this page.
 */

const EXTRA_WIDGET_ID = "demo:extra";
const EXTRA_WIDGET_ORDER = 2;
const OVERLAY_NAME = "PlaygroundOverlayBubble";

const WIDGET_CODE = `const { register, unregister } = useAppWidgets();
register({ id: "${EXTRA_WIDGET_ID}", icon: "i-ph-lightning", label: "$demo.frontend.widget.label", body: "WidgetDemoCard", order: ${EXTRA_WIDGET_ORDER} });
unregister("${EXTRA_WIDGET_ID}");`;

const OVERLAY_CODE = `const { register, unregister } = useAppOverlay();
register("${OVERLAY_NAME}"); // a global component, positioned by itself
unregister("${OVERLAY_NAME}");`;

const appWidgets = useAppWidgets();
const appOverlay = useAppOverlay();

const hasExtraWidget = computed(() =>
  appWidgets.widgets.value.some((widget) => widget.id === EXTRA_WIDGET_ID),
);
const hasOverlay = computed(() =>
  appOverlay.overlays.value.includes(OVERLAY_NAME),
);

const widgetItems = computed(() =>
  appWidgets.widgets.value.map((widget) => ({
    label: widget.id,
    value: widget.body,
    type: "mono" as const,
    detail: `order ${widget.order ?? 0}`,
  })),
);

function toggleExtraWidget(): void {
  if (hasExtraWidget.value) {
    appWidgets.unregister(EXTRA_WIDGET_ID);
    return;
  }
  appWidgets.register({
    id: EXTRA_WIDGET_ID,
    icon: "i-ph-lightning",
    label: "$demo.frontend.widget.label",
    body: "WidgetDemoCard",
    order: EXTRA_WIDGET_ORDER,
  });
}

function toggleOverlay(): void {
  if (hasOverlay.value) {
    appOverlay.unregister(OVERLAY_NAME);
    return;
  }
  appOverlay.register(OVERLAY_NAME);
}
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="app-widgets"
      title="Framed app widgets"
      description="The DMS draws a low-opacity chip per widget in the bottom-left corner, stacks them by order and unfolds the body component into a card on hover. Registration is plain data; a widget with nothing to show unregisters itself."
    >
      <ShowcaseDemo label="register / unregister" :code="WIDGET_CODE">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :label="
              hasExtraWidget ? 'Remove the third widget' : 'Add a third widget'
            "
            :icon="hasExtraWidget ? 'i-ph-minus' : 'i-ph-plus'"
            size="sm"
            @click="toggleExtraWidget"
          />
          <span class="text-muted text-[13px]">
            Then hover the dock in the bottom-left corner.
          </span>
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="useAppWidgets().widgets">
        <DmsCard title="Docked widgets" :count="widgetItems.length">
          <DmsKeyValueList :items="widgetItems" dense />
        </DmsCard>
      </ShowcaseDemo>
      <ShowcaseDemo label="The two widgets every page shows" wide>
        <SourceSnippet path="plugins/app-widget-demo.ts" />
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="app-overlay"
      title="Free overlay"
      description="An overlay is a global component the DMS renders on every page, outside the routed page, with no frame: it places itself (position: fixed). It stays across navigations until it is unregistered or the page reloads."
    >
      <ShowcaseDemo label="useAppOverlay()" :code="OVERLAY_CODE">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :label="hasOverlay ? 'Remove the overlay' : 'Show the overlay'"
            :icon="hasOverlay ? 'i-ph-minus' : 'i-ph-plus'"
            size="sm"
            @click="toggleOverlay"
          />
          <DmsStatusPill
            :tone="hasOverlay ? 'success' : 'neutral'"
            :label="hasOverlay ? 'Bottom-right corner' : 'Not registered'"
            dot="static"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="The overlay component">
        <SourceSnippet path="components/chrome/PlaygroundOverlayBubble.vue" />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
