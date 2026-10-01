<script setup lang="ts">
interface Props {
  id?: string;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
}

const props = defineProps<Props>();
const model = defineModel<string[] | null | undefined>();

const { processI18n } = useTranslation();

/** Commas, semicolons and whitespace separate pasted addresses. */
const SEPARATORS = /[\s,;]+/;
const COMMIT_KEYS = new Set(["Enter", ",", ";", " ", "Tab"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const draft = ref("");
const input = ref<HTMLInputElement | null>(null);

const emails = computed(() => model.value ?? []);
const isFull = computed(
  () => props.max !== undefined && emails.value.length >= props.max,
);
const isDraftInvalid = computed(
  () => draft.value.trim() !== "" && !EMAIL_PATTERN.test(draft.value.trim()),
);

function addAll(text: string): string[] {
  const rejected: string[] = [];
  const next = [...emails.value];
  for (const candidate of text.split(SEPARATORS).filter(Boolean)) {
    const email = candidate.toLowerCase();
    const isValid = EMAIL_PATTERN.test(email);
    const hasRoom = props.max === undefined || next.length < props.max;
    if (!isValid || !hasRoom) rejected.push(candidate);
    else if (!next.includes(email)) next.push(email);
  }
  model.value = next;
  return rejected;
}

function commit() {
  draft.value = addAll(draft.value).join(" ");
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
  draft.value = addAll(`${draft.value} ${text}`).join(" ");
}

function remove(email: string) {
  model.value = emails.value.filter((entry) => entry !== email);
  input.value?.focus();
}
</script>

<template>
  <div
    class="bg-default flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 transition-colors"
    :class="[
      isDraftInvalid
        ? 'border-error'
        : 'border-accented focus-within:border-primary focus-within:ring-primary/25 focus-within:ring-2',
      { 'pointer-events-none opacity-60': props.disabled },
    ]"
    @click="input?.focus()"
  >
    <span
      v-for="email in emails"
      :key="email"
      class="bg-elevated border-default text-default inline-flex h-6 items-center gap-1 rounded-[6px] border ps-2 pe-1 text-[12.5px]"
    >
      {{ email }}
      <button
        type="button"
        class="text-dimmed hover:text-highlighted grid size-4 place-items-center rounded-[4px]"
        :aria-label="$t('page.settings.members.invite.remove_email', { email })"
        @click.stop="remove(email)"
      >
        <UIcon name="i-ph-x" class="size-3" />
      </button>
    </span>
    <input
      :id="props.id"
      ref="input"
      v-model="draft"
      type="email"
      multiple
      autocomplete="off"
      :disabled="props.disabled || isFull"
      :placeholder="
        emails.length > 0
          ? $t('page.settings.members.invite.placeholder.emails_more')
          : props.placeholder && processI18n(props.placeholder)
      "
      class="text-highlighted placeholder:text-dimmed min-w-[180px] flex-1 border-0 bg-transparent py-0.5 text-[13px] outline-none"
      @keydown="onKeydown"
      @paste="onPaste"
      @blur="commit"
    />
  </div>
</template>
