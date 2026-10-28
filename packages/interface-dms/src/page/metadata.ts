import { type ControllerClass } from "@antelopejs/interface-api";
import {
  type Component,
  type ComponentInfo,
  type ComponentInfoSerialized,
} from "../component";
import type { SlotOptions } from "../component-slots";
import { type TenantGuardOptions } from "../guards";
import type { NativeUploadFieldRegistration } from "../internal/uploads";
import type { ComponentTreeNode } from "./component-tree";
import type { PageExtensionEntry } from "./internal/extension-assembly";
import type { ComponentNodeMap } from "./layout-filter";
import {
  type MenuOptions,
  type PageExtensionComponent,
  type PageExtensionInfo,
  type PageInfo,
  type PageLayout,
  type PageLayoutRequest,
} from "./types";
import type { UploadFieldNode } from "./internal/metadata-uploads";
import { SignUploadToken } from "../uploads";
// oxlint-disable-next-line import/no-cycle -- Category proxies are read after evaluation.
import * as metadata from "./internal/metadata-lifecycle";

export class PageMetadata {
  public static key = Symbol();

  static {
    metadata.installMetadataOwner((page) => ({
      get registration() {
        return page.registration;
      },
      get componentMap() {
        return page.componentMap;
      },
      get componentTrees() {
        return page.componentTrees;
      },
      get nativeUploadFields() {
        return page.nativeUploadFields;
      },
      get notifiedComponents() {
        return page.notifiedComponents;
      },
      get extensionEntries() {
        return page.extensionEntries;
      },
      get layoutRef() {
        return page.layoutRef;
      },
      get ownComponents() {
        return page.ownComponents;
      },
      set ownComponents(value) {
        page.ownComponents = value;
      },
      get detached() {
        return page.detached;
      },
      set detached(value) {
        page.detached = value;
      },
      get moduleScoped() {
        return page.moduleScoped;
      },
      set moduleScoped(value) {
        page.moduleScoped = value;
      },
      get skipComponentPermissions() {
        return page.skipComponentPermissions;
      },
      set skipComponentPermissions(value) {
        page.skipComponentPermissions = value;
      },
      get pagePermissionId() {
        return page.pagePermissionId;
      },
      set pagePermissionId(value) {
        page.pagePermissionId = value;
      },
      get registeredPagePermission() {
        return page.registeredPagePermission;
      },
      set registeredPagePermission(value) {
        page.registeredPagePermission = value;
      },
      registerPermission: (info) => page.registerPagePermission(info),
      ownsPermissions: () => page.ownsPagePermissions(),
      ownProperties: () => page.ownRouteProperties(),
      auth: (info) => page.applyAuthDecorators(info),
      route: (info) => page.registerLayoutRoute(info),
      permissionId: (key) => page.componentPermissionId(key),
      unregister: (component, key) => page.unregisterComponent(component, key),
      register: (node) => page.registerComponentNode(node),
      unregisterNode: (node) => page.unregisterComponentNode(node),
      registersPermissions: () => page.registersComponentPermissions(),
      actions: (component) => page.actionPermissions(component),
      actionsForNode: (node) => page.actionPermissions(node.component),
      notify: (node) => page.notifyPageCreated(node),
      bind: (serialized, key) =>
        page.bindNativeUploadFields(
          serialized,
          page.componentPermissionId(key),
        ),
      takenKeys: () => page.takenComponentKeys(),
      path: (contribution) => page.extensionComponentPath(contribution),
      prepareExtension: (contribution, path) =>
        page.prepareComponent(contribution.component, path),
      unregisterExtension: (contribution) =>
        page.unregisterComponent(
          contribution.component,
          page.extensionComponentPath(contribution),
        ),
      drop: (info) => page.dropExtension(info),
      rebuild: () => page.rebuildLayoutComponents(),
      releaseGate: () => page.releaseOwnComponentsGate(),
    }));
  }

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
    return metadata.componentPermissionIds(this, component);
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
  private registration = new metadata.PageRegistration();
  private pagePermissionId = "";
  private registeredPagePermission = false;
  private skipComponentPermissions = false;
  private moduleScoped = false;

  constructor(public readonly target: ControllerClass) {}

  inherit(parent: PageMetadata) {
    metadata.inherit(this, parent);
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
    metadata.setPageInfo(this, id, fullSlug, menuOptions, pageLayout);
  }

  public async Register() {
    const pageInfo = this.pageInfo;
    if (!pageInfo) {
      throw new Error("PageMetadata not properly initialized");
    }

    this.registration = new metadata.PageRegistration();
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

    if (metadata.pageExtensions.has(pageInfo.fullId)) {
      await metadata.syncTargetExtensions(pageInfo.fullId);
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
  private publish(pageInfo: PageInfo) {
    metadata.publish(this, pageInfo);
  }

  /**
   * Take down everything this registration created. Idempotent, and safe to
   * call on a metadata that has already been replaced: each step only undoes
   * what it still owns.
   *
   * @internal
   */
  public Dispose(): void {
    metadata.dispose(this);
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
    const keys = metadata.permissionKeys(this);
    if (!keys) return false;
    for (const key of keys) {
      const permissionId = this.componentPermissionId(key);
      if (await metadata.HasPermission(permissions, permissionId)) return false;
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
  private async awaitOwnComponents() {
    let gate = this.ownComponentsGate;
    await gate;
    while (gate !== this.ownComponentsGate) {
      gate = this.ownComponentsGate;
      await gate;
    }
  }

  private closeOwnComponentsGate() {
    this.ownComponentsReady = false;
    this.releaseOwnComponentsGate();
    this.ownComponentsGate = new Promise<void>((resolve) => {
      this.releaseOwnComponentsGate = resolve;
    });
  }

  private async applyRegisteredExtensions() {
    const infos = this.detached
      ? []
      : (metadata.pageExtensions.get(this.pageInfo?.fullId ?? "") ?? []);
    metadata.removeStaleExtensions(this, infos);
    for (const info of infos) {
      if (!this.extensionEntries.has(info)) {
        await this.addExtension(info);
      }
    }
    this.rebuildLayoutComponents();
  }

  private registerPagePermission(pageInfo: PageInfo) {
    return metadata.registerPermission(this, pageInfo);
  }

  private registerLayoutRoute(pageInfo: PageInfo) {
    metadata.registerLayoutRoute(
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
  ) {
    const layout = metadata.registeredLayout(this);
    if (metadata.tenantGateRequired(this, enforceTenantAccessGate, user)) {
      await metadata.AssertTenantAccess(user._id, tenantId);
    }
    const components = await metadata.ResolveComponentSlots(layout.components);
    const { loadPermissions, context } = metadata.prepareLayoutContext({
      user,
      memberModel,
      roleModel,
      tenantId,
      query,
      params,
      resolverContext,
    });
    const read = await metadata.readPageRecord(layout.layout, context);
    context.record = read?.record;
    if (this.pageInfo?.publicAccess === true || this.skipComponentPermissions) {
      const respond = metadata.prepareLayoutResponse(layout, components);
      return respond(
        await metadata.filterPageHeader(
          this,
          layout,
          loadPermissions,
          context,
          read,
        ),
      );
    }
    const permissions = await loadPermissions();
    const served = await metadata.filterPageComponents(
      this,
      components,
      permissions,
      context,
    );
    const respond = metadata.prepareFilteredLayoutResponse(
      layout,
      components,
      served,
    );
    return respond(
      await metadata.filterPageHeader(
        this,
        layout,
        async () => permissions,
        context,
        read,
      ),
    );
  }

  private registersComponentPermissions() {
    return !this.skipComponentPermissions && !this.moduleScoped;
  }

  private componentPermissionId(key: string) {
    return `${this.pagePermissionId}.${key}`;
  }

  private actionPermissions(component: Component) {
    return metadata.actionPermissions(component, this.pageInfo);
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
  private prepareComponent(component: Component, key: string) {
    return metadata.prepareComponent(this, component, key);
  }

  private async bindNativeUploadFields(
    serialized: ComponentInfoSerialized,
    id: string,
  ) {
    if (!metadata.prepareUploadOptions(this, serialized, id)) return;
    await this.bindUploadOptions(
      serialized.options,
      serialized.componentName,
      id,
      [],
    );
    for (const child of serialized.children ?? []) {
      await this.bindNativeUploadFields(child.component, `${id}.${child.id}`);
    }
  }

  private async bindUploadOptions(
    value: SlotOptions[string],
    name: string,
    id: string,
    path: string[],
  ) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Serialized options may be primitives; recurse only through objects.
    if (!value || typeof value !== "object") return;
    if (metadata.isNativeUploadField(value)) {
      await this.registerNativeUploadField(value, name, id, path);
    }
    for (const [key, child] of Object.entries(value)) {
      await this.bindUploadOptions(child, name, id, [...path, key]);
    }
  }

  private async registerNativeUploadField(
    node: UploadFieldNode,
    name: string,
    id: string,
    path: string[],
  ) {
    const phase = metadata.prepareUploadRegistration(
      this,
      node,
      name,
      id,
      path,
    );
    if (!phase) return;
    phase.options.uploadToken = await SignUploadToken(phase.registration);
    metadata.finishUploadRegistration(this, phase);
  }

  private registerComponentNode(node: ComponentTreeNode) {
    metadata.registerComponentNode(this, node);
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
    metadata.notifyPageCreated(this, node);
  }

  /**
   * A page's permission ids are derived from its `fullId`, so a metadata
   * instance that has already been replaced (dev hot reload re-registers the
   * page under a new class) shares them with the live one. Only the current
   * owner — or nobody, when the page is gone for good — may take them down.
   */
  private ownsPagePermissions() {
    return metadata.ownsPagePermissions(this);
  }

  private unregisterComponent(_component: Component, key: string) {
    metadata.unregisterComponent(this, key);
  }

  private unregisterComponentNode(node: ComponentTreeNode) {
    metadata.unregisterComponentNode(this, node);
  }

  private async addExtension(info: PageExtensionInfo) {
    const entries = metadata.prepareExtensionEntries(this, info);
    if (!entries) return;
    for (const [declarationIndex, contribution] of info.components.entries()) {
      if (!metadata.isPageExtensionRegistered(info)) break;
      entries.push({
        ...contribution,
        extensionName: info.extensionName,
        declarationIndex,
      });
      try {
        const prepare = metadata.prepareExtensionComponent(
          this,
          info,
          contribution,
        );
        const { serialized } = await metadata.runAsPageExtensionOwner(
          info,
          prepare,
        );
        entries[entries.length - 1].serialized = serialized;
      } catch (error) {
        metadata.reportExtensionFailure(
          this,
          entries,
          info,
          contribution,
          error,
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
    return metadata.takenKeys(this);
  }

  private dropExtension(info: PageExtensionInfo) {
    metadata.dropExtension(this, info);
  }

  private extensionComponentPath(component: PageExtensionComponent) {
    return metadata.extensionComponentPath(component);
  }

  private rebuildLayoutComponents() {
    metadata.rebuildLayoutComponents(this);
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
    metadata.ownRouteProperties(this.target);
  }

  private applyAuthDecorators(pageInfo: PageInfo) {
    metadata.applyAuthDecorators(this, pageInfo);
  }
}
