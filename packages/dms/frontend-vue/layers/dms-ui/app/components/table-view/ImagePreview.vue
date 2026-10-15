<script setup lang="ts">
import { useFileMetadata } from "../../build/composables/files/useFileMetadata";

const props = defineProps<{
  images: ImageItemValue[];
  storage?: string;
}>();

const MAX_THUMBNAILS = 3;

const files = useFileMetadata(props.storage);

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

// Read with the page: the server renders the thumbnails.
watch(
  visibleImages,
  (images) => images.forEach((image) => void files.resolve(image.key)),
  { immediate: true },
);

const urlOf = (key: string): string | undefined => files.metadata(key)?.url;
const isLoading = computed(() =>
  visibleImages.value.some(
    (image) => !urlOf(image.key) && !files.isUnavailable(image.key),
  ),
);
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
          v-if="urlOf(image.key)"
          :src="urlOf(image.key)"
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
