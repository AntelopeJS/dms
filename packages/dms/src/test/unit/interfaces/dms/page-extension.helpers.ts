import type { ControllerClass } from "@antelopejs/interface-api";

import { Component } from "@antelopejs/interface-dms/component";

import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

export function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function definePage(id: string) {
  return PageController(id, {
    displayName: `Extension target ${id}`,
    category: pagesCategory,
    publicAccess: true,
  });
}

/** A page whose layout goes through the permission filter, unlike definePage. */
export function definePermissionedPage(id: string) {
  return PageController(id, {
    displayName: `Gated extension target ${id}`,
    category: pagesCategory,
  });
}

export async function registerPage(cl: ControllerClass): Promise<void> {
  RegisterPage()(cl);
  await settle();
}

/**
 * A component whose serialization always throws. The rejection is given a
 * handler up front so Node does not report it as late-handled: the component
 * only awaits it when the extension sync reaches it.
 */
export function failingComponent(): Component {
  const rejected = Promise.reject(new Error("component boom"));
  rejected.catch(() => undefined);
  return new Component(rejected, { name: "Failing" });
}
