<script setup lang="ts">
import type {
  FieldGroup,
  FormFieldOrGroup,
} from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";
import { FORM_ENTRY_CONTEXT_KEY } from "../../composables/form/formEntryContext";
import { GROUP_FIELDS_CLASSES } from "../../composables/form/formLayout";
import DmsFormFieldControl from "./FormFieldControl.vue";

interface FormEntriesProps {
  entries: FormFieldOrGroup[];
  /** Rows of a section card: the card's inset, hairlines edge to edge. */
  inSection?: boolean;
}

const props = defineProps<FormEntriesProps>();
const context = inject(FORM_ENTRY_CONTEXT_KEY)!;
const { processI18n } = useTranslation();

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
</script>

<template>
  <div :class="classes.rows">
    <template v-for="entry in props.entries" :key="entry.id">
      <template v-if="isFieldGroup(entry)">
        <section v-if="isGroupVisible(entry)" :class="classes.row">
          <div :class="classes.meta">
            <span class="text-highlighted text-[13px] font-[550]">
              {{ processI18n(entry.label || "") }}
              <span
                v-if="isGroupRequired(entry)"
                class="text-error ms-0.5"
                aria-hidden="true"
              >
                *
              </span>
            </span>
            <p v-if="entry.description" :class="classes.description">
              {{ processI18n(entry.description) }}
            </p>
          </div>

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
        </section>
      </template>

      <section v-else-if="!context.isFieldHidden(entry)" :class="classes.row">
        <div :class="classes.meta">
          <label
            :for="entry.id"
            class="text-highlighted text-[13px] font-[550]"
          >
            {{ processI18n(entry.label || "") }}
            <span
              v-if="context.isFieldRequired(entry)"
              class="text-error ms-0.5"
              aria-hidden="true"
            >
              *
            </span>
          </label>
          <p v-if="entry.description" :class="classes.description">
            {{ processI18n(entry.description) }}
          </p>
        </div>

        <DmsFormFieldControl
          v-if="entry.component.componentName"
          :field="entry"
          class="min-w-0"
        />
      </section>
    </template>
  </div>
</template>
