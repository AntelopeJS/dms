<script setup lang="ts">
import {
  formErrorsInjectionKey,
  formFieldInjectionKey,
} from "@nuxt/ui/composables/useFormField";
import { useControlError } from "../../../build/composables/form/useControlError";
import {
  addTags,
  invalidTags,
  type TagItemType,
} from "../../../build/composables/form/tagValues";

interface InputTagsProps {
  id?: string;
  /** `email`: an item that is no address shows red and blocks the submit. */
  itemType?: TagItemType;
  max?: number;
  /** Offered as the user types. */
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
}

/** A form error naming some of the items (`values`), as the form keeps it. */
interface ItemsError {
  name?: string;
  values?: unknown;
}

const props = defineProps<InputTagsProps>();
const model = defineModel<string[] | null | undefined>();
const { t } = useI18n();
const { report } = useControlError();
const formField = inject(formFieldInjectionKey, undefined);
const formErrors = inject(formErrorsInjectionKey, undefined);

// Commas, semicolons and whitespace end an item, typed or pasted.
const DELIMITER = /[\s,;]+/;

const tags = computed(() => model.value ?? []);
const isFull = computed(
  () => props.max !== undefined && tags.value.length >= props.max,
);
const suggestionsId = computed(() => `${props.id ?? "tags"}-suggestions`);

const invalid = computed(
  () => new Set(invalidTags(tags.value, props.itemType)),
);
// Items a server refused (an address already a member): its error names them.
const refused = computed(() => {
  const name = formField?.value?.name;
  const error = (formErrors?.value as ItemsError[] | undefined)?.find(
    (entry) => entry.name === name,
  );
  return new Set(
    Array.isArray(error?.values)
      ? error.values.map((value) => String(value).toLowerCase())
      : [],
  );
});

function isFlagged(item: string): boolean {
  return invalid.value.has(item) || refused.value.has(item.toLowerCase());
}

watch(
  invalid,
  (items) => {
    const list = [...items];
    report(
      list.length
        ? t(
            "dms.form.tags.invalid_email",
            { value: list.join(", ") },
            list.length,
          )
        : undefined,
    );
  },
  { immediate: true },
);

function onTags(next: string[] | null | undefined): void {
  model.value = addTags([], next ?? [], {
    itemType: props.itemType,
    max: props.max,
  });
}
</script>

<template>
  <div>
    <UInputTags
      :id="props.id"
      :model-value="tags"
      :placeholder="isFull ? undefined : props.placeholder"
      :disabled="props.disabled"
      :max="props.max"
      :delimiter="DELIMITER"
      :list="props.suggestions?.length ? suggestionsId : undefined"
      add-on-paste
      add-on-blur
      add-on-tab
      class="w-full"
      :ui="{
        item: 'has-[[data-flagged]]:border-error/50 has-[[data-flagged]]:bg-error/10 has-[[data-flagged]]:text-error',
      }"
      @update:model-value="onTags"
    >
      <template #item-text="{ item }">
        <span
          class="inline-flex items-center gap-1"
          :data-flagged="isFlagged(String(item)) || undefined"
        >
          <UIcon
            v-if="isFlagged(String(item))"
            name="i-ph-warning-circle"
            class="size-3.5 shrink-0"
          />
          {{ item }}
        </span>
      </template>
    </UInputTags>
    <datalist v-if="props.suggestions?.length" :id="suggestionsId">
      <option
        v-for="suggestion in props.suggestions"
        :key="suggestion"
        :value="suggestion"
      />
    </datalist>
  </div>
</template>
