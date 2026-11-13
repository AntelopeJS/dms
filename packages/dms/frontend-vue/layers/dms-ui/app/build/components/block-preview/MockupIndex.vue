<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  MOCKUP_LIST_ENDPOINT,
  parseMockupList,
  type MockupSummary,
} from "../../utils/mockup";

/** The mockups the dev backend holds, each a link to its viewer. */
const props = defineProps<{ basePath: string }>();

const { t } = useI18n();
const { $authFetch } = useAuthFetch();

const mockups = ref<MockupSummary[]>([]);
const isLoaded = ref(false);
const hasFailed = ref(false);

function viewerLink(name: string): string {
  return `${props.basePath}?name=${encodeURIComponent(name)}`;
}

onMounted(async () => {
  try {
    const answer = await $authFetch(MOCKUP_LIST_ENDPOINT);
    const list = parseMockupList(answer);
    hasFailed.value = list === undefined;
    mockups.value = list ?? [];
  } catch {
    hasFailed.value = true;
  }
  isLoaded.value = true;
});
</script>

<template>
  <section class="space-y-3" data-dms-mockup-index>
    <h1 class="text-highlighted text-base font-semibold">
      {{ t("dms.mockup.list_title") }}
    </h1>
    <UAlert
      v-if="hasFailed"
      color="error"
      variant="subtle"
      icon="i-ph-warning-circle"
      :title="t('dms.mockup.list_failed')"
    />
    <p v-else-if="isLoaded && !mockups.length" class="text-muted text-sm">
      {{ t("dms.mockup.list_empty") }}
    </p>
    <ul class="space-y-1">
      <li v-for="mockup in mockups" :key="mockup.name">
        <a
          class="text-primary text-sm hover:underline"
          :href="viewerLink(mockup.name)"
          data-dms-mockup-link
        >
          {{ mockup.title || mockup.name }}
        </a>
        <span class="text-muted ml-2 text-xs">
          {{ t("dms.mockup.pages_count", { count: mockup.pages }) }}
        </span>
      </li>
    </ul>
  </section>
</template>
