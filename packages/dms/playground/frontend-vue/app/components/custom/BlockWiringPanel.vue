<script setup lang="ts">
/**
 * A custom block wired to the blocks around it. It follows the form declared
 * next to it (`siblingComponentId` + its `FIELD_CHANGE` events), names the
 * page's record after the typed title (`usePageRecordLabel`, read by the
 * breadcrumb), scrolls to a block by its key (`scrollToBlock`) and asks every
 * data block of the page to read again (`refreshPageBlocks`).
 */
interface BlockWiringPanelProps {
  componentId: string;
}

interface FieldChangeData {
  formValues?: Record<string, unknown>;
}

interface FieldChangeDetail {
  component?: string;
  data?: FieldChangeData;
}

const FORM_KEY = "form";
const READS_KEY = "reads";
const MISSING_KEY = "nowhere";
const TITLE_FIELD = "title";

const props = defineProps<BlockWiringPanelProps>();
const formId = siblingComponentId(props.componentId, FORM_KEY);
const route = useDmsRoute();
const { label, setLabel } = usePageRecordLabel();
const toast = useToast();
const formValues = ref<Record<string, unknown>>({});

function onFieldChange(event: Event): void {
  const detail = (event as CustomEvent<FieldChangeDetail>).detail;
  if (detail?.component !== formId) return;
  formValues.value = detail.data?.formValues ?? {};
  const title = formValues.value[TITLE_FIELD];
  setLabel(route.path, typeof title === "string" ? title : undefined);
}

function jumpTo(key: string): void {
  if (scrollToBlock(key, { behavior: "smooth", block: "start" })) return;
  toast.add({ title: `No block "${key}" on screen`, color: "warning" });
}

onMounted(() =>
  window.addEventListener(FormEvents.FIELD_CHANGE, onFieldChange),
);
onBeforeUnmount(() => {
  window.removeEventListener(FormEvents.FIELD_CHANGE, onFieldChange);
  setLabel(route.path, undefined);
});

const wiringItems = computed(() => [
  {
    label: "This block's componentId",
    value: props.componentId,
    type: "mono" as const,
  },
  {
    label: "siblingComponentId(componentId, 'form')",
    value: formId,
    type: "mono" as const,
  },
  {
    label: "Record label (breadcrumb)",
    value: label.value ?? "Not set",
    type: "mono" as const,
  },
  {
    label: "Last values from the form",
    value: JSON.stringify(formValues.value),
    type: "mono" as const,
  },
]);
</script>

<template>
  <DmsCard title="Wired custom block">
    <div class="grid gap-4">
      <DmsKeyValueList :items="wiringItems" dense />
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Jump to the form"
          icon="i-ph-arrow-down"
          size="sm"
          @click="jumpTo(FORM_KEY)"
        />
        <UButton
          label="Jump to a missing block"
          icon="i-ph-question"
          color="neutral"
          variant="outline"
          size="sm"
          @click="jumpTo(MISSING_KEY)"
        />
        <UButton
          label="Refresh the page's blocks"
          icon="i-ph-arrows-clockwise"
          color="neutral"
          variant="outline"
          size="sm"
          @click="refreshPageBlocks()"
        />
        <UButton
          label="Jump to the figures"
          icon="i-ph-chart-bar"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="jumpTo(READS_KEY)"
        />
      </div>
    </div>
  </DmsCard>
</template>
