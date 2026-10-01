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
  <!-- v2 .ob-meta: "Step 2 of 3 · Administrator" with a mono aside. -->
  <div class="mb-[18px] flex items-center justify-between gap-3">
    <DmsEyebrow
      as="span"
      tone="accent"
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
      class="text-dimmed truncate font-mono text-[11px] font-medium"
    >
      {{ props.aside }}
    </span>
  </div>
</template>
