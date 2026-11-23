<script setup lang="ts">
defineProps<{
  /** The sketch's named states, in its order. */
  names: readonly string[];
}>();
/** The state the sketch is drawn in: its own `html` when undefined, else a named state. The pick lives in the viewer, never in the spec. */
const state = defineModel<string | undefined>({ required: true });

const { t } = useI18n();
</script>

<template>
  <div class="space-y-1.5" data-dms-mockup-sketch-states>
    <p class="text-muted text-xs font-medium">
      {{ t("dms.mockup.sketch_state") }}
    </p>
    <div
      class="border-default flex flex-wrap gap-0.5 rounded-md border p-0.5"
      role="radiogroup"
      :aria-label="t('dms.mockup.sketch_state')"
    >
      <UButton
        size="xs"
        color="neutral"
        role="radio"
        :variant="state === undefined ? 'soft' : 'ghost'"
        :aria-checked="state === undefined"
        data-dms-mockup-sketch-state=""
        @click="state = undefined"
      >
        {{ t("dms.mockup.sketch_state_default") }}
      </UButton>
      <UButton
        v-for="name in names"
        :key="name"
        size="xs"
        color="neutral"
        role="radio"
        :variant="state === name ? 'soft' : 'ghost'"
        :aria-checked="state === name"
        :data-dms-mockup-sketch-state="name"
        @click="state = name"
      >
        {{ name }}
      </UButton>
    </div>
  </div>
</template>
