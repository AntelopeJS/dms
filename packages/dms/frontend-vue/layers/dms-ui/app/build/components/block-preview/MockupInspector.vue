<script setup lang="ts">
import { computed, ref } from "vue";
import type { MockupBlockType } from "../../utils/mockupCatalog";
import type { MockupEdit } from "../../utils/mockupEdit";
import {
  inspectorFields,
  type MockupInspectorTab,
} from "../../utils/mockupInspector";
import { blockName, breadcrumb } from "../../utils/mockupOutline";
import {
  MOCKUP_SKETCH_TYPE,
  nodeAt,
  type MockupSpecDocument,
} from "../../utils/mockupSpec";
import type { MockupIssue } from "../../utils/mockup";
import MockupInspectorField from "./MockupInspectorField.vue";
import MockupIssues from "./MockupIssues.vue";
import MockupPageInspector from "./MockupPageInspector.vue";

/**
 * Edit mode's right panel. A selected block shows its visual options, Content
 * and Style, and hands its data to the AI; a custom zone offers the AI or a
 * DMS block in its place; with nothing selected, the page's own settings.
 */
const props = defineProps<{
  spec: MockupSpecDocument;
  page: number;
  selection: string | undefined;
  catalog: ReadonlyMap<string, MockupBlockType>;
  issues: MockupIssue[];
}>();
const emit = defineEmits<{
  edit: [edit: MockupEdit, coalesceKey?: string];
  connectData: [pointer: string];
  askAi: [pointer: string];
  replace: [pointer: string];
}>();

const TABS: readonly MockupInspectorTab[] = ["content", "style"];
const DATA_GROUPS = new Set(["data", "visualization"]);

const { t } = useI18n();
const tab = ref<MockupInspectorTab>("content");

const node = computed(() =>
  props.selection ? nodeAt(props.spec, props.selection) : undefined,
);
const block = computed(() => props.catalog.get(node.value?.type ?? ""));
const isSketch = computed(() => node.value?.type === MOCKUP_SKETCH_TYPE);
const fields = computed(() =>
  block.value ? inspectorFields(block.value, tab.value) : [],
);
const trail = computed(() =>
  props.selection ? breadcrumb(props.spec, props.selection, props.catalog) : [],
);
const hasData = computed(() => {
  const type = block.value;
  if (!type) return false;
  return (
    DATA_GROUPS.has(type.meta.group ?? "") ||
    Object.values(type.config).some((option) => option.ui?.group === "data")
  );
});

function optionValue(key: string): unknown {
  const options = node.value?.options ?? {};
  return Object.hasOwn(options, key) ? options[key] : undefined;
}

function setOption(key: string, value: unknown): void {
  const pointer = props.selection;
  if (!pointer) return;
  emit("edit", { kind: "setOption", pointer, key, value }, `${pointer}:${key}`);
}
</script>

<template>
  <aside
    class="border-default bg-default min-h-0 overflow-y-auto border-s"
    :aria-label="t('dms.mockup.inspector')"
    data-dms-mockup-inspector
  >
    <div v-if="node && selection" class="space-y-4 p-4">
      <header class="space-y-1">
        <h2 class="text-highlighted text-sm font-semibold">
          {{
            isSketch ? t("dms.mockup.sketch_title") : blockName(node, catalog)
          }}
        </h2>
        <p class="text-dimmed truncate font-mono text-[11px]">
          {{ trail.join(" › ") }}
        </p>
      </header>

      <template v-if="isSketch">
        <p class="text-muted text-sm">{{ t("dms.mockup.sketch_hint") }}</p>
        <div class="flex flex-col gap-2">
          <UButton
            color="primary"
            icon="i-ph-sparkle"
            block
            data-dms-mockup-ask-ai
            @click="emit('askAi', selection)"
          >
            {{ t("dms.mockup.ask_ai") }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-ph-squares-four"
            block
            data-dms-mockup-replace
            @click="emit('replace', selection)"
          >
            {{ t("dms.mockup.replace_block") }}
          </UButton>
        </div>
      </template>

      <template v-else>
        <div
          class="border-default inline-flex gap-0.5 rounded-md border p-0.5"
          role="tablist"
        >
          <UButton
            v-for="entry in TABS"
            :key="entry"
            size="xs"
            color="neutral"
            role="tab"
            :variant="entry === tab ? 'soft' : 'ghost'"
            :aria-selected="entry === tab"
            :data-dms-mockup-inspector-tab="entry"
            @click="tab = entry"
          >
            {{ t(`dms.mockup.tab_${entry}`) }}
          </UButton>
        </div>
        <p v-if="!fields.length" class="text-muted text-xs">
          {{ t("dms.mockup.no_fields") }}
        </p>
        <MockupInspectorField
          v-for="field in fields"
          :key="`${selection}:${field.key}`"
          :field="field"
          :value="optionValue(field.key)"
          @update="setOption(field.key, $event)"
        />
        <section
          v-if="hasData"
          class="border-default bg-elevated/50 space-y-2 rounded-lg border p-3"
          data-dms-mockup-data-card
        >
          <h3 class="text-highlighted text-sm font-semibold">
            {{ t("dms.mockup.data_title") }}
          </h3>
          <p class="text-muted text-sm">{{ t("dms.mockup.data_hint") }}</p>
          <UButton
            color="primary"
            icon="i-ph-sparkle"
            block
            data-dms-mockup-connect-data
            @click="emit('connectData', selection)"
          >
            {{ t("dms.mockup.connect_data") }}
          </UButton>
        </section>
      </template>
    </div>

    <template v-else>
      <MockupPageInspector
        :spec="spec"
        :page="page"
        @edit="(edit, key) => emit('edit', edit, key)"
      />
      <div class="px-4 pb-4">
        <MockupIssues :issues="issues" />
      </div>
    </template>
  </aside>
</template>
