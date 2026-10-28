<template>
  <div>
    <p class="pb-1.5 text-xs font-normal">
      {{ $t("form.password_strength.label") }}
    </p>
    <UProgress
      :color="props.color"
      :model-value="props.score"
      :max="props.strength.length"
      size="sm"
    />
  </div>

  <div>
    <p id="password-strength" class="pb-3 text-sm font-medium">
      {{ $t("form.password_strength.contains") }}
    </p>

    <ul class="space-y-1 pl-3" aria-labelledby="password-strength">
      <li
        v-for="(req, index) in props.strength"
        :key="index"
        class="flex items-center gap-2.5"
      >
        <UIcon
          :name="req.met ? 'i-lucide-check' : 'i-lucide-x'"
          class="size-4 shrink-0"
          :class="req.met ? 'text-success' : 'text-error'"
        />

        <span class="text-xs font-light">
          {{ req.text }}
          <span class="sr-only">
            {{ req.met ? " - Requirement met" : " - Requirement not met" }}
          </span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  color: {
    // SAFETY: PropType only supplies Vue's static color union; the runtime constructor remains String.
    type: String as PropType<
      | "error"
      | "primary"
      | "secondary"
      | "success"
      | "info"
      | "warning"
      | "neutral"
    >,
    required: true,
  },
  score: Number,
  strength: {
    // SAFETY: PropType only supplies Vue's static requirement shape; the runtime constructor remains Array.
    type: Array as PropType<{ met: boolean; text: string }[]>,
    required: true,
  },
});
</script>
