import { computed, type Ref } from "vue";
import type { FormProps } from "../../../composables/form/types/props";
import { isFieldGroup } from "../../../composables/form/types/field";
import type { useForm } from "../../../composables/form/useForm";
import {
  entryFieldIds,
  invalidFieldIds,
  layoutSections,
  resolveSectionNav,
  sectionState,
  type FormErrorRef,
  type FormSectionState,
} from "./formSections";

interface FormSectionsSource {
  props: FormProps;
  hasSections: boolean;
  fields: ReturnType<typeof useForm>["fields"];
  allFieldIds: Ref<string[]>;
  errors: () => readonly FormErrorRef[];
  changedFields: Ref<ReturnType<typeof useForm>["allFields"]["value"]>;
  isInstant: boolean;
  showsErrorSummary: Ref<boolean>;
  usesSaveBar: boolean;
  processI18n: (value: string) => string;
}

/** Section layout, navigation badges and field labels shown by Form.vue. */
export function formComponentSections(source: FormSectionsSource) {
  const sectionsLayout = computed(() =>
    source.hasSections
      ? layoutSections(source.fields.value, source.props.sections ?? [])
      : undefined,
  );
  const sectionNav = resolveSectionNav(
    source.props.sectionNav,
    source.props.sections?.length ?? 0,
  );
  const invalidFields = computed<ReadonlySet<string>>(
    () => new Set(invalidFieldIds(source.errors(), source.allFieldIds.value)),
  );
  const changedFieldIds = computed(
    () =>
      new Set(
        source.isInstant
          ? []
          : source.changedFields.value.map((field) => field.id),
      ),
  );
  const sectionStates = computed<Record<string, FormSectionState>>(() =>
    Object.fromEntries(
      (sectionsLayout.value?.sections ?? []).map((section) => [
        section.id,
        sectionState(section, changedFieldIds.value, invalidFields.value),
      ]),
    ),
  );
  const fieldLabels = computed(() => {
    const labels = new Map<string, string>();
    for (const entry of source.fields.value) {
      const fieldsOfEntry = isFieldGroup(entry) ? entry.fields : [entry];
      for (const field of fieldsOfEntry) {
        const label = field.label || entry.label || field.id;
        labels.set(field.id, source.processI18n(label));
      }
    }
    return labels;
  });
  const sectionOfField = computed(() => {
    const owners = new Map<string, string>();
    for (const section of sectionsLayout.value?.sections ?? []) {
      for (const id of section.fieldIds) owners.set(id, section.label);
    }
    return owners;
  });
  const errorSummaryItems = computed(() => {
    if (!source.showsErrorSummary.value) return [];
    const items = [...invalidFields.value].map((id) => {
      const section = sectionOfField.value.get(id);
      return {
        id,
        label: fieldLabels.value.get(id) ?? id,
        section: section ? source.processI18n(section) : undefined,
      };
    });
    return items.filter(
      (item, index) =>
        items.findIndex(
          (other) =>
            other.label === item.label && other.section === item.section,
        ) === index,
    );
  });
  const changedFieldLabels = computed<string[]>(() => {
    if (!source.usesSaveBar) return [];
    const layout = sectionsLayout.value;
    if (!layout)
      return source.changedFields.value.map((field) => field.label || field.id);
    const leadIds = new Set(layout.lead.flatMap(entryFieldIds));
    return [
      ...source.changedFields.value
        .filter((field) => leadIds.has(field.id))
        .map((field) => field.label || field.id),
      ...layout.sections
        .filter((section) => sectionStates.value[section.id]?.dirty)
        .map((section) => section.label),
    ];
  });
  return {
    sectionsLayout,
    sectionNav,
    changedFieldIds,
    sectionStates,
    errorSummaryItems,
    changedFieldLabels,
  };
}
