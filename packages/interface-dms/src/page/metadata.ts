import { type ControllerClass } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import { DefaultLayout } from "../base/layouts";
import {
  type Component,
  type ComponentFilterContext,
  type ComponentInfo,
  type ComponentInfoSerialized,
} from "../component";
import type { SlotOptions } from "../component-slots";
import { type TenantGuardOptions } from "../guards";
import { GetEffectiveUserPermissions, HasPermission } from "../permissions";
import { ResolveComponentSlots } from "../internal/component-slots";
import { gateAllowsSurface } from "../internal/tenant-access";
import type { NativeUploadFieldRegistration } from "../internal/uploads";
import { AssertTenantAccess } from "../tenant-access";
import { SignUploadToken, internal as uploadInternal } from "../uploads";
// oxlint-disable import/no-cycle -- Category cycles resolve in function bodies.
import {
  resolveCategoryInfo,
  resolveInheritedLayout,
} from "./internal/categories";
import { mergeMetadata as merge, publish } from "./internal/metadata-publish";
// oxlint-enable import/no-cycle
import type { ComponentTreeNode } from "./component-tree";
import {
  assembleLayoutComponents,
  type PageExtensionEntry,
} from "./internal/extension-assembly";
import { collectExtensionErrors } from "./internal/extension-validation";
import { PageDeclarationConflictError } from "./declaration-conflict";
import { pageRoutePath } from "./page-routes";
import { type ComponentNodeMap, filterComponents } from "./layout-filter";
import {
  filterLayoutHeaderActions,
  withComponentHeaderButtons,
} from "./internal/layout-filter";
import { readPageRecord } from "./internal/page-record";
import { withTableViewPlacements } from "./internal/table-view-ids";
import { inheritedMemberAccess } from "./internal/member-access";
import {
  pageExtensions,
  pageMetadataByFullId,
  isPageExtensionRegistered,
  runAsPageExtensionOwner,
  syncTargetExtensions,
} from "./internal/registry";
import {
  type MenuOptions,
  type PageExtensionComponent,
  type PageExtensionInfo,
  type PageInfo,
  type PageLayout,
  type PageLayoutRequest,
} from "./types";
import { PageRegistration } from "./internal/page-registration";
import {
  hiddenComponentsFlag,
  registerLayoutRoute,
} from "./internal/metadata-layout";
import {
  isNativeUploadField,
  readUploadConstraints,
  resolveWritePermission,
  type UploadFieldNode,
} from "./internal/metadata-uploads";
import {
  applyAuthDecorators,
  ownRouteProperties,
  registerPagePermission,
} from "./internal/metadata-registration";
import {
  extensionComponentPath,
  takenComponentKeys,
} from "./internal/metadata-extensions";
import {
  actionPermissions,
  notifyPageCreated,
  prepareComponent,
  registerComponentNode,
  unregisterComponent,
  unregisterComponentNode,
} from "./internal/metadata-components";

export class PageMetadata {
  public static key = Symbol();

  public pageInfo?: PageInfo;
  public layout?: ComponentInfo;
  public components: Record<string, Component> = {};
  /**
   * Tenant guard options the page's layout route was registered with. Recorded
   * at registration so the page's `bypassTenantAccessGate` can be asserted
   * without issuing a request.
   */
  public guardOptions?: TenantGuardOptions;

  private layoutRef?: PageLayout;
  private ownComponents: Record<string, ComponentInfoSerialized> = {};
  private componentMap: ComponentNodeMap = new Map();
  private nativeUploadFields = new Map<
    string,
    NativeUploadFieldRegistration[]
  >();

  /** Exact live positions of a component, including mounts on multiple pages. */
  public ComponentPermissionIds(component: Component): string[] {
    return [...this.componentMap.values()]
      .filter((node) => node.component === component && node.access === "own")
      .map((node) => node.permissionId);
  }
  private componentTrees = new Map<string, ComponentTreeNode[]>();
  private notifiedComponents = new Set<Component>();
  private extensionEntries = new Map<PageExtensionInfo, PageExtensionEntry[]>();
  private extensionSyncQueue: Promise<void> = Promise.resolve();
  /**
   * Being in the page registry and being ready to be extended are two facts:
   * the page is published before its first await, while `ownComponents` is
   * only filled after it. An extension grafted in between resolves its anchors
   * against a key set that stops wherever the serialization loop had reached,
   * so anchors on later fields silently fall to the end of the page. This gate
   * carries the second fact — extensions wait on it instead of racing it.
   */
  private ownComponentsReady = false;
  private ownComponentsGate: Promise<void> = Promise.resolve();
  private releaseOwnComponentsGate: () => void = () => undefined;
  private detached = false;
  private registration = new PageRegistration();
  private pagePermissionId = "";
  private registeredPagePermission = false;
  private skipComponentPermissions = false;
  private moduleScoped = false;

  constructor(public readonly target: ControllerClass) {}

  inherit(parent: PageMetadata) {
    this.pageInfo = merge(parent.pageInfo, this.pageInfo);
    this.layout = merge(parent.layout, this.layout);
    this.components = merge(parent.components, this.components) ?? {};
  }

  public SetComponent(id: string, component: Component) {
    this.components[id] = component;
  }

  public SetInfo(
    id: string,
    fullSlug: string,
    menuOptions: MenuOptions,
    pageLayout?: ComponentInfo,
  ) {
    const { parent, ...menu } = menuOptions;
    const resolvedCategory = resolveCategoryInfo(menu.category);
    const parentFullId = resolvedCategory?.fullId ?? "";
    const fullId = parentFullId ? `${parentFullId}.${id}` : id;

    const location = pageRoutePath(fullSlug, "/pagelayout");

    const pageInfo: PageInfo = {
      ...menu,
      category: resolvedCategory,
      id,
      fullId,
      fullSlug,
      layoutUrl: location,
      parentSlug: parent ? resolveCategoryInfo(parent)?.fullSlug : undefined,
      hidden: menu.hidden || resolvedCategory?.hidden,
      publicAccess: menu.publicAccess || resolvedCategory?.publicAccess,
      authOnly: menu.authOnly || resolvedCategory?.authOnly,
      memberAccess:
        menu.memberAccess ||
        inheritedMemberAccess(resolvedCategory?.memberAccess),
      bypassTenantAccessGate:
        menu.bypassTenantAccessGate || resolvedCategory?.bypassTenantAccessGate,
    };

    this.layout =
      pageLayout ??
      menu.layout ??
      resolveInheritedLayout(resolvedCategory) ??
      DefaultLayout();
    this.pageInfo = pageInfo;
  }

  public async Register() {
    const pageInfo = this.pageInfo;
    if (!pageInfo) {
      throw new Error("PageMetadata not properly initialized");
    }

    this.registration = new PageRegistration();
    this.layoutRef = { layout: this.layout, components: {} };
    this.ownComponents = {};
    this.componentMap = new Map();
    this.componentTrees = new Map();
    this.notifiedComponents = new Set();
    this.extensionEntries = new Map();
    this.detached = false;
    this.closeOwnComponentsGate();

    try {
      this.publish(pageInfo);

      const prepared = Object.entries(this.components).map(([key, component]) =>
        this.prepareComponent(component, key),
      );
      for (const prepare of prepared) {
        const { key, serialized } = await prepare();
        this.ownComponents[key] = serialized;
      }
      this.ownComponentsReady = true;
      this.rebuildLayoutComponents();
    } catch (error) {
      this.detached = true;
      this.registration.dispose();
      throw error;
    } finally {
      this.releaseOwnComponentsGate();
    }

    if (pageExtensions.has(pageInfo.fullId)) {
      await syncTargetExtensions(pageInfo.fullId);
    }
  }

  /**
   * Claim everything the page owns that does not depend on its components: the
   * registry entry, the navigation entry, the page permission and the layout
   * route.
   *
   * Published before the first await of `Register()`. The old order left a
   * window where the page was in the registry but not in this map: a module
   * destroyed during it found nothing to clear, and the registration still in
   * flight then wrote the metadata of a page that no longer serves — which
   * later extensions would graft themselves onto.
   */
  private publish(pageInfo: PageInfo): void {
    publish(this, pageInfo, {
      registration: () => this.registration,
      configure: (moduleScoped, skip) => {
        this.moduleScoped = moduleScoped;
        this.skipComponentPermissions = skip();
      },
      registerPermission: (info) => {
        this.pagePermissionId = this.registerPagePermission(info);
      },
      permissionId: () => this.pagePermissionId,
      registeredPermission: () => this.registeredPagePermission,
      clearRegisteredPermission: () => {
        this.registeredPagePermission = false;
      },
      ownsPermissions: () => this.ownsPagePermissions(),
      ownProperties: () => this.ownRouteProperties(),
      auth: (info) => this.applyAuthDecorators(info),
      route: (info) => this.registerLayoutRoute(info),
    });
  }

  /**
   * Take down everything this registration created. Idempotent, and safe to
   * call on a metadata that has already been replaced: each step only undoes
   * what it still owns.
   *
   * @internal
   */
  public Dispose(): void {
    this.detached = true;
    this.releaseOwnComponentsGate();
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot the keys before dropExtension deletes entries from the same map.
    for (const info of [...this.extensionEntries.keys()]) {
      this.dropExtension(info);
    }
    this.rebuildLayoutComponents();
    this.ownComponents = {};
    this.registration.dispose();
  }

  /**
   * Bring the page's injected components in line with the extensions currently
   * registered against it: components of extensions that went away are torn
   * down, new ones are processed exactly like the page's own components, and
   * the layout order is rebuilt.
   *
   * Runs are serialized, so two modules registering back to back never process
   * the same extension twice.
   *
   * @internal
   */
  public SyncExtensions(): Promise<void> {
    const run = this.extensionSyncQueue
      .then(() => this.awaitOwnComponents())
      .then(() => this.applyRegisteredExtensions());
    this.extensionSyncQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * Whether an extension grafting onto this page right now would resolve its
   * anchors against the page's full component set.
   *
   * @internal
   */
  public AcceptsExtensions(): boolean {
    return this.ownComponentsReady && !this.detached;
  }

  /**
   * Whether the page declares blocks and `permissions` grants none of them:
   * the layout it serves would then be `allComponentsHidden`, by the same
   * per-block check. A page declaring none (a module page rendering its own
   * content), or serving its blocks to whoever opens it, hides nothing.
   *
   * @internal Read by the menu, which leaves such a page out.
   */
  public async HidesEveryComponent(permissions: Set<string>): Promise<boolean> {
    if (this.pageInfo?.publicAccess === true || this.skipComponentPermissions) {
      return false;
    }
    const keys = Object.keys(this.layoutRef?.components ?? {});
    if (keys.length === 0) return false;
    for (const key of keys) {
      const permissionId = this.componentPermissionId(key);
      if (await HasPermission(permissions, permissionId)) return false;
    }
    return true;
  }

  /**
   * Wait until the page has serialized its own components — and until the
   * registration that ends up owning them is the current one: a registration
   * starting while this waits installs its own gate, and a run released by the
   * old one would resolve its anchors against components the new one has yet
   * to write.
   */
  private async awaitOwnComponents(): Promise<void> {
    let gate = this.ownComponentsGate;
    await gate;
    while (gate !== this.ownComponentsGate) {
      gate = this.ownComponentsGate;
      await gate;
    }
  }

  private closeOwnComponentsGate(): void {
    this.ownComponentsReady = false;
    this.releaseOwnComponentsGate();
    this.ownComponentsGate = new Promise<void>((resolve) => {
      this.releaseOwnComponentsGate = resolve;
    });
  }

  private async applyRegisteredExtensions(): Promise<void> {
    const infos = this.detached
      ? []
      : (pageExtensions.get(this.pageInfo?.fullId ?? "") ?? []);
    const desired = new Set(infos);
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot the keys before dropExtension deletes entries from the same map.
    for (const info of [...this.extensionEntries.keys()]) {
      if (!desired.has(info)) {
        this.dropExtension(info);
      }
    }
    for (const info of infos) {
      if (!this.extensionEntries.has(info)) {
        await this.addExtension(info);
      }
    }
    this.rebuildLayoutComponents();
  }

  private registerPagePermission(pageInfo: PageInfo) {
    return registerPagePermission(
      pageInfo,
      () => this.moduleScoped,
      (registered) => {
        this.registeredPagePermission = registered;
      },
    );
  }

  private registerLayoutRoute(pageInfo: PageInfo) {
    registerLayoutRoute(
      () => this.target,
      pageInfo,
      () => this.registration,
      (request) => this.resolvePageLayout(request),
      (request, options) => this.resolvePageLayout(request, options),
    );
  }

  private async resolvePageLayout(
    {
      user,
      memberModel,
      roleModel,
      tenantId,
      query,
      params,
      resolverContext,
    }: PageLayoutRequest,
    { enforceTenantAccessGate = false } = {},
  ): Promise<PageLayout> {
    const layout = this.layoutRef;
    if (!layout) {
      throw new Error("PageMetadata not properly initialized");
    }
    if (
      enforceTenantAccessGate &&
      user &&
      this.pageInfo &&
      !gateAllowsSurface(this.pageInfo, true)
    ) {
      await AssertTenantAccess(user._id, tenantId);
    }
    const components = await ResolveComponentSlots(layout.components);
    const loadPermissions = async (): Promise<Set<string>> => {
      if (!user) return new Set<string>();
      const roleIds = (await memberModel.getByUser(user._id))?.roleIds ?? [];
      return GetEffectiveUserPermissions(
        user,
        tenantId,
        roleIds,
        roleModel,
        resolverContext,
      );
    };
    const context: ComponentFilterContext = { tenantId, user, query, params };
    const read = await readPageRecord(layout.layout, context);
    context.record = read?.record;
    if (this.pageInfo?.publicAccess === true || this.skipComponentPermissions) {
      return {
        ...layout,
        layout: withComponentHeaderButtons(
          await filterLayoutHeaderActions(
            layout.layout,
            loadPermissions,
            context,
            this.pagePermissionId,
            read?.status,
          ),
          components,
        ),
        components: withTableViewPlacements(components),
      };
    }
    const permissions = await loadPermissions();
    const servedComponents = await filterComponents(
      components,
      this.pagePermissionId,
      permissions,
      this.componentMap,
      context,
    );
    return {
      ...layout,
      layout: withComponentHeaderButtons(
        await filterLayoutHeaderActions(
          layout.layout,
          async () => permissions,
          context,
          this.pagePermissionId,
          read?.status,
        ),
        servedComponents,
      ),
      components: withTableViewPlacements(servedComponents),
      ...hiddenComponentsFlag(components, servedComponents),
    };
  }

  private registersComponentPermissions(): boolean {
    return !this.skipComponentPermissions && !this.moduleScoped;
  }

  private componentPermissionId(componentKey: string): string {
    return `${this.pagePermissionId}.${componentKey}`;
  }

  private actionPermissions(component: Component) {
    return actionPermissions(component, this.pageInfo);
  }

  /**
   * Claim a component's permissions now, and hand back the serialization to
   * await later.
   *
   * The split is what keeps the registration attributable: `RegisterPermission`
   * reads the responsible module off the call stack, and every component after
   * the first used to register from a continuation of the previous one's
   * `serialize()` — where that stack is gone, so the core had no module to
   * sweep them from.
   *
   * A component's children are prepared with it, each under the permission id
   * of its position: they take part in per-request filtering under that id, so
   * a child that never claimed it would have its `onFilter` skipped.
   */
  private prepareComponent(component: Component, componentKey: string) {
    return prepareComponent(component, componentKey, {
      permissionId: (key) => this.componentPermissionId(key),
      trees: () => this.componentTrees,
      registration: () => this.registration,
      unregister: (component, key) => this.unregisterComponent(component, key),
      register: (node) => this.registerComponentNode(node),
      detached: () => this.detached,
      bind: (serialized, key) =>
        this.bindNativeUploadFields(
          serialized,
          this.componentPermissionId(key),
        ),
    });
  }

  private async bindNativeUploadFields(
    serialized: ComponentInfoSerialized,
    componentId: string,
  ): Promise<void> {
    if (this.detached || this.componentMap.get(componentId)?.access !== "own")
      return;
    if (serialized.options)
      serialized.options = JSON.parse(JSON.stringify(serialized.options));
    await this.bindUploadOptions(
      serialized.options,
      serialized.componentName,
      componentId,
      [],
    );
    for (const child of serialized.children ?? []) {
      await this.bindNativeUploadFields(
        child.component,
        `${componentId}.${child.id}`,
      );
    }
  }

  private async bindUploadOptions(
    value: SlotOptions[string],
    componentName: string,
    componentId: string,
    path: string[],
  ): Promise<void> {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Recursive discovery walks arbitrary serialized options and descends only into object containers, preserving each component's own option schema.
    if (!value || typeof value !== "object") return;
    if (isNativeUploadField(value)) {
      await this.registerNativeUploadField(
        value,
        componentName,
        componentId,
        path,
      );
    }
    for (const [key, child] of Object.entries(value)) {
      await this.bindUploadOptions(child, componentName, componentId, [
        ...path,
        key,
      ]);
    }
  }

  private async registerNativeUploadField(
    node: UploadFieldNode,
    componentName: string,
    componentId: string,
    path: string[],
  ): Promise<void> {
    const mount = this.componentMap.get(componentId);
    if (this.detached || mount?.access !== "own") return;
    const options = node.component.options ?? {};
    node.component.options = options;
    const registration: NativeUploadFieldRegistration = {
      pageId: this.pageInfo?.fullId ?? "",
      componentId,
      storage:
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Native upload discovery projects only string storage names from erased contributor options.
        typeof options.storage === "string" ? options.storage : undefined,
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Native upload discovery projects only string paths from erased contributor options.
      path: typeof options.path === "string" ? options.path : undefined,
      field:
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The serialized attachment field overrides the discovered path only when it is a string.
        typeof options.attachmentField === "string"
          ? options.attachmentField
          : path.join("/"),
      visibility: options.visibility === "public" ? "public" : "private",
      writePermission: node.disabled
        ? "__native_upload_disabled__"
        : resolveWritePermission(componentName, mount.component, path),
      readPermissions:
        this.registersComponentPermissions() && !this.pageInfo?.publicAccess
          ? componentId
              .slice(this.pagePermissionId.length + 1)
              .split(".")
              .map(
                (_, index, parts) =>
                  `${this.pagePermissionId}.${parts.slice(0, index + 1).join(".")}`,
              )
          : [],
      constraints: readUploadConstraints(options),
    };
    options.uploadToken = await SignUploadToken(registration);
    if (this.detached || this.componentMap.get(componentId) !== mount) return;
    uploadInternal.RegisterNativeUploadField.register(registration);
    const fields = this.nativeUploadFields.get(componentId) ?? [];
    fields.push(registration);
    this.nativeUploadFields.set(componentId, fields);
  }

  private registerComponentNode(node: ComponentTreeNode) {
    registerComponentNode(node, {
      componentMap: () => this.componentMap,
      pageInfo: () => this.pageInfo,
      registersComponentPermissions: () => this.registersComponentPermissions(),
      actionPermissions: (component) => this.actionPermissions(component),
      notify: (node) => this.notifyPageCreated(node),
    });
  }

  /**
   * Run a component's `onCreated` hook, once per registration whatever the
   * number of positions the same instance occupies — the hook registers side
   * effects (a table view's form sub-pages, a chart's realtime topic), and
   * running it twice registers them twice.
   *
   * A nested component's hook is isolated the way `addExtension` isolates an
   * extension's: it never ran before this walk existed, so letting it abort a
   * page that used to register would turn a quietly inert component into a
   * screen that no longer serves. The page's own components keep aborting it —
   * a half-registered page is worse than none.
   */
  private notifyPageCreated(node: ComponentTreeNode) {
    notifyPageCreated(this, node, () => this.notifiedComponents);
  }

  /**
   * A page's permission ids are derived from its `fullId`, so a metadata
   * instance that has already been replaced (dev hot reload re-registers the
   * page under a new class) shares them with the live one. Only the current
   * owner — or nobody, when the page is gone for good — may take them down.
   */
  private ownsPagePermissions(): boolean {
    const owner = pageMetadataByFullId.get(this.pageInfo?.fullId ?? "");
    return owner === undefined || owner === this;
  }

  private unregisterComponent(_component: Component, componentKey: string) {
    unregisterComponent(componentKey, {
      trees: () => this.componentTrees,
      uploads: () => this.nativeUploadFields,
      nodes: () => this.componentMap,
      notified: () => this.notifiedComponents,
      ownsPermissions: () => this.ownsPagePermissions(),
      unregister: (node) => this.unregisterComponentNode(node),
    });
  }

  private unregisterComponentNode(node: ComponentTreeNode) {
    unregisterComponentNode(
      node,
      () => this.registersComponentPermissions(),
      (node) => this.actionPermissions(node.component),
    );
  }

  private async addExtension(info: PageExtensionInfo): Promise<void> {
    const errors = collectExtensionErrors(info, {
      own: this.ownComponents,
      taken: this.takenComponentKeys(),
    });
    const entries: PageExtensionEntry[] = [];
    this.extensionEntries.set(info, entries);
    if (errors.length > 0) {
      for (const error of errors) {
        Logging.Error(`[dms] ${error}`);
      }
      return;
    }
    for (const [declarationIndex, contribution] of info.components.entries()) {
      if (!isPageExtensionRegistered(info)) break;
      entries.push({
        ...contribution,
        extensionName: info.extensionName,
        declarationIndex,
      });
      try {
        const componentPath = this.extensionComponentPath(contribution);
        const prepare = runAsPageExtensionOwner(info, () =>
          this.prepareComponent(contribution.component, componentPath),
        );
        const { serialized } = await runAsPageExtensionOwner(info, prepare);
        entries[entries.length - 1].serialized = serialized;
      } catch (error) {
        entries.pop();
        this.unregisterComponent(
          contribution.component,
          this.extensionComponentPath(contribution),
        );
        if (error instanceof PageDeclarationConflictError) throw error;
        Logging.Error(
          `[dms] page extension "${info.extensionName}" could not register component "${contribution.key}" on page "${info.targetFullId}": ${String(error)}`,
        );
      }
    }
    if (this.detached) {
      this.dropExtension(info);
    }
  }

  /**
   * Who owns each component key of the page right now: the page itself for its
   * own fields, the extension that injected it otherwise. One namespace,
   * because a page's components share one permission subtree.
   */
  private takenComponentKeys() {
    return takenComponentKeys(
      this.pageInfo?.fullId ?? "",
      this.ownComponents,
      () => this.extensionEntries,
    );
  }

  private dropExtension(info: PageExtensionInfo): void {
    for (const entry of this.extensionEntries.get(info) ?? []) {
      this.unregisterComponent(
        entry.component,
        this.extensionComponentPath(entry),
      );
    }
    this.extensionEntries.delete(info);
  }

  private extensionComponentPath(component: PageExtensionComponent) {
    return extensionComponentPath(component);
  }

  private rebuildLayoutComponents(): void {
    if (!this.layoutRef) return;
    this.layoutRef.components = assembleLayoutComponents(
      this.ownComponents,
      [...this.extensionEntries.values()].flat(),
    );
  }

  /**
   * Give the page's controller its own copy of every route property it
   * inherited, before decorating them.
   *
   * A page whose controller extends another page's — each page-mode form of a
   * TableView extends the page carrying it — inherits that page's route
   * properties by reference: `ControllerMeta.inherit` copies the map, not its
   * entries. Decorating `user` here then rewrote the parent page's own guard
   * too, so the page's `/pagelayout` route ended up asking for the permission
   * of its last form (`<table>.view`), and a form page for the one after it.
   */
  private ownRouteProperties() {
    ownRouteProperties(this.target);
  }

  private applyAuthDecorators(pageInfo: PageInfo) {
    applyAuthDecorators(this, pageInfo);
  }
}
