<script setup lang="ts">
import { markRaw, type Component } from "vue";
import BlockPreviewIssue from "../../build/components/block-preview/BlockPreviewIssue.vue";
import { useBlockPreviewEmbed } from "../../build/composables/block-preview/useBlockPreviewEmbed";
import {
  collectPreviewIssues,
  decodePreviewState,
  resolvePreviewTree,
  type PreviewBlockTypes,
  type PreviewIssue,
  type PreviewResolvedNode,
  type PreviewTree,
} from "../../build/utils/blockPreview";
import { childComponentId } from "../../utils/componentId";

/**
 * Draws a tree of registered DMS blocks exactly as a page would.
 *
 * In a dashboard, hand it the tree: `<DmsBlockPreview :tree="node" />`. On
 * `/dms-preview` (`embed`), it reads `?state=` and the parent window's
 * `postMessage` instead, and reports back its height. There, `transparent`
 * marks the root so the preview layout paints no background.
 *
 * Only registered block types are drawn; any other node, a block needing a
 * backend resource, or one whose URL options are not relative paths of this
 * site, renders an inline notice.
 */
const props = withDefaults(
  defineProps<{
    tree?: PreviewTree;
    /** The allowlist; fetched from the backend when absent. */
    blockTypes?: PreviewBlockTypes;
    /** Driven by `?state=` and `postMessage`, as `/dms-preview` is. */
    embed?: boolean;
    /** Pads the blocks off the edges; `?state=` may override it. */
    padding?: boolean;
    pageId?: string;
    componentId?: string;
  }>(),
  {
    tree: undefined,
    blockTypes: undefined,
    embed: false,
    padding: false,
    pageId: "dms-preview",
    componentId: "preview",
  },
);

const BLOCK_TYPES_ENDPOINT = "/api/block-preview/types";
const STATE_QUERY = "state";

const { t, locale, locales, setLocale } = useI18n();
const route = useDmsRoute();
const root = useTemplateRef<HTMLElement>("root");

const stateParam = route.query[STATE_QUERY];
const initialState =
  props.embed && typeof stateParam === "string"
    ? decodePreviewState(stateParam)
    : undefined;
const isStateInvalid = props.embed && !!stateParam && !initialState;

function switchLocale(code: string): void {
  const known = locales.value.some((entry) => entry.code === code);
  if (known && code !== locale.value)
    void setLocale(code as typeof locale.value);
}

const embed = props.embed
  ? useBlockPreviewEmbed({ root, initialState, setLocale: switchLocale })
  : undefined;

const fetchedBlockTypes = ref<PreviewBlockTypes>();
const blockTypes = computed(() => props.blockTypes ?? fetchedBlockTypes.value);
const tree = computed(() => (embed ? embed.tree.value : props.tree));
const revision = computed(() => embed?.revision.value ?? 0);
const isTransparent = computed(() => embed?.transparent.value ?? false);
const isPadded = computed(
  () => initialState?.padding ?? (props.embed || props.padding),
);

const resolved = computed<PreviewResolvedNode[]>(() =>
  tree.value && blockTypes.value
    ? resolvePreviewTree(tree.value, blockTypes.value)
    : [],
);

function toPageComponent(node: PreviewResolvedNode): ResolvedComponentInfo {
  const component: Component | string = node.issue
    ? markRaw(BlockPreviewIssue)
    : (resolveDmsComponent(node.componentName) ?? "div");
  return {
    id: node.id,
    component,
    componentName: node.componentName,
    options: node.issue ? { issue: node.issue } : node.options,
    children: node.children.map(toPageComponent),
    ...(node.slot ? { slot: node.slot } : {}),
    ...(node.colSpan === undefined ? {} : { colSpan: node.colSpan }),
  };
}

const components = computed(() => resolved.value.map(toPageComponent));

function describeIssue(issue: PreviewIssue): string {
  return t(`dms.block_preview.${issue.key}`, {
    name: issue.name,
    value: issue.value ?? "",
  });
}

function reportIssues(nodes: PreviewResolvedNode[]): void {
  const issues = collectPreviewIssues(nodes);
  if (issues.length) embed?.reportError(issues.map(describeIssue).join("\n"));
}

watch(resolved, reportIssues);

onMounted(async () => {
  if (isStateInvalid) embed?.reportError(t("dms.block_preview.invalid_state"));
  reportIssues(resolved.value);
  // The page always hands the allowlist; fetching it is for a signed-in
  // dashboard, and a public visitor would only be sent to the login page.
  if (props.blockTypes || props.embed) return;
  const { $authFetch } = useAuthFetch();
  try {
    fetchedBlockTypes.value =
      await $authFetch<PreviewBlockTypes>(BLOCK_TYPES_ENDPOINT);
  } catch (error: unknown) {
    embed?.reportError(error instanceof Error ? error.message : String(error));
  }
});
</script>

<template>
  <div
    ref="root"
    data-dms-block-preview
    :data-dms-preview-transparent="isTransparent || undefined"
    :class="{ 'p-4 sm:p-6': isPadded }"
  >
    <UAlert
      v-if="isStateInvalid"
      color="error"
      variant="subtle"
      icon="i-ph-warning-circle"
      :title="t('dms.block_preview.invalid_state')"
    />
    <p
      v-else-if="!components.length && embed"
      class="text-muted py-8 text-center text-sm"
    >
      {{ t("dms.block_preview.empty") }}
    </p>
    <div v-else :key="revision" class="dms-page-stack space-y-6">
      <div
        v-for="component in components"
        :key="component.id"
        class="empty:hidden"
        data-dms-preview-block
      >
        <DmsRecursiveComponent
          :component="component"
          :page-id="pageId"
          :component-id="childComponentId(componentId, component.id)"
          :layout-path="component.id"
        />
      </div>
    </div>
  </div>
</template>
