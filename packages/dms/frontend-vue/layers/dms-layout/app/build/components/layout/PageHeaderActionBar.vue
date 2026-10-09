<script setup lang="ts">
import type { ButtonProps, DropdownMenuItem } from "@nuxt/ui";
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
import { useRecordActions } from "#dms-ui/app/build/composables/actions/useRecordActions";
import {
  type RecordActionState,
  recordActionState,
} from "#dms-ui/app/build/utils/recordConditions";
import type {
  RecordAction,
  RecordActionFields,
} from "#dms-ui/app/types/record-action";
import { usePageRecord } from "#dms-core/app/build/composables/page/usePageRecord";
import { interpolateUrl } from "#dms-core/app/utils/url-interpolation";
import { replaceUrlVariables } from "#dms-ui/app/build/utils/urlVariables";
import {
  dispatchQuickActionTarget,
  findServedQuickAction,
} from "#dms-ui/app/build/utils/dispatchQuickActionTarget";

/**
 * A button of the page header as the server serves it (`DefaultLayout({
 * headerActions })` in interface-dms, and a component's buttons placed in
 * the header): a button the layout declares carries its `target`; one a
 * component places there names the component, which runs it. Buttons behind
 * a permission the user lacks never reach the client.
 *
 * On a page whose header loads a record (`header.fetchUrl`), its `when` and
 * `unavailableWhen` read that record, and a `menuGroup` puts it in the
 * header's "More actions" menu.
 */
export interface LayoutHeaderAction
  extends Partial<Omit<CustomButton, "id" | "color" | "variant">>,
    RecordActionFields {
  id: string;
  color?: ButtonProps["color"];
  variant?: ButtonProps["variant"];
  /** The component of the page whose button this is. */
  componentId?: string;
  /** Id of that component's button; absent for its built-in add. */
  buttonId?: string;
}

interface PageHeaderActionBarProps {
  actions: LayoutHeaderAction[];
}

interface ResolvedHeaderAction {
  id: string;
  button: ButtonProps;
  /** The menu group it is drawn in, rather than as a button. */
  menuGroup?: string;
  /** Under its label, in the menu. */
  description?: string;
  /** Why the button is disabled, shown in a tooltip. */
  disabledReason?: string;
  /** "Preview as role" only: the role would not be shown this button. */
  previewLocked?: string;
}

const props = defineProps<PageHeaderActionBarProps>();

const { processI18n } = useTranslation();
const siteLayout = useSiteLayout();
const { quickActions } = siteLayout;
const route = useDmsRoute();
const router = useDmsRouter();
const routeParams = () =>
  siteLayout.findMatchingRoute(route.path)?.params as
    | Record<string, string>
    | undefined;
// The record the page header loaded, when it loads one: the actions read
// their conditions on it, and their targets its fields.
const { record } = usePageRecord();

// The page header runs a declared button's target as a table runs its
// toolbar buttons: confirmation, drawer, modal, API call, export, link. A
// button that changed something (an API call, a form it opened) changes the
// record the page shows: its blocks, and the header, read their data again.
const { runRecordAction, urlContext } = useRecordActions({
  componentId: "page-header",
  pageId: siteLayout.findMatchingRoute(route.path)?.metadata?.fullId ?? "page",
  routeParams,
});
const runAction = (action: LayoutHeaderAction) =>
  runRecordAction(action as RecordAction, record.value);

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

function baseButton(
  action: LayoutHeaderAction,
  state: RecordActionState,
): ButtonProps {
  const color = action.color ?? "neutral";
  return {
    color,
    variant: action.variant ?? defaultVariant(color),
    icon: action.icon,
    label: action.label ? processI18n(action.label) : undefined,
    disabled: state.isDisabled,
  };
}

type LinkTarget = Extract<ActionTarget, { type: "page" | "external" }>;

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

// A link names the page's route tokens, and the record's fields once loaded.
function linkUrl(url: string): string {
  const routed = replaceUrlVariables(url, urlContext());
  return record.value ? interpolateUrl(routed, record.value) : routed;
}

function linkProps(action: LayoutHeaderAction): ButtonProps | undefined {
  const { target } = action;
  if (action.confirm || !target) return undefined;
  const link = LINK_TARGETS[target.type];
  if (!link) return undefined;
  const linkTarget = target as LinkTarget;
  return link({ ...linkTarget, url: linkUrl(linkTarget.url) });
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
    button: {
      ...base,
      icon: action.icon ?? quickAction.icon,
      label: base.label || processI18n(quickAction.displayName),
      onClick: () =>
        action.confirm
          ? runAction(action)
          : dispatchQuickActionTarget(quickAction.target),
    },
  };
}

function resolveAction(
  action: LayoutHeaderAction,
): ResolvedHeaderAction | null {
  const state = recordActionState(action as RecordAction, record.value);
  if (!state.isVisible) return null;
  const resolved = resolveButton(action, baseButton(action, state));
  if (!resolved) return null;
  return {
    ...resolved,
    menuGroup: action.menuGroup,
    description: action.description
      ? processI18n(action.description)
      : undefined,
    disabledReason:
      state.isDisabled && state.disabledReason
        ? processI18n(state.disabledReason)
        : undefined,
  };
}

function resolveButton(
  action: LayoutHeaderAction,
  base: ButtonProps,
): ResolvedHeaderAction | null {
  if (action.componentId) {
    const { componentId, buttonId } = action;
    return {
      id: action.id,
      button: {
        ...base,
        onClick: () => pressComponentButton(componentId, buttonId),
      },
    };
  }
  if (!action.target) return null;
  if (action.target.type === "quickAction") {
    return resolveQuickActionButton(action, base, action.target.id);
  }
  return {
    id: action.id,
    button: {
      ...base,
      ...(linkProps(action) ?? { onClick: () => runAction(action) }),
    },
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
    .map(lockForPreview),
);
const buttons = computed(() =>
  resolved.value.filter((action) => !action.menuGroup),
);

// A menu entry reads as its button: its link, its click, its reason (or its
// description) under its label.
function menuItem(action: ResolvedHeaderAction): DropdownMenuItem {
  const { button } = action;
  const { onClick } = button;
  return {
    label: button.label,
    icon: button.icon,
    color: button.color === "neutral" ? undefined : button.color,
    disabled: button.disabled,
    description:
      action.previewLocked ?? action.disabledReason ?? action.description,
    to: button.to,
    target: button.target,
    class: button.class,
    onSelect:
      typeof onClick === "function"
        ? (event: Event) => onClick(event as MouseEvent)
        : undefined,
  };
}

// The "More actions" menu: one list per `menuGroup`, in the order their
// first action is declared, set apart by a separator.
const menu = computed<DropdownMenuItem[][]>(() => {
  const groups = new Map<string, DropdownMenuItem[]>();
  for (const action of resolved.value) {
    if (!action.menuGroup) continue;
    const group = groups.get(action.menuGroup) ?? [];
    group.push(menuItem(action));
    groups.set(action.menuGroup, group);
  }
  return [...groups.values()];
});
const MENU_CONTENT = { align: "end" } as const;
const MENU_ICON = "i-ph-dots-three-outline";
</script>

<template>
  <template v-for="action in buttons" :key="action.id">
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
  <UDropdownMenu v-if="menu.length > 0" :items="menu" :content="MENU_CONTENT">
    <UButton
      color="neutral"
      variant="outline"
      :icon="MENU_ICON"
      :aria-label="t('header.more_actions')"
    />
  </UDropdownMenu>
</template>
