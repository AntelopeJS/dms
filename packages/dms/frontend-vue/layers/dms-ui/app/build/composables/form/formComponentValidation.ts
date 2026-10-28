import { computed, provide, reactive, toValue, watch } from "vue";
import type { ZodErrorMap } from "zod";
import {
  formIssueMessage,
  REQUIRED_MESSAGE,
} from "#dms-core/app/composables/useFormValidation";
import type { useTranslation } from "#dms-core/app/composables/translation/useTranslation";
import {
  isAcceptanceField,
  type useForm,
} from "../../../composables/form/useForm";
import type { FormField } from "../../../composables/form/types/field";
import { validateFormState } from "./formValidation";
import { FORM_CONTROL_ERRORS_KEY } from "./formControlErrors";
import type { KeptServerError } from "./serverFieldErrors";

interface FormValidationSource
  extends Pick<
    ReturnType<typeof useForm>,
    "validationSchema" | "allFields" | "state"
  > {
  isFieldRequired: (field: FormField) => boolean;
  processApiMessage: ReturnType<typeof useTranslation>["processApiMessage"];
  locale: () => string;
  locales: () => readonly { code: string }[];
  serverErrors: Map<string, KeptServerError>;
  clearError: (name: string) => void;
  validateControl: (fieldId: string) => void;
  revalidateChangedField: (field: FormField) => void;
}

/** Form.vue's localized schema and validation for controls with custom events. */
export function formComponentValidation(source: FormValidationSource) {
  const issueErrorMap: ZodErrorMap = (issue, context) => ({
    message: source.processApiMessage(formIssueMessage(issue, context.data)),
  });
  const localizedSchema = computed(() => {
    const schema = source.validationSchema.value;
    const validationFields = toValue(source.allFields).map((field) => ({
      id: field.id,
      type: field.type,
      localized: field.localized,
      fallbackLocale: field.fallbackLocale,
      required: source.isFieldRequired(field),
      acceptance: isAcceptanceField(field),
    }));
    return {
      "~standard": {
        version: 1 as const,
        vendor: "dms",
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Standard Schema accepts arbitrary inputs; the form validator retains its existing unchecked object adapter rather than rejecting or coercing malformed data.
        validate: (value: unknown) =>
          validateFormState(
            schema,
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Standard Schema accepts arbitrary inputs; this unchecked adapter forwards them to the object-state validator unchanged.
            value as Parameters<typeof validateFormState>[1],
            {
              fields: validationFields,
              requiredMessage: source.processApiMessage(REQUIRED_MESSAGE),
              locale: source.locale(),
              parseParams: { errorMap: issueErrorMap },
              controlErrors,
            },
          ),
      },
    };
  });
  const controlErrors = reactive(new Map<string, string>());
  provide(FORM_CONTROL_ERRORS_KEY, {
    report(fieldId, message) {
      if (message)
        controlErrors.set(fieldId, source.processApiMessage(message));
      else controlErrors.delete(fieldId);
      source.validateControl(fieldId);
    },
  });
  const fieldValueSnapshots = new Map<string, string>();
  watch(
    source.state,
    (current) => {
      for (const field of toValue(source.allFields)) {
        const snapshot = JSON.stringify(current[field.id]) ?? "";
        const previous = fieldValueSnapshots.get(field.id);
        fieldValueSnapshots.set(field.id, snapshot);
        if (previous === undefined || previous === snapshot) continue;
        source.revalidateChangedField(field);
      }
    },
    { deep: true, immediate: true },
  );
  function errorNames(field: FormField): string[] {
    if (!field.localized) return [field.id];
    return [
      field.id,
      ...source.locales().map((lang) => `${field.id}.${lang.code}`),
    ];
  }
  function clearServerErrors(): void {
    for (const name of source.serverErrors.keys()) source.clearError(name);
    source.serverErrors.clear();
  }
  return { localizedSchema, errorNames, clearServerErrors };
}

/** Clears validation when a field becomes disabled or hidden. */
export function watchFormComponentFieldFlags<
  T extends { clear: (name: string) => void },
>(
  fields: ReturnType<typeof useForm>["disabledFields"],
  target: () => T | null | undefined,
): void {
  watch(fields, (next, previous) => {
    if (!next || !target()) return;
    for (const fieldId of next) {
      if (!previous?.has(fieldId)) target()!.clear(fieldId);
    }
  });
}
