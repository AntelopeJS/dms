<script setup lang="ts">
import type { ComponentInfo } from "#dms-core/app/types/page";
import type { ComponentOptionsData } from "#dms-core/app/types/component";
import { useControlError } from "../../../composables/form/useControlError";
import {
  type KeyValueRow,
  keyValueColumns,
  keyValueProblem,
  keyValueRows,
  keyValueObject,
} from "../../../build/composables/form/keyValueRows";
import DmsInputRepeater from "./InputRepeater.vue";

interface KeyValueColumn {
  type?: string;
  component: ComponentInfo<ComponentOptionsData>;
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
const model = defineModel<
  Record<string, KeyValueRow["value"]> | null | undefined
>();
const { t } = useI18n();
const { report } = useControlError();

const columns = computed(() => keyValueColumns(props, t));

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
  <DmsInputRepeater
    :id="props.id"
    :model-value="rows"
    :columns="columns"
    :add-label="props.addLabel"
    :disabled="props.disabled"
    @update:model-value="onRows($event)"
  />
</template>
