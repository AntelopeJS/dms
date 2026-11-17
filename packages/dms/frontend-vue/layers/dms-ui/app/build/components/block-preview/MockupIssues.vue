<script setup lang="ts">
import type { MockupIssue } from "../../utils/mockup";

/** The problems in a spec: where in the file, and what is wrong there. */
defineProps<{ issues: readonly MockupIssue[] }>();

const { t } = useI18n();
</script>

<template>
  <section class="space-y-2" data-dms-mockup-issues>
    <h2 class="text-highlighted text-sm font-semibold">
      {{ t("dms.mockup.issues", { count: issues.length }) }}
    </h2>
    <p v-if="!issues.length" class="text-muted text-sm">
      {{ t("dms.mockup.issues_none") }}
    </p>
    <ul v-else class="space-y-2">
      <li
        v-for="(issue, index) in issues"
        :key="`${issue.path}:${index}`"
        class="text-sm"
        data-dms-mockup-issue
      >
        <code class="text-muted block text-xs break-all">
          {{ issue.path || "/" }}
        </code>
        {{ issue.message }}
      </li>
    </ul>
  </section>
</template>
