<script setup lang="ts">
import type { FormSectionNav } from "../../../composables/form/types/field";
import type {
  FormSectionState,
  FormSectionsLayout,
} from "../../composables/form/formSections";
import DmsFormEntries from "./FormEntries.vue";
import DmsFormSectionNav from "./FormSectionNav.vue";

interface FormSectionsProps {
  layout: FormSectionsLayout;
  nav: FormSectionNav;
  states: Record<string, FormSectionState>;
  /** Id of the form, prefixing its sections' anchors. */
  formId: string;
}

const props = defineProps<FormSectionsProps>();

// A section is current once its top passes this band near the top of the
// viewport: the one being read, not the one merely peeking in at the bottom.
const SPY_ROOT_MARGIN = "0px 0px -65% 0px";

const activeId = ref(props.layout.sections[0]?.id);
const sectionElements = useTemplateRef<HTMLElement[]>("sectionElements");

function anchorId(sectionId: string): string {
  return `${props.formId}-section-${sectionId}`;
}

function scrollToSection(sectionId: string): void {
  activeId.value = sectionId;
  document
    .getElementById(anchorId(sectionId))
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(history.state, "", `#${anchorId(sectionId)}`);
}

let observer: IntersectionObserver | undefined;
const visible = new Set<string>();

function onIntersect(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    const id = (entry.target as HTMLElement).dataset.section;
    if (!id) continue;
    if (entry.isIntersecting) visible.add(id);
    else visible.delete(id);
  }
  const first = props.layout.sections.find((section) =>
    visible.has(section.id),
  );
  if (first) activeId.value = first.id;
}

onMounted(() => {
  if (props.nav === "none" || typeof IntersectionObserver === "undefined") {
    return;
  }
  observer = new IntersectionObserver(onIntersect, {
    rootMargin: SPY_ROOT_MARGIN,
  });
  for (const element of sectionElements.value ?? []) observer.observe(element);
  const linked = props.layout.sections.find(
    (section) => location.hash === `#${anchorId(section.id)}`,
  );
  if (linked) scrollToSection(linked.id);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <!-- The side list needs room beside the sections: the form's own width
    decides, so a narrow drawer or a split view gets the chips. -->
  <div class="@container">
    <div
      class="grid gap-6"
      :class="
        props.nav === 'side' &&
        '@min-[880px]:grid-cols-[200px_minmax(0,1fr)] @min-[880px]:gap-8'
      "
    >
      <div v-if="props.nav === 'side'" class="hidden @min-[880px]:block">
        <div class="sticky top-4 grid gap-3">
          <DmsFormSectionNav
            variant="list"
            :sections="props.layout.sections"
            :states="props.states"
            :active-id="activeId"
            :anchor-id="anchorId"
            @select="scrollToSection"
          />
          <slot name="nav-footer" />
        </div>
      </div>

      <div class="min-w-0">
        <DmsFormSectionNav
          v-if="props.nav !== 'none'"
          variant="chips"
          class="mb-4"
          :class="props.nav === 'side' && '@min-[880px]:hidden'"
          :sections="props.layout.sections"
          :states="props.states"
          :active-id="activeId"
          :anchor-id="anchorId"
          @select="scrollToSection"
        />

        <DmsSection v-if="props.layout.lead.length">
          <DmsFormEntries :entries="props.layout.lead" in-section />
        </DmsSection>

        <div
          v-for="section in props.layout.sections"
          :id="anchorId(section.id)"
          ref="sectionElements"
          :key="section.id"
          :data-section="section.id"
          class="mt-7 scroll-mt-14 first:mt-0"
        >
          <DmsSection :title="section.label" :description="section.description">
            <DmsFormEntries :entries="section.entries" in-section />
          </DmsSection>
        </div>

        <slot />
      </div>
    </div>
  </div>
</template>
