import { Logging } from "@antelopejs/interface-core/logging";
import type {
  WatchAction,
  WatchActionCondition,
  WatchFunctionParams,
} from "./base/types/watch";
import { ComponentId } from "./base/types/watch";
import type { PageMetadata } from "./page";
import type { Permission } from "./permissions";
import type { MaybePromise } from "./types";

export interface ActionDefinition {
  title: string;
  icon?: string;
  description?: string;
  defaultGranted?: boolean;
}

const actionComponents = new WeakMap<Action, Component>();

export class Action {
  constructor(
    public readonly id: string,
    public readonly definition: ActionDefinition,
    component: Component,
  ) {
    actionComponents.set(this, component);
  }

  get permissionId(): string | undefined {
    const component = actionComponents.get(this);
    if (!component) return undefined;
    const componentPermissionId = getPermissionIdRef.get(component);
    if (!componentPermissionId) {
      return undefined;
    }
    return `${componentPermissionId}.${this.id}`;
  }

  toPermission(): Permission | undefined {
    const id = this.permissionId;
    if (!id) return undefined;
    return {
      id,
      title: this.definition.title,
      icon: this.definition.icon,
      description: this.definition.description,
      defaultGranted: this.definition.defaultGranted,
    };
  }
}

export const getPermissionIdRef = {
  get(_component: Component): string | undefined {
    return undefined;
  },
};

export namespace ComponentEvents {
  export const LOAD = "DmsComponent.Load";
  export const UNLOAD = "DmsComponent.Unload";
}

export interface ComponentChild<T = unknown, C = Component<T>> {
  id: string;
  component: C;
  slot?: string;
  [key: string]: unknown;
}

export interface ComponentInfo<
  T = unknown,
  C = Component<T>,
  ChildType = ComponentChild<T, C>,
> {
  componentName: string;
  options?: T;
  children?: ChildType[];
}

export type ChildSerialized = {
  id: string;
  component: ComponentInfoSerialized;
  slot?: string;
  [key: string]: unknown;
};

export type ComponentInfoSerialized<T = unknown> = Omit<
  ComponentInfo<T>,
  "children"
> & {
  children?: ChildSerialized[];
};

export interface BaseComponentChild {
  id: string;
  component: Component;
  slot?: string;
  [key: string]: unknown;
}

// Each option is set only when the caller passed it, so a watch without params
// carries no `params` key -- which is what the serialised component contract
// distinguishes from a key holding undefined.
function buildWatchAction<F extends string>(
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
    watch.params = opts.params as Record<string, unknown>;
  }
  if (opts?.onParam !== undefined) watch.onParam = opts.onParam;
  if (opts?.requirePermission !== undefined) {
    watch.requirePermission = opts.requirePermission;
  }
  return watch;
}

/** A component position below one of a page's static root components. */
export class ComponentTarget {
  constructor(
    public readonly root: Component,
    public readonly path: readonly string[],
  ) {}
}

/** A page component itself or one of its nested positions. */
export type ComponentTargetInput = Component | ComponentTarget;

export interface ComponentMetadata {
  name: string;
  description?: string;
  icon?: string;
}

export type ComponentInfoPromise<T = unknown> = MaybePromise<
  ComponentInfo<T, Component<T>, BaseComponentChild>
>;

/**
 * Where an injected component sits relative to its anchor. `end` appends it
 * after every component of the target page.
 */
export type PlacementSide = "before" | "after" | "end";

/**
 * Placement of a component injected into another page by
 * `@RegisterPageExtension`. Ignored on a component declared on its own page.
 */
export interface ComponentPlacement {
  side: PlacementSide;
  anchor?: ComponentTargetInput;
  order: number;
}

/** Placement of a component that declared none: appended, no ordering hint. */
export const DEFAULT_PLACEMENT: ComponentPlacement = {
  side: "end",
  order: 0,
};

export class Component<T = unknown> {
  protected _componentInfo: ComponentInfoPromise<T>;
  protected _metadata: ComponentMetadata;
  protected _onPageCreated?: (page: PageMetadata) => void;
  protected _onFilter?: (
    permissions: Set<string>,
    options: any,
    permissionId: string,
  ) => MaybePromise<any>;
  protected _actions: Record<string, Action> = {};
  protected _placement?: ComponentPlacement;

  get actions(): Record<string, Action> {
    return this._actions;
  }

  getAction(id: string): Action | undefined {
    return this._actions[id];
  }

  constructor(
    componentInfo: ComponentInfoPromise<T>,
    metadata: ComponentMetadata,
    onPageCreated?: (page: PageMetadata) => void,
  ) {
    this._componentInfo = componentInfo;
    this._metadata = metadata;
    this._onPageCreated = onPageCreated;
  }

  get componentInfo(): ComponentInfoPromise<T> {
    return this._componentInfo;
  }

  get metadata(): ComponentMetadata {
    return this._metadata;
  }

  get onPageCreated() {
    return this._onPageCreated;
  }

  get onFilterCallback() {
    return this._onFilter;
  }

  get placement(): ComponentPlacement | undefined {
    return this._placement;
  }

  private setPlacement(placement: Partial<ComponentPlacement>): this {
    this._placement = {
      ...DEFAULT_PLACEMENT,
      ...this._placement,
      ...placement,
    };
    return this;
  }

  /**
   * Inject this component just above `anchor` on the extended page. Use a
   * static component field for a root anchor, or `.targetChild()` to inject it
   * beside a nested anchor. Only meaningful on a component declared inside a
   * `@RegisterPageExtension` class.
   */
  before(anchor: ComponentTargetInput): this {
    return this.setPlacement({ side: "before", anchor });
  }

  /** Inject this component just below `anchor`. See {@link Component.before}. */
  after(anchor: ComponentTargetInput): this {
    return this.setPlacement({ side: "after", anchor });
  }

  /**
   * Target a nested position by the child ids leading to it.
   *
   * @example `MyPage.content.targetChild("panel", "table")`
   */
  targetChild(...path: string[]): ComponentTarget {
    return new ComponentTarget(this, path);
  }

  /**
   * Break the tie when several components land at the same spot: lower `order`
   * comes first, and equal orders fall back to the extension class name then to
   * declaration order, so the result never depends on module start order.
   * Defaults to 0.
   */
  order(value: number): this {
    return this.setPlacement({ order: value });
  }

  // Loosely typed like `_onFilter` above: a protected member typed on `T`
  // would make ComponentBuilder<X> incompatible with Component<unknown>. The
  // public `transformOptions` keeps the strong signature.
  protected _optionTransforms: Array<(options: any) => MaybePromise<any>> = [];

  // Serialization can run more than once (a hot reload re-registers the page),
  // so transforms always start from the original options and must return new
  // values rather than mutate — otherwise the second pass would transform an
  // already-transformed state.
  private async applyOptionTransforms(
    options: T | undefined,
  ): Promise<T | undefined> {
    let transformed = options;
    for (const transform of this._optionTransforms) {
      transformed = await transform(transformed);
    }
    return transformed;
  }

  async serialize(): Promise<ComponentInfoSerialized<T>> {
    const componentInfo = await this.componentInfo;
    const options = await this.applyOptionTransforms(componentInfo.options);

    if (componentInfo.children) {
      const serializedChildren = await Promise.all(
        componentInfo.children.map(async (child) => {
          const { id, component, ...additionalProps } = child;
          return {
            id,
            component: await component.serialize(),
            ...additionalProps,
          };
        }),
      );

      return {
        ...componentInfo,
        options,
        children: serializedChildren,
      };
    }

    return {
      ...componentInfo,
      options,
      children: [],
    };
  }

  // Transforms do not run here: synchronous serialization is how a component
  // gets embedded into another component's options, and the host's own
  // transform is what finalizes everything it embeds. A host that forgets is
  // fail-closed — the embedded field renders and refuses its use with a 403.
  serializeSync(): ComponentInfoSerialized<T> {
    const componentInfo = this.componentInfo as ComponentInfo<T>;

    if (componentInfo.children) {
      const serializedChildren = componentInfo.children.map((child) => {
        const { id, component, ...additionalProps } = child;
        return {
          id,
          component: component.serializeSync(),
          ...additionalProps,
        };
      });

      return {
        ...componentInfo,
        children: serializedChildren,
      };
    }

    return {
      ...componentInfo,
      children: [],
    };
  }
}

export interface WatchOptions<F extends string> {
  params?: WatchFunctionParams<F>;
  onParam?: WatchActionCondition | WatchActionCondition[];
  requirePermission?: string;
}

export class ComponentBuilder<T = unknown> extends Component<T> {
  private readonly _componentName: string;
  private _options?: T;
  private _children: BaseComponentChild[] = [];
  private _watches: WatchAction[] = [];
  private _childWatches = new Map<string, WatchAction[]>();
  private _watchFilter?: (
    permissions: Set<string>,
    watches: WatchAction[],
    permissionId: string,
  ) => MaybePromise<WatchAction[]>;
  private _userOnFilter?: (
    permissions: Set<string>,
    options: T,
    permissionId: string,
  ) => MaybePromise<T>;

  constructor(componentName: string) {
    const placeholderInfo: ComponentInfo<
      T,
      Component<T>,
      BaseComponentChild
    > = {
      componentName,
      options: undefined,
      children: undefined,
    };
    super(placeholderInfo, { name: componentName });
    this._componentName = componentName;
  }

  override get componentInfo(): ComponentInfoPromise<T> {
    const base: ComponentInfo<T, Component<T>, BaseComponentChild> = {
      componentName: this._componentName,
      options: this.mergeWatchesIntoOptions(this._options, this._watches),
      children: this._children.length > 0 ? this._children : undefined,
    };
    return base;
  }

  /**
   * Caller-supplied `watchActions` is stripped: watches are declared through
   * `.watch()`/`.watchOn()` only; the options field is the internal transport
   * the builder fills at serialization time.
   */
  options(opts?: T): this {
    this._options = this.stripWatchActions(opts);
    return this;
  }

  mergeOptions(opts: Partial<T>): this {
    if (!this._options) {
      Logging.Warn("Could not merge options, component has no options");
      return this;
    }
    this._options = {
      ...this._options,
      ...this.stripWatchActions(opts),
    };
    return this;
  }

  private stripWatchActions<O>(opts: O): O {
    if (!opts || typeof opts !== "object" || !("watchActions" in opts)) {
      return opts;
    }
    const { watchActions: _ignored, ...rest } = opts as Record<string, unknown>;
    return rest as O;
  }

  /**
   * Append a child whose permission id extends this position with `id`.
   * Reusing one component instance registers every position, while APIs that
   * accept the instance itself resolve its first registered position.
   */
  child<C>(
    id: string,
    component: Component<C>,
    metadata?: { slot?: string; [key: string]: unknown },
  ): this {
    if (this._children.some((child) => child.id === id)) {
      Logging.Warn(
        `Duplicate child id "${id}" in component "${this._metadata.name}"`,
      );
    }
    const { slot, ...additionalProps } = metadata || {};
    this._children.push({ id, component, slot, ...additionalProps });
    return this;
  }

  meta(meta: Partial<ComponentMetadata>): this {
    this._metadata = { ...this._metadata, ...meta };
    return this;
  }

  onCreated(callback: (page: PageMetadata) => void): this {
    this._onPageCreated = callback;
    return this;
  }

  /**
   * Finalize the options during `serialize()` — once, when the page carrying
   * the component registers. For work whose result does not depend on the
   * request: signing an upload token, precomputing a schema. The per-request
   * counterpart is {@link onFilter}. Transforms compose in registration order,
   * receive the current options and return the new ones.
   *
   * `serializeSync()` skips transforms: it is how a component gets embedded
   * into another component's options, and the host's transform finalizes
   * everything it embeds.
   */
  transformOptions(
    transform: (options: T | undefined) => MaybePromise<T | undefined>,
  ): this {
    this._optionTransforms.push(transform);
    return this;
  }

  onFilter(
    callback: (
      permissions: Set<string>,
      options: T,
      permissionId: string,
    ) => MaybePromise<T>,
  ): this {
    this._userOnFilter = callback;
    this.installFilterChain();
    return this;
  }

  watch<F extends string>(
    event: string,
    functionId: F,
    opts?: WatchOptions<F>,
  ): this {
    this._watches.push(buildWatchAction(event, functionId, opts));
    this.installFilterChain();
    return this;
  }

  watchOn<F extends string>(
    childId: string,
    event: string,
    functionId: F,
    opts?: WatchOptions<F>,
  ): this {
    if (!this._children.some((child) => child.id === childId)) {
      Logging.Warn(
        `watchOn: unknown child id "${childId}" on component "${this._metadata.name}". Did you call .child() first?`,
      );
    }
    const watch = buildWatchAction(event, functionId, opts);
    const existing = this._childWatches.get(childId) ?? [];
    existing.push(watch);
    this._childWatches.set(childId, existing);
    return this;
  }

  watchFilter(
    callback: (
      permissions: Set<string>,
      watches: WatchAction[],
      permissionId: string,
    ) => MaybePromise<WatchAction[]>,
  ): this {
    this._watchFilter = callback;
    this.installFilterChain();
    return this;
  }

  private installFilterChain(): void {
    this._onFilter = async (permissions, options, permissionId) => {
      let next = options as T;
      if (this._userOnFilter) {
        next = await this._userOnFilter(permissions, next, permissionId);
      }
      next = (await this.applyWatchFilters(
        permissions,
        // A generic parameter and a dictionary type do not overlap, so this
        // cannot be one assertion; the filters read the payload by key.
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions
        next as unknown as Record<string, unknown>,
        permissionId,
      )) as T;
      return next;
    };
  }

  private async applyWatchFilters(
    permissions: Set<string>,
    options: Record<string, unknown> | undefined,
    permissionId: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (!options || !this._watchFilter) {
      return options;
    }
    const watches = (options.watchActions as WatchAction[] | undefined) ?? [];
    if (watches.length === 0) {
      return options;
    }
    const filtered = await this._watchFilter(
      permissions,
      watches,
      permissionId,
    );
    return { ...options, watchActions: filtered };
  }

  action(id: string, definition: ActionDefinition): this {
    this._actions[id] = new Action(id, definition, this);
    return this;
  }

  private mergeWatchesIntoOptions(
    options: T | undefined,
    watches: WatchAction[],
  ): T | undefined {
    if (watches.length === 0) {
      return options;
    }
    const optionsObj = (options ?? {}) as Record<string, unknown> & {
      watchActions?: WatchAction[];
    };
    const existing = optionsObj.watchActions ?? [];
    const merged = [...existing, ...watches];
    return { ...optionsObj, watchActions: merged } as T;
  }

  private spliceChildWatches(
    result: ComponentInfoSerialized<T>,
  ): ComponentInfoSerialized<T> {
    if (this._childWatches.size === 0 || !result.children) {
      return result;
    }
    return {
      ...result,
      children: result.children.map((child) => {
        const watches = this._childWatches.get(child.id);
        if (!watches || watches.length === 0) {
          return child;
        }
        const childOptions = (child.component.options ?? {}) as Record<
          string,
          unknown
        > & { watchActions?: WatchAction[] };
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

  override async serialize(): Promise<ComponentInfoSerialized<T>> {
    return this.spliceChildWatches(await super.serialize());
  }

  override serializeSync(): ComponentInfoSerialized<T> {
    return this.spliceChildWatches(super.serializeSync());
  }
}
