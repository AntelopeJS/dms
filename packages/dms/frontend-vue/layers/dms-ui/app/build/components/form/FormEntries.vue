<script setup lang="ts">
import type {
  FieldGroup,
  FormFieldOrGroup,
} from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";
import { FORM_ENTRY_CONTEXT_KEY } from "../../composables/form/formEntryContext";
import { GROUP_FIELDS_CLASSES } from "../../composables/form/formLayout";
import { combineSaveStates } from "../../composables/instant-save/useInstantSave";
import type { SaveStatusState } from "../../../components/save-bar/SaveStatus.vue";
import DmsFormFieldControl from "./FormFieldControl.vue";
import DmsFieldRow from "../../../components/field-row/FieldRow.vue";

interface FormEntriesProps {
  entries: FormFieldOrGroup[];
  /** Rows of a section card: the card's inset, hairlines edge to edge. */
  inSection?: boolean;
}

const props = defineProps<FormEntriesProps>();
const context = inject(FORM_ENTRY_CONTEXT_KEY)!;

const classes = computed(() => context.layoutClasses(props.inSection));

function groupFieldsClass(group: FieldGroup): string {
  return GROUP_FIELDS_CLASSES[
    group.orientation === "vertical" ? "vertical" : "horizontal"
  ];
}

function isGroupVisible(group: FieldGroup): boolean {
  return group.fields.some((field) => !context.isFieldHidden(field));
}

function isGroupRequired(group: FieldGroup): boolean {
  return group.fields.some(context.isFieldRequired);
}

/** The instant-save state a row shows: its field's, or its group's. */
function saveStateOf(entry: FormFieldOrGroup): SaveStatusState {
  if (!isFieldGroup(entry)) return context.fieldSaveState(entry.id);
  return combineSaveStates(
    entry.fields.map((field) => context.fieldSaveState(field.id)),
  );
}
</script>

<template>
  <div :class="classes.rows">
    <template v-for="entry in props.entries" :key="entry.id">
      <template v-if="isFieldGroup(entry)">
        <DmsFieldRow
          v-if="isGroupVisible(entry)"
          v-bind="classes.row"
          :label="entry.label || ''"
          :description="entry.description"
          :required="isGroupRequired(entry)"
        >
          <template v-if="saveStateOf(entry) !== 'idle'" #details>
            <DmsSaveStatus
              :state="saveStateOf(entry)"
              @retry="context.retrySave()"
            />
          </template>
          <div :class="groupFieldsClass(entry)">
            <template v-for="field in entry.fields" :key="field.id">
              <DmsFormFieldControl
                v-if="
                  field.component.componentName && !context.isFieldHidden(field)
                "
                :field
                class="min-w-0 flex-1"
              />
            </template>
          </div>
        </DmsFieldRow>
      </template>

      <DmsFieldRow
        v-else-if="!context.isFieldHidden(entry)"
        v-bind="classes.row"
        :label="entry.label || ''"
        :label-for="entry.id"
        :description="entry.description"
        :required="context.isFieldRequired(entry)"
      >
        <template v-if="saveStateOf(entry) !== 'idle'" #details>
          <DmsSaveStatus
            :state="saveStateOf(entry)"
            @retry="context.retrySave()"
          />
        </template>
        <DmsFormFieldControl
          v-if="entry.component.componentName"
          :field="entry"
          class="min-w-0"
        />
      </DmsFieldRow>
    </template>
  </div>
</template>
