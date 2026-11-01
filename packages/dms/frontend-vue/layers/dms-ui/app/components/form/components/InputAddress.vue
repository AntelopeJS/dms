<script setup lang="ts">
import { pageRequestUrl } from "../../../build/composables/page/pageUrlValues";
import { isObject } from "#dms-core/app/utils/type-check";
import type { SelectMenuItem } from "@nuxt/ui";
import { refDebounced } from "@vueuse/core";
import {
  rankAddressSuggestions,
  suggestionPoolSize,
} from "../../../build/utils/addressSuggestions";
import {
  formErrorsInjectionKey,
  formInputsInjectionKey,
  useFormField,
} from "@nuxt/ui/composables/useFormField";

const SEARCH_DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 3;
const SUGGESTION_LIMIT = 5;
const BLUR_CLOSE_DELAY_MS = 150;
const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api";

/**
 * Structured address aligned with ISO 19160-1 components and the UBL
 * `cac:PostalAddress` used by EN 16931 / Peppol BIS Billing 3.0.
 */
interface AddressValue {
  streetName: string;
  houseNumber?: string;
  boxNumber?: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  countrySubdivision?: string;
  countryCode: string;
}

interface AddressAutocompleteConfig {
  enabled?: boolean;
  url?: string;
  lang?: string;
  limit?: number;
  placeholder?: string;
}

interface AddressProps {
  /** Id of the street input, the first part: what the field's label names. */
  id?: string;
  placeholder?: Partial<Record<keyof AddressValue, string>>;
  autocomplete?: AddressAutocompleteConfig;
  disabled?: boolean;
  searchUrl?: string;
  keyMapping?: {
    label?: string;
    value?: string;
  };
  /**
   * ISO 3166-1 alpha-2 code ("BE") the country shows while the address has
   * none, written with the first part typed, and the country whose places
   * the street suggestions list first.
   */
  defaultCountry?: string;
}

const props = defineProps<AddressProps>();

const { processI18n } = useTranslation();
const { t, tm, locale } = useI18n();

const modelValue = defineModel<AddressValue | null>();

const defaultAddress: AddressValue = {
  streetName: "",
  houseNumber: "",
  boxNumber: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  countrySubdivision: "",
  countryCode: "",
};

const defaultCountryCode = computed(
  () => props.defaultCountry?.trim().toUpperCase() ?? "",
);

const safeModelValue = computed<AddressValue>(() => {
  const value = modelValue.value ?? defaultAddress;
  return value.countryCode || !defaultCountryCode.value
    ? value
    : { ...value, countryCode: defaultCountryCode.value };
});

const REQUIRED_PARTS = new Set<keyof AddressValue>([
  "streetName",
  "postalCode",
  "city",
  "countryCode",
]);

const {
  name: fieldName,
  ariaAttrs,
  emitFormBlur,
  emitFormInput,
} = useFormField();
const formErrors = inject(formErrorsInjectionKey, null);
const formInputs = inject(formInputsInjectionKey, null);

// SAFETY: defaultAddress is the local literal above, contains only AddressValue keys and is never assigned extra properties.
const PARTS = Object.keys(defaultAddress) as Array<keyof AddressValue>;
const FIRST_PART: keyof AddressValue = "streetName";

/**
 * The id of a part's control: the street takes the field's, which its label
 * names, the others `<field>.<part>`, the name their errors go under.
 */
function partId(part: keyof AddressValue): string | undefined {
  const base = props.id ?? fieldName.value;
  if (!base) return undefined;
  return part === FIRST_PART ? base : `${base}.${part}`;
}

onMounted(() => {
  const name = fieldName.value;
  if (!name || !formInputs) return;
  for (const part of PARTS) {
    formInputs.value[`${name}.${part}`] = { id: partId(part) };
  }
});
onBeforeUnmount(() => {
  const name = fieldName.value;
  if (!name || !formInputs) return;
  for (const part of PARTS) delete formInputs.value[`${name}.${part}`];
});

/** Whether a required part is still empty. */
function isPartMissing(part: keyof AddressValue): boolean {
  return REQUIRED_PARTS.has(part) && !safeModelValue.value[part]?.trim();
}

/**
 * Whether a part shows the error border: it has an error of its own
 * (`<field>.<part>`), or the address as a whole was refused: left empty
 * while required, the required parts still empty; refused as it is (a
 * server's verdict), every part.
 */
function isPartInvalid(part: keyof AddressValue): boolean {
  const name = fieldName.value;
  if (!name || !formErrors?.value.length) return false;
  const errorNames = new Set(formErrors.value.map((error) => error.name));
  if (errorNames.has(`${name}.${part}`)) return true;
  if (!errorNames.has(name)) return false;
  return PARTS.some(isPartMissing) ? isPartMissing(part) : true;
}

/** The props marking one part invalid, as UFormField marks an input. */
function partState(part: keyof AddressValue) {
  if (!isPartInvalid(part)) return {};
  return { color: "error" as const, highlight: true, ...ariaAttrs.value };
}

const root = useTemplateRef<HTMLElement>("root");

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (next instanceof Node && root.value?.contains(next)) return;
  emitFormBlur();
}

const updateField = <K extends keyof AddressValue>(
  field: K,
  value: AddressValue[K],
) => {
  modelValue.value = {
    ...safeModelValue.value,
    [field]: value,
  };
  emitFormInput();
};

const patchFields = (patch: Partial<AddressValue>) => {
  modelValue.value = {
    ...safeModelValue.value,
    ...patch,
  };
  emitFormInput();
};

const staticCountryOptions = computed(() => {
  const countries = tm("country");

  if (!countries || !isObject(countries)) {
    return [];
  }

  return Object.entries(countries)
    .map(([code, _]) => ({
      label: t(`country.${code}`),
      value: code,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const countrySearchTerm = ref("");
const countrySearchTermDebounced = refDebounced(
  countrySearchTerm,
  SEARCH_DEBOUNCE_MS,
);

interface CountryApiResponse {
  results: Record<string, string>[];
  total: number;
}

const mapCountryData = (item: Record<string, string>) => {
  const labelKey = props.keyMapping?.label || "label";
  const valueKey = props.keyMapping?.value || "value";

  return {
    label: item[labelKey],
    value: item[valueKey],
  };
};

const { $authFetch } = useAuthFetch();
const { presentError } = useApiErrorPresenter();

/** The remote country list, already shaped for `USelectMenu`. */
interface CountryOptions {
  results: SelectMenuItem[];
  total: number;
}

async function fetchCountryOptions(): Promise<CountryOptions> {
  const url = pageRequestUrl(props.searchUrl);
  if (!url) return { results: [], total: 0 };
  const data = await $authFetch<CountryApiResponse>(url, {
    params: {
      q: countrySearchTermDebounced.value,
    },
    onRequestError: ({ error }: { error: Error }) => {
      presentError(error, { fallbackKey: "dms.form.error_title" });
    },
  });

  const items: SelectMenuItem[] = data.results.map((item) =>
    mapCountryData(item),
  );

  if (data.total && data.total > items.length) {
    items.push(
      {
        type: "separator",
      },
      {
        type: "label",
        disabled: true,
        label: t("form.showing_entries", {
          shown: items.length,
          total: data.total,
        }),
      },
    );
  }

  return { ...data, results: items };
}

const dynamicCountryData = props.searchUrl
  ? await useDmsAsyncData(fetchCountryOptions, undefined, {
      lazy: true,
      immediate: false,
      watch: [countrySearchTermDebounced],

      refreshOnPageRefresh: false,
    })
  : { data: ref(null), status: ref("idle"), execute: () => {} };

const countryOptions = computed(() => {
  if (props.searchUrl && dynamicCountryData.data.value?.results) {
    return dynamicCountryData.data.value.results;
  }
  return staticCountryOptions.value;
});

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
}

interface PhotonResponse {
  features?: { properties: PhotonProperties }[];
}

interface AddressSuggestion {
  id: string;
  label: string;
  countryCode?: string;
  patch: Partial<AddressValue>;
}

const autocompleteEnabled = computed(
  () => props.autocomplete?.enabled === true,
);
const photonUrl = computed(() => props.autocomplete?.url || DEFAULT_PHOTON_URL);
const photonLimit = computed(
  () => props.autocomplete?.limit ?? SUGGESTION_LIMIT,
);
const photonLang = computed(() => {
  const explicit = props.autocomplete?.lang;
  if (explicit) return explicit;
  return String(locale.value || "en").split("-")[0];
});

const streetQuery = ref("");
const streetQueryDebounced = refDebounced(streetQuery, SEARCH_DEBOUNCE_MS);
const suggestions = ref<AddressSuggestion[]>([]);
const isSearching = ref(false);
const showSuggestions = ref(false);

const isStreetFocused = ref(false);

const BOX_KEYWORD = /\s+(?:bo[iî]te|bus|box|bte)\s*\.?\s*/i;

const splitHouseNumber = (raw?: string) => {
  const value = (raw ?? "").trim();
  if (!value) return { houseNumber: "", boxNumber: "" };

  const keyword = value.split(BOX_KEYWORD);
  if (keyword.length > 1) {
    return {
      houseNumber: (keyword[0] ?? "").trim(),
      boxNumber: keyword.slice(1).join(" ").trim(),
    };
  }

  const slash = value.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slash) {
    return {
      houseNumber: (slash[1] ?? "").trim(),
      boxNumber: (slash[2] ?? "").trim(),
    };
  }

  return { houseNumber: value, boxNumber: "" };
};

const mapPhotonFeature = (p: PhotonProperties): Partial<AddressValue> => {
  const { houseNumber, boxNumber } = splitHouseNumber(p.housenumber);
  return {
    streetName: p.street ?? p.name ?? "",
    houseNumber,
    boxNumber,
    postalCode: p.postcode ?? "",
    city: p.city ?? p.town ?? p.village ?? p.county ?? "",
    countrySubdivision: p.state ?? "",
    countryCode: (p.countrycode ?? "").toUpperCase(),
  };
};

const formatPhotonLabel = (p: PhotonProperties): string => {
  const street = [p.street ?? p.name, p.housenumber].filter(Boolean).join(" ");
  const locality = [p.postcode, p.city ?? p.town ?? p.village]
    .filter(Boolean)
    .join(" ");
  return [street, locality, p.country].filter(Boolean).join(", ");
};

let searchSeq = 0;

watch(streetQueryDebounced, async (query) => {
  if (
    !autocompleteEnabled.value ||
    !query ||
    query.trim().length < MIN_QUERY_LENGTH
  ) {
    suggestions.value = [];
    return;
  }

  const seq = ++searchSeq;
  isSearching.value = true;
  try {
    const response = await $fetch<PhotonResponse>(photonUrl.value, {
      params: {
        q: query,
        lang: photonLang.value,

        limit: suggestionPoolSize(photonLimit.value),
      },
    });

    if (seq !== searchSeq) return;

    const found = (response.features ?? [])
      .filter(
        (feature) => feature.properties?.street || feature.properties?.name,
      )
      .map((feature, index) => ({
        id: String(index),
        label: formatPhotonLabel(feature.properties),
        countryCode: feature.properties.countrycode?.toUpperCase(),
        patch: mapPhotonFeature(feature.properties),
      }));
    suggestions.value = rankAddressSuggestions(
      found,
      safeModelValue.value.countryCode,
      photonLimit.value,
    );
    showSuggestions.value =
      isStreetFocused.value && suggestions.value.length > 0;
  } catch {
    if (seq === searchSeq) suggestions.value = [];
  } finally {
    if (seq === searchSeq) isSearching.value = false;
  }
});

const streetModel = computed({
  get: () => safeModelValue.value.streetName,
  set: (value: string) => {
    updateField("streetName", value);
    if (autocompleteEnabled.value) {
      streetQuery.value = value;
      showSuggestions.value = true;
    }
  },
});

const applySuggestion = (suggestion: AddressSuggestion) => {
  const { countryCode, ...located } = suggestion.patch;
  patchFields(countryCode ? suggestion.patch : located);

  searchSeq++;
  suggestions.value = [];
  showSuggestions.value = false;
};

let blurTimer: ReturnType<typeof setTimeout> | undefined;

const onStreetFocus = () => {
  isStreetFocused.value = true;
  if (autocompleteEnabled.value && suggestions.value.length > 0) {
    showSuggestions.value = true;
  }
};

const onStreetBlur = () => {
  isStreetFocused.value = false;
  blurTimer = setTimeout(() => {
    showSuggestions.value = false;
  }, BLUR_CLOSE_DELAY_MS);
};

/** Escape closes the suggestions, as it would any list; typing reopens it. */
const onStreetEscape = (event: KeyboardEvent) => {
  if (!showSuggestions.value) return;

  event.stopPropagation();
  showSuggestions.value = false;
};

onBeforeUnmount(() => {
  if (blurTimer) clearTimeout(blurTimer);
});

const resolvePlaceholder = (
  field: keyof AddressValue,
  fallbackKey: string,
): string => {
  const custom = props.placeholder?.[field];
  return custom ? processI18n(custom) : t(fallbackKey);
};

const placeholders = computed(() => ({
  countryCode: resolvePlaceholder(
    "countryCode",
    "dms.form.address.country_placeholder",
  ),
  streetName: resolvePlaceholder(
    "streetName",
    "dms.form.address.street_name_placeholder",
  ),
  houseNumber: resolvePlaceholder(
    "houseNumber",
    "dms.form.address.house_number_placeholder",
  ),
  boxNumber: resolvePlaceholder(
    "boxNumber",
    "dms.form.address.box_number_placeholder",
  ),
  addressLine2: resolvePlaceholder(
    "addressLine2",
    "dms.form.address.address_line2_placeholder",
  ),
  postalCode: resolvePlaceholder(
    "postalCode",
    "dms.form.address.postal_code_placeholder",
  ),
  city: resolvePlaceholder("city", "dms.form.address.city_placeholder"),
  countrySubdivision: resolvePlaceholder(
    "countrySubdivision",
    "dms.form.address.country_subdivision_placeholder",
  ),
}));

const streetPlaceholder = computed(() => {
  if (!autocompleteEnabled.value) return placeholders.value.streetName;
  return props.autocomplete?.placeholder
    ? processI18n(props.autocomplete.placeholder)
    : t("dms.form.address.search_placeholder");
});
</script>

<template>
  <div ref="root" class="grid gap-3" @focusout="onFocusOut">
    <div class="relative grid gap-1.5">
      <UInput
        v-model="streetModel"
        v-bind="partState('streetName')"
        :id="partId('streetName')"
        :icon="autocompleteEnabled ? 'i-ph-magnifying-glass' : undefined"
        :placeholder="streetPlaceholder"
        :disabled="props.disabled"
        :loading="autocompleteEnabled && isSearching"
        autocomplete="off"
        @focus="onStreetFocus"
        @blur="onStreetBlur"
        @keydown.esc="onStreetEscape"
      />
      <div
        v-if="autocompleteEnabled && showSuggestions && suggestions.length"
        class="border-default bg-default ring-default absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border shadow-lg ring"
      >
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          type="button"
          class="text-default hover:bg-elevated block w-full px-3 py-2 text-left text-sm"
          @mousedown.prevent="applySuggestion(suggestion)"
        >
          {{ suggestion.label }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.houseNumber"
          v-bind="partState('houseNumber')"
          :id="partId('houseNumber')"
          :placeholder="placeholders.houseNumber"
          :disabled="props.disabled"
          @update:model-value="updateField('houseNumber', $event)"
        />
      </div>
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.boxNumber"
          v-bind="partState('boxNumber')"
          :id="partId('boxNumber')"
          :placeholder="placeholders.boxNumber"
          :disabled="props.disabled"
          @update:model-value="updateField('boxNumber', $event)"
        />
      </div>
    </div>

    <div class="grid gap-1.5">
      <UInput
        :model-value="safeModelValue.addressLine2"
        v-bind="partState('addressLine2')"
        :id="partId('addressLine2')"
        :placeholder="placeholders.addressLine2"
        :disabled="props.disabled"
        @update:model-value="updateField('addressLine2', $event)"
      />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.postalCode"
          v-bind="partState('postalCode')"
          :id="partId('postalCode')"
          :placeholder="placeholders.postalCode"
          :disabled="props.disabled"
          @update:model-value="updateField('postalCode', $event)"
        />
      </div>
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.city"
          v-bind="partState('city')"
          :id="partId('city')"
          :placeholder="placeholders.city"
          :disabled="props.disabled"
          @update:model-value="updateField('city', $event)"
        />
      </div>
    </div>

    <div class="grid gap-1.5">
      <UInput
        :model-value="safeModelValue.countrySubdivision"
        v-bind="partState('countrySubdivision')"
        :id="partId('countrySubdivision')"
        :placeholder="placeholders.countrySubdivision"
        :disabled="props.disabled"
        @update:model-value="updateField('countrySubdivision', $event)"
      />
    </div>

    <div class="grid gap-1.5">
      <USelectMenu
        v-model:search-term="countrySearchTerm"
        :model-value="safeModelValue.countryCode"
        v-bind="partState('countryCode')"
        :id="partId('countryCode')"
        :items="countryOptions"
        :placeholder="placeholders.countryCode"
        :disabled="props.disabled"
        :loading="
          props.searchUrl
            ? dynamicCountryData.status.value === 'pending'
            : false
        "
        :ignore-filter="!!props.searchUrl"
        value-key="value"
        label-key="label"
        searchable
        :aria-label="t('dms.a11y.show_options')"
        @update:model-value="updateField('countryCode', $event)"
      />
    </div>
  </div>
</template>
