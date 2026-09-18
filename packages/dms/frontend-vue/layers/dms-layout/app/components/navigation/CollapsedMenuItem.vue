<script lang="ts">
import { tv } from "tailwind-variants";

const theme = tv({
  slots: {
    topLevelButton:
      "relative flex items-center justify-center size-8 rounded-md transition-colors hover:bg-elevated",
    link: "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-elevated",
    icon: "shrink-0",
    // The collapsed rail leaves no room for a trailing dot, so a top-level
    // entry carries it as a badge on the corner of its icon. The ring makes it
    // readable whatever the icon underneath.
    topLevelStatusDot:
      "absolute top-0.5 right-0.5 size-2 rounded-full bg-current ring-2 ring-default",
    statusDot: "ml-auto size-2 shrink-0 rounded-full bg-current",
    chevron: "text-muted size-4 transition-transform",
    popoverContent: "p-1",
    popoverHeader:
      "text-muted px-2 py-1.5 text-xs font-semibold tracking-wide uppercase",
    childList: "space-y-0.5",
    collapsibleTrigger: "w-full justify-between",
    collapsibleContent: "mt-0.5 space-y-0.5",
  },
  variants: {
    isTopLevel: {
      true: { icon: "size-5" },
      false: { icon: "size-4" },
    },
    isOpen: {
      true: { chevron: "rotate-180" },
    },
    isAccent: {
      true: { topLevelButton: "text-primary", link: "text-primary" },
    },
  },
});
</script>

<script setup lang="ts">
import { DmsLink } from "#dms/frontend-module";
interface Props {
  item: DmsMenuItem;
  isTopLevel?: boolean;
  level?: number;
}

const props = withDefaults(defineProps<Props>(), {
  isTopLevel: false,
  level: 0,
});

const ui = computed(() =>
  theme({
    isTopLevel: props.isTopLevel,
    isAccent: props.item.variant === "accent",
  }),
);

// Rendered as a plain dot taking its color from the shared status map.
const statusClass = computed(() =>
  props.item.status ? MENU_STATUS_TEXT_CLASSES[props.item.status] : undefined,
);

const hasChildren = computed(() => {
  return props.item.children && props.item.children.length > 0;
});

const MENU_INDENT_PX = 12;
const TOOLTIP_OPEN_DELAY = 50;

const paddingLeft = computed(() => {
  return props.level > 0 ? `${props.level * MENU_INDENT_PX}px` : undefined;
});

const chevronClass = (isOpen: boolean) => {
  return theme({ isOpen }).chevron();
};

const { prefetchPageLayout } = usePrefetch();

function onLinkHover(): void {
  const { to } = props.item;
  if (typeof to === "string") {
    prefetchPageLayout(stripQueryAndHash(to));
    return;
  }
  const path = (to as MenuItemTarget | undefined)?.path;
  if (path) {
    prefetchPageLayout(path);
  }
}
</script>

<template>
  <template v-if="!hasChildren">
    <UTooltip
      v-if="isTopLevel"
      :text="item.label"
      :content="{ side: 'right', sideOffset: 8 }"
    >
      <component
        :is="item.to ? DmsLink : 'div'"
        :to="item.to"
        :class="ui.topLevelButton()"
        @mouseenter="onLinkHover"
      >
        <UIcon v-if="item.icon" :name="item.icon" :class="ui.icon()" />
        <span
          v-if="statusClass"
          :class="[ui.topLevelStatusDot(), statusClass]"
        />
      </component>
    </UTooltip>

    <component
      :is="item.to ? DmsLink : 'div'"
      v-else
      :to="item.to"
      :class="ui.link()"
      :style="{ paddingLeft }"
      @mouseenter="onLinkHover"
    >
      <UIcon v-if="item.icon" :name="item.icon" :class="ui.icon()" />
      <span>{{ item.label }}</span>
      <span v-if="statusClass" :class="[ui.statusDot(), statusClass]" />
    </component>
  </template>

  <template v-else>
    <UPopover
      v-if="isTopLevel"
      mode="hover"
      :open-delay="TOOLTIP_OPEN_DELAY"
      :content="{ side: 'right', sideOffset: 8, align: 'start' }"
      :ui="{ content: 'min-w-48 max-h-[70vh] overflow-y-auto' }"
    >
      <button type="button" :class="ui.topLevelButton()">
        <UIcon v-if="item.icon" :name="item.icon" :class="ui.icon()" />
      </button>

      <template #content>
        <div :class="ui.popoverContent()">
          <div v-if="item.label" :class="ui.popoverHeader()">
            {{ item.label }}
          </div>
          <ul :class="ui.childList()">
            <li v-for="(child, index) in item.children" :key="index">
              <DmsCollapsedMenuItem
                :item="child"
                :is-top-level="false"
                :level="0"
              />
            </li>
          </ul>
        </div>
      </template>
    </UPopover>

    <UCollapsible v-else class="w-full">
      <template #default="{ open }">
        <button
          type="button"
          :class="[ui.link(), ui.collapsibleTrigger()]"
          :style="{ paddingLeft }"
        >
          <span class="flex items-center gap-2">
            <UIcon v-if="item.icon" :name="item.icon" :class="ui.icon()" />
            <span>{{ item.label }}</span>
          </span>
          <UIcon name="i-ph-caret-down-light" :class="chevronClass(open)" />
        </button>
      </template>

      <template #content>
        <ul :class="ui.collapsibleContent()">
          <li v-for="(child, index) in item.children" :key="index">
            <DmsCollapsedMenuItem
              :item="child"
              :is-top-level="false"
              :level="level + 1"
            />
          </li>
        </ul>
      </template>
    </UCollapsible>
  </template>
</template>
