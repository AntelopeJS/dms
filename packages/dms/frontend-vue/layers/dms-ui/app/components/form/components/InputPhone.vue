<script setup lang="ts">
import { useFormField } from "@nuxt/ui/composables/useFormField";
import type { CountryCode } from "libphonenumber-js/min";
import { useControlError } from "../../../composables/form/useControlError";
import {
  formatPhone,
  moveToCountry,
  phoneCountries,
  phoneCountry,
  readTypedPhone,
  storedPhoneCountry,
} from "../../../build/utils/phoneNumber";

const ITEM_HEIGHT = 32;

interface InputPhoneProps {
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Refuses a number typed without its country. */
  requiredPrefix?: boolean;
  /** ISO 3166-1 alpha-2 code the country selector starts on ("BE"). */
  defaultCountry?: string;
}

const props = defineProps<InputPhoneProps>();
const model = defineModel<string | null | undefined>();
const { t, locale } = useI18n();
const { report } = useControlError();
const {
  id,
  size,
  color,
  highlight,
  disabled,
  ariaAttrs,
  emitFormBlur,
  emitFormInput,
} = useFormField(props);

const isStrict = computed(
  () => !!props.requiredPrefix || !!props.defaultCountry,
);

const text = ref("");
const country = ref<CountryCode>();
let emitted: string | null | undefined;

function show(value: string | null | undefined): void {
  emitted = value;
  const stored = value ?? "";
  text.value = formatPhone(stored);
  country.value =
    storedPhoneCountry(stored) ??
    (stored ? country.value : undefined) ??
    phoneCountry(props.defaultCountry);
}

show(model.value);

watch(model, (value) => {
  if (value !== emitted) show(value);
});

function store(value: string): void {
  emitted = value;
  model.value = value;
  emitFormInput();
}

function read(next: string, { isDeleting = false } = {}): void {
  const typed = readTypedPhone(next, country.value);
  text.value = isDeleting ? next : typed.text;
  country.value = typed.country;
  store(typed.value);
  if (typed.isNumber || !next.trim()) report(undefined);
}

function onInput(next: string | number | null | undefined): void {
  const value = String(next ?? "");
  read(value, { isDeleting: value.length < text.value.length });
}

function onBlur(): void {
  const typed = readTypedPhone(text.value, country.value);
  if (typed.isNumber) text.value = formatPhone(typed.value);
  report(
    isStrict.value && text.value.trim() && !typed.isNumber
      ? t("dms.field_errors.invalid_phone")
      : undefined,
  );
  emitFormBlur();
}

function onCountry(next: CountryCode | undefined): void {
  if (!next) return;
  const moved = moveToCountry(text.value, country.value, next);
  country.value = next;
  read(moved);
}

const countryNames = computed(
  () => new Intl.DisplayNames([locale.value], { type: "region" }),
);

const countryItems = computed(() =>
  phoneCountries()
    .map((entry) => ({
      ...entry,
      value: entry.code,
      label: countryNames.value.of(entry.code) ?? entry.code,
      code: `+${entry.callingCode}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale.value)),
);

const selected = computed(() =>
  countryItems.value.find((item) => item.value === country.value),
);
</script>

<template>
  <div class="flex w-full">
    <USelectMenu
      :model-value="country"
      :items="countryItems"
      value-key="value"
      label-key="label"
      :filter-fields="['label', 'value', 'code']"
      :search-input="{ placeholder: t('dms.form.phone.country_search') }"
      :virtualize="{ estimateSize: ITEM_HEIGHT }"
      :size="size"
      :color="color"
      :highlight="highlight"
      :disabled="disabled"
      :aria-label="t('dms.form.phone.country')"
      trailing-icon="i-ph-caret-down"
      class="shrink-0 rounded-e-none"
      :ui="{ content: 'min-w-72' }"
      data-phone-country
      @update:model-value="onCountry"
    >
      <span v-if="selected" class="tabular-nums">
        {{ selected.flag }} {{ selected.code }}
      </span>
      <UIcon v-else name="i-ph-globe" class="size-4" />
      <template #item-leading="{ item }">
        <span aria-hidden="true">{{ item.flag }}</span>
      </template>
      <template #item-trailing="{ item }">
        <span class="text-dimmed text-[11px] tabular-nums">
          {{ item.code }}
        </span>
      </template>
    </USelectMenu>
    <UInput
      v-bind="ariaAttrs"
      :id="id"
      :model-value="text"
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      :placeholder="props.placeholder"
      :size="size"
      :color="color"
      :highlight="highlight"
      :disabled="disabled"
      class="min-w-0 flex-1"
      :ui="{ base: 'rounded-s-none' }"
      @update:model-value="onInput"
      @blur="onBlur"
    />
  </div>
</template>
