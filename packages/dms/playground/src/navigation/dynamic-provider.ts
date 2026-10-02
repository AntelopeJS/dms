import {
  type DynamicMenuItem,
  type MenuItemStatus,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import {
  DYNAMIC_NAVIGATION_PROJECT_SLUG,
  dynamicNavigationCategory,
} from "./category";

const DEMO_PROJECT_IDS = ["invoicer", "resto-lucca", "sleepy-api"];
// The first project shows a count badge instead of its status dot.
const DEMO_BADGES: Record<string, string> = { invoicer: "3" };
const STATUS_CYCLE: MenuItemStatus[] = [
  "success",
  "warning",
  "neutral",
  "error",
];

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

RegisterDynamicMenuProvider(
  dynamicNavigationCategory.fullId,
  buildDemoProjects,
);
