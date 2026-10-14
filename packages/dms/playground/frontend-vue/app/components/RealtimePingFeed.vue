<script setup lang="ts">
/**
 * Shows each message published on a topic the backend bound to this page
 * with `RegisterPageTopic`, as `useRealtimeTopic` hands it over: the raw
 * `topic`, `type`, `payload`, `actorId` and `ts` of the message.
 */
import { ref } from "vue";
import { useRealtimeTopic } from "#dms-core/app/composables/realtime/useRealtimeTopic";
import type {
  RealtimeEvent,
  RealtimeSnapshotEvent,
} from "#dms-core/app/composables/realtime/useUserRealtime";

const props = defineProps<{
  topic: string;
}>();

const KEPT_MESSAGES = 5;
const messages = ref<RealtimeEvent[]>([]);

function isMessage(
  event: RealtimeEvent | RealtimeSnapshotEvent,
): event is RealtimeEvent {
  return "type" in event;
}

useRealtimeTopic(
  () => props.topic,
  (event) => {
    if (!isMessage(event)) return;
    messages.value = [event, ...messages.value].slice(0, KEPT_MESSAGES);
  },
);
</script>

<template>
  <UCard>
    <template #header>
      <p class="text-highlighted text-sm font-medium">
        {{ $t("demo.pages.realtime.browser_title", { topic }) }}
      </p>
    </template>
    <p v-if="messages.length === 0" class="text-muted text-sm">
      {{ $t("demo.pages.realtime.browser_empty") }}
    </p>
    <pre
      v-for="message in messages"
      :key="message.ts"
      class="bg-elevated mb-2 overflow-x-auto rounded-md p-3 font-mono text-xs"
      >{{ JSON.stringify(message, null, 2) }}</pre
    >
  </UCard>
</template>
