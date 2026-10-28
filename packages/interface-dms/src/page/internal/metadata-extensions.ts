/** @internal */
import type { ComponentInfoSerialized } from "../../component";
import type { PageExtensionComponent, PageExtensionInfo } from "../types";
import type { PageExtensionEntry } from "./extension-assembly";

/** @internal */
export function extensionComponentPath(
  component: PageExtensionComponent,
): string {
  const anchorPath = component.anchorPath ?? [];
  if (anchorPath.length <= 1) return component.key;
  return [...anchorPath.slice(0, -1), component.key].join(".");
}

/** @internal */
export function takenComponentKeys(
  owner: string,
  own: Record<string, ComponentInfoSerialized>,
  extensions: () => Map<PageExtensionInfo, PageExtensionEntry[]>,
): Map<string, string> {
  const taken = new Map<string, string>(
    Object.keys(own).map((key) => [key, owner]),
  );
  for (const [info, entries] of extensions()) {
    for (const entry of entries) taken.set(entry.key, info.extensionName);
  }
  return taken;
}
