<script setup lang="ts">
import { computed } from "vue";
import type {
  MockupAnnotation,
  MockupAnnotationStatus,
} from "../../utils/mockup";

/** The notes left on a mockup, open ones first, each resolvable and reopenable. */
const props = defineProps<{ annotations: readonly MockupAnnotation[] }>();

const emit = defineEmits<{
  status: [id: string, status: MockupAnnotationStatus];
}>();

const { t } = useI18n();

interface AnnotationGroup {
  status: MockupAnnotationStatus;
  /** The status the group's button moves a note to, and its label. */
  action: MockupAnnotationStatus;
  actionLabel: string;
}

const GROUPS: readonly AnnotationGroup[] = [
  { status: "open", action: "resolved", actionLabel: "dms.mockup.resolve" },
  { status: "resolved", action: "open", actionLabel: "dms.mockup.reopen" },
];

const groups = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    entries: props.annotations.filter((entry) => entry.status === group.status),
  })),
);
</script>

<template>
  <section class="space-y-3" data-dms-mockup-annotations>
    <h2 class="text-highlighted text-sm font-semibold">
      {{ t("dms.mockup.annotations") }}
    </h2>
    <p v-if="!annotations.length" class="text-muted text-sm">
      {{ t("dms.mockup.annotations_empty") }}
    </p>
    <template v-for="group in groups" :key="group.status">
      <div v-if="group.entries.length" class="space-y-2">
        <h3 class="text-muted text-xs font-medium uppercase">
          {{ t(`dms.mockup.status_${group.status}`) }} ({{
            group.entries.length
          }})
        </h3>
        <ul class="space-y-2">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="border-default space-y-1 rounded-md border p-2 text-sm"
            :data-dms-mockup-annotation="entry.status"
          >
            <code class="text-muted block text-xs break-all">
              {{ entry.page }} {{ entry.path }}
            </code>
            <p class="whitespace-pre-wrap">{{ entry.text }}</p>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              @click="emit('status', entry.id, group.action)"
            >
              {{ t(group.actionLabel) }}
            </UButton>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
