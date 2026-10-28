<script setup lang="ts">
import { h, resolveComponent } from "vue";
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › Header actions: an icon button of the
 * dashboard header that runs code (`registerHeaderAction`), and a button this
 * component puts in its own page header (`usePageHeaderActions`).
 */

const PAGE_HEADER_ACTION_ORDER = -1;
const COMPACT_SCALE = "small";

const PAGE_HEADER_CODE = `usePageHeaderActions(
  () => h(UButton, { label: "Page action", icon: "i-ph-hand-tap", onClick }),
  { order: ${PAGE_HEADER_ACTION_ORDER} },
);`;

const UButton = resolveComponent("UButton");
const toast = useToast();
const clicks = ref(0);
const scale = useInterfaceScale();

function onPageAction(): void {
  clicks.value += 1;
  toast.add({ title: "The page header action ran", icon: "i-ph-hand-tap" });
}

usePageHeaderActions(
  () =>
    h(UButton, {
      label: "Page action",
      icon: "i-ph-hand-tap",
      color: "neutral",
      variant: "outline",
      onClick: onPageAction,
    }),
  { order: PAGE_HEADER_ACTION_ORDER },
);
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="header-action"
      title="A header action that runs code"
      description="registerHeaderAction adds an icon button next to the notifications. onSelect runs on click, isActive draws it engaged, isVisible shows it only where it applies: here, on the dashboard chrome pages only. With callables it registers from a .client plugin."
    >
      <ShowcaseDemo label="What to try">
        <ul class="text-muted grid list-disc gap-2 ps-5 text-[13px]">
          <li>
            Click the arrows-in button of the dashboard header: the interface
            switches to its compact scale and the button stays engaged.
          </li>
          <li>
            Click it again to go back, or open another library page: it hides.
          </li>
        </ul>
      </ShowcaseDemo>
      <ShowcaseDemo label="useInterfaceScale(), the state it toggles">
        <DmsStatusPill
          :tone="scale === COMPACT_SCALE ? 'info' : 'neutral'"
          :label="`Interface scale: ${scale}`"
          dot="static"
        />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="registerHeaderAction({ onSelect, isActive, isVisible })"
        wide
      >
        <SourceSnippet path="plugins/header-action-demo.client.ts" />
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="page-header-action"
      title="A button in the page header, from a component"
      description="A block puts its own buttons in the header of the page it sits on, for as long as it is mounted. Call usePageHeaderActions before the setup's first await, so the server renders the button with the page."
    >
      <ShowcaseDemo
        label="usePageHeaderActions(render, { order })"
        :code="PAGE_HEADER_CODE"
      >
        <p class="text-muted text-[13px]">
          The Page action button of this page's header comes from this block.
          Clicked {{ clicks }} time(s).
        </p>
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
