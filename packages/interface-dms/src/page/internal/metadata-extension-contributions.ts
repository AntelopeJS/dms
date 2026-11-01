/** @internal */
import { Logging } from "@antelopejs/interface-core/logging";
import { PageDeclarationConflictError } from "../declaration-conflict";
import type { PageMetadata } from "../metadata";
import type { PageExtensionComponent, PageExtensionInfo } from "../types";
import type { PageExtensionEntry } from "./extension-assembly";
import { collectExtensionErrors } from "./extension-validation";
import { metadataOwner } from "./metadata-owner";
import { runAsPageExtensionOwner } from "./registry";

/** @internal */
export function removeStaleExtensions(
  page: PageMetadata,
  infos: PageExtensionInfo[],
): void {
  const owner = metadataOwner(page);
  const desired = new Set(infos);
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot the keys before drop deletes entries from the same map.
  for (const info of [...owner.extensionEntries.keys()]) {
    if (!desired.has(info)) owner.drop(info);
  }
}

/** @internal */
export function prepareExtensionEntries(
  page: PageMetadata,
  info: PageExtensionInfo,
): PageExtensionEntry[] | undefined {
  const owner = metadataOwner(page);
  const errors = collectExtensionErrors(info, {
    own: owner.ownComponents,
    taken: owner.takenKeys(),
  });
  const entries: PageExtensionEntry[] = [];
  owner.extensionEntries.set(info, entries);
  if (errors.length > 0) {
    for (const error of errors) Logging.Error(`[dms] ${error}`);
    return;
  }
  return entries;
}

/** @internal */
export function prepareExtensionComponent(
  page: PageMetadata,
  info: PageExtensionInfo,
  contribution: PageExtensionComponent,
) {
  const owner = metadataOwner(page);
  const componentPath = owner.path(contribution);
  return runAsPageExtensionOwner(info, () =>
    owner.prepareExtension(contribution, componentPath),
  );
}

/** @internal */
export function reportExtensionFailure(
  page: PageMetadata,
  entries: PageExtensionEntry[],
  info: PageExtensionInfo,
  contribution: PageExtensionComponent,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript catch values have no owner-declared type; preserve cleanup, conflict rethrow, and late string conversion for arbitrary throws.
  error: unknown,
): void {
  const owner = metadataOwner(page);
  entries.pop();
  owner.unregisterExtension(contribution);
  if (error instanceof PageDeclarationConflictError) throw error;
  Logging.Error(
    `[dms] page extension "${info.extensionName}" could not register component "${contribution.key}" on page "${info.targetFullId}": ${String(error)}`,
  );
}
