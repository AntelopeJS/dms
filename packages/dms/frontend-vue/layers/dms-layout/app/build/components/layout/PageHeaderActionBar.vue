<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import {
  QUICK_ACTION_BUTTON,
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
} from "#dms-ui/app/types/quick-actions";
import { usePermissionPreview } from "#dms-core/app/composables/auth/usePermissionPreview";
import { dispatchQuickActionTarget } from "../../../composables/page/useQuickActions";

/**
 * A header action as a backend page declares it (`DefaultLayout({
 * headerActions })` in interface-dms): it opens `to`, runs a quick action, or
 * presses a custom button of a component of the page. Actions behind a
 * permission the user lacks never reach the client.
 */
export interface LayoutHeaderAction {
  id: string;
  label?: string;
  icon?: string;
  to?: string;
  external?: boolean;
  /** Key (`category:id`) or bare id of a quick action. */
  quickAction?: string;
  /** Id of a component's custom button (a table view's `customButtons`). */
  button?: string;
  color?: ButtonProps["color"];
  variant?: ButtonProps["variant"];
}

interface PageHeaderActionBarProps {
  actions: LayoutHeaderAction[];
}

interface ResolvedHeaderAction {
  id: string;
  button: ButtonProps;
  /** Why the button is disabled, shown in a tooltip. */
  disabledReason?: string;
  /** "Preview as role" only: the role would not be shown this button. */
  previewLocked?: string;
}

interface PageCustomButton {
  id?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface PageButtonEntry {
  componentId: string;
  button: PageCustomButton;
}

const props = defineProps<PageHeaderActionBarProps>();

const { processI18n } = useTranslation();
const siteLayout = useSiteLayout();
const { quickActions } = siteLayout;
const route = useDmsRoute();
const router = useDmsRouter();

// The custom buttons the components of this page were served: one the user
// lacks the permission for was stripped, so its header action is left out.
const pageButtons = computed<PageButtonEntry[]>(() => {
  const layoutUrl = siteLayout.findMatchingRoute(route.path)?.metadata
    ?.layoutUrl;
  const layout = layoutUrl ? siteLayout.pageLayouts.value[layoutUrl] : null;
  return Object.entries(layout?.components ?? {}).flatMap(
    ([componentId, component]) =>
      (
        (component?.options as { customButtons?: PageCustomButton[] })
          ?.customButtons ?? []
      ).map((button) => ({ componentId, button })),
  );
});

// Pressed the way a quick action presses it: the table view watches these
// query keys and opens what the button opens.
function pressPageButton(componentId: string, buttonId: string) {
  void router.replace({
    query: {
      ...route.query,
      [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_BUTTON,
      [QUICK_ACTION_COMPONENT_KEY]: componentId,
      [QUICK_ACTION_BUTTON_KEY]: buttonId,
    },
  });
}

function resolveButtonAction(
  action: LayoutHeaderAction & { button: string },
  base: ButtonProps,
): ResolvedHeaderAction | null {
  const entry = pageButtons.value.find(
    (candidate) => candidate.button.id === action.button,
  );
  if (!entry) return null;
  const { disabled, disabledReason } = entry.button;
  return {
    id: action.id,
    button: {
      ...base,
      disabled,
      onClick: () => pressPageButton(entry.componentId, action.button),
    },
    disabledReason:
      disabled && disabledReason ? processI18n(disabledReason) : undefined,
  };
}

// A neutral action reads as the v2 outline button, any colored one is solid.
const defaultVariant = (
  color: ButtonProps["color"] | undefined,
): ButtonProps["variant"] =>
  !color || color === "neutral" ? "outline" : "solid";

function resolveAction(
  action: LayoutHeaderAction,
): ResolvedHeaderAction | null {
  const color = action.color ?? "neutral";
  const base: ButtonProps = {
    color,
    variant: action.variant ?? defaultVariant(color),
    icon: action.icon,
    label: action.label ? processI18n(action.label) : undefined,
  };
  if (action.button) {
    return resolveButtonAction({ ...action, button: action.button }, base);
  }
  if (action.quickAction) {
    // Quick actions are served per user: one missing here is not for them.
    const served = quickActions.value?.actions ?? {};
    const quickAction =
      served[action.quickAction] ??
      Object.values(served).find((entry) => entry.id === action.quickAction);
    if (!quickAction) return null;
    return {
      id: action.id,
      button: {
        ...base,
        icon: action.icon ?? quickAction.icon,
        label: base.label ?? processI18n(quickAction.displayName),
        onClick: () => dispatchQuickActionTarget(quickAction.target),
      },
    };
  }
  if (!action.to) return null;
  return {
    id: action.id,
    button: {
      ...base,
      to: action.to,
      target: action.external ? "_blank" : undefined,
      trailingIcon: action.external ? "i-ph-arrow-square-out" : undefined,
    },
  };
}

// "Preview as role": a button the role would not be shown stays, hatched and
// locked (the same look as the sidebar's locked entries). Outside a preview
// nothing is locked: the server and the rules above already left it out.
const preview = usePermissionPreview();
const { t } = useI18n();
const PREVIEW_LOCK_ICON = "i-ph-lock-simple";
const PREVIEW_LOCK_CLASS =
  "text-muted bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-error)_9%,transparent)_0_6px,transparent_6px_12px)]";

function lockForPreview(action: ResolvedHeaderAction): ResolvedHeaderAction {
  if (!preview.isHeaderActionHidden(action.id)) return action;
  return {
    ...action,
    button: {
      ...action.button,
      color: "neutral",
      variant: "outline",
      icon: PREVIEW_LOCK_ICON,
      class: PREVIEW_LOCK_CLASS,
      ui: { leadingIcon: "text-error" },
    },
    previewLocked: t("page.settings.roles.preview.menu_hidden", {
      role: preview.session.value?.roleName ?? "",
    }),
  };
}

const resolved = computed(() =>
  props.actions
    .map(resolveAction)
    .filter((action): action is ResolvedHeaderAction => action !== null)
    .map(lockForPreview),
);
</script>

<template>
  <template v-for="action in resolved" :key="action.id">
    <!-- A disabled button fires no pointer event: the tooltip hangs on a
      focusable wrapper, so the reason also reaches keyboard users. -->
    <UTooltip v-if="action.previewLocked" :text="action.previewLocked">
      <UButton v-bind="action.button" />
    </UTooltip>
    <UTooltip v-else-if="action.disabledReason" :text="action.disabledReason">
      <span tabindex="0" class="inline-flex">
        <UButton v-bind="action.button" />
      </span>
    </UTooltip>
    <UButton v-else v-bind="action.button" />
  </template>
</template>
