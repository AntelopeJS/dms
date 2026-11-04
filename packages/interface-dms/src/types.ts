import type { ControllerClass } from "@antelopejs/interface-api";

export type MaybePromise<T> = T | Promise<T>;

/** An image stored by key, as the image data type and `User.avatar` hold it. */
export interface ImageValue {
  key: string;
  alt?: string;
  principal?: boolean;
}

/**
 * The page a component is placed on, as its `onCreated` hook receives it once
 * the page registers. `PageMetadata` implements it.
 */
export interface CreatedPage {
  /** The page controller the component is placed on. */
  readonly target: ControllerClass;
  /** The id and slug the page registered under, from the root category. */
  readonly pageInfo?: { readonly fullId: string; readonly fullSlug: string };
}
