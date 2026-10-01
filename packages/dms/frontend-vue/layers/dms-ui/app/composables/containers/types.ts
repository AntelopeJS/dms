import type { Component } from "vue";
import type { ModalSize } from "../../types/modal";

/**
 * Side from which a {@link DrawerOptions} drawer slides in.
 * Mirrors the `direction` prop of the internal DynamicDrawer container.
 */
export type DrawerDirection = "top" | "bottom" | "left" | "right";

/** Tint of the optional header icon well of a container. */
export type ContainerColor =
  | "primary"
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "error";

/**
 * Options shared by every themed container opened through a public composable.
 * They map one-to-one onto the props of the internal Dynamic{Drawer,Modal}
 * containers, except `containerId` which is generated when omitted.
 */
export interface ContainerOptions {
  title: string;
  description?: string;
  component: Component;
  componentOptions?: Record<string, unknown>;
  headerComponent?: Component;
  headerComponentOptions?: Record<string, unknown>;
  containerId?: string;
  /** Icon rendered in a 36px tinted well before the title. */
  icon?: string;
  /** Tint of the icon well (default primary). */
  color?: ContainerColor;
}

/** Options accepted by {@link useDrawer}'s `open`. */
export interface DrawerOptions extends ContainerOptions {
  direction?: DrawerDirection;
}

/** Options accepted by {@link useModal}'s `open`. */
export interface ModalOptions extends ContainerOptions {
  size?: ModalSize;
}

/**
 * Handle returned when a container is opened. `result` settles with the value
 * the body component emits on `success` (or the value passed to `close`) once
 * the container is dismissed; `close` dismisses it programmatically.
 */
export interface ContainerInstance<Result = unknown> {
  result: Promise<Result>;
  close: (result?: Result) => void;
}
