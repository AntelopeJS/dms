<script setup lang="ts">
import { useFileMetadata } from "../../build/composables/files/useFileMetadata";

const props = defineProps<{
  resourceKey: string;
  storage?: string;
}>();

// Read with the page: the server renders the file's name and link.
const files = useFileMetadata(props.storage);
watch(
  () => props.resourceKey,
  (key) => void files.resolve(key),
  { immediate: true },
);
const metadata = computed(() => files.metadata(props.resourceKey));
const isLoading = computed(
  () => !metadata.value && !files.isUnavailable(props.resourceKey),
);

const isImage = computed(
  () => metadata.value?.mimetype.startsWith("image/") ?? false,
);
</script>

<template>
  <span v-if="isLoading" class="text-muted">...</span>
  <template v-else-if="metadata">
    <UAvatar v-if="isImage" :src="metadata.url" :alt="metadata.filename" />
    <ULink
      v-else
      :to="metadata.url"
      target="_blank"
      class="decoration-dimmed/40 hover:decoration-muted text-muted hover:text-default flex items-center gap-1 truncate font-normal underline"
      @click.stop
    >
      <span class="truncate">{{ metadata.filename }}</span>
      <UIcon
        name="i-ph-arrow-up-right"
        class="text-dimmed size-3 flex-shrink-0"
      />
    </ULink>
  </template>
  <span v-else class="text-muted">-</span>
</template>
