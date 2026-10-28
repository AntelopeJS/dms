import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "./auth/db";
import type {
  WatchAction,
  WatchActionCondition,
  WatchFunctionParams,
} from "./base/types/watch";
import type { Tone } from "./base/types/tone";
import {
  appendChild,
  builderInfo,
  initialInfo,
  mergeBuilderOptions,
  setButton,
  warnUnknownChild,
} from "./internal/component-builder";
import {
  actionComponents,
  actionPermissionId,
  componentPermissionId,
  resolveButtonPermissionId as resolvePermissionId,
  toActionPermission,
} from "./internal/component-permissions";
import {
  normalizeComponentAnchor,
  serializeChild,
  serializeInfoSync,
  serializedInfo,
} from "./internal/component-serialization";
import {
  appendChildWatch,
  buildWatchAction,
  createFilterChain,
  mergeWatchesIntoOptions,
  readWatchActions,
  spliceChildWatches,
  stripWatchActions,
} from "./internal/component-watches";
import type { PageMetadata } from "./page";
import type { Permission } from "./permissions";
import type { MaybePromise } from "./types";

export interface ActionDefinition {
  title: string;
  icon?: string;
  description?: string;
  /**
   * Other actions of the same component this one needs, by id: a table's
   * `edit` needs its `view`, the read that loads the row into the form. The
   * roles editor grants them with it, and a role is saved with them.
   */
  dependencies?: string[];
  defaultGranted?: boolean;
}

export class Action {
  constructor(
    public readonly id: string,
    public readonly definition: ActionDefinition,
    component: Component,
  ) {
    actionComponents.set(this, component);
  }

  private get componentPermissionId(): string | undefined {
    return componentPermissionId(this, getPermissionIdRef);
  }

  get permissionId(): string | undefined {
    return actionPermissionId(this, this.componentPermissionId);
  }

  toPermission(): Permission | undefined {
    return toActionPermission(this, this.componentPermissionId);
  }
}

export const getPermissionIdRef = {
  get(_component: Component): string | undefined {
    return undefined;
  },
};

/**
 * The permission a button requires: one of its own component's actions by id
 * (e.g. `"add"`), or an `Action` of any component.
 */
export type ButtonPermission = string | Action;

/**
 * A named affordance of a component that is not one of its actions — a table
 * view's toolbar button. Registered so a quick action can expose it and inherit
 * its permission instead of restating it.
 */
export interface ComponentButton {
  id: string;
  /**
   * One of the component's actions by name, or an `Action`. Absent, with
   * `permissionId`, when everyone who reaches the component may press it.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the button requires; wins over `permission`. */
  permissionId?: string;
}

/**
 * A navigation badge's count with the tone it is drawn in: `error` for what
 * needs acting on now, `warning` for what to check, `primary` for an action
 * available, `success` for good news. Without a tone, or `neutral`, the badge
 * keeps its grey look.
 */
export interface NavBadgeCount {
  count: number;
  tone?: Tone;
}

/**
 * A count a component publishes as the navigation badge of a page, read when
 * the menu loads (see {@link Component.navBadge}). A table view's tab declared
 * with `navBadge` publishes one.
 */
export interface NavBadgeSource {
  /** The page the badge goes to; the component's own page when absent. */
  page?: ControllerClass;
  /**
   * The count for the caller of `ctx`: a number, drawn neutral, or a
   * {@link NavBadgeCount} that also gives its tone. It throws when the caller
   * may not read it.
   */
  count: (ctx: RequestContext, user: User) => Promise<number | NavBadgeCount>;
}

/**
 * The permission id `permission` stands for on the component whose own
 * permission id is `componentPermissionId`. Undefined when it cannot be
 * resolved — a component on a page that never registered — which every caller
 * treats as refused.
 */
export function resolveButtonPermissionId(
  permission: ButtonPermission,
  componentPermissionId: string | undefined,
): string | undefined {
  return resolvePermissionId(permission, componentPermissionId);
}

/**
 * The request a page layout is being filtered for. Handed to every
 * component's filter along with the caller's permissions, so a component can
 * adapt what it serves to the tenant and the user asking.
 */
export interface ComponentFilterContext {
  tenantId: string;
  /** Undefined for an unauthenticated request. */
  user: User | undefined;
  /**
   * The query of the page URL the layout is served for (`?workspace=web` is
   * `{ workspace: "web" }`), one value per name. Set while a page layout is
   * served, and read by a header button's `availability`; undefined anywhere
   * else (a table view's data request, a row action). Caller-supplied: check
   * the values like any other input.
   */
  query?: Readonly<Record<string, string>>;
  /**
   * The route parameters of the page URL the layout is served for: on a page
   * registered at `/projects/project/:id`, `/projects/project/p1` is
   * `{ id: "p1" }`. Set alongside `query` while a page layout is served, so a
   * header button's `availability` can depend on the record the page shows.
   * Caller-supplied, like `query`.
   */
  params?: Readonly<Record<string, string>>;
  /**
   * The record the page shows, as the layout's `record` read it for this
   * request (`DefaultLayout({ record })`). Set while the layout of a page
   * declaring one is served; undefined when it found none, and anywhere else.
   */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The page's consumer-defined record schema remains open in the published filter context.
  record?: Readonly<Record<string, unknown>>;
}

/**
 * Adapts a component's serialized options to one request, after its
 * permission has been granted.
 */
export type ComponentFilter<T> = (
  permissions: Set<string>,
  options: T,
  permissionId: string,
  context: ComponentFilterContext,
) => MaybePromise<T>;

export namespace ComponentEvents {
  export const LOAD = "DmsComponent.Load";
  export const UNLOAD = "DmsComponent.Unload";
}

export interface ComponentChild<T = unknown, C = Component<T>> {
  id: string;
  component: C;
  slot?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published component children carry consumer-defined metadata in addition to their identity and component.
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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Serialized children preserve consumer metadata keys in the published contract.
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Serialized child metadata remains open to consumer-defined keys.
  children?: ChildSerialized[];
};

export interface BaseComponentChild {
  id: string;
  component: Component;
  slot?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The base child contract preserves arbitrary metadata forwarded by child serialization.
  [key: string]: unknown;
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
 * An anchor names a position on the *target* page by the static field names
 * leading to it, never by a reference to the component itself: an extending
 * module has no access to the target module's classes. `"table"` is the page's
 * static `table` field, `"content.tasks"` (or `["content", "tasks"]`) the
 * child declared as `tasks` under its `content` field.
 */
export type ComponentAnchor = string | readonly string[];

/**
 * Placement of a component injected into another page by
 * `@RegisterPageExtension`. Ignored on a component declared on its own page.
 */
export interface ComponentPlacement {
  side: PlacementSide;
  anchor?: readonly string[];
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
  protected _onFilter?: ComponentFilter<any>;
  protected _actions: Record<string, Action> = {};
  protected _buttons: Record<string, ComponentButton> = {};
  protected _navBadges: NavBadgeSource[] = [];
  protected _placement?: ComponentPlacement;

  /** @internal The counts the component publishes as navigation badges. */
  get navBadgeSources(): readonly NavBadgeSource[] {
    return this._navBadges;
  }

  get actions(): Record<string, Action> {
    return this._actions;
  }

  getAction(id: string): Action | undefined {
    return this._actions[id];
  }

  getButton(id: string): ComponentButton | undefined {
    return this._buttons[id];
  }

  /** See {@link resolveButtonPermissionId}, resolved against this component. */
  resolveButtonPermissionId(permission: ButtonPermission): string | undefined {
    return resolveButtonPermissionId(permission, getPermissionIdRef.get(this));
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
   * Inject this component just above `anchor` on the extended page. The anchor
   * is the target page's own static field name -- `"table"` -- or the dotted
   * path to a nested position -- `"content.tasks"`. Only meaningful on a
   * component declared inside a `@RegisterPageExtension` class.
   */
  before(anchor: ComponentAnchor): this {
    return this.setPlacement({
      side: "before",
      anchor: normalizeComponentAnchor(anchor),
    });
  }

  /** Inject this component just below `anchor`. See {@link Component.before}. */
  after(anchor: ComponentAnchor): this {
    return this.setPlacement({
      side: "after",
      anchor: normalizeComponentAnchor(anchor),
    });
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

  protected _optionTransforms: Array<(options: any) => MaybePromise<any>> = [];

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
    const children = componentInfo.children
      ? await Promise.all(componentInfo.children.map(serializeChild))
      : undefined;
    return serializedInfo(componentInfo, options, children);
  }

  serializeSync(): ComponentInfoSerialized<T> {
    return serializeInfoSync(this.componentInfo);
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
  private _userOnFilter?: ComponentFilter<T>;

  constructor(componentName: string) {
    super(initialInfo<T>(componentName), { name: componentName });
    this._componentName = componentName;
  }

  override get componentInfo(): ComponentInfoPromise<T> {
    return builderInfo(
      this._componentName,
      this.mergeWatchesIntoOptions(this._options, this._watches),
      () => this._children,
    );
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
    mergeBuilderOptions(
      () => this._options,
      (value) => {
        this._options = value;
      },
      () => this.stripWatchActions(opts),
    );
    return this;
  }

  private stripWatchActions<O>(opts: O): O {
    return stripWatchActions(opts);
  }

  /**
   * Append a child whose permission id extends this position with `id`.
   * Reusing one component instance registers every position, while APIs that
   * accept the instance itself resolve its first registered position.
   */
  child<C>(
    id: string,
    component: Component<C>,
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published child metadata accepts arbitrary keys which are forwarded during serialization.
    metadata?: { slot?: string; [key: string]: unknown },
  ): this {
    appendChild(
      () => this._children,
      () => this._metadata.name,
      {
        id,
        component,
        metadata,
      },
    );
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

  onFilter(callback: ComponentFilter<T>): this {
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
    warnUnknownChild(this._children, childId, () => this._metadata.name);
    appendChildWatch(
      () => this._childWatches,
      childId,
      buildWatchAction(event, functionId, opts),
    );
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
    this._onFilter = createFilterChain(
      this,
      () => this._userOnFilter,
      (permissions, options, permissionId) =>
        this.applyWatchFilters(permissions, options, permissionId),
    );
  }

  private async applyWatchFilters<O>(
    permissions: Set<string>,
    options: O,
    permissionId: string,
  ): Promise<O> {
    if (!options || !this._watchFilter) {
      return options;
    }
    const watches = readWatchActions(options);
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

  button(id: string, info: Omit<ComponentButton, "id">): this {
    setButton(
      () => this._buttons,
      () => this._metadata.name,
      id,
      info,
    );
    return this;
  }

  /**
   * Publishes a count as the navigation badge of a page: the component's own
   * page, or `source.page`. The DMS counts it per caller when it serves the
   * menu, for the pages the caller can open; a count that throws (a caller
   * who may not read it) or is zero shows no badge, and a page's static
   * `MenuOptions.badge` wins over it. The counts published for one page add
   * up, drawn in the strongest of their tones (error, warning, primary,
   * success, then neutral).
   *
   * @example
   * component.navBadge({
   *   count: async (_ctx, user) => {
   *     const overdue = await countOverdue(user._id);
   *     return { count: overdue, tone: "error" };
   *   },
   * });
   */
  navBadge(source: NavBadgeSource): this {
    this._navBadges.push(source);
    return this;
  }

  private mergeWatchesIntoOptions(
    options: T | undefined,
    watches: WatchAction[],
  ): T | undefined {
    return mergeWatchesIntoOptions(options, watches);
  }

  private spliceChildWatches(
    result: ComponentInfoSerialized<T>,
  ): ComponentInfoSerialized<T> {
    return spliceChildWatches(result, () => this._childWatches);
  }

  override async serialize(): Promise<ComponentInfoSerialized<T>> {
    return this.spliceChildWatches(await super.serialize());
  }

  override serializeSync(): ComponentInfoSerialized<T> {
    return this.spliceChildWatches(super.serializeSync());
  }
}
