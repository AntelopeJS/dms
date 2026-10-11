import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  type ComputedRef,
} from "vue";
import type {
  LiveSubscription,
  PageLiveController,
} from "./pageLiveController";

// Client-only state: the page renderer sets it in the browser, where one app
// shows one page at a time. The server renders no event and no refetch, so it
// never needs one, and a module-level value there would be shared between
// requests.
const currentController = shallowRef<PageLiveController | null>(null);

/**
 * The live controller of the page on screen, `null` when the page has no
 * `live` option (or while server-rendering).
 *
 * @internal
 */
export function currentPageLive(): PageLiveController | null {
  return currentController.value;
}

/**
 * Installs the controller of the page on screen. The page renderer calls it.
 *
 * @internal
 */
export function setCurrentPageLive(controller: PageLiveController | null) {
  if (typeof window === "undefined") return;
  currentController.value = controller;
}

/** @internal */
export interface LiveGate {
  /** An event behind the block arrived: refetch, now or later, or count it. */
  trigger(event?: object): void;
  /** Events the block missed while the page is paused. */
  missed: ComputedRef<number>;
  /** Refetches now and forgets what was missed. */
  catchUp(): void;
}

interface BoundSubscription {
  controller: PageLiveController;
  subscription: LiveSubscription;
}

/**
 * The gate a block's refetch goes through. On a page without `live` it calls
 * `refresh` at once, as before. Bound lazily, on the first event, to the
 * controller of the page on screen: a block of the page layout sets up before
 * the page installs its controller.
 *
 * @internal
 */
export function useLiveGate(refresh: () => void): LiveGate {
  const bound = shallowRef<BoundSubscription | null>(null);

  const unbind = () => {
    bound.value?.subscription.unsubscribe();
    bound.value = null;
  };

  const resolve = (): LiveSubscription | null => {
    const controller = currentController.value;
    if (bound.value?.controller === controller) {
      return bound.value?.subscription ?? null;
    }
    unbind();
    if (!controller) return null;
    bound.value = { controller, subscription: controller.subscribe(refresh) };
    return bound.value.subscription;
  };

  if (getCurrentScope()) onScopeDispose(unbind);

  return {
    trigger: (event) => {
      const subscription = resolve();
      if (subscription) subscription.trigger(event);
      else refresh();
    },
    missed: computed(() =>
      bound.value?.controller === currentController.value
        ? (bound.value?.subscription.missed.value ?? 0)
        : 0,
    ),
    catchUp: () => {
      const subscription = resolve();
      if (subscription) subscription.catchUp();
      else refresh();
    },
  };
}
