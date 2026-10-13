<script setup lang="ts">
import { computed, reactive } from "vue";
import DmsFieldRow from "#dms-ui/app/components/field-row/FieldRow.vue";
import DmsFormRequiredLegend from "#dms-ui/app/components/form/FormRequiredLegend.vue";

/**
 * A form built by hand in a module's component, outside the DMS `Form`:
 * `DmsFieldRow` marks its required rows, and `DmsFormRequiredLegend` explains
 * the asterisk once at least one row is required, as `Form` does on its own.
 */

interface ContactRow {
  id: string;
  label: string;
  required: boolean;
}

const ROWS: ContactRow[] = [
  { id: "contact-name", label: "Contact name", required: true },
  { id: "contact-email", label: "Email", required: true },
  { id: "contact-phone", label: "Phone", required: false },
];

const values = reactive<Record<string, string>>({});
const hasRequiredFields = computed(() => ROWS.some((row) => row.required));
</script>

<template>
  <section class="dms-card grid gap-2 p-5">
    <h3 class="text-highlighted text-sm font-semibold">Hand-built form</h3>
    <p class="text-muted text-xs">
      DmsFieldRow required · DmsFormRequiredLegend under the rows
    </p>
    <div class="grid">
      <DmsFieldRow
        v-for="row in ROWS"
        :key="row.id"
        :label="row.label"
        :label-for="row.id"
        :required="row.required"
        layout="form"
        :inset="false"
      >
        <UInput :id="row.id" v-model="values[row.id]" class="w-full" />
      </DmsFieldRow>
    </div>
    <DmsFormRequiredLegend v-if="hasRequiredFields" class="mt-4" />
  </section>
</template>
