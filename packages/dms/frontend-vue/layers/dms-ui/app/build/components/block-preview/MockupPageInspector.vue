<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { slugify, type MockupEdit } from "../../utils/mockupEdit";
import {
  MOCKUP_PAGE_ID_PATTERN,
  type MockupSpecDocument,
} from "../../utils/mockupSpec";

/** The open page's settings: its title, and its URL, which is its id. */
const props = defineProps<{ spec: MockupSpecDocument; page: number }>();
const emit = defineEmits<{ edit: [edit: MockupEdit, coalesceKey?: string] }>();

const { t } = useI18n();
const titleId = useId();
const urlId = useId();

const entry = computed(() => props.spec.pages[props.page]);
const url = ref("");
const isUrlRefused = ref(false);

watch(
  () => entry.value?.id,
  (id) => {
    url.value = id ?? "";
    isUrlRefused.value = false;
  },
  { immediate: true },
);

function setTitle(title: string | number): void {
  const page = entry.value?.id;
  if (!page) return;
  emit(
    "edit",
    { kind: "updatePage", page, title: String(title) },
    `page:${page}:title`,
  );
}

function commitUrl(): void {
  const page = entry.value?.id;
  if (!page) return;
  const id = slugify(url.value);
  const isTaken = props.spec.pages.some(
    (other) => other.id === id && other.id !== page,
  );
  isUrlRefused.value = !MOCKUP_PAGE_ID_PATTERN.test(id) || isTaken;
  if (isUrlRefused.value) return;
  url.value = id;
  if (id !== page) emit("edit", { kind: "updatePage", page, id });
}
</script>

<template>
  <div v-if="entry" class="space-y-4 p-4" data-dms-mockup-page-inspector>
    <header class="space-y-1">
      <h2 class="text-highlighted text-sm font-semibold">
        {{ t("dms.mockup.page_inspector", { title: entry.title }) }}
      </h2>
      <p class="text-dimmed text-xs">{{ t("dms.mockup.select_hint") }}</p>
    </header>
    <div class="space-y-1.5">
      <label :for="titleId" class="text-muted block text-xs font-medium">
        {{ t("dms.mockup.page_title") }}
      </label>
      <UInput
        :id="titleId"
        :model-value="entry.title"
        class="w-full"
        data-dms-mockup-page-title
        @update:model-value="setTitle"
      />
    </div>
    <div class="space-y-1.5">
      <label :for="urlId" class="text-muted block text-xs font-medium">
        {{ t("dms.mockup.page_url") }}
      </label>
      <UInput
        :id="urlId"
        v-model="url"
        class="w-full font-mono"
        icon="i-ph-link"
        data-dms-mockup-page-url
        @keydown.enter.prevent="commitUrl"
        @blur="commitUrl"
      />
      <p v-if="isUrlRefused" class="text-error text-xs">
        {{ t("dms.mockup.page_url_invalid") }}
      </p>
    </div>
  </div>
</template>
