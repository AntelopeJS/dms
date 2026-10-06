<script setup lang="ts">
import DmsCard from "#dms-ui/app/components/card/Card.vue";
import DmsIconWell from "#dms-ui/app/components/icon-well/IconWell.vue";
import DmsEyebrow from "#dms-ui/app/components/section-header/Eyebrow.vue";

/** Card widths of the v2 stage: 420px forms, 560px and 720px wide panels. */
export type StageCardWidth = "default" | "wide" | "xwide";

/** Color of the icon well above the title. */
export type StageCardTone =
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "neutral";

interface StageCardProps {
  as?: string;
  width?: StageCardWidth;
  title?: string;
  description?: string;
  /** Mono uppercase kicker above the title. */
  eyebrow?: string;
  icon?: string;
  /** Extra classes on the icon, e.g. a spin while something loads. */
  iconClass?: string;
  tone?: StageCardTone;
}

const props = withDefaults(defineProps<StageCardProps>(), {
  as: "section",
  width: "default",
  title: undefined,
  description: undefined,
  eyebrow: undefined,
  icon: undefined,
  iconClass: undefined,
  tone: "accent",
});

const WIDTH_CLASSES: Record<StageCardWidth, string> = {
  default: "max-w-[420px]",
  wide: "max-w-[560px]",
  xwide: "max-w-[720px]",
};
</script>

<template>
  <!-- v2 .au-card: the elevated card, alone on the stage, with the stage's
       16px radius. -->
  <DmsCard
    :as="props.as"
    variant="elevated"
    :padded="false"
    class="mx-auto w-full rounded-[16px] px-5 py-6 sm:p-8"
    :class="WIDTH_CLASSES[props.width]"
  >
    <DmsIconWell v-if="props.icon" :tone="props.tone" size="xl" class="mb-4">
      <UIcon :name="props.icon" class="size-5" :class="props.iconClass" />
    </DmsIconWell>

    <slot name="eyebrow">
      <DmsEyebrow
        v-if="props.eyebrow"
        as="span"
        tone="accent"
        class="mb-2.5 block"
        :label="props.eyebrow"
      />
    </slot>

    <h1
      v-if="props.title"
      class="text-highlighted text-xl leading-tight font-[650] tracking-[-0.025em]"
    >
      {{ props.title }}
    </h1>

    <p
      v-if="props.description || $slots.description"
      class="text-muted [&_b]:text-toned mt-1.5 text-[13px] [&_b]:font-semibold"
    >
      <slot name="description">{{ props.description }}</slot>
    </p>

    <slot />
  </DmsCard>
</template>
