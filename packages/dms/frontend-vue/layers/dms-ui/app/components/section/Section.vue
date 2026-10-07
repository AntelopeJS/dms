<script setup lang="ts">
import { computed, provide } from "vue";
import { tv } from "tailwind-variants";
import DmsSectionHeader from "../section-header/SectionHeader.vue";
import { DMS_SECTION_SURFACE_KEY } from "../../build/components/section/context";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// The renderer's props are optional: DmsSection is both the backend `Section`
// block (`dms-section-block`) and a template component.
interface SectionProps extends Partial<DefaultComponentProps> {
  /** Heading (i18n key with `$` or literal). */
  title?: string;
  /** One line under the heading. */
  description?: string;
  /** Destructive actions: the frame and title turn to the error color. */
  danger?: boolean;
  /** The card frame around the content; off for custom layouts and grids. */
  card?: boolean;
}

interface SectionSlots {
  /** The card content: field rows, list rows… */
  default?: () => unknown;
  /** Inline after the title (a count, a status pill). */
  badge?: () => unknown;
  /** Right of the heading (a section-level action). */
  trail?: () => unknown;
  /** Muted band at the bottom of the card. */
  footer?: () => unknown;
}

const props = withDefaults(defineProps<SectionProps>(), {
  title: undefined,
  description: undefined,
  danger: false,
  card: true,
});
const slots = defineSlots<SectionSlots>();

useWatch(props.watchActions || [], props.componentId);

// v2 .st-block: a 15px title and one line of description (the generic
// section header) above a card whose rows are set apart by hairlines.
const theme = tv({
  slots: {
    root: "mt-7 first:mt-0",
    // Clip, not hidden: a sticky save bar or form footer inside the card
    // keeps sticking to the panel instead of to the card.
    card: "dms-card overflow-clip",
    footer:
      "flex flex-wrap items-center gap-3 border-t border-default bg-(--dms-bg-muted) px-4 py-2.5 text-[12.5px] text-muted",
  },
  variants: {
    danger: {
      true: {
        card: "border-error/40",
      },
    },
  },
});

const ui = computed(() => theme({ danger: props.danger }));
const { processI18n } = useTranslation();

provide(DMS_SECTION_SURFACE_KEY, props.card);
</script>

<template>
  <section :class="ui.root()">
    <DmsSectionHeader
      v-if="props.title || props.description || slots.trail || slots.badge"
      class="mb-2.5"
      :title="props.title ? processI18n(props.title) : undefined"
      :description="
        props.description ? processI18n(props.description) : undefined
      "
      :danger="props.danger"
    >
      <template v-if="slots.badge" #badge>
        <slot name="badge" />
      </template>
      <template v-if="slots.trail" #trailing>
        <slot name="trail" />
      </template>
    </DmsSectionHeader>

    <slot v-if="!props.card" />
    <div v-else :class="ui.card()">
      <slot />
      <footer v-if="slots.footer" :class="ui.footer()">
        <slot name="footer" />
      </footer>
    </div>
  </section>
</template>
