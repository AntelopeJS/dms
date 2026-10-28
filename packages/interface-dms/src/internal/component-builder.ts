/** @internal */
import { Logging } from "@antelopejs/interface-core/logging";
import type {
  BaseComponentChild,
  Component,
  ComponentBuilder,
  ComponentInfo,
} from "../component";

/** @internal */
export function mergeBuilderOptions<T>(
  options: () => ComponentBuilder<T>["_options"],
  update: (value: ComponentBuilder<T>["_options"]) => void,
  partial: () => Partial<T>,
): void {
  const state = {
    get options() {
      return options();
    },
  };
  if (!state.options) {
    Logging.Warn("Could not merge options, component has no options");
    return;
  }
  update({ ...state.options, ...partial() });
}

/** @internal */
export function initialInfo<T>(
  componentName: string,
): ComponentInfo<T, Component<T>, BaseComponentChild> {
  return { componentName, options: undefined, children: undefined };
}

/** @internal */
export function builderInfo<T>(
  componentName: string,
  options: T | undefined,
  children: () => ComponentBuilder<T>["_children"],
): ComponentInfo<T, Component<T>, BaseComponentChild> {
  return {
    componentName,
    options,
    children: children().length > 0 ? children() : undefined,
  };
}

/** @internal */
export function appendChild<C>(
  children: () => ComponentBuilder["_children"],
  name: () => string,
  child: {
    id: string;
    component: Component<C>;
    metadata: Parameters<ComponentBuilder["child"]>[2];
  },
): void {
  const { id, component, metadata } = child;
  if (children().some((existing) => existing.id === id)) {
    Logging.Warn(`Duplicate child id "${id}" in component "${name()}"`);
  }
  const { slot, ...additionalProps } = metadata || {};
  children().push({ id, component, slot, ...additionalProps });
}

/** @internal */
export function warnUnknownChild(
  children: ComponentBuilder["_children"],
  childId: string,
  name: () => string,
): void {
  if (!children.some((child) => child.id === childId)) {
    Logging.Warn(
      `watchOn: unknown child id "${childId}" on component "${name()}". Did you call .child() first?`,
    );
  }
}

/** @internal */
export function setButton(
  buttons: () => ComponentBuilder["_buttons"],
  name: () => string,
  id: string,
  info: Parameters<ComponentBuilder["button"]>[1],
): void {
  if (buttons()[id]) {
    Logging.Warn(`Duplicate button id "${id}" in component "${name()}"`);
  }
  buttons()[id] = { id, ...info };
}
