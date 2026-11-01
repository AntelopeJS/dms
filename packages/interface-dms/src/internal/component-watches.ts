/** @internal */
import type { WatchAction } from "../watch-actions";
import { ComponentId } from "../watch-actions";
import type {
  ComponentBuilder,
  ComponentFilter,
  ComponentInfoSerialized,
  WatchOptions,
} from "../component";

/** @internal */
export function createFilterChain<T>(
  owner: ComponentBuilder<T>,
  userFilter: () => ComponentBuilder<T>["_userOnFilter"],
  applyWatchFilters: ComponentBuilder<T>["applyWatchFilters"],
): ComponentFilter<T> {
  const filters = {
    get user() {
      return userFilter();
    },
  };
  return async (permissions, options, permissionId, context) => {
    let next: T = options;
    if (filters.user) {
      // oxlint-disable-next-line anti-slop/no-reflect-apply -- Keep the builder receiver without reading the callback's shadowable call property.
      next = await Reflect.apply(filters.user, owner, [
        permissions,
        next,
        permissionId,
        context,
      ]);
    }
    next = await applyWatchFilters(permissions, next, permissionId);
    return next;
  };
}

/** @internal */
export function readWatchActions<O>(options: NonNullable<O>): WatchAction[] {
  const watchOptions: { watchActions?: WatchAction[] } = options;
  return watchOptions.watchActions ?? [];
}

/** @internal */
export function appendChildWatch(
  childWatches: () => ComponentBuilder["_childWatches"],
  childId: string,
  watch: WatchAction,
): void {
  const existing = childWatches().get(childId) ?? [];
  existing.push(watch);
  childWatches().set(childId, existing);
}

/** @internal */
export function buildWatchAction<F extends string>(
  event: string,
  functionId: F,
  opts: WatchOptions<F> | undefined,
): WatchAction {
  const watch: WatchAction = {
    component: ComponentId.SELF,
    event,
    functionId,
  };
  if (opts?.params !== undefined) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Consumer declaration merging can supply watch parameter interfaces without dictionary index signatures; transport preserves those values without parsing.
    watch.params = opts.params as WatchAction["params"];
  }
  if (opts?.onParam !== undefined) watch.onParam = opts.onParam;
  if (opts?.requirePermission !== undefined) {
    watch.requirePermission = opts.requirePermission;
  }
  return watch;
}

/** @internal */
export function stripWatchActions<O>(opts: O): O {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Options can be primitives; only object options can carry caller-supplied watchActions to strip.
  if (!opts || typeof opts !== "object" || !("watchActions" in opts)) {
    return opts;
  }
  const { watchActions: _ignored, ...rest } = opts;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published builder preserves O while intentionally stripping watchActions, even if a consumer includes that key in O.
  return rest as O;
}

/** @internal */
export function mergeWatchesIntoOptions<T>(
  options: T | undefined,
  watches: WatchAction[],
): T | undefined {
  if (watches.length === 0) {
    return options;
  }
  const optionsObj: {
    watchActions?: WatchAction[];
  } = options ?? {};
  const existing = optionsObj.watchActions ?? [];
  const merged = [...existing, ...watches];
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The builder's published T is preserved while watchActions is added to its serialized transport.
  return { ...optionsObj, watchActions: merged } as T;
}

/** @internal */
export function spliceChildWatches<T>(
  result: ComponentInfoSerialized<T>,
  childWatches: () => ComponentBuilder<T>["_childWatches"],
): ComponentInfoSerialized<T> {
  if (childWatches().size === 0 || !result.children) {
    return result;
  }
  return {
    ...result,
    children: result.children.map((child) => {
      const watches = childWatches().get(child.id);
      if (!watches || watches.length === 0) {
        return child;
      }
      const childOptions: {
        watchActions?: WatchAction[];
      } = child.component.options ?? {};
      const existing = childOptions.watchActions ?? [];
      return {
        ...child,
        component: {
          ...child.component,
          options: {
            ...childOptions,
            watchActions: [...existing, ...watches],
          },
        },
      };
    }),
  };
}
