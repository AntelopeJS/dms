<script setup lang="ts">
interface FileMetadataResponse {
  resourceKey: string;
  filename: string;
  size: number;
  mimetype: string;
  url: string;
  expiresAt?: number;
}

const props = defineProps<{
  resourceKey: string;
  storage?: string;
}>();

const { $authFetch } = useAuthFetch();
const metadata = ref<FileMetadataResponse | null>(null);
const isLoading = ref(true);

const isImage = computed(
  () => metadata.value?.mimetype.startsWith("image/") ?? false,
);

onMounted(async () => {
  try {
    metadata.value = await $authFetch<FileMetadataResponse>(
      `/api/files/metadata`,
      { query: { resourceKey: props.resourceKey, storage: props.storage } },
    );
  } catch {
    metadata.value = null;
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <span v-if="isLoading" class="text-muted">...</span>
  <template v-else-if="metadata">
    <UAvatar v-if="isImage" :src="metadata.url" :alt="metadata.filename" />
    <ULink
      v-else
      :to="metadata.url"
      target="_blank"
      class="decoration-dimmed/40 hover:decoration-muted flex items-center gap-1 truncate underline"
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
