/** @internal */
import type { Component, ComponentInfoSerialized } from "../../component";
import type { NativeUploadFieldRegistration } from "../../internal/uploads";
import type { ComponentTreeNode } from "../component-tree";
import type { ComponentNodeMap } from "../layout-filter";
import type { PageMetadata } from "../metadata";
import type {
  PageExtensionComponent,
  PageExtensionInfo,
  PageInfo,
  PageLayout,
} from "../types";
import type { PageExtensionEntry } from "./extension-assembly";
import type {
  actionPermissions,
  prepareComponent,
} from "./metadata-components";
import type { PageRegistration } from "./page-registration";

/** @internal */
export interface MetadataOwner {
  readonly registration: PageRegistration;
  readonly componentMap: ComponentNodeMap;
  readonly componentTrees: Map<string, ComponentTreeNode[]>;
  readonly nativeUploadFields: Map<string, NativeUploadFieldRegistration[]>;
  readonly notifiedComponents: Set<Component>;
  readonly extensionEntries: Map<PageExtensionInfo, PageExtensionEntry[]>;
  readonly layoutRef: PageLayout | undefined;
  ownComponents: Record<string, ComponentInfoSerialized>;
  detached: boolean;
  moduleScoped: boolean;
  skipComponentPermissions: boolean;
  pagePermissionId: string;
  registeredPagePermission: boolean;
  registerPermission(info: PageInfo): string;
  ownsPermissions(): boolean;
  ownProperties(): void;
  auth(info: PageInfo): void;
  route(info: PageInfo): void;
  permissionId(key: string): string;
  unregister(component: Component, key: string): void;
  register(node: ComponentTreeNode): void;
  unregisterNode(node: ComponentTreeNode): void;
  registersPermissions(): boolean;
  actions(component: Component): ReturnType<typeof actionPermissions>;
  actionsForNode(node: ComponentTreeNode): ReturnType<typeof actionPermissions>;
  notify(node: ComponentTreeNode): void;
  bind(serialized: ComponentInfoSerialized, key: string): Promise<void>;
  takenKeys(): Map<string, string>;
  path(contribution: PageExtensionComponent): string;
  prepareExtension(
    contribution: PageExtensionComponent,
    path: string,
  ): ReturnType<typeof prepareComponent>;
  unregisterExtension(contribution: PageExtensionComponent): void;
  drop(info: PageExtensionInfo): void;
  rebuild(): void;
  releaseGate(): void;
}

let createOwner: (page: PageMetadata) => MetadataOwner;

/** @internal */
export function installMetadataOwner(factory: typeof createOwner): void {
  createOwner = factory;
}

/** @internal */
export function metadataOwner(page: PageMetadata): MetadataOwner {
  return createOwner(page);
}
