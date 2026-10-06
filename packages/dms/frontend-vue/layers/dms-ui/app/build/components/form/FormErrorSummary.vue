<script setup lang="ts">
/** An invalid field the summary links to. */
export interface FormErrorSummaryItem {
  /** The field id. */
  id: string;
  label: string;
  /** Title of the section holding it, when the form has sections. */
  section?: string;
}

interface FormErrorSummaryProps {
  items: FormErrorSummaryItem[];
}

const props = defineProps<FormErrorSummaryProps>();
const emit = defineEmits<{ select: [fieldId: string] }>();
const { t } = useI18n();
</script>

<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-ph-warning-circle"
    role="alert"
    :title="
      t(
        'dms.form.error_summary.title',
        { count: props.items.length },
        props.items.length,
      )
    "
  >
    <template #description>
      <ul class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <li v-for="item in props.items" :key="item.id">
          <a
            :href="`#${item.id}`"
            class="underline decoration-current/40 underline-offset-2 hover:decoration-current"
            @click.prevent="emit('select', item.id)"
          >
            {{ item.label }}
          </a>
          <span v-if="item.section" class="opacity-70">
            · {{ item.section }}
          </span>
        </li>
      </ul>
    </template>
  </UAlert>
</template>
