import {
  type DynamicMenuItem,
  type MenuItemStatus,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import {
  DYNAMIC_NAVIGATION_DETAIL_SLUG,
  DYNAMIC_NAVIGATION_PROJECT_SLUG,
  dynamicNavigationCategory,
} from "./category";

/** The projects the validation function of the project page knows. */
export const DEMO_PROJECT_IDS = ["invoicer", "resto-lucca", "sleepy-api"];
// The first project shows a count badge instead of its status dot.
const DEMO_BADGES: Record<string, string> = { invoicer: "3" };
const STATUS_CYCLE: MenuItemStatus[] = [
  "success",
  "warning",
  "neutral",
  "error",
];
const UNKNOWN_PROJECT_ID = "archived-project";
const EXTRA_ENTRIES_ORDER = 50;
// Listed only for a user holding the overview page's permission.
const OVERVIEW_PERMISSION_ID = `${dynamicNavigationCategory.fullId}.overview`;

// A real provider would read the tenant's data here; the playground keeps a
// fixed list, whose statuses the demo route rotates to show a live menu refresh.
let statusOffset = 0;

const statusOf = (index: number): MenuItemStatus => {
  const status = STATUS_CYCLE[(index + statusOffset) % STATUS_CYCLE.length];
  return status ?? "neutral";
};

export function rotateDemoProjectStatuses(): MenuItemStatus[] {
  statusOffset = (statusOffset + 1) % STATUS_CYCLE.length;
  return DEMO_PROJECT_IDS.map((_id, index) => statusOf(index));
}

function buildDemoProjects(): DynamicMenuItem[] {
  return DEMO_PROJECT_IDS.map((id, index) => ({
    id,
    displayName: id,
    fullSlug: DYNAMIC_NAVIGATION_PROJECT_SLUG,
    query: { project: id },
    icon: "i-ph-cube",
    order: index,
    status: statusOf(index),
    badge: DEMO_BADGES[id],
  }));
}

/** One entry per remaining `DynamicMenuItem` option. */
function buildOptionEntries(): DynamicMenuItem[] {
  return [
    {
      id: "lucca-detail",
      displayName: "resto-lucca (path)",
      description: "Fills the :projectId segment of the page slug",
      fullSlug: DYNAMIC_NAVIGATION_DETAIL_SLUG,
      params: { projectId: "resto-lucca" },
      icon: "i-ph-path",
      order: EXTRA_ENTRIES_ORDER,
    },
    {
      id: "launch",
      displayName: "Launch checklist",
      description: "An accent entry computed per request",
      fullSlug: DYNAMIC_NAVIGATION_PROJECT_SLUG,
      query: { project: "sleepy-api" },
      icon: "i-ph-rocket-launch",
      variant: "accent",
      order: EXTRA_ENTRIES_ORDER + 1,
      permissionId: OVERVIEW_PERMISSION_ID,
    },
    {
      id: UNKNOWN_PROJECT_ID,
      displayName: "Unknown project",
      description: "Fails the page validation and is redirected",
      fullSlug: DYNAMIC_NAVIGATION_PROJECT_SLUG,
      query: { project: UNKNOWN_PROJECT_ID },
      icon: "i-ph-question",
      order: EXTRA_ENTRIES_ORDER + 2,
    },
  ];
}

RegisterDynamicMenuProvider(dynamicNavigationCategory.fullId, () => [
  ...buildDemoProjects(),
  ...buildOptionEntries(),
]);
