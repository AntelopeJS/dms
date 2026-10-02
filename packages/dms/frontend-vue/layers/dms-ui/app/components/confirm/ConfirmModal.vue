<script setup lang="ts">
import { nextTick, useTemplateRef, watch, type FunctionalComponent } from "vue";
import { DialogDescription, DialogTitle } from "reka-ui";
import DmsIconWell from "../icon-well/IconWell.vue";
import {
  type ConfirmBodyRender,
  type ConfirmColor,
  type ConfirmImpact,
  ConfirmTextError,
} from "../../composables/confirm/types";

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: ConfirmColor;
  /** Leading icon of the confirm button. */
  confirmIcon?: string;
  /** Acknowledge-only: no confirm button, cancel closes (resolves `false`). */
  hideConfirm?: boolean;
  /** Header icon; defaults per colour, `false` gives the minimal layout. */
  icon?: string | false;
  /** Dependents listed above the actions ("Orders 48, Invoices 12…"). */
  impact?: ConfirmImpact[];
  /** Extra body content as a render function (see the `body` slot). */
  body?: ConfirmBodyRender;
  /** Text the user must type (exactly, trimmed) before confirming. */
  confirmText?: string;
  /**
   * Awaited on confirm: the modal stays open, loading, until it settles.
   * Resolving `false` keeps it open (the handler reported the problem).
   */
  onConfirm?: () => Promise<void | boolean>;
}

interface ConfirmModalSlots {
  /** Extra content under the impact list (a select, a note…). */
  body?: () => unknown;
}

interface ConfirmModalEmits {
  (e: "close", value: boolean): void;
}

const props = withDefaults(defineProps<ConfirmModalProps>(), {
  confirmLabel: undefined,
  cancelLabel: undefined,
  confirmColor: "primary",
  confirmIcon: undefined,
  hideConfirm: false,
  icon: undefined,
  impact: () => [],
  body: undefined,
  confirmText: undefined,
  onConfirm: undefined,
});

const emit = defineEmits<ConfirmModalEmits>();
const slots = defineSlots<ConfirmModalSlots>();

// Renders the `body` option of useConfirm(); its own render effect keeps it
// reactive to the caller's refs.
const BodyRender: FunctionalComponent = () => props.body?.();

const DEFAULT_ICONS: Record<ConfirmColor, string> = {
  primary: "i-ph-rocket-launch",
  error: "i-ph-trash",
  warning: "i-ph-archive",
};

const isOpen = ref(true);
const typedText = ref("");
const isPending = ref(false);
const errorMessage = ref<string>();
// The server refused the typed text: shown under the typed field.
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
    : (props.icon ?? DEFAULT_ICONS[props.confirmColor]),
);

const hasBody = computed(
  () =>
    props.impact.length > 0 ||
    !!props.body ||
    !!slots.body ||
    !!props.confirmText ||
    !!errorMessage.value,
);

// Without a body the header carries the bottom spacing above the footer.
const modalUi = computed(() => ({
  content: "sm:max-w-[420px]",
  header: hasBody.value ? "" : "pb-5",
}));

const isTypedMatch = computed(
  () => !props.confirmText || typedText.value.trim() === props.confirmText,
);

function close(value: boolean) {
  isOpen.value = false;
  emit("close", value);
}

async function runConfirm(action: () => Promise<void | boolean>) {
  isPending.value = true;
  errorMessage.value = undefined;
  typedError.value = undefined;
  try {
    const result = await action();
    if (result !== false) close(true);
  } catch (error) {
    if (error instanceof ConfirmTextError && props.confirmText) {
      typedError.value = error.message;
    } else {
      errorMessage.value =
        error instanceof Error ? error.message : String(error);
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

function handleConfirm() {
  if (props.hideConfirm || !isTypedMatch.value || isPending.value) return;
  if (props.onConfirm) return runConfirm(props.onConfirm);
  close(true);
}

function handleCancel() {
  if (isPending.value) return;
  close(false);
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="props.title"
    :description="props.description"
    :dismissible="!isPending"
    :ui="modalUi"
    @update:open="(open: boolean) => !open && handleCancel()"
  >
    <template #header>
      <DmsIconWell
        v-if="headerIcon"
        :icon="headerIcon"
        :tone="props.confirmColor"
      />
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

        <UAlert
          v-if="errorMessage"
          color="error"
          icon="i-ph-warning-circle"
          :description="errorMessage"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <span
          class="text-dimmed me-auto hidden items-center gap-1.5 text-xs sm:flex"
        >
          <UKbd value="Esc" size="sm" />
          {{ $t("dms.confirm.esc_hint") }}
        </span>
        <UButton
          :label="props.cancelLabel || $t('dms.confirm.cancel')"
          variant="outline"
          color="neutral"
          :disabled="isPending"
          @click="handleCancel"
        />
        <UButton
          v-if="!props.hideConfirm"
          :label="props.confirmLabel || $t('dms.confirm.confirm')"
          :icon="props.confirmIcon"
          :color="props.confirmColor"
          :loading="isPending"
          :disabled="!isTypedMatch"
          @click="handleConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
