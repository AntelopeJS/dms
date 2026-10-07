<script setup lang="ts">
/**
 * Demo answer for the command palette's assistant mode. Its async setup holds
 * the palette's loading skeleton for a moment, then the answer stays
 * read-only: every action is an explicit button.
 */
interface PaletteAssistantDemoAnswerProps {
  prompt: string;
  close: () => void;
}

const ANSWER_DELAY_MS = 1200;
const OVERVIEW_PATH = "/examples/overview";

const props = defineProps<PaletteAssistantDemoAnswerProps>();
const { t } = useI18n();
const toast = useToast();
const router = useDmsRouter();

await new Promise((resolve) => setTimeout(resolve, ANSWER_DELAY_MS));

function openOverview(): void {
  props.close();
  void router.push(OVERVIEW_PATH);
}

async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.prompt);
    toast.add({ title: t("demo.assistant.answer.copied") });
  } catch {
    toast.add({ title: t("demo.assistant.answer.copyFailed"), color: "error" });
  }
}
</script>

<template>
  <div>
    <p class="text-xs text-dimmed">{{ t("demo.assistant.answer.eyebrow") }}</p>
    <p class="mt-1">
      {{ t("demo.assistant.answer.echo", { prompt: props.prompt }) }}
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <UButton
        size="sm"
        color="secondary"
        icon="i-ph-arrow-square-out"
        @click="openOverview"
      >
        {{ t("demo.assistant.answer.open") }}
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-ph-copy"
        @click="copyPrompt"
      >
        {{ t("demo.assistant.answer.copy") }}
      </UButton>
    </div>
  </div>
</template>
