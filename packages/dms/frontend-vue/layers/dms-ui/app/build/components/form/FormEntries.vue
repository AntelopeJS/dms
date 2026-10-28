<script setup lang="ts">
import type {
  FieldGroup,
  FormFieldOrGroup,
} from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";
import { FORM_ENTRY_CONTEXT_KEY } from "../../composables/form/formEntryContext";
import {
  GROUP_FIELDS_CLASSES,
  entryFields,
  entryRowLayout,
  GROUP_MEMBER_CLASSES,
} from "../../composables/form/formLayout";
import { combineSaveStates } from "#dms-ui/app/composables/layout/useInstantSaveHeader";
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
const { processI18n } = useTranslation();

const classes = computed(() => context.layoutClasses(props.inSection));

/** The row's layout: a wide field takes the full width under its label. */
function rowOf(entry: FormFieldOrGroup) {
  return entryRowLayout(classes.value.row, entryFields(entry));
}

function groupFieldsClass(group: FieldGroup): string {
  return GROUP_FIELDS_CLASSES[
    group.orientation === "vertical" ? "vertical" : "horizontal"
  ];
}

function isGroupVisible(group: FieldGroup): boolean {
  return group.fields.some((field) => !context.isFieldHidden(field));
}

function descriptionOf(entry: FormFieldOrGroup): string | undefined {
  return context.isReadOnly.value ? undefined : entry.description;
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
          v-bind="rowOf(entry)"
          :label="entry.label || ''"
          :description="descriptionOf(entry)"
          :required="isGroupRequired(entry)"
        >
          <template v-if="saveStateOf(entry) !== 'idle'" #details>
            <DmsSaveStatus
              :state="saveStateOf(entry)"
              @retry="context.retrySave()"
            />
          </template>
          <div :class="groupFieldsClass(entry)">
            <!-- The group's label heads the cluster; each member keeps its
                 own above its control, so a group can title a run of
                 labelled fields. -->
            <template v-for="field in entry.fields" :key="field.id">
              <div
                v-if="
                  field.component.componentName && !context.isFieldHidden(field)
                "
                :class="GROUP_MEMBER_CLASSES.root"
              >
                <label
                  v-if="field.label"
                  :for="field.id"
                  :class="GROUP_MEMBER_CLASSES.label"
                >
                  {{ processI18n(field.label) }}
                  <span
                    v-if="context.isFieldRequired(field)"
                    class="text-error"
                    aria-hidden="true"
                  >
                    *
                  </span>
                </label>
                <DmsFormFieldControl :field class="min-w-0" />
              </div>
            </template>
          </div>
        </DmsFieldRow>
      </template>

      <DmsFieldRow
        v-else-if="!context.isFieldHidden(entry)"
        v-bind="rowOf(entry)"
        :label="entry.label || ''"
        :label-for="entry.id"
        :description="descriptionOf(entry)"
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
