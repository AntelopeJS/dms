<script setup lang="ts">
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › Sidebar widgets: the components the
 * playground mounts in the sidebar with `useSidebarWidgets().register`.
 */

const DEMO_MODULE_PATH = "/modules/demo/pages/welcome";
const GLOBAL_SCOPE = "Outside modules";

const { widgets } = useSidebarWidgets();

const widgetItems = computed(() =>
  widgets.value.map((widget) => ({
    label: widget.id,
    value: resolveSidebarWidgetPosition(widget),
    type: "mono" as const,
    detail: widget.module ? `Only in module "${widget.module}"` : GLOBAL_SCOPE,
  })),
);
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="registered"
      title="The registered widgets"
      description="Each widget names a global component, a position (above or below the search button) and an order. Without a module scope it shows outside every module; with module: 'demo' it shows only inside the demo module."
    >
      <ShowcaseDemo
        label="useSidebarWidgets().widgets · resolveSidebarWidgetPosition"
      >
        <DmsCard title="Sidebar widgets" :count="widgetItems.length">
          <DmsKeyValueList :items="widgetItems" dense />
        </DmsCard>
      </ShowcaseDemo>
      <ShowcaseDemo label="What to try">
        <ul class="text-muted grid list-disc gap-2 ps-5 text-[13px]">
          <li>
            Look above the search button of the sidebar: the playground's card
            sits there.
          </li>
          <li>
            Collapse the sidebar: the widget receives
            <code>collapsed</code> and shrinks to an icon.
          </li>
          <li>
            Open the
            <DmsAutoLink :to="DEMO_MODULE_PATH" class="text-primary font-medium"
              >demo module</DmsAutoLink
            >: the global card goes, the module-scoped one shows below the
            module title.
          </li>
        </ul>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="registration"
      title="Registration"
      description="A universal plugin: the registration is plain data, so the server renders the sidebar with the widgets in place."
      :columns="1"
    >
      <ShowcaseDemo label="useSidebarWidgets().register(widget)" wide>
        <SourceSnippet path="plugins/sidebar-widget-demo.ts" />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
