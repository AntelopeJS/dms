<script setup lang="ts">
import { useControlError } from "../../../build/composables/form/useControlError";
import {
  type KeyValueRow,
  keyValueProblem,
  keyValueRows,
  keyValueObject,
} from "../../../build/composables/form/keyValueRows";
import DmsRepeater from "./Repeater.vue";

interface KeyValueColumn {
  type?: string;
  component: ComponentInfo;
}

interface KeyValueProps {
  id?: string;
  value: KeyValueColumn;
  toggleable?: boolean;
  addLabel?: string;
  keyLabel?: string;
  valueLabel?: string;
  disabled?: boolean;
}

const props = defineProps<KeyValueProps>();
const model = defineModel<Record<string, unknown> | null | undefined>();
const { t } = useI18n();
const { report } = useControlError();

const KEY_COMPONENT = { componentName: "dms-input-text" };
const TOGGLE_COMPONENT = { componentName: "dms-checkbox" };

const columns = computed(() => [
  ...(props.toggleable
    ? [{ id: "enabled", type: "boolean", component: TOGGLE_COMPONENT }]
    : []),
  {
    id: "key",
    label: props.keyLabel || t("dms.form.key_value.key"),
    type: "string",
    component: KEY_COMPONENT,
  },
  {
    id: "value",
    label: props.valueLabel || t("dms.form.key_value.value"),
    type: props.value.type,
    component: props.value.component,
  },
]);

// The rows are the editor's own: an object cannot hold a row still without
// a name, nor two rows of one name while the user fixes it. The object the
// field holds follows them, and they follow the object when it changes from
// elsewhere (loaded, reset).
const rows = ref<KeyValueRow[]>(keyValueRows(model.value, props.toggleable));
let emitted = JSON.stringify(model.value ?? {});

watch(model, (value) => {
  if (JSON.stringify(value ?? {}) === emitted) return;
  rows.value = keyValueRows(value, props.toggleable);
  emitted = JSON.stringify(value ?? {});
});

function onRows(next: KeyValueRow[] | null | undefined): void {
  rows.value = next ?? [];
  const problem = keyValueProblem(rows.value);
  report(problem);
  if (problem) return;
  const value = keyValueObject(rows.value, props.toggleable);
  emitted = JSON.stringify(value);
  model.value = value;
}
</script>

<template>
  <DmsRepeater
    :id="props.id"
    :model-value="rows"
    :columns="columns"
    :add-label="props.addLabel"
    :disabled="props.disabled"
    @update:model-value="onRows($event as KeyValueRow[] | null | undefined)"
  />
</template>
