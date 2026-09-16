<script setup lang="ts">
interface Props {
  component: ResolvedComponentInfo;
  pageId: string;
  componentId: string;
  routeParams?: Record<string, string>;
}

const props = defineProps<Props>();

function calculateColumnCount(
  children: ResolvedComponentInfo[] | undefined,
): number {
  if (!children) return 0;
  return children.reduce(
    (sum, child) => sum + ((child.colSpan as number) || 1),
    0,
  );
}

function getColSpanStyle(
  child: ResolvedComponentInfo,
): Record<string, string> | undefined {
  const colSpan = Number(child.colSpan);
  if (!colSpan || colSpan <= 1) return undefined;
  return { gridColumn: `span ${colSpan}` };
}

const columnCount = computed(() =>
  calculateColumnCount(props.component.children),
);
</script>

<template>
  <Component
    :is="component.component"
    v-bind="JSON.parse(JSON.stringify(component.options || {})) || {}"
    :page-id="pageId"
    :component-id="componentId"
    :child-count="columnCount"
    :route-params="routeParams"
  >
    <template
      v-for="(child, childIndex) in component.children?.filter((c) => c.slot)"
      :key="`${componentId}-slot-${childIndex}`"
      #[child.slot]
    >
      <div v-if="getColSpanStyle(child)" :style="getColSpanStyle(child)">
        <DmsRecursiveComponent
          :component="child"
          :page-id="pageId"
          :component-id="`${componentId}-child-${child.id}`"
          :route-params="routeParams"
        />
      </div>
      <DmsRecursiveComponent
        v-else
        :component="child"
        :page-id="pageId"
        :component-id="`${componentId}-child-${child.id}`"
        :route-params="routeParams"
      />
    </template>
    <template
      v-for="(child, childIndex) in component.children?.filter((c) => !c.slot)"
      :key="`${componentId}-child-${childIndex}`"
    >
      <div v-if="getColSpanStyle(child)" :style="getColSpanStyle(child)">
        <DmsRecursiveComponent
          :component="child"
          :page-id="pageId"
          :component-id="`${componentId}-child-${child.id}`"
          :route-params="routeParams"
        />
      </div>
      <DmsRecursiveComponent
        v-else
        :component="child"
        :page-id="pageId"
        :component-id="`${componentId}-child-${child.id}`"
        :route-params="routeParams"
      />
    </template>
  </Component>
</template>
