<script setup lang="ts">
import { isString } from "../../../../../dms-core/app/utils/type-check";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { AgendaRelation } from "../../../types/full-agenda";
import type { AgendaFormValue } from "../../composables/agenda/agendaForm";

/**
 * The input of a `relation` field of the details form: a select that searches the records
 * the field points to on the server as the user types. The value kept is the record's id; the name of
 * the record already chosen is read from the same route with `?id=`.
 */
interface RelationItem {
  value: string;
  label: string;
  description?: string;
}

interface AgendaRelationInputProps {
  relation: AgendaRelation;
  /** The field's label, the name of the search box. */
  label: string;
  modelValue: AgendaFormValue;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_MIN_CHARS = 2;
const TYPING_PAUSE_MS = 250;

const props = withDefaults(defineProps<AgendaRelationInputProps>(), {
  id: undefined,
  invalid: false,
  disabled: false,
  placeholder: undefined,
});
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();
const { t } = useI18n();
const { $authFetch } = useAuthFetch();

const term = ref("");
const found = ref<RelationItem[]>([]);
const chosen = ref<RelationItem | null>(null);
const loading = ref(false);
let ticket = 0;
let pause: ReturnType<typeof setTimeout> | undefined;

const minChars = computed(() => props.relation.minChars ?? DEFAULT_MIN_CHARS);
const value = computed(() =>
  isString(props.modelValue) && props.modelValue ? props.modelValue : null,
);
const items = computed(() => {
  const selected = chosen.value;
  return selected && !found.value.some((item) => item.value === selected.value)
    ? [selected, ...found.value]
    : found.value;
});

/** The answer to a search, or `null` when a newer search has replaced it. */
async function ask(
  query: Record<string, string>,
): Promise<RelationItem[] | null> {
  const mine = ++ticket;
  loading.value = true;
  try {
    const answer = await $authFetch<{ items: RelationItem[] }>(
      props.relation.searchUrl,
      { query },
    );
    return mine === ticket ? answer.items : null;
  } catch {
    return mine === ticket ? [] : null;
  } finally {
    if (mine === ticket) loading.value = false;
  }
}

watch(term, (text) => {
  clearTimeout(pause);
  if (text.trim().length < minChars.value) {
    found.value = [];
    return;
  }
  pause = setTimeout(async () => {
    found.value = (await ask({ q: text.trim() })) ?? found.value;
  }, TYPING_PAUSE_MS);
});

watch(
  value,
  async (id) => {
    if (id === null) chosen.value = null;
    else if (chosen.value?.value !== id) {
      const answer = await ask({ id });
      if (answer) chosen.value = answer[0] ?? { value: id, label: id };
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => clearTimeout(pause));

const select = (id: string | null | undefined) => {
  const next = id ?? null;
  chosen.value = found.value.find((item) => item.value === next) ?? null;
  emit("update:modelValue", next);
};
</script>

<template>
  <USelectMenu
    :id="props.id"
    v-model:search-term="term"
    :model-value="value ?? undefined"
    :items="items"
    value-key="value"
    ignore-filter
    :loading="loading"
    :disabled="props.disabled"
    :placeholder="props.placeholder"
    :aria-label="props.label"
    :color="props.invalid ? 'error' : undefined"
    :highlight="props.invalid || undefined"
    class="w-full"
    data-agenda-relation
    @update:model-value="select"
  >
    <template #empty>
      {{
        term.trim().length < minChars
          ? t("dms.agenda.relation.type_more", { count: minChars })
          : loading
            ? t("dms.agenda.relation.searching")
            : t("dms.agenda.relation.none")
      }}
    </template>
  </USelectMenu>
</template>
