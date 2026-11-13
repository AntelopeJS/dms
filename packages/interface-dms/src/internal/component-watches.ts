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
  // SAFETY: rest is an O exactly when O does not require watchActions and keeps its members as own enumerable fields, since the spread copies those and drops watchActions. Every options type of this package declares watchActions optional (BaseComponentProps, SlotFormOptions); a module's options type that requires it, or reads members through a prototype, is not one.
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
  // SAFETY: The result is a T exactly when options are a T whose watchActions, where T declares it, holds WatchAction[] as BaseComponentProps declares, or options are absent and T requires no member, as for CustomComponent's ComponentBuilder<unknown>. A builder whose T requires a member and that was never given options gets an object without it.
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
