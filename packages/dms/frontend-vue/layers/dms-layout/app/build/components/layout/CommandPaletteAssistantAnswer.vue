<script setup lang="ts">
import { computed, onErrorCaptured, ref } from "vue";
import { EYEBROW_CLASS } from "#dms-ui/app/build/utils/eyebrow";

interface CommandPaletteAssistantAnswerFrameProps {
  /** The assistant's resolved label, shown as the frame's eyebrow. */
  label: string;
  icon: string;
  /** Registered name of the module's answer component. */
  component: string;
  prompt: string;
  close: () => void;
}

const props = defineProps<CommandPaletteAssistantAnswerFrameProps>();
const { t } = useI18n();

const answerComponent = computed(() => resolveDmsComponent(props.component));
const isLoading = ref(true);
const hasFailed = ref(false);
const eyebrowClass = [
  EYEBROW_CLASS,
  "mb-2 flex items-center gap-1.5 text-secondary",
];
// Line widths of the loading skeleton, after the v2 mockup.
const SKELETON_WIDTHS = ["w-[82%]", "w-[64%]", "w-[40%]"];

// A rejected async setup would leave the skeleton up for good: the frame
// states the failure instead, and the other palette content keeps working.
onErrorCaptured((error) => {
  console.error("[command-palette] the assistant answer failed", error);
  hasFailed.value = true;
  isLoading.value = false;
  return false;
});
</script>

<template>
  <section
    class="text-toned m-1.5 rounded-xl border border-(--dms-assistant-line) bg-(--dms-assistant-tint) px-4 py-3.5 text-left text-sm/relaxed"
    :aria-label="props.label"
    :aria-busy="isLoading"
    data-slot="assistantAnswer"
  >
    <p :class="eyebrowClass">
      <UIcon :name="props.icon" class="size-3.5" />
      {{ props.label }}
    </p>
    <p v-if="hasFailed || !answerComponent" role="alert" class="text-muted">
      {{ t("commandPalette.assistant.failed") }}
    </p>
    <Suspense v-else @pending="isLoading = true" @resolve="isLoading = false">
      <component
        :is="answerComponent"
        :prompt="props.prompt"
        :close="props.close"
      />
      <template #fallback>
        <div
          role="status"
          class="after:via-secondary/25 relative grid gap-2.5 overflow-hidden py-1.5 after:absolute after:inset-0 after:bg-linear-100 after:from-transparent after:from-30% after:to-transparent after:to-70% motion-safe:after:animate-[dms-assistant-sweep_1.6s_ease-out_infinite]"
        >
          <span class="sr-only">
            {{ t("commandPalette.assistant.loading") }}
          </span>
          <USkeleton
            v-for="width in SKELETON_WIDTHS"
            :key="width"
            :class="['h-3 bg-(--dms-assistant-tint)', width]"
          />
        </div>
      </template>
    </Suspense>
  </section>
</template>
