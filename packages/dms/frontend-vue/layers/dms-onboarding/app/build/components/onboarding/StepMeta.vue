<script setup lang="ts">
import { ONBOARDING_STEPS } from "../../composables/onboarding/steps";

interface StepMetaProps {
  /** One-based position of the step. */
  step: number;
  label: string;
  /** Quiet detail on the right, such as the time the step takes. */
  aside?: string;
}

const props = withDefaults(defineProps<StepMetaProps>(), {
  aside: undefined,
});
</script>

<template>
  <!-- v2 .ob-meta: "Step 2 of 3 · Administrator" with a mono aside. On a
       phone the aside wraps under the eyebrow instead of being cut short. -->
  <div
    class="mb-[18px] flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
  >
    <DmsEyebrow
      as="span"
      tone="primary"
      :label="
        $t('page.onboarding.steps.eyebrow', {
          step: props.step,
          total: ONBOARDING_STEPS.length,
          label: props.label,
        })
      "
    />
    <span
      v-if="props.aside"
      class="text-dimmed font-mono text-[11px] font-medium whitespace-nowrap"
    >
      {{ props.aside }}
    </span>
  </div>
</template>
