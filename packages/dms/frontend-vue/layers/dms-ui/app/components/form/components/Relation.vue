<script
  setup
  lang="ts"
  generic="T extends ArrayOrNested<SelectMenuItem>, M extends boolean = false"
>
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
import type { FormProps } from "../../../composables/form/types";

const SEARCH_DEBOUNCE_MS = 200;
const ADD_NEW_VALUE = "__dms_relation_add_new__";

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
  addForm?: { componentName: string; options?: FormProps };
  addPermissionId?: string;
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
    addPermissionId: _______,
    ...rest
  } = props;
  return rest as SelectMenuProps<T, "value", M>;
});
const forwarded = useForwardPropsEmits(forwardedProps, emits);

type ModelValue = SelectMenuEmits<T, "value", M>["update:modelValue"][0];

function isAddNewValue(value: unknown): boolean {
  if (value === ADD_NEW_VALUE) return true;
  if (Array.isArray(value)) return value.includes(ADD_NEW_VALUE);
  return false;
}

function handleUpdateModelValue(value: ModelValue) {
  if (isAddNewValue(value)) {
    openAddDrawer();
    if (Array.isArray(value)) {
      emits(
        "update:modelValue",
        (value as unknown[]).filter((v) => v !== ADD_NEW_VALUE) as ModelValue,
      );
    } else {
      emits("update:modelValue", props.modelValue as ModelValue);
    }
    return;
  }
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

const { $authFetch } = useAuthFetch();
const toast = useToast();
const { t } = useI18n();
const { hasPermission, isLoaded, fetchPermissions } = usePermissions();
const { open: openDrawer } = useDrawer();
const { clearGuards } = useLeaveGuard();

if (!isLoaded.value) {
  await fetchPermissions().catch(() => {});
}

const addContainerId = `relation-add-${useId()}`;
// Shallow: `SelectMenuItem` carries a string index signature, so a deeply
// unwrapped item is an unbounded type for the checker. The list is always
// replaced, never mutated in place.
const locallyAddedItems: Ref<SelectMenuItem[]> = shallowRef([]);

const canAdd = computed(
  () =>
    !!props.addForm &&
    !!props.addForm.options?.submitUrl &&
    (!props.addPermissionId || hasPermission(props.addPermissionId)),
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
    label: item[labelValue] as string,
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
  const data = await $authFetch<RelationResponse>(props.searchUrl, {
    params: {
      search: searchTermDebounced.value || undefined,
    },
    onRequestError: ({ error }: { error: Error }) => {
      toast.add({
        color: Color.error,
        title: t("dms.form.error_title"),
        description: error.message,
      });
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
    watch: [searchTermDebounced],
  },
);

function isMappableObject(value: unknown): value is Record<string, string> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const initialItems = computed(() => {
  if (!props.initialValue) return [];

  const values = Array.isArray(props.initialValue)
    ? props.initialValue
    : [props.initialValue];

  return values.filter(isMappableObject).map(mapData);
});

const mergedItems = computed<SelectMenuItem[]>(() => {
  const searchResults = data.value?.results || [];
  const initial = initialItems.value || [];
  const added = locallyAddedItems.value;

  const merged: SelectMenuItem[] = [...initial, ...added];
  const existingValues = new Set(
    merged.map((item) =>
      typeof item === "object" && item !== null && "value" in item
        ? item.value
        : item,
    ),
  );

  searchResults.forEach((item) => {
    const itemValue =
      typeof item === "object" && item !== null && "value" in item
        ? item.value
        : item;

    if (!existingValues.has(itemValue)) {
      merged.push(item);
    }
  });

  if (canAdd.value) {
    if (merged.length > 0) {
      merged.push({ type: "separator" });
    }
    merged.push({
      label: t("dms.form.relation.add_new"),
      value: ADD_NEW_VALUE,
      icon: "i-ph-plus",
    });
  }

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

  const { avatarSource, ...rest } = item as AvatarSourceItem;
  const avatar = buildAvatarProps(avatarSource, rest.label);

  return { ...rest, ...(avatar ? { avatar } : {}) } as SelectMenuItem;
}

const displayItems = computed<SelectMenuItem[]>(() =>
  mergedItems.value.map(resolveItemAvatar),
);

watch(
  mergedItems,
  (items) => {
    for (const item of items) {
      const source = (item as AvatarSourceItem).avatarSource;
      if (isImageRefValue(source)) {
        void resolveAvatarUrl(source.key);
      }
    }
  },
  { immediate: true },
);

function onOpen(isOpen: boolean) {
  if (isOpen && !data.value?.results?.length) {
    execute();
  }
}

function openAddDrawer() {
  const formOptions = addFormOptions.value;
  if (!formOptions) return;
  const drawer = openDrawer({
    title: t("dms.table.new_item"),
    description: t("dms.table.new_item_description"),
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
  });
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
      return r.insertedIds[0] as string;
    }
    if (
      Array.isArray(r.generated_keys) &&
      typeof r.generated_keys[0] === "string"
    ) {
      return r.generated_keys[0] as string;
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
      ...(formData as Record<string, string>),
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
    :model-value="props.modelValue"
    :items="displayItems as T"
    :loading="status === 'pending'"
    value-key="value"
    :portal="false"
    :ignore-filter="true"
    :ui="{ content: 'z-50' }"
    @update:open="onOpen"
    @update:model-value="handleUpdateModelValue"
  >
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotData">
      <slot
        :name="name as keyof SelectMenuSlots<T, 'value', M>"
        v-bind="slotData ?? {}"
      />
    </template>
  </USelectMenu>
</template>
