<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import {
  QUICK_ACTION_ADD,
  QUICK_ACTION_BUTTON,
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
  type QuickActionIntent,
} from "#dms-ui/app/types/quick-actions";
import type { CustomButton } from "#dms-ui/app/composables/table-view/types/custom-button";
import type { ActionTarget } from "#dms-ui/app/composables/table-view/types/action-target";
import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { PREVIEW_LOCK_ICON } from "#dms-ui/app/build/utils/permissionPreview";
import { runMountedQuickAction } from "#dms-ui/app/build/utils/quickActionTargets";
import { useActionTargets } from "#dms-ui/app/build/composables/actions/useActionTargets";
import { refreshPageBlocks } from "#dms-ui/app/utils/blockRefresh";
import {
  hasUrlVariables,
  resolveLinkVariables,
} from "#dms-ui/app/build/utils/urlVariables";
import {
  dispatchQuickActionTarget,
  findServedQuickAction,
} from "#dms-ui/app/build/utils/dispatchQuickActionTarget";
import { DEFAULT_PAGE_HEADER_ACTIONS_ORDER } from "../../../composables/layout/usePageHeaderActions";

/**
 * A button of the page header as the server serves it (`DefaultLayout({
 * headerActions })` in interface-dms, and a component's buttons placed in
 * the header): a button the layout declares carries its `target`; one a
 * component places there names the component, which runs it. Buttons behind
 * a permission the user lacks never reach the client.
 */
export interface LayoutHeaderAction
  extends Partial<Omit<CustomButton, "id" | "color" | "variant">> {
  id: string;
  color?: ButtonProps["color"];
  variant?: ButtonProps["variant"];
  /** The component of the page whose button this is. */
  componentId?: string;
  /** Id of that component's button; absent for its built-in add. */
  buttonId?: string;
  /** Place among the header's buttons, smallest first; `0` by default. */
  order?: number;
}

interface PageHeaderActionBarProps {
  actions: LayoutHeaderAction[];
  /**
   * Where the default slot (the actions of `usePageHeaderActions`) goes
   * among the buttons: after every button of an order up to this one.
   */
  slotOrder?: number;
}

interface ResolvedHeaderAction {
  id: string;
  order: number;
  button: ButtonProps;
  /** Why the button is disabled, shown in a tooltip. */
  disabledReason?: string;
  /** "Preview as role" only: the role would not be shown this button. */
  previewLocked?: string;
}

const props = withDefaults(defineProps<PageHeaderActionBarProps>(), {
  slotOrder: DEFAULT_PAGE_HEADER_ACTIONS_ORDER,
});

const { processI18n } = useTranslation();
const siteLayout = useSiteLayout();
const { quickActions } = siteLayout;
const route = useDmsRoute();
const router = useDmsRouter();
const { $authFetch } = useAuthFetch();

// The page header runs a declared button's target as a table runs its
// toolbar buttons: confirmation, drawer, modal, API call, export, link. A
// button that changed something (an API call, a form it opened) changes the
// record the page shows: its blocks read their data again.
const { handleCustomButton } = useActionTargets({
  api: $authFetch,
  componentId: "page-header",
  pageId: siteLayout.findMatchingRoute(route.path)?.metadata?.fullId ?? "page",
  refreshCallback: refreshPageBlocks,
  handleApiError: (error, title) => useApiError(error, { title }),
});

// Pressed in place by the component of this page, so what it opens shows on
// the click. Only a component not mounted (yet) gets it the way a quick
// action does: through query keys its watcher reads, at the cost of two
// server visits.
function pressComponentButton(componentId: string, buttonId?: string) {
  const intent: QuickActionIntent = buttonId
    ? { kind: "button", button: buttonId }
    : { kind: "add" };
  if (runMountedQuickAction(route.path, componentId, intent)) return;
  void router.replace({
    query: {
      ...route.query,
      [QUICK_ACTION_QUERY_KEY]: buttonId
        ? QUICK_ACTION_BUTTON
        : QUICK_ACTION_ADD,
      [QUICK_ACTION_COMPONENT_KEY]: componentId,
      ...(buttonId ? { [QUICK_ACTION_BUTTON_KEY]: buttonId } : {}),
    },
  });
}

// A neutral action reads as the v2 outline button, any colored one is solid.
const defaultVariant = (
  color: ButtonProps["color"] | undefined,
): ButtonProps["variant"] =>
  !color || color === "neutral" ? "outline" : "solid";

const orderOf = (action: LayoutHeaderAction): number =>
  action.order ?? DEFAULT_PAGE_HEADER_ACTIONS_ORDER;

// A served label's translation reads the page query as its parameters:
// `"Download {locale}.json"` names the language of `?locale=`.
function labelParams(): Record<string, unknown> {
  const { routeParams, routeQuery } = pageUrlValues.value;
  return { ...routeParams, ...routeQuery };
}

function baseButton(action: LayoutHeaderAction): ButtonProps {
  const color = action.color ?? "neutral";
  return {
    color,
    variant: action.variant ?? defaultVariant(color),
    icon: action.icon,
    label: action.label ? processI18n(action.label, labelParams()) : undefined,
    disabled: action.disabled,
  };
}

type LinkTarget = Extract<ActionTarget, { type: "page" | "external" }>;
type UrlTarget = Extract<ActionTarget, { url: string }>;

const hasTargetUrl = (target: ActionTarget): target is UrlTarget =>
  typeof (target as Partial<UrlTarget>).url === "string";

// The values of the page a target's URL may name: a button declared once on
// the page leads to the record the page shows (`{{params.id}}`) or keeps its
// scope (`?workspace={{query.workspace}}`), following the URL as it changes.
const pageUrlValues = computed(() => ({
  routeParams: siteLayout.findMatchingRoute(route.path)?.params,
  routeQuery: route.query as Record<string, unknown>,
}));

function withPageValues(action: LayoutHeaderAction): LayoutHeaderAction {
  const { target } = action;
  if (!target || !hasTargetUrl(target) || !hasUrlVariables(target.url)) {
    return action;
  }
  return {
    ...action,
    target: {
      ...target,
      url: resolveLinkVariables(target.url, pageUrlValues.value),
    },
  };
}

// A link target (without a confirmation) renders as a link: middle click and
// "open in a new tab" keep working.
const LINK_TARGETS: Partial<
  Record<ActionTarget["type"], (target: LinkTarget) => ButtonProps>
> = {
  page: (target) => ({ to: target.url }),
  external: (target) => {
    const newTab = target.type === "external" && target.newTab;
    return {
      to: target.url,
      target: newTab ? "_blank" : undefined,
      trailingIcon: newTab ? "i-ph-arrow-square-out" : undefined,
    };
  },
};

function linkProps(action: LayoutHeaderAction): ButtonProps | undefined {
  const { target } = action;
  if (action.confirm || !target) return undefined;
  return LINK_TARGETS[target.type]?.(target as LinkTarget);
}

function resolveQuickActionButton(
  action: LayoutHeaderAction,
  base: ButtonProps,
  key: string,
): ResolvedHeaderAction | null {
  // Quick actions are served per user: one missing here is not for them.
  const quickAction = findServedQuickAction(quickActions.value?.actions, key);
  if (!quickAction) return null;
  return {
    id: action.id,
    order: orderOf(action),
    button: {
      ...base,
      icon: action.icon ?? quickAction.icon,
      label: base.label || processI18n(quickAction.displayName),
      onClick: () =>
        action.confirm
          ? handleCustomButton(action as CustomButton)
          : dispatchQuickActionTarget(quickAction.target),
    },
  };
}

function resolveAction(
  declared: LayoutHeaderAction,
): ResolvedHeaderAction | null {
  const action = withPageValues(declared);
  const base = baseButton(action);
  const disabledReason =
    action.disabled && action.disabledReason
      ? processI18n(action.disabledReason)
      : undefined;
  if (action.componentId) {
    const { componentId, buttonId } = action;
    return {
      id: action.id,
      order: orderOf(action),
      button: {
        ...base,
        onClick: () => pressComponentButton(componentId, buttonId),
      },
      disabledReason,
    };
  }
  if (!action.target) return null;
  if (action.target.type === "quickAction") {
    return resolveQuickActionButton(action, base, action.target.id);
  }
  return {
    id: action.id,
    order: orderOf(action),
    button: {
      ...base,
      ...(linkProps(action) ?? {
        onClick: () => handleCustomButton(action as CustomButton),
      }),
    },
    disabledReason,
  };
}

// "Preview as role": a button the role would not be shown stays, hatched and
// locked (the same look as the sidebar's locked entries). Outside a preview
// nothing is locked: the server and the rules above already left it out.
const preview = usePermissionPreview();
const { t } = useI18n();
const PREVIEW_LOCK_CLASS = "text-muted dms-hatch-locked";

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
    .map(lockForPreview)
    .sort((first, second) => first.order - second.order),
);

// The slot (the page's own actions) goes after every served button of an
// order up to its own: at an equal order the served ones lead, as they did
// before `order` existed.
const SLOT_KEY = "dms-page-header-slot";

interface HeaderBarEntry {
  key: string;
  /** Absent for the slot's place. */
  action?: ResolvedHeaderAction;
}

const entries = computed<HeaderBarEntry[]>(() => {
  const toEntry = (action: ResolvedHeaderAction) => ({
    key: action.id,
    action,
  });
  const leading = resolved.value.filter(
    (action) => action.order <= props.slotOrder,
  );
  const trailing = resolved.value.filter(
    (action) => action.order > props.slotOrder,
  );
  return [...leading.map(toEntry), { key: SLOT_KEY }, ...trailing.map(toEntry)];
});
</script>

<template>
  <template v-for="{ key, action } in entries" :key="key">
    <slot v-if="!action" />
    <!-- A disabled button fires no pointer event: the tooltip hangs on a
      focusable wrapper, so the reason also reaches keyboard users. -->
    <UTooltip v-else-if="action.previewLocked" :text="action.previewLocked">
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
