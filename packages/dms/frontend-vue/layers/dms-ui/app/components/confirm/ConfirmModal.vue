<script setup lang="ts">
import { nextTick, useTemplateRef, watch, type FunctionalComponent } from "vue";
import { DialogDescription, DialogTitle } from "reka-ui";
import DmsIconWell from "../icon-well/IconWell.vue";
import {
  ConfirmActionError,
  type ConfirmBodyRender,
  type ConfirmColor,
  type ConfirmInitialFocus,
  type ConfirmImpact,
  type ConfirmNotice,
  type ConfirmPartialOutcome,
  ConfirmTextError,
  type ConfirmValues,
} from "../../composables/confirm/types";
import { resolveActionError } from "../../composables/confirm/actionError";
import type { ConfirmDialogField } from "#dms-core/app/types/confirm-dialog";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";

interface ConfirmModalProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * The button focused on open; left out, the dialog's first focusable
   * element (its close button) as before.
   */
  initialFocus?: ConfirmInitialFocus;
  color?: ConfirmColor;
  /** Leading icon of the confirm button. */
  confirmIcon?: string;
  /** Acknowledge-only: no confirm button, cancel closes (resolves `false`). */
  blocked?: boolean;
  /** Header icon; defaults per colour, `false` gives the minimal layout. */
  icon?: string | false;
  /** Dependents listed above the actions ("Orders 48, Invoices 12…"). */
  impact?: ConfirmImpact[];
  /** Extra body content as a render function (see the `body` slot). */
  body?: ConfirmBodyRender;
  /**
   * Text the user must type (exactly, trimmed): confirming with the field
   * empty or different flags it under the field instead.
   */
  confirmText?: string;
  /**
   * Fields filled in before confirming (labels resolved); their values reach
   * `onConfirm`, and a field error it rejects with shows under its field.
   */
  fields?: ConfirmDialogField[];
  /** A component drawn in the body, bound to the fields' values. */
  component?: ComponentInfo;
  /** Checks the body fields first; `false` keeps the modal open. */
  validate?: () => boolean | Promise<boolean>;
  /**
   * Awaited on confirm: the modal stays open, loading, until it settles.
   * A rejection is shown in an error alert, the modal open for a retry;
   * resolving `false` keeps it open (the handler reported the problem);
   * a partial outcome turns it into an acknowledgement of what went through.
   */
  onConfirm?: (
    values: ConfirmValues,
  ) => Promise<void | boolean | ConfirmPartialOutcome>;
}

interface ConfirmModalSlots {
  /** Extra content under the impact list (a select, a note…). */
  body?: () => unknown;
}

interface ConfirmModalEmits {
  (e: "close", value: boolean): void;
}

const props = withDefaults(defineProps<ConfirmModalProps>(), {
  description: "",
  confirmLabel: undefined,
  cancelLabel: undefined,
  initialFocus: undefined,
  color: "primary",
  confirmIcon: undefined,
  blocked: false,
  icon: undefined,
  impact: () => [],
  body: undefined,
  confirmText: undefined,
  fields: () => [],
  component: undefined,
  validate: undefined,
  onConfirm: undefined,
});

const emit = defineEmits<ConfirmModalEmits>();
const slots = defineSlots<ConfirmModalSlots>();
const { t } = useI18n();

// Renders the `body` option of useConfirm(); its own render effect keeps it
// reactive to the caller's refs.
const BodyRender: FunctionalComponent = () => props.body?.();

const DEFAULT_ICONS: Partial<Record<ConfirmColor, string>> = {
  primary: "i-ph-rocket-launch",
  error: "i-ph-trash",
  warning: "i-ph-archive",
};
const FALLBACK_ICON = "i-ph-question";

const { processApiMessage } = useTranslation();

// What the dialog's fields hold, sent with the confirmed action.
const values = ref<ConfirmValues>(
  Object.fromEntries(
    props.fields.map((field) => [field.id, field.defaultValue]),
  ),
);
// Refusals shown under their field: required ones on confirm, the server's
// field errors once the action ran.
const fieldErrors = ref<Record<string, string | undefined>>({});
watch(
  values,
  () => {
    fieldErrors.value = {};
  },
  { deep: true },
);

const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/** Flags the required fields left empty. */
function checkRequiredFields(): boolean {
  const missing = props.fields.filter(
    (field) => field.required && isEmptyValue(values.value[field.id]),
  );
  fieldErrors.value = Object.fromEntries(
    missing.map((field) => [field.id, t("dms.field_errors.required")]),
  );
  return missing.length === 0;
}

const resolveComponentRef = (component: ComponentInfo | undefined) => {
  const name = component?.componentName;
  return name ? resolveDmsComponent(name) || name : undefined;
};

const bodyComponent = computed(() => resolveComponentRef(props.component));

const isOpen = ref(true);
const typedText = ref("");
const isPending = ref(false);
// The failure (or partial outcome) of the last confirm, above the buttons.
const notice = ref<ConfirmNotice & { tone: "error" | "warning" }>();
// The action went part of the way: nothing left to confirm, closing it
// acknowledges what was done.
const isSettled = ref(false);
// The typed text is missing or wrong (checked on confirm), or the server
// refused it: shown under the typed field.
const typedError = ref<string>();
const typedInput = useTemplateRef<{ inputRef?: HTMLInputElement }>(
  "typedInput",
);

watch(typedText, () => {
  typedError.value = undefined;
});

const headerIcon = computed(() =>
  props.icon === false
    ? undefined
    : (props.icon ?? DEFAULT_ICONS[props.color] ?? FALLBACK_ICON),
);

const hasBody = computed(
  () =>
    props.impact.length > 0 ||
    !!props.body ||
    !!slots.body ||
    props.fields.length > 0 ||
    !!props.component ||
    !!props.confirmText ||
    !!notice.value,
);

// Without a body the header carries the bottom spacing above the footer.
const modalUi = computed(() => ({
  content: "sm:max-w-[420px]",
  header: hasBody.value ? "" : "pb-5",
}));

// Focus a footer button on open instead of the first focusable element.
const modalContent = computed(() =>
  props.initialFocus
    ? {
        onOpenAutoFocus: (event: Event) => {
          const button = (
            event.target as HTMLElement | null
          )?.querySelector<HTMLElement>(
            `[data-confirm-action="${props.initialFocus}"]`,
          );
          if (!button) return;
          event.preventDefault();
          button.focus();
        },
      }
    : undefined,
);

const isTypedMatch = computed(
  () => !props.confirmText || typedText.value.trim() === props.confirmText,
);

function close(value: boolean) {
  isOpen.value = false;
  emit("close", value);
}

const isPartialOutcome = (value: unknown): value is ConfirmPartialOutcome =>
  typeof value === "object" && value !== null && "partial" in value;

// Worded for users: the server's message when it is meant for them, else a
// translated fallback (never an ofetch line, JSON or a stack trace).
function errorNotice(error: unknown): ConfirmNotice {
  if (error instanceof ConfirmActionError) {
    return { title: error.message, description: error.description };
  }
  return { title: resolveActionError(error, t) };
}

/**
 * Shows under their field the field errors the server answered with; true
 * when nothing else is left to tell in the alert.
 */
function showFieldErrors(error: unknown): boolean {
  if (props.fields.length === 0) return false;
  const resolved = resolveFieldErrors(error, {
    fields: props.fields.map((field) => field.id),
  });
  if (resolved.fields.length === 0) return false;
  fieldErrors.value = Object.fromEntries(
    resolved.fields.map(({ field, message }) => [
      field,
      processApiMessage(message),
    ]),
  );
  return !resolved.hasUnmatched;
}

async function runConfirm(
  action: (
    values: ConfirmValues,
  ) => Promise<void | boolean | ConfirmPartialOutcome>,
) {
  isPending.value = true;
  notice.value = undefined;
  typedError.value = undefined;
  try {
    const result = await action({ ...values.value });
    if (isPartialOutcome(result)) {
      notice.value = { ...result.partial, tone: "warning" };
      isSettled.value = true;
    } else if (result !== false) {
      close(true);
    }
  } catch (error) {
    if (error instanceof ConfirmTextError && props.confirmText) {
      typedError.value = error.message;
    } else if (!showFieldErrors(error)) {
      notice.value = { ...errorNotice(error), tone: "error" };
    }
  } finally {
    isPending.value = false;
  }
  // The field is disabled while pending: focus it once enabled again.
  if (typedError.value) {
    await nextTick();
    typedInput.value?.inputRef?.focus();
  }
}

/** Flags the typed field when it is empty or does not match. */
function checkTypedText(): boolean {
  if (!props.confirmText) return true;
  if (!typedText.value.trim()) {
    typedError.value = t("dms.field_errors.required");
  } else if (!isTypedMatch.value) {
    typedError.value = t("dms.confirm.type_mismatch", {
      text: props.confirmText,
    });
  }
  return !typedError.value;
}

async function handleConfirm() {
  if (props.blocked || isSettled.value || isPending.value) return;
  // Every field is checked at once; the body ones come first on the page,
  // so the typed field takes the focus only when they passed.
  const areFieldsValid = checkRequiredFields();
  const isBodyValid =
    (props.validate ? await props.validate() : true) && areFieldsValid;
  const isTypedValid = checkTypedText();
  if (!isTypedValid && isBodyValid) typedInput.value?.inputRef?.focus();
  if (!isBodyValid || !isTypedValid) return;
  if (props.onConfirm) return runConfirm(props.onConfirm);
  close(true);
}

function handleCancel() {
  if (isPending.value) return;
  close(isSettled.value);
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="props.title"
    :description="props.description"
    :dismissible="!isPending"
    :ui="modalUi"
    :content="modalContent"
    @update:open="(open: boolean) => !open && handleCancel()"
  >
    <template #header>
      <DmsIconWell v-if="headerIcon" :icon="headerIcon" :tone="props.color" />
      <div class="min-w-0 flex-1">
        <DialogTitle
          class="text-highlighted text-[17px] leading-[1.3] font-[650] tracking-[-0.02em]"
        >
          {{ props.title }}
        </DialogTitle>
        <DialogDescription class="text-muted mt-1 text-[13px]">
          {{ props.description }}
        </DialogDescription>
      </div>
      <UButton
        icon="i-ph-x"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :disabled="isPending"
        :aria-label="$t('dms.confirm.cancel')"
        @click="handleCancel"
      />
    </template>

    <template v-if="hasBody" #body>
      <div class="flex flex-col gap-3.5" :class="headerIcon && 'sm:ps-12'">
        <ul
          v-if="impact.length"
          class="border-default divide-default divide-y overflow-hidden rounded-md border bg-(--dms-bg-muted)"
        >
          <li
            v-for="entry in impact"
            :key="entry.label"
            class="flex items-center gap-2.5 px-3 py-2 text-[13px]"
          >
            <UIcon
              :name="entry.icon"
              class="text-dimmed size-4 shrink-0"
              :aria-hidden="true"
            />
            <span class="text-default">{{ entry.label }}</span>
            <span
              v-if="entry.count !== undefined"
              class="text-highlighted ms-auto font-mono text-xs font-semibold"
            >
              {{ entry.count }}
            </span>
          </li>
        </ul>

        <UFormField
          v-for="field in props.fields"
          :key="field.id"
          :label="field.label"
          :description="field.description"
          :required="field.required"
          :error="fieldErrors[field.id]"
          :data-confirm-field="field.id"
        >
          <component
            :is="resolveComponentRef(field.component)"
            :id="`confirm-field-${field.id}`"
            v-model="values[field.id]"
            v-bind="field.component.options ?? {}"
            :disabled="field.disabled || isPending"
            class="w-full"
          />
          <template #error="{ error }">
            <template v-if="error">
              <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
              {{ error }}
            </template>
          </template>
        </UFormField>

        <component
          :is="bodyComponent"
          v-if="bodyComponent"
          v-model:values="values"
          v-bind="props.component?.options ?? {}"
        />

        <BodyRender v-if="props.body" />
        <slot name="body" />

        <UFormField v-if="confirmText" :error="typedError">
          <template #label>
            <i18n-t keypath="dms.confirm.type_to_confirm" tag="span">
              <template #text>
                <span class="text-highlighted font-mono font-semibold">
                  {{ confirmText }}
                </span>
              </template>
            </i18n-t>
          </template>
          <UInput
            ref="typedInput"
            v-model="typedText"
            class="w-full font-mono"
            autocomplete="off"
            :disabled="isPending"
            :trailing-icon="isTypedMatch ? 'i-ph-check-circle' : undefined"
            :ui="{ trailingIcon: 'text-success' }"
            @keydown.enter="handleConfirm"
          />
          <template #error="{ error }">
            <template v-if="error">
              <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
              {{ error }}
            </template>
          </template>
        </UFormField>

        <!-- What went wrong (or the partial summary), then its reason. -->
        <UAlert
          v-if="notice"
          role="alert"
          :color="notice.tone"
          variant="subtle"
          :icon="
            notice.tone === 'error' ? 'i-ph-warning-circle' : 'i-ph-warning'
          "
          :title="notice.title"
          :description="notice.description"
          data-confirm-notice
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <span
          class="text-dimmed me-auto hidden items-center gap-1.5 text-xs sm:flex"
        >
          <UKbd value="Esc" size="sm" />
          {{
            $t(
              isSettled ? "dms.confirm.esc_close_hint" : "dms.confirm.esc_hint",
            )
          }}
        </span>
        <UButton
          :label="
            isSettled
              ? $t('dms.confirm.close')
              : props.cancelLabel || $t('dms.confirm.cancel')
          "
          variant="outline"
          color="neutral"
          :disabled="isPending"
          data-confirm-action="cancel"
          @click="handleCancel"
        />
        <UButton
          v-if="!props.blocked && !isSettled"
          :label="props.confirmLabel || $t('dms.confirm.confirm')"
          :icon="props.confirmIcon"
          :color="props.color"
          :loading="isPending"
          data-confirm-action="confirm"
          @click="handleConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
