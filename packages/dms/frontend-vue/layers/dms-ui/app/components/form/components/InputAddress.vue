<script setup lang="ts">
import type { SelectMenuItem } from "@nuxt/ui";
import { refDebounced } from "@vueuse/core";

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
  placeholder?: Partial<Record<keyof AddressValue, string>>;
  autocomplete?: AddressAutocompleteConfig;
  disabled?: boolean;
  searchUrl?: string;
  keyMapping?: {
    label?: string;
    value?: string;
  };
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

const safeModelValue = computed(() => modelValue.value ?? defaultAddress);

const updateField = <K extends keyof AddressValue>(
  field: K,
  value: AddressValue[K],
) => {
  modelValue.value = {
    ...safeModelValue.value,
    [field]: value,
  };
};

const patchFields = (patch: Partial<AddressValue>) => {
  modelValue.value = {
    ...safeModelValue.value,
    ...patch,
  };
};

/* -------------------------------------------------------------------------- */
/* Country select (static i18n list, or remote DMS data API via searchUrl)    */
/* -------------------------------------------------------------------------- */

const staticCountryOptions = computed(() => {
  const countries = tm("country") as Record<string, unknown>;

  if (!countries || typeof countries !== "object") {
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
    label: item[labelKey] as string,
    value: item[valueKey] as string,
  };
};

const { $authFetch } = useAuthFetch();
const toast = useToast();

/** The remote country list, already shaped for `USelectMenu`. */
interface CountryOptions {
  results: SelectMenuItem[];
  total: number;
}

async function fetchCountryOptions(): Promise<CountryOptions> {
  const data = await $authFetch<CountryApiResponse>(props.searchUrl!, {
    params: {
      q: countrySearchTermDebounced.value,
    },
    onRequestError: ({ error }: { error: Error }) => {
      toast.add({
        color: Color.error,
        title: t("dms.form.error_title"),
        description: error.message,
      });
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

// The second argument is the handler of the keyed form; this call is keyless,
// so the options belong in third position.
const dynamicCountryData = props.searchUrl
  ? await useDmsAsyncData(fetchCountryOptions, undefined, {
      lazy: true,
      immediate: false,
      watch: [countrySearchTermDebounced],
    })
  : { data: ref(null), status: ref("idle"), execute: () => {} };

const countryOptions = computed(() => {
  if (props.searchUrl && dynamicCountryData.data.value?.results) {
    return dynamicCountryData.data.value.results;
  }
  return staticCountryOptions.value;
});

/* -------------------------------------------------------------------------- */
/* Street autocomplete (Photon geocoder by default — free, key-less, global)  */
/* -------------------------------------------------------------------------- */

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

// Photon/OSM exposes a single `housenumber`. We only pull a box/unit out when it
// is *explicitly* marked (BE "bte", NL "bus", "box", or a "/" separator). A bare
// letter suffix like "182A" — or "12 bis" — is a distinct house number, not a
// box, so it stays in the house number field.
const BOX_KEYWORD = /\s+(?:bo[iî]te|bus|box|bte)\s*\.?\s*/i;

const splitHouseNumber = (
  raw?: string,
): { houseNumber: string; boxNumber: string } => {
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

// Monotonic id so a slow in-flight request can never overwrite the results of
// a more recent keystroke (out-of-order responses are discarded).
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
        limit: photonLimit.value,
      },
    });

    if (seq !== searchSeq) return;

    suggestions.value = (response.features ?? [])
      .filter(
        (feature) => feature.properties?.street || feature.properties?.name,
      )
      .map((feature, index) => ({
        id: String(index),
        label: formatPhotonLabel(feature.properties),
        patch: mapPhotonFeature(feature.properties),
      }));
    showSuggestions.value = suggestions.value.length > 0;
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
  patchFields(suggestion.patch);
  // Bump the sequence so any still-in-flight request is discarded and cannot
  // repopulate the list / reopen the dropdown after the user picked a result.
  searchSeq++;
  suggestions.value = [];
  showSuggestions.value = false;
};

let blurTimer: ReturnType<typeof setTimeout> | undefined;

const onStreetFocus = () => {
  if (autocompleteEnabled.value && suggestions.value.length > 0) {
    showSuggestions.value = true;
  }
};

const onStreetBlur = () => {
  blurTimer = setTimeout(() => {
    showSuggestions.value = false;
  }, BLUR_CLOSE_DELAY_MS);
};

onBeforeUnmount(() => {
  if (blurTimer) clearTimeout(blurTimer);
});

/* -------------------------------------------------------------------------- */
/* Placeholders                                                               */
/* -------------------------------------------------------------------------- */

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

// When autocomplete is on, the street field doubles as the address search box,
// so its placeholder hints that typing will search.
const streetPlaceholder = computed(() => {
  if (!autocompleteEnabled.value) return placeholders.value.streetName;
  return props.autocomplete?.placeholder
    ? processI18n(props.autocomplete.placeholder)
    : t("dms.form.address.search_placeholder");
});
</script>

<template>
  <div class="grid gap-3">
    <div class="relative grid gap-1.5">
      <UInput
        v-model="streetModel"
        :icon="autocompleteEnabled ? 'i-ph-magnifying-glass' : undefined"
        :placeholder="streetPlaceholder"
        :disabled="props.disabled"
        :loading="autocompleteEnabled && isSearching"
        autocomplete="off"
        @focus="onStreetFocus"
        @blur="onStreetBlur"
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
          :placeholder="placeholders.houseNumber"
          :disabled="props.disabled"
          @update:model-value="updateField('houseNumber', $event)"
        />
      </div>
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.boxNumber"
          :placeholder="placeholders.boxNumber"
          :disabled="props.disabled"
          @update:model-value="updateField('boxNumber', $event)"
        />
      </div>
    </div>

    <div class="grid gap-1.5">
      <UInput
        :model-value="safeModelValue.addressLine2"
        :placeholder="placeholders.addressLine2"
        :disabled="props.disabled"
        @update:model-value="updateField('addressLine2', $event)"
      />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.postalCode"
          :placeholder="placeholders.postalCode"
          :disabled="props.disabled"
          @update:model-value="updateField('postalCode', $event)"
        />
      </div>
      <div class="grid gap-1.5">
        <UInput
          :model-value="safeModelValue.city"
          :placeholder="placeholders.city"
          :disabled="props.disabled"
          @update:model-value="updateField('city', $event)"
        />
      </div>
    </div>

    <div class="grid gap-1.5">
      <UInput
        :model-value="safeModelValue.countrySubdivision"
        :placeholder="placeholders.countrySubdivision"
        :disabled="props.disabled"
        @update:model-value="updateField('countrySubdivision', $event)"
      />
    </div>

    <div class="grid gap-1.5">
      <USelectMenu
        v-model:search-term="countrySearchTerm"
        :model-value="safeModelValue.countryCode"
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
        @update:model-value="updateField('countryCode', $event)"
      />
    </div>
  </div>
</template>
