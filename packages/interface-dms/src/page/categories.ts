import type { ControllerClass } from "@antelopejs/interface-api";
import { RegisteringProxy } from "@antelopejs/interface-core";
import {
  categoryIdentity,
  dynamicMenuProviderIdentity,
  moduleIdentity,
  pageExtensionIdentity,
  pageIdentity,
  type RegistrationIdentity,
  capturePageExtensionContext,
} from "./internal/registry";
import type {
  CategoryInfo,
  DynamicMenuProviderInfo,
  ModuleInfo,
  PageExtensionInfo,
  PageInfo,
} from "./types";
// Category creation in internal/categories registers through the proxies
// declared here, and isInsideModule resolves categories through it: neither
// module dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
import { resolveCategoryInfo } from "./internal/categories";

/**
 * A registration proxy that accepts a per-context view of its entries.
 *
 * `RegisteringProxy` looks its entries up by object reference, and anything
 * that crossed the interface boundary comes back as a view of itself. A caller
 * unregistering with the object it holds — a module tearing its pages down, or
 * a test holding `metadata.pageInfo` — would match nothing, and the page would
 * stay in the registry, routed and still serving. Every entry point resolves
 * the view back to the reference the registration was filed under first.
 */
class IdentifiedRegisteringProxy<T extends object> extends RegisteringProxy<
  (value: T) => void
> {
  constructor(private readonly identity: RegistrationIdentity<T>) {
    super();
  }

  override register(value: T): void {
    this.identity.remember(value);
    super.register(value);
  }

  override unregister(value: T): void {
    const registered = this.identity.resolve(value);
    this.identity.forget(registered);
    super.unregister(registered);
  }
}

/**
 * Captures the registering module's context before the extension reaches the
 * DMS, which applies it -- now and on every later sync -- from its own.
 */
class PageExtensionRegisteringProxy extends IdentifiedRegisteringProxy<PageExtensionInfo> {
  constructor() {
    super(pageExtensionIdentity);
  }

  override register(value: PageExtensionInfo): void {
    capturePageExtensionContext(value);
    super.register(value);
  }
}

/**
 * @internal
 */
export namespace internal {
  export const RegisterCategory = new IdentifiedRegisteringProxy<CategoryInfo>(
    categoryIdentity,
  );
  export const RegisterPage = new IdentifiedRegisteringProxy<PageInfo>(
    pageIdentity,
  );
  export const RegisterModule = new IdentifiedRegisteringProxy<ModuleInfo>(
    moduleIdentity,
  );
  export const RegisterDynamicMenuProvider =
    new IdentifiedRegisteringProxy<DynamicMenuProviderInfo>(
      dynamicMenuProviderIdentity,
    );

  export const RegisterPageExtension = new PageExtensionRegisteringProxy();
}

interface ModuleEntry {
  module?: string;
  category?: CategoryInfo | ControllerClass;
  isModuleRoot?: boolean;
}

export function isInsideModule(entry: ModuleEntry): boolean {
  if (entry.isModuleRoot) return true;
  if (entry.module) return true;
  let current: CategoryInfo | ControllerClass | undefined = entry.category;
  while (current) {
    const resolved = resolveCategoryInfo(current);
    if (!resolved) return false;
    if (resolved.isModuleRoot) return true;
    current = resolved.category;
  }
  return false;
}
