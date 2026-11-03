<script
  setup
  lang="ts"
  generic="T extends ArrayOrNested<SelectMenuItem>, M extends boolean = false"
>
import { pageRequestUrl } from "../../../build/composables/page/pageUrlValues";
import { useForwardPropsEmits } from "reka-ui";
import type {
  SelectMenuProps,
  SelectMenuEmits,
  SelectMenuSlots,
  SelectMenuItem,
  AvatarProps,
} from "@nuxt/ui";
import type { ArrayOrNested } from "@nuxt/ui/runtime/types/utils.js";

import { refDebounced } from "@vueuse/core";
import DmsForm from "../Form.vue";
import { dmsOwnDrawer } from "../../../build/composables/containers/context";
import { FIELD_TRIGGER_ICON } from "../../../build/utils/fieldTrigger";
import { unlabeledRelationIds } from "../../../build/composables/data-types/relationValue";
import {
  notFoundRelationIds,
  useRelationRows,
} from "../../../build/composables/data-types/relationRows";
import type { FormProps } from "../../../composables/form/types";
import { sameFormValue } from "../../../build/composables/unsaved-changes/formValue";
import { FORM_ENTRY_CONTEXT_KEY } from "../../../build/composables/form/formEntryContext";
import {
  type RelationFilterBy,
  relationFilterParams,
  resolveRelationPick,
} from "../../../build/composables/data-types/relationFilter";

const SEARCH_DEBOUNCE_MS = 200;
// How long the menu's content gets to leave the page before the add form opens
// anyway, and the beat its focus return takes once it has.
const MENU_CLOSE_MAX_MS = 1000;
const MENU_FOCUS_SETTLE_MS = 60;

/** Title and description of the drawer a relation picker's "add" opens. */
interface RelationAddFormTexts {
  displayName?: string;
  description?: string;
}

interface RelationProps extends SelectMenuProps<T, "value", M> {
  searchUrl: string;
  initialValue?: unknown;
  deselectable?: boolean;
  keyMapping?: {
    label?: string;
    value?: string;
    avatar?: string;
    disabled?: string;
  };
  /**
   * Lists only the related rows whose `field` equals the value of the form
   * field `from`; ignored outside a form (a filter's picker).
   */
  filterBy?: RelationFilterBy;
  addForm?: { componentName: string; options?: FormProps };
  addPermissionIds?: string[];
  /**
   * Title and description of the drawer the "add" entry opens; default to
   * "New entry".
   */
  addFormTexts?: RelationAddFormTexts;
}

const props = withDefaults(defineProps<RelationProps>(), {
  deselectable: true,
});
const emits = defineEmits<SelectMenuEmits<T, "value", M>>();
defineSlots<SelectMenuSlots<T, "value", M>>();

const forwardedProps = computed(() => {
  const {
    searchUrl: _,
    initialValue: __,
    keyMapping: ___,
    deselectable: ____,
    modelValue: _____,
    addForm: ______,
    addPermissionIds: _______,
    addFormTexts: ________,
    filterBy: _________,
    ...rest
  } = props;
  return rest;
});
const forwardedPropsEmits = useForwardPropsEmits(forwardedProps, emits);
// The picks go through `handleUpdateModelValue` alone, which deselects a value
// picked again: forwarded as well, the form got the pick it had undone.
const forwarded = computed(() => {
  const { "onUpdate:modelValue": _, ...rest } = forwardedPropsEmits.value;
  return rest as typeof forwardedPropsEmits.value;
});

type ModelValue = SelectMenuEmits<T, "value", M>["update:modelValue"][0];

function handleUpdateModelValue(value: ModelValue) {
  const shouldDeselect =
    props.deselectable && !props.multiple && value === props.modelValue;
  emits(
    "update:modelValue",
    shouldDeselect ? (undefined as ModelValue) : value,
  );
}

const instanceId = useId();

const searchTerm = ref("");
const searchTermDebounced = refDebounced(searchTerm, SEARCH_DEBOUNCE_MS);

// The form this picker fills, whose `filterBy.from` field narrows it.
const formContext = inject(FORM_ENTRY_CONTEXT_KEY, null);
const filterSourceValue = computed(() =>
  props.filterBy && formContext
    ? formContext.state.value[props.filterBy.from]
    : undefined,
);
const filterParams = computed(() =>
  relationFilterParams(props.filterBy, filterSourceValue.value),
);
// A string, so a recomputed but equal filter does not search again.
const filterKey = computed(() => JSON.stringify(filterParams.value));
// The source value the record loaded with, which its loaded pick matches.
const loadedFilterSource = filterSourceValue.value;

const { $authFetch } = useAuthFetch();
const { readRelationRows } = useRelationRows();
const { presentError } = useApiErrorPresenter();
const { t } = useI18n();
const { processI18n } = useTranslation();
const { hasPermission, loadPermissions } = usePermissions();
const { open: openDrawer } = useDrawer();
const { clearGuards } = useLeaveGuard();

await loadPermissions().catch(() => {});

const addContainerId = `relation-add-${useId()}`;
// Shallow: `SelectMenuItem` carries a string index signature, so a deeply
// unwrapped item is an unbounded type for the checker. The list is always
// replaced, never mutated in place.
const locallyAddedItems: Ref<SelectMenuItem[]> = shallowRef([]);
// The rows of the ids the value holds, read from the `select` route when the
// form's data answers the ids rather than the joined rows.
const valueItems: Ref<SelectMenuItem[]> = shallowRef([]);

const canAdd = computed(
  () =>
    !!props.addForm &&
    !!props.addForm.options?.submitUrl &&
    (!props.addPermissionIds?.length ||
      props.addPermissionIds.some((id) => hasPermission(id))),
);

interface RelationResponse {
  results: Record<string, string>[];
  total: number;
}

interface ImageRefValue {
  key: string;
  alt?: string;
}

function isImageRefValue(value: unknown): value is ImageRefValue {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as ImageRefValue).key === "string"
  );
}

const { getUrl: getAvatarUrl, resolve: resolveAvatarUrl } = useFileReadUrls();

function buildAvatarProps(
  source: unknown,
  alt: string | undefined,
): AvatarProps | undefined {
  if (typeof source === "string" && source) {
    return { src: source, alt: alt ?? source };
  }
  if (isImageRefValue(source)) {
    const url = getAvatarUrl(source.key);
    if (!url) return undefined;
    return { src: url, alt: source.alt || alt || "" };
  }
  return undefined;
}

function mapData(item: Record<string, string>) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return {
      label: "",
      value: "",
      disabled: true,
    };
  }

  const avatarValue = props.keyMapping?.avatar || undefined;
  const labelValue = props.keyMapping?.label || "label";
  const valueValue = props.keyMapping?.value || "value";

  return {
    ...item,
    label: item[labelValue],
    value: item[valueValue],
    avatar: undefined,
    avatarSource: avatarValue ? item[avatarValue] : undefined,
    disabled: !!item[props.keyMapping?.disabled || "disabled"],
  };
}
/** A page of relation candidates, already shaped for `USelectMenu`. */
interface RelationItems {
  results: SelectMenuItem[];
  total: number;
}

async function fetchRelationItems(): Promise<RelationItems> {
  const url = pageRequestUrl(props.searchUrl);
  if (!url) return { results: [], total: 0 };
  const data = await $authFetch<RelationResponse>(url, {
    params: {
      search: searchTermDebounced.value || undefined,
      ...filterParams.value,
    },
    onRequestError: ({ error }: { error: Error }) => {
      presentError(error, { fallbackKey: "dms.form.error_title" });
    },
  });

  const items: SelectMenuItem[] = data.results.map((item) => mapData(item));

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

const { data, status, execute } = await useDmsAsyncData(
  `relation-${instanceId}`,
  fetchRelationItems,
  {
    lazy: true,
    immediate: false,
    watch: [searchTermDebounced, filterKey],
    // Options to pick from, not the page's data.
    refreshOnPageRefresh: false,
  },
);

function isMappableObject(value: unknown): value is Record<string, string> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const initialItems = computed(() => {
  if (!props.initialValue) return [];
  // The loaded row matched the loaded source value, not another one.
  if (!sameFormValue(filterSourceValue.value, loadedFilterSource)) return [];

  const values = Array.isArray(props.initialValue)
    ? props.initialValue
    : [props.initialValue];

  return values.filter(isMappableObject).map(mapData);
});

function itemValue(item: SelectMenuItem): unknown {
  return typeof item === "object" && item !== null && "value" in item
    ? item.value
    : item;
}

const mergedItems = computed<SelectMenuItem[]>(() => {
  const searchResults = data.value?.results || [];
  const initial = initialItems.value || [];
  const added = locallyAddedItems.value;

  const merged: SelectMenuItem[] = [...initial, ...added];
  const existingValues = new Set(merged.map(itemValue));

  [...valueItems.value, ...searchResults].forEach((item) => {
    const value = itemValue(item);
    if (!existingValues.has(value)) {
      existingValues.add(value);
      merged.push(item);
    }
  });

  return merged;
});

interface AvatarSourceItem {
  avatarSource?: unknown;
  label?: string;
}

function resolveItemAvatar(item: SelectMenuItem): SelectMenuItem {
  if (typeof item !== "object" || item === null || !("avatarSource" in item)) {
    return item;
  }

  const { avatarSource, ...rest } = item;
  const avatar = buildAvatarProps(avatarSource, rest.label);

  return { ...rest, ...(avatar ? { avatar } : {}) };
}

const displayItems = computed<SelectMenuItem[]>(() =>
  mergedItems.value.map(resolveItemAvatar),
);

watch(
  mergedItems,
  (items) => {
    for (const item of items) {
      // SAFETY: Select-menu objects may carry an avatar source; string items yield undefined for this optional property.
      const source = (item as AvatarSourceItem).avatarSource;
      if (isImageRefValue(source)) {
        void resolveAvatarUrl(source.key);
      }
    }
  },
  { immediate: true },
);

// The pick as the form holds it, read alongside the source field: a record
// loading both values changes them in the same tick.
const pickValue = computed(() =>
  formContext && props.id
    ? formContext.state.value[props.id]
    : props.modelValue,
);
let pickSource = loadedFilterSource;

// A pick made for another value of the source field is void once it changes.
watch(
  [filterSourceValue, pickValue],
  ([source, pick], [prevSource, prevPick]) => {
    if (!props.filterBy || !formContext) return;
    const outcome = resolveRelationPick({
      source,
      pick,
      previousSource: prevSource,
      previousPick: prevPick,
      pickSource,
    });
    pickSource = outcome.pickSource;
    if (!outcome.shouldClear) return;
    emits("update:modelValue", (props.multiple ? [] : undefined) as ModelValue);
  },
);

const isMenuOpen = ref(false);

const slots = useSlots();
// `content-bottom` is filled below, after the add entry.
const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter((name) => name !== "content-bottom"),
);

const labeledIds = computed(
  () => new Set(mergedItems.value.map((item) => String(itemValue(item)))),
);
// Asked once each: an id the route does not answer (deleted, out of reach)
// keeps showing as is rather than being asked again.
const requestedIds = new Set<string>();

// The ids the route did not answer (deleted, out of reach), shown as "Not
// found" with the id on hover.
const notFoundIds: Ref<ReadonlySet<string>> = shallowRef(new Set());

async function loadValueItems(ids: string[]) {
  for (const id of ids) requestedIds.add(id);
  const source = { searchUrl: props.searchUrl, keyMapping: props.keyMapping };
  const rows = await readRelationRows(source, ids);
  const missing = notFoundRelationIds(source, ids, rows);
  if (!rows.length && !missing.length) return;
  notFoundIds.value = new Set([...notFoundIds.value, ...missing]);
  valueItems.value = [
    ...valueItems.value,
    ...rows.map((item) => mapData(item as Record<string, string>)),
    // Kept pickable, so the value can still be deselected.
    ...missing.map((id) => ({
      label: t("dms.form.relation.not_found"),
      value: id,
    })),
  ];
}

const notFoundTitle = computed(() => {
  const ids = [props.modelValue]
    .flat()
    .map(String)
    .filter((id) => notFoundIds.value.has(id));
  return ids.length ? ids.join(", ") : undefined;
});

// The picker shows a value through its item: an id no item carries yet is
// labelled (and given its avatar) from its row before the picker is opened.
onMounted(() => {
  watch(
    () =>
      unlabeledRelationIds(props.modelValue, labeledIds.value).filter(
        (id) => !requestedIds.has(id),
      ),
    (ids) => {
      if (ids.length > 0) void loadValueItems(ids);
    },
    { immediate: true },
  );
});

function onOpen(isOpen: boolean) {
  isMenuOpen.value = isOpen;
  if (isOpen && !data.value?.results?.length) {
    execute();
  }
}

const addEntryRef = useTemplateRef<HTMLElement>("addEntry");

function waitForDetached(element: HTMLElement | null): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (
        !element?.isConnected ||
        performance.now() - startedAt > MENU_CLOSE_MAX_MS
      ) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Opens the add form once the menu has left the page: its content animates
 * out, then hands the focus back to the field, and a drawer opened before
 * that took the focus leaving it for a click outside and closed at once.
 */
async function openAddDrawerOnceClosed(): Promise<void> {
  const menuContent = addEntryRef.value;
  isMenuOpen.value = false;
  await waitForDetached(menuContent);
  await new Promise((resolve) => setTimeout(resolve, MENU_FOCUS_SETTLE_MS));
  openAddDrawer();
}

function openAddDrawer() {
  const formOptions = addFormOptions.value;
  if (!formOptions) return;
  const drawer = openDrawer(
    dmsOwnDrawer({
      title: props.addFormTexts?.displayName
        ? processI18n(props.addFormTexts.displayName)
        : t("dms.table.new_item"),
      description: props.addFormTexts?.description
        ? processI18n(props.addFormTexts.description)
        : t("dms.table.new_item_description"),
      direction: "bottom",
      containerId: addContainerId,
      component: DmsForm,
      componentOptions: {
        ...formOptions,
        onSuccessCallback: (response: unknown, formData: unknown) => {
          clearGuards(addContainerId);
          drawer.close();
          handleAddSuccess(response, formData);
        },
      },
    }),
  );
}

function extractInsertedId(response: unknown): string | undefined {
  if (!response) return undefined;
  if (typeof response === "string") return response;
  if (Array.isArray(response)) {
    const first = response[0];
    return typeof first === "string" ? first : undefined;
  }
  if (typeof response === "object") {
    const r = response as Record<string, unknown>;
    if (typeof r.insertedId === "string") return r.insertedId;
    if (Array.isArray(r.insertedIds) && typeof r.insertedIds[0] === "string") {
      return r.insertedIds[0];
    }
    if (
      Array.isArray(r.generated_keys) &&
      typeof r.generated_keys[0] === "string"
    ) {
      return r.generated_keys[0];
    }
    if (typeof r.id === "string") return r.id;
    if (typeof r._id === "string") return r._id;
  }
  return undefined;
}

async function handleAddSuccess(response: unknown, formData: unknown) {
  const newId = extractInsertedId(response);
  if (newId && formData && typeof formData === "object") {
    const valueKey = props.keyMapping?.value || "value";
    const newItem = mapData({
      ...formData,
      [valueKey]: newId,
    });
    const exists = locallyAddedItems.value.some((item) =>
      typeof item === "object" && item !== null && "value" in item
        ? item.value === newId
        : false,
    );
    if (!exists) {
      locallyAddedItems.value = [...locallyAddedItems.value, newItem];
    }
  }
  await execute();
  if (!newId) return;
  if (props.multiple) {
    const current: unknown[] = Array.isArray(props.modelValue)
      ? props.modelValue
      : [];
    if (!current.includes(newId)) {
      emits("update:modelValue", [...current, newId] as ModelValue);
    }
  } else {
    emits("update:modelValue", newId as ModelValue);
  }
}

const addFormOptions = computed(() => {
  if (!props.addForm?.options) return null;
  return {
    ...props.addForm.options,
    componentId: `${instanceId}-add`,
    pageId: `${instanceId}-add`,
  };
});
</script>

<template>
  <USelectMenu
    v-bind="forwarded"
    v-model:search-term="searchTerm"
    :trailing-icon="props.trailingIcon ?? FIELD_TRIGGER_ICON"
    :model-value="props.modelValue"
    :open="isMenuOpen"
    :items="displayItems"
    :loading="status === 'pending'"
    value-key="value"
    :portal="false"
    :ignore-filter="true"
    :ui="{ content: 'z-50' }"
    :aria-label="t('dms.a11y.show_options')"
    :title="notFoundTitle"
    @update:open="onOpen"
    @update:model-value="handleUpdateModelValue"
  >
    <template v-for="name in forwardedSlotNames" :key="name" #[name]="slotData">
      <slot
        :name="name as keyof SelectMenuSlots<T, 'value', M>"
        v-bind="slotData ?? {}"
      />
    </template>
    <!-- The add entry is no item: picked, it became the field's value. -->
    <template v-if="canAdd || $slots['content-bottom']" #content-bottom>
      <div v-if="canAdd" ref="addEntry" class="border-default border-t p-1">
        <UButton
          :label="t('dms.form.relation.add_new')"
          icon="i-ph-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
          @click="openAddDrawerOnceClosed"
        />
      </div>
      <slot name="content-bottom" />
    </template>
  </USelectMenu>
</template>
