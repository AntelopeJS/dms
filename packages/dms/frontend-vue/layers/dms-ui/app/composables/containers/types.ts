import type { Component } from "vue";
import type { ModalSize } from "../../types/modal";
import type { RowNavigation } from "../../build/composables/actions/rowNavigation";

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
  /**
   * Mounts the body component anew when it changes: a drawer stepping to
   * another row gives the component a fresh start on it.
   */
  componentKey?: string;
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
  /**
   * Width a `left` / `right` drawer opens at from `lg`: a modal's width at
   * that size (`sm` 384px ... `5xl` 1024px), `full` the whole window; 600px
   * without one, capped to the window. Below `lg` an unsized side drawer is
   * 440px wide, and on a phone every side drawer, sized or not, leaves a 2rem
   * strip of backdrop (only `full` fills the screen). A `top` / `bottom`
   * drawer ignores it.
   */
  size?: ModalSize;
  /**
   * The key the size the user drags the drawer to is remembered under, on
   * this device (a cookie): the same drawer opens again at that size. Sizes
   * are kept per axis, so a side and a bottom drawer may share a key.
   * Defaults to `containerId`, else to the body component's name (its
   * `name`, or the file name of a `<script setup>` component): a drawer keeps
   * its size without one. Set it when one component opens drawers that
   * should not share a size, or when an anonymous component (a render
   * function, an async wrapper) or a per-opening `containerId` would forget.
   */
  sizeKey?: string;
  /**
   * Draws the DMS's row header in place of the drawer's own title, as on a
   * row action's drawer: the row's title, its position ("4 of 50") and
   * previous / next, next to the close button; J and K step while the
   * drawer is open. For a drawer a module opens on a row of its own list.
   */
  rowHeader?: DrawerRowHeader;
}

/**
 * The DMS's row header over a drawer opened with {@link useDrawer}. Patch it
 * (`patch({ rowHeader })`) as the drawer steps to another row.
 */
export interface DrawerRowHeader {
  /** The row's title; the drawer's `title` without one. */
  title?: string;
  /**
   * i18n key (`$`-prefixed) of the position, receiving `{ index, total }`
   * (1-based, grouped as the locale does); "{index} of {total}" without one.
   */
  positionLabel?: string;
  /**
   * The row's place among the rows it steps through: the position, the
   * previous / next buttons and J / K call its `prev()` and `next()`. No
   * position nor buttons without one.
   */
  navigation?: RowNavigation;
}

/** Options accepted by {@link useModal}'s `open`. */
export interface ModalOptions extends ContainerOptions {
  size?: ModalSize;
}

/**
 * Handle returned when a container is opened. `result` settles with the value
 * the body component emits on `success` (or the value passed to `close`) once
 * the container is dismissed; `close` dismisses it programmatically, `patch`
 * changes it in place.
 */
export interface ContainerInstance<Result = unknown> {
  result: Promise<Result>;
  close: (result?: Result) => void;
  /** Updates the open container: its texts, or its body's options and key. */
  patch: (options: ContainerPatch) => void;
}

/** What an open container can change in place. */
export type ContainerPatch = Partial<
  Pick<
    ContainerOptions,
    | "title"
    | "description"
    | "componentOptions"
    | "componentKey"
    | "headerComponentOptions"
  >
>;

/**
 * What an open drawer can change in place: a container's, and the row
 * header it was opened with (`rowHeader`), replaced as a whole.
 */
export type DrawerPatch = ContainerPatch & Pick<DrawerOptions, "rowHeader">;

/** The handle of a drawer opened with {@link useDrawer}. */
export interface DrawerInstance<Result = unknown>
  extends Omit<ContainerInstance<Result>, "patch"> {
  /** Updates the open drawer: its texts, its body, its row header. */
  patch: (options: DrawerPatch) => void;
}
