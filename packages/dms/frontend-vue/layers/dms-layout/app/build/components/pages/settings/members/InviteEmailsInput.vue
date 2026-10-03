<script setup lang="ts">
import { inject, nextTick } from "vue";
import {
  formErrorsInjectionKey,
  formFieldInjectionKey,
  useFormField,
} from "@nuxt/ui/composables/useFormField";
import DmsFieldError from "#dms-ui/app/components/field-error/FieldError.vue";
import { fieldErrorId } from "#dms-core/app/composables/useFieldErrors";

interface Props {
  id?: string;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
}

/** A form error naming some of the addresses (`values`), as the form keeps it. */
interface AddressesError {
  name?: string;
  values?: unknown;
}

const props = defineProps<Props>();
const model = defineModel<string[] | null | undefined>();

const { t } = useI18n();
const { processI18n } = useTranslation();
// The wrapping UFormField: its error marks the field invalid and describes
// the input; a server error naming addresses (`values`) marks those tags.
const { ariaAttrs } = useFormField();
const formField = inject(formFieldInjectionKey, undefined);
const formErrors = inject(formErrorsInjectionKey, undefined);

/** Commas, semicolons and whitespace separate pasted addresses. */
const SEPARATORS = /[\s,;]+/;
const COMMIT_KEYS = new Set(["Enter", ",", ";", " ", "Tab"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const draft = ref("");
const input = ref<HTMLInputElement | null>(null);
// Addresses of the last commit that were already in the list.
const duplicates = ref<string[]>([]);
// The draft was committed and stayed: it is not an address.
const isCommittedInvalid = ref(false);

const emails = computed(() => model.value ?? []);
const isFull = computed(
  () => props.max !== undefined && emails.value.length >= props.max,
);
const isDraftInvalid = computed(
  () => draft.value.trim() !== "" && !EMAIL_PATTERN.test(draft.value.trim()),
);
const hasFieldError = computed(() => !!formField?.value?.error);
const refusedEmails = computed(() => {
  const name = formField?.value?.name;
  const error = (formErrors?.value as AddressesError[] | undefined)?.find(
    (entry) => entry.name === name,
  );
  return new Set(
    Array.isArray(error?.values)
      ? error.values.map((value) => String(value).toLowerCase())
      : [],
  );
});

// The address being typed: wrong as typed, or already in the list. Checked
// on commit, so typing an address doesn't flash an error at every key.
const entryError = computed(() => {
  if (isCommittedInvalid.value && isDraftInvalid.value) {
    return t("page.settings.members.invite.email_invalid", {
      email: draft.value.trim(),
    });
  }
  if (duplicates.value.length > 0) {
    return t(
      "page.settings.members.invite.email_duplicate",
      { email: duplicates.value.join(", ") },
      duplicates.value.length,
    );
  }
  return undefined;
});
const entryErrorId = computed(() =>
  fieldErrorId(`${props.id ?? "invite-emails"}-entry`),
);
const describedBy = computed(
  () =>
    [
      entryError.value ? entryErrorId.value : undefined,
      ariaAttrs.value?.["aria-describedby"],
    ]
      .filter(Boolean)
      .join(" ") || undefined,
);

watch(draft, () => {
  isCommittedInvalid.value = false;
  duplicates.value = [];
});

function addAll(text: string): string[] {
  const rejected: string[] = [];
  const repeated: string[] = [];
  const next = [...emails.value];
  for (const candidate of text.split(SEPARATORS).filter(Boolean)) {
    const email = candidate.toLowerCase();
    const isValid = EMAIL_PATTERN.test(email);
    const hasRoom = props.max === undefined || next.length < props.max;
    if (!isValid || !hasRoom) rejected.push(candidate);
    else if (next.includes(email)) repeated.push(email);
    else next.push(email);
  }
  model.value = next;
  duplicates.value = repeated;
  return rejected;
}

function commit() {
  const rejected = addAll(draft.value).join(" ");
  const repeated = duplicates.value;
  draft.value = rejected;
  // The draft watcher resets the marks: set them once it has run.
  nextTick(() => {
    isCommittedInvalid.value = rejected !== "";
    duplicates.value = repeated;
  });
}

function onKeydown(event: KeyboardEvent) {
  if (COMMIT_KEYS.has(event.key) && draft.value.trim()) {
    if (event.key !== "Tab") event.preventDefault();
    commit();
    return;
  }
  if (event.key === "Backspace" && !draft.value && emails.value.length > 0) {
    model.value = emails.value.slice(0, -1);
  }
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!SEPARATORS.test(text.trim())) return;
  event.preventDefault();
  draft.value = `${draft.value} ${text}`;
  commit();
}

function remove(email: string) {
  model.value = emails.value.filter((entry) => entry !== email);
  input.value?.focus();
}
</script>

<template>
  <div class="grid gap-1.5">
    <div
      class="bg-default flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 transition-colors"
      :class="[
        entryError || hasFieldError
          ? 'border-error focus-within:ring-error/25 focus-within:ring-2'
          : 'border-accented focus-within:border-primary focus-within:ring-primary/25 focus-within:ring-2',
        { 'pointer-events-none opacity-60': props.disabled },
      ]"
      @click="input?.focus()"
    >
      <span
        v-for="email in emails"
        :key="email"
        class="inline-flex h-6 items-center gap-1 rounded-[6px] border ps-2 pe-1 text-[12.5px]"
        :class="
          refusedEmails.has(email)
            ? 'border-error/50 bg-error/10 text-error'
            : 'bg-elevated border-default text-default'
        "
        :data-refused="refusedEmails.has(email) || undefined"
      >
        <UIcon
          v-if="refusedEmails.has(email)"
          name="i-ph-warning-circle"
          class="size-3.5 shrink-0"
        />
        {{ email }}
        <button
          type="button"
          class="text-dimmed hover:text-highlighted grid size-4 place-items-center rounded-[4px]"
          :aria-label="
            $t('page.settings.members.invite.remove_email', { email })
          "
          @click.stop="remove(email)"
        >
          <UIcon name="i-ph-x" class="size-3" />
        </button>
      </span>
      <!-- Text with an e-mail keyboard, not type="email": the browser's own
           check would stop the form with its bubble before the DMS shows
           its inline error. -->
      <input
        :id="props.id"
        ref="input"
        v-model="draft"
        type="text"
        inputmode="email"
        autocomplete="off"
        spellcheck="false"
        :disabled="props.disabled || isFull"
        :placeholder="
          emails.length > 0
            ? $t('page.settings.members.invite.placeholder.emails_more')
            : props.placeholder && processI18n(props.placeholder)
        "
        :aria-invalid="!!entryError || hasFieldError || undefined"
        :aria-describedby="describedBy"
        class="text-highlighted placeholder:text-dimmed min-w-[180px] flex-1 border-0 bg-transparent py-0.5 text-[13px] outline-none"
        @keydown="onKeydown"
        @paste="onPaste"
        @blur="commit"
      />
    </div>
    <DmsFieldError :id="entryErrorId" :message="entryError" />
  </div>
</template>
