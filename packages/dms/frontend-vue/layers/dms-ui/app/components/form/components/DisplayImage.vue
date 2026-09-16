<script setup lang="ts">
interface DisplayImageProps {
  modelValue?: ImageItemValue | ImageItemValue[] | null;
  multiple?: boolean;
  storage?: string;
}

const props = defineProps<DisplayImageProps>();
const { t } = useI18n();
const { getUrl, resolve } = useFileReadUrls(props.storage);

const items = computed<ImageItemValue[]>(() => {
  const value = props.modelValue;
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
});

const isEmpty = computed(() => items.value.length === 0);

watch(items, (value) => value.forEach((image) => resolve(image.key)), {
  immediate: true,
});
</script>

<template>
  <span v-if="isEmpty" class="text-dimmed py-1.5 text-sm">
    {{ t("dms.form.empty_value") }}
  </span>
  <div v-else class="flex flex-wrap gap-2 py-1.5">
    <div
      v-for="image in items"
      :key="image.key"
      class="bg-elevated relative size-20 overflow-hidden rounded-lg shadow-sm"
      :class="{ 'ring-warning ring-2': image.principal }"
      :title="image.alt"
    >
      <img
        v-if="getUrl(image.key)"
        :src="getUrl(image.key)"
        :alt="image.alt ?? ''"
        class="h-full w-full object-cover"
      />
      <span v-else class="flex h-full w-full items-center justify-center">
        <UIcon name="i-lucide-image" class="text-dimmed size-5" />
      </span>
      <span
        v-if="image.principal && multiple"
        class="bg-warning absolute top-1 left-1 inline-flex items-center rounded-full p-0.5 text-white shadow-sm"
      >
        <UIcon name="i-lucide-star" class="size-3" />
      </span>
    </div>
  </div>
</template>
