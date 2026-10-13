<script setup lang="ts">
import {
  PLAYGROUND_PALETTE_SOURCE_ID,
  registerPlaygroundPaletteSource,
} from "../../composables/usePlaygroundPaletteSource";
import { useSidePanelDemo } from "../../composables/useSidePanelDemo";
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › Command palette: the playground's own
 * group in Ctrl/Cmd+K (`registerCommandPaletteSource`) and its assistant mode
 * (`registerCommandPaletteAssistant`).
 */

const { t } = useI18n();
const sidePanel = useSidePanelDemo();
const { groups } = useCommandPaletteGroups();
const isSourceRegistered = computed(() =>
  groups.value.some((group) =>
    String(group.id).startsWith(PLAYGROUND_PALETTE_SOURCE_ID),
  ),
);

function toggleSource(): void {
  if (isSourceRegistered.value) {
    unregisterCommandPaletteSource(PLAYGROUND_PALETTE_SOURCE_ID);
    return;
  }
  registerPlaygroundPaletteSource((key) => t(key), sidePanel);
}
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="source"
      title="A source of commands"
      description="A source adds groups to the palette: pages to open (to) and commands to run (onSelect). Its groups are computed, so they follow reactive state: the side-panel command reads Open or Close. searchText makes an entry match words it never shows."
    >
      <ShowcaseDemo label="What to try">
        <ul class="text-muted grid list-disc gap-2 ps-5 text-[13px]">
          <li>
            Press <UKbd value="meta" /> <UKbd value="K" /> to open the palette:
            the Playground group lists three entries.
          </li>
          <li>
            Search <code>pills</code>: Design system foundations matches on its
            hidden search text.
          </li>
          <li>
            Pick the side-panel command, then open the palette again: its label
            changed.
          </li>
        </ul>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="unregisterCommandPaletteSource(id) · registerCommandPaletteSource(source)"
      >
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill
            :tone="isSourceRegistered ? 'success' : 'neutral'"
            :label="isSourceRegistered ? 'Registered' : 'Unregistered'"
            dot="static"
          />
          <UButton
            :label="
              isSourceRegistered ? 'Unregister the source' : 'Register it again'
            "
            color="neutral"
            variant="outline"
            size="sm"
            @click="toggleSource"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo label="The source" wide>
        <SourceSnippet path="composables/usePlaygroundPaletteSource.ts" />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="Registered from a client plugin: onSelect is a callable"
        wide
      >
        <SourceSnippet path="plugins/command-palette-source-demo.client.ts" />
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="assistant"
      title="An assistant mode"
      description="With an assistant registered, Tab switches the palette to it, every search ends with an Ask item, and a submitted prompt mounts the answer component, which gets the prompt and a close function. A suggestion may submit a prompt other than its label, and carry its own icon."
      :columns="1"
    >
      <ShowcaseDemo label="What to try" wide>
        <ul class="text-muted grid list-disc gap-2 ps-5 text-[13px]">
          <li>
            Open the palette and press <UKbd value="Tab" />: three suggestions
            show, two with their own icon.
          </li>
          <li>
            Pick the order suggestion: the answer echoes a longer prompt than
            the label.
          </li>
          <li>
            Type any question and press <UKbd value="Enter" />: a skeleton shows
            while the answer's async setup waits.
          </li>
        </ul>
      </ShowcaseDemo>
      <ShowcaseDemo label="registerCommandPaletteAssistant(assistant)" wide>
        <SourceSnippet
          path="plugins/command-palette-assistant-demo.client.ts"
        />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
