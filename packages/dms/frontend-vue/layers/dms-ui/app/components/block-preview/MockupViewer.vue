<script setup lang="ts">
import { onMounted, ref } from "vue";
import MockupIndex from "../../build/components/block-preview/MockupIndex.vue";
import MockupWorkbench from "../../build/components/block-preview/MockupWorkbench.vue";
import { fetchStatus } from "../../build/utils/fetchStatus";
import {
  isMockupDataMode,
  isMockupWidth,
  mockupAccessEndpoint,
  parseMockupAccess,
  readQueryValue,
  type MockupAccess,
} from "../../build/utils/mockup";

const HTTP_FORBIDDEN = 403;

/**
 * `/mockup`: the list of mockups without `?name=`, else the workbench of one,
 * once the backend has said who the viewer is to it: the owner, who edits,
 * or a reviewer, who comments. A refusal says the mockup cannot be opened.
 */
const route = useDmsRoute();
const { t } = useI18n();
const { $authFetch } = useAuthFetch();

const name = readQueryValue(route.query.name);
const width = readQueryValue(route.query.width);
const data = readQueryValue(route.query.data);

const access = ref<MockupAccess>();
const refusal = ref<"denied" | "failed">();

onMounted(async () => {
  if (!name) return;
  try {
    const answer: unknown = await $authFetch(mockupAccessEndpoint(name));
    const parsed = parseMockupAccess(answer);
    if (parsed) access.value = parsed;
    else refusal.value = "failed";
  } catch (error) {
    refusal.value = fetchStatus(error) === HTTP_FORBIDDEN ? "denied" : "failed";
  }
});
</script>

<template>
  <div data-dms-docks-side-panel>
    <template v-if="name">
      <MockupWorkbench
        v-if="access"
        :name="name"
        :access="access"
        :initial-width="isMockupWidth(width) ? width : undefined"
        :initial-data="isMockupDataMode(data) ? data : undefined"
      />
      <div v-else-if="refusal" class="p-4 sm:p-6">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-ph-warning-circle"
          :title="
            t(
              refusal === 'denied'
                ? 'dms.mockup.access_denied'
                : 'dms.mockup.access_failed',
            )
          "
          data-dms-mockup-access-refused
        />
      </div>
    </template>
    <div v-else class="p-4 sm:p-6">
      <MockupIndex :base-path="route.path" />
    </div>
  </div>
</template>
