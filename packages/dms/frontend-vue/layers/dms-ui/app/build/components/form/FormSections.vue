<script setup lang="ts">
import type { FormSectionNav } from "../../../composables/form/types/field";
import {
  currentSectionId,
  type FormSectionState,
  type FormSectionsLayout,
} from "../../composables/form/formSections";
import DmsFormEntries from "./FormEntries.vue";
import DmsFormSectionNav from "./FormSectionNav.vue";
import { scrollParent, scrollWithin } from "../../utils/scrollWithin";

interface FormSectionsProps {
  layout: FormSectionsLayout;
  nav: FormSectionNav;
  states: Record<string, FormSectionState>;
  /** Id of the form, prefixing its sections' anchors. */
  formId: string;
}

const props = defineProps<FormSectionsProps>();

const READING_LINE_RATIO = 0.35;

const END_TOLERANCE_PX = 2;

const SCROLL_SETTLE_MS = 150;

const activeId = ref(props.layout.sections[0]?.id);
const sectionElements = useTemplateRef<HTMLElement[]>("sectionElements");

function anchorId(sectionId: string): string {
  return `${props.formId}-section-${sectionId}`;
}

let pickedTimer: ReturnType<typeof setTimeout> | undefined;
let isPicked = false;

function holdPicked(): void {
  clearTimeout(pickedTimer);
  pickedTimer = setTimeout(() => {
    isPicked = false;
  }, SCROLL_SETTLE_MS);
}

function scrollToSection(sectionId: string): void {
  activeId.value = sectionId;
  isPicked = true;
  holdPicked();
  const section = document.getElementById(anchorId(sectionId));
  if (section) scrollWithin(section, { behavior: "smooth", block: "start" });
  history.replaceState(history.state, "", `#${anchorId(sectionId)}`);
}

interface SpyViewport {
  top: number;
  height: number;
  isAtEnd: boolean;
}

function isScrolledToEnd(
  scrollTop: number,
  height: number,
  scrollHeight: number,
): boolean {
  return scrollTop > 0 && scrollTop + height >= scrollHeight - END_TOLERANCE_PX;
}

function spyViewport(scroller: HTMLElement | null): SpyViewport {
  if (scroller) {
    return {
      top: scroller.getBoundingClientRect().top,
      height: scroller.clientHeight,
      isAtEnd: isScrolledToEnd(
        scroller.scrollTop,
        scroller.clientHeight,
        scroller.scrollHeight,
      ),
    };
  }
  const root = document.documentElement;
  return {
    top: 0,
    height: window.innerHeight,
    isAtEnd: isScrolledToEnd(
      window.scrollY,
      window.innerHeight,
      root.scrollHeight,
    ),
  };
}

function updateActiveSection(): void {
  const elements = sectionElements.value ?? [];
  const first = elements[0];
  if (!first) return;
  const viewport = spyViewport(scrollParent(first));
  const id = currentSectionId({
    sections: elements.map((element) => ({
      id: element.dataset.section ?? "",
      top: element.getBoundingClientRect().top - viewport.top,
    })),
    readingLine: viewport.height * READING_LINE_RATIO,
    isAtEnd: viewport.isAtEnd,
  });
  if (id) activeId.value = id;
}

let frame: number | undefined;

function onScroll(): void {
  if (isPicked) {
    holdPicked();
    return;
  }
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    updateActiveSection();
  });
}

onMounted(() => {
  if (props.nav === "none") return;
  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });
  const linked = props.layout.sections.find(
    (section) => location.hash === `#${anchorId(section.id)}`,
  );
  if (linked) scrollToSection(linked.id);
  else updateActiveSection();
});

onBeforeUnmount(() => {
  document.removeEventListener("scroll", onScroll, { capture: true });
  clearTimeout(pickedTimer);
  if (frame !== undefined) cancelAnimationFrame(frame);
});
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
