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
    watch.params = opts.params;
  }
  if (opts?.onParam !== undefined) watch.onParam = opts.onParam;
  if (opts?.requirePermission !== undefined) {
    watch.requirePermission = opts.requirePermission;
  }
  return watch;
}

/** Whether builder options are an object, which alone can carry `watchActions`. */
const isObjectOption = <O>(opts: O): opts is O & object =>
  typeof opts === "object" && opts !== null;

/** @internal */
export function stripWatchActions<O>(opts: O): O {
  if (!opts || !isObjectOption(opts) || !("watchActions" in opts)) {
    return opts;
  }
  const { watchActions: _ignored, ...rest } = opts;
  // SAFETY: No component options type requires watchActions, the transport key the builder owns (SlotFormOptions declares it optional), so the options without it are still an O.
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
  // SAFETY: The options plus watchActions, a key no options type requires, are still a T; options are absent only on a builder made without them, such as CustomComponent's ComponentBuilder<unknown>, whose T the bare object satisfies.
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
