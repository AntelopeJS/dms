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
  images: ImageItemValue[];
  storage?: string;
}>();

const MAX_THUMBNAILS = 3;

const { $authFetch } = useAuthFetch();
const urls = ref<Map<string, string>>(new Map());
const isLoading = ref(true);

const sortedImages = computed(() =>
  [...props.images].sort(
    (a, b) => Number(b.principal ?? false) - Number(a.principal ?? false),
  ),
);

const visibleImages = computed(() =>
  sortedImages.value.slice(0, MAX_THUMBNAILS),
);

const overflowCount = computed(
  () => props.images.length - visibleImages.value.length,
);

onMounted(async () => {
  await Promise.all(
    visibleImages.value.map(async (image) => {
      try {
        const metadata = await $authFetch<FileMetadataResponse>(
          "/api/files/metadata",
          { query: { resourceKey: image.key, storage: props.storage } },
        );
        urls.value.set(image.key, metadata.url);
      } catch {
        urls.value.set(image.key, "");
      }
    }),
  );
  isLoading.value = false;
});
</script>

<template>
  <span v-if="isLoading" class="text-muted">...</span>
  <div v-else class="flex items-center">
    <div class="flex -space-x-2">
      <span
        v-for="image in visibleImages"
        :key="image.key"
        class="ring-bg bg-elevated inline-block size-7 overflow-hidden rounded-md ring-2"
      >
        <img
          v-if="urls.get(image.key)"
          :src="urls.get(image.key)"
          :alt="image.alt ?? ''"
          class="h-full w-full object-cover"
        />
        <span v-else class="flex h-full w-full items-center justify-center">
          <UIcon name="i-lucide-image" class="text-dimmed size-3.5" />
        </span>
      </span>
    </div>
    <span v-if="overflowCount > 0" class="text-muted ml-1.5 text-xs">
      +{{ overflowCount }}
    </span>
  </div>
</template>
