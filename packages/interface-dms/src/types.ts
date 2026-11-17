import type { DecoratorTarget } from "@antelopejs/interface-core/decorators";

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
  /**
   * The page controller the component is placed on, as page metadata holds
   * it. `pageController` (`@antelopejs/interface-dms/page/internal/page-controller`)
   * narrows it to the controller class, or throws `PageTargetError`.
   */
  readonly target: DecoratorTarget;
  /** The id and slug the page registered under, from the root category. */
  readonly pageInfo?: { readonly fullId: string; readonly fullSlug: string };
}
