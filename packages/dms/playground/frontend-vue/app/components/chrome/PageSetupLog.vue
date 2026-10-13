<script setup lang="ts">
import { usePageSetupLog } from "../../composables/usePageSetupLog";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › Page setup function: what the setup
 * function this page names (`setupId`) wrote while it ran, then its source.
 */

const log = usePageSetupLog();
const { formatTime } = useRegionalFormat();
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <DmsCard title="Setup function log" :count="log.length">
      <DmsEmptyState
        v-if="!log.length"
        icon="i-ph-plugs-connected"
        title="Nothing yet"
        description="The function writes here once the page mounted. Type in the form below."
      />
      <div v-else class="grid">
        <DmsListRow
          v-for="(entry, index) in log"
          :key="`${entry.at.getTime()}-${index}`"
          :title="entry.message"
          :description="entry.detail"
          :trailing="formatTime(entry.at)"
          size="sm"
        />
      </div>
      <template #footer>
        <span class="text-muted text-[12.5px]">
          Leave the page and come back: the cleanup line shows first.
        </span>
      </template>
    </DmsCard>
    <SourceSnippet path="plugins/dms-page-setup-demo.client.ts" />
  </div>
</template>
