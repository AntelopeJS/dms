import {
  defineComponent,
  inject,
  onBeforeMount,
  onBeforeUnmount,
  onErrorCaptured,
  onServerPrefetch,
  provide,
  readonly,
  ref,
  shallowRef,
  type Component,
  type InjectionKey,
  type Ref,
  type ShallowRef,
  type VNodeChild,
} from "vue";

/** Renders the actions shown on the right of the page header. */
export type PageHeaderActionsRender = () => VNodeChild;

/**
 * What a layout rendering a page header shares with the page in its slot.
 *
 * The header renders before the page, yet its actions come from the page.
 * On the server, the header's outlet defers its render (a server prefetch)
 * until the page has set up, so the actions are in the server-rendered
 * markup. In the browser, the outlet keeps that markup as it is until the
 * page has set up again, then renders the live actions over it: no pop-in,
 * no hydration mismatch.
 */
export interface PageHeaderActionsHost {
  /** The render function the page asked for, if any. */
  actions: ShallowRef<PageHeaderActionsRender | null>;
  /** Once the page in the slot has set up and set its actions. */
  isReady: Readonly<Ref<boolean>>;
  /** Called right after the page in the slot rendered (its sync setup ran). */
  markSlotRendered: () => void;
  /** A page announces its actions; the returned callback says they are set. */
  expect: () => () => void;
  /** Settles with `isReady`. */
  whenReady: () => Promise<void>;
}

const PAGE_HEADER_ACTIONS_KEY: InjectionKey<PageHeaderActionsHost> = Symbol(
  "dms:page-header-actions",
);

// A server render must never hang on a page that announced actions and then
// failed in a way no error hook saw: past this delay the header renders
// without them.
const SERVER_READY_TIMEOUT_MS = 5000;

/**
 * Called by a layout that renders a page header: shares the actions state
 * with the page in its slot.
 */
export const providePageHeaderActions = (): PageHeaderActionsHost => {
  const actions = shallowRef<PageHeaderActionsRender | null>(null);
  const isReady = ref(false);
  let slotRendered = false;
  let pending = 0;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const markReady = () => {
    isReady.value = true;
    resolveReady();
  };
  const settle = () => {
    if (slotRendered && pending === 0) markReady();
  };
  if (import.meta.env.SSR) setTimeout(markReady, SERVER_READY_TIMEOUT_MS);
  // A page whose setup throws never sets its actions: stop waiting for it.
  onErrorCaptured(() => {
    pending = 0;
    settle();
  });
  const host: PageHeaderActionsHost = {
    actions,
    isReady: readonly(isReady),
    markSlotRendered: () => {
      slotRendered = true;
      settle();
    },
    expect: () => {
      pending++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        pending = Math.max(0, pending - 1);
        settle();
      };
    },
    whenReady: () => ready,
  };
  provide(PAGE_HEADER_ACTIONS_KEY, host);
  return host;
};

/** The actions state of the enclosing layout, if any (for its outlet). */
export const injectPageHeaderActionsHost = (): PageHeaderActionsHost | null =>
  inject(PAGE_HEADER_ACTIONS_KEY, null);

/**
 * Holds the header actions back while an async part of the page (a page
 * whose setup awaits before rendering its blocks) has not rendered yet: a
 * block in it may still ask for actions. Call it before the setup's first
 * await, and render the returned marker after the content it holds for.
 *
 * @returns The marker component to render after the held content
 */
export const holdPageHeaderActions = (): Component => {
  const host = inject(PAGE_HEADER_ACTIONS_KEY, null);
  const release = host?.expect() ?? (() => {});
  onBeforeUnmount(release);
  return defineComponent({
    name: "DmsPageContentRendered",
    setup() {
      release();
      return () => null;
    },
  });
};

/**
 * Puts actions in the page header (a primary button, a status pill…) from a
 * page rendered inside a layout. The actions show once the page has set up
 * (so the render function may read anything the setup declares) and are
 * removed when the page unmounts. Outside such a layout the call does
 * nothing.
 *
 * Call it before the first `await` of the setup: the header then renders
 * the actions in the server pass, with the page.
 *
 * @param render Render function of the actions, e.g. `() => h(UButton, …)`
 */
export const usePageHeaderActions = (render: PageHeaderActionsRender): void => {
  const host = inject(PAGE_HEADER_ACTIONS_KEY, null);
  if (!host) return;
  const release = host.expect();
  const show = () => {
    host.actions.value = render;
    release();
  };
  // Both hooks on both sides: each only ever fires on its own side, and a
  // server prefetch hook marks the component as an async boundary, which
  // `useId` counts. Registered on one side only, every id rendered after
  // the page would differ between the server and the browser.
  onServerPrefetch(show);
  onBeforeMount(show);
  onBeforeUnmount(() => {
    release();
    if (host.actions.value === render) host.actions.value = null;
  });
};
