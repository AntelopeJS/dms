<script setup lang="ts">
import { computed, useId } from "vue";
import DmsBlockActions, {
  type BlockAction,
} from "../../build/components/blocks/BlockActions.vue";
import { splitHeadline } from "../../build/utils/heroHeadline";
import { isSafeImageUrl } from "../../build/utils/markdown";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
// Relative: defineProps extends it, and the SFC compiler resolves no alias.
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { BlockText } from "#dms-core/app/types/composed-text";

/** A figure under the lead (interface-dms `HeroProof`). */
interface HeroProof {
  value: BlockText;
  label: BlockText;
}

type HeroSize = "md" | "lg";
type HeroBackground = "plain" | "gradient" | "card";

// `Hero` block (interface-dms `base/hero`): the opening of a landing or
// onboarding page. Texts follow the `$` i18n convention or are composed
// texts; the headline's `*words*` (or `highlight`) take the primary colour.
// The media — an image, else an icon composition — sits beside the texts
// from the `lg` breakpoint, and under them on a phone or with
// `mediaPosition: "below"`.
interface HeroBlockProps extends Partial<DefaultComponentProps> {
  eyebrow?: BlockText;
  title?: BlockText;
  highlight?: BlockText;
  lead?: BlockText;
  actions?: BlockAction[];
  proof?: HeroProof[];
  image?: string;
  imageAlt?: BlockText;
  icons?: string[];
  mediaPosition?: "side" | "below";
  align?: "left" | "center";
  size?: HeroSize;
  background?: HeroBackground;
}

const props = withDefaults(defineProps<HeroBlockProps>(), {
  eyebrow: undefined,
  title: undefined,
  highlight: undefined,
  lead: undefined,
  actions: () => [],
  proof: () => [],
  image: undefined,
  imageAlt: undefined,
  icons: () => [],
  mediaPosition: "side",
  align: "left",
  size: "lg",
  background: "plain",
});

const MAX_ACTIONS = 3;
const MAX_PROOF = 4;
const MAX_ICONS = 3;

// Literal class maps: Tailwind only extracts classes it sees whole.
const BACKGROUND_CLASSES: Record<HeroBackground, string> = {
  plain: "",
  gradient:
    "border-primary/15 from-primary/12 via-primary/4 rounded-(--dms-radius-card) border bg-linear-135 to-transparent",
  card: "dms-card",
};

// The plain hero sits on the page and needs no inner padding.
const PADDING_CLASSES: Record<HeroSize, Record<"plain" | "framed", string>> = {
  lg: { plain: "py-4 sm:py-8", framed: "px-5 py-8 sm:px-10 sm:py-14" },
  md: { plain: "py-2 sm:py-4", framed: "px-5 py-6 sm:px-8 sm:py-10" },
};

const TITLE_CLASSES: Record<HeroSize, string> = {
  lg: "text-[2.25rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]",
  md: "text-[1.75rem] leading-tight sm:text-4xl",
};

const LEAD_CLASSES: Record<HeroSize, string> = {
  lg: "mt-5 text-lg leading-relaxed sm:text-xl",
  md: "mt-4 text-base leading-relaxed sm:text-lg",
};

const PROOF_VALUE_CLASSES: Record<HeroSize, string> = {
  lg: "text-2xl sm:text-3xl",
  md: "text-xl sm:text-2xl",
};

// The icon composition: the middle tile leads, the others lean behind it.
const ICON_TILES = [
  "bg-primary/10 ring-primary/25 text-primary size-20 -rotate-6 sm:size-24",
  "bg-(--dms-surface-card) ring-default text-highlighted z-10 size-24 shadow-md sm:size-28",
  "bg-(--dms-accent-tint) ring-primary/20 text-primary size-20 rotate-6 sm:size-24",
];
const ICON_GLYPHS = [
  "size-9 sm:size-10",
  "size-11 sm:size-12",
  "size-9 sm:size-10",
];

const { processText } = useComposedText();
const titleId = useId();

const text = (value: BlockText | undefined) =>
  value ? processText(value) : "";

const headline = computed(() =>
  splitHeadline(text(props.title), text(props.highlight) || undefined),
);
const actions = computed(() => props.actions.slice(0, MAX_ACTIONS));
const proof = computed(() => props.proof.slice(0, MAX_PROOF));
const icons = computed(() => props.icons.slice(0, MAX_ICONS));
// A route may serve the address: only `http(s)` or a path becomes a source.
const image = computed(() =>
  props.image && isSafeImageUrl(props.image) ? props.image : undefined,
);
const hasMedia = computed(() => Boolean(image.value) || icons.value.length > 0);
const isSide = computed(() => hasMedia.value && props.mediaPosition === "side");
const isCentered = computed(() => props.align === "center");
const isFramed = computed(() => props.background !== "plain");

const rootClass = computed(() => [
  BACKGROUND_CLASSES[props.background],
  PADDING_CLASSES[props.size][isFramed.value ? "framed" : "plain"],
]);
const layoutClass = computed(() =>
  isSide.value
    ? "grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center"
    : "grid gap-10",
);
const textsClass = computed(() =>
  isCentered.value
    ? "mx-auto flex max-w-3xl flex-col items-center text-center"
    : "flex max-w-3xl flex-col items-start",
);
</script>

<template>
  <section
    :class="rootClass"
    :aria-labelledby="props.title ? titleId : undefined"
    data-dms-hero
  >
    <div :class="layoutClass">
      <div class="min-w-0" :class="textsClass">
        <p
          v-if="props.eyebrow"
          class="text-primary mb-3 text-xs font-semibold tracking-[0.14em] uppercase"
        >
          {{ text(props.eyebrow) }}
        </p>
        <h2
          v-if="props.title"
          :id="titleId"
          class="text-highlighted font-semibold tracking-tight text-balance"
          :class="TITLE_CLASSES[props.size]"
        >
          <template v-for="(segment, index) in headline" :key="index">
            <span v-if="segment.isHighlighted" class="text-primary">
              {{ segment.text }}
            </span>
            <template v-else>{{ segment.text }}</template>
          </template>
        </h2>
        <p
          v-if="props.lead"
          class="text-muted max-w-[60ch] text-pretty"
          :class="LEAD_CLASSES[props.size]"
        >
          {{ text(props.lead) }}
        </p>
        <div
          v-if="actions.length"
          class="mt-7 flex flex-wrap gap-2.5"
          :class="isCentered ? 'justify-center' : ''"
        >
          <DmsBlockActions
            :actions="actions"
            :size="props.size === 'lg' ? 'lg' : 'md'"
            rest-variant="outline"
          />
        </div>
        <dl
          v-if="proof.length"
          class="border-default mt-9 grid grid-cols-2 gap-x-8 gap-y-5 border-t pt-6 sm:flex sm:flex-wrap sm:gap-x-10"
          :class="isCentered ? 'sm:justify-center' : ''"
        >
          <div
            v-for="(item, index) in proof"
            :key="index"
            class="flex min-w-0 flex-col-reverse"
          >
            <dt class="text-muted mt-0.5 text-[13px]">
              {{ text(item.label) }}
            </dt>
            <dd
              class="text-highlighted font-semibold tracking-tight tabular-nums"
              :class="PROOF_VALUE_CLASSES[props.size]"
            >
              {{ text(item.value) }}
            </dd>
          </div>
        </dl>
      </div>

      <div
        v-if="hasMedia"
        class="min-w-0"
        :class="isCentered || !isSide ? 'mx-auto w-full max-w-3xl' : ''"
        data-dms-hero-media
      >
        <img
          v-if="image"
          :src="image"
          :alt="text(props.imageAlt)"
          :aria-hidden="props.imageAlt ? undefined : 'true'"
          class="border-default h-auto w-full rounded-(--dms-radius-card) border object-cover shadow-(--dms-shadow-card)"
          decoding="async"
        />
        <div
          v-else
          class="flex items-center justify-center py-4"
          aria-hidden="true"
        >
          <div
            v-for="(icon, index) in icons"
            :key="`${index}-${icon}`"
            class="-mx-2 grid shrink-0 place-items-center rounded-3xl ring-1 ring-inset"
            :class="ICON_TILES[icons.length === 1 ? 1 : index]"
          >
            <UIcon
              :name="icon"
              :class="ICON_GLYPHS[icons.length === 1 ? 1 : index]"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
