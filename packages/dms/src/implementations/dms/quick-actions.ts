import type {
  QuickActionCategoryInfo,
  QuickActionInfo,
  QuickActionTarget,
} from "@antelopejs/interface-dms/quick-actions";

const categoryRegistry = new Map<string, QuickActionCategoryInfo>();
const actionRegistry = new Map<string, QuickActionInfo>();

export namespace internal {
  export const RegisterQuickActionCategory = {
    register: (info: QuickActionCategoryInfo) => {
      if (categoryRegistry.has(info.id)) return;
      categoryRegistry.set(info.id, info);
    },
    unregister: (info: QuickActionCategoryInfo) => {
      categoryRegistry.delete(info.id);
    },
  };

  export const RegisterQuickAction = {
    register: (info: QuickActionInfo) => {
      if (!categoryRegistry.has(info.category.id)) {
        throw new Error(
          `QuickAction category "${info.category.id}" is not registered. Register the category before its actions.`,
        );
      }
      const fullId = `${info.category.id}:${info.id}`;
      if (actionRegistry.has(fullId)) return;
      actionRegistry.set(fullId, info);
    },
    unregister: (info: QuickActionInfo) => {
      actionRegistry.delete(`${info.category.id}:${info.id}`);
    },
  };
}

/**
 * A target with its page resolved: the route the browser navigates to, and the
 * component key its openForm and button variants address. The controller class
 * never leaves the server.
 */
export type QuickActionTargetSerialized =
  | { type: "navigate"; to: string; query?: Record<string, string> }
  | { type: "openForm"; to: string; component: string }
  | { type: "button"; to: string; component: string; button: string }
  | { type: "event"; name: string; payload?: unknown };

export type QuickActionSerialized = Omit<QuickActionInfo, "target"> & {
  target: QuickActionTargetSerialized;
};

export type QuickActionsPayload = {
  categories: Record<string, QuickActionCategoryInfo>;
  actions: Record<string, QuickActionSerialized>;
};

/**
 * Resolves a target against the page it belongs to. Returns undefined when the
 * caller may not reach that page — or when it is not registered at all, which
 * is a declaration error, not a permission one.
 */
export type QuickActionTargetResolver = (
  target: QuickActionTarget,
) => Promise<QuickActionTargetSerialized | undefined>;

/**
 * The quick actions the caller can actually run.
 *
 * Inaccessible ones are left out rather than flagged: unlike a page, a quick
 * action is never a destination the browser has to resolve, so nothing needs
 * to know it exists. A category whose actions all dropped goes with them.
 */
export async function getQuickActionsForUser(
  resolveTarget: QuickActionTargetResolver,
): Promise<QuickActionsPayload> {
  const actions: Record<string, QuickActionSerialized> = {};
  const usedCategories = new Set<string>();

  for (const [fullId, info] of actionRegistry) {
    const target = await resolveTarget(info.target);
    if (!target) continue;
    actions[fullId] = { ...info, target };
    usedCategories.add(info.category.id);
  }

  const categories: Record<string, QuickActionCategoryInfo> = {};
  for (const [id, info] of categoryRegistry) {
    if (usedCategories.has(id)) {
      categories[id] = info;
    }
  }

  return { categories, actions };
}
