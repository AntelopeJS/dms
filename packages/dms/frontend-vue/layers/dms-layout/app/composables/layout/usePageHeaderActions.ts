import {
  inject,
  onBeforeUnmount,
  provide,
  shallowRef,
  type InjectionKey,
  type ShallowRef,
  type VNodeChild,
} from "vue";

/** Renders the actions shown on the right of the page header. */
export type PageHeaderActionsRender = () => VNodeChild;

const PAGE_HEADER_ACTIONS_KEY: InjectionKey<
  ShallowRef<PageHeaderActionsRender | null>
> = Symbol("dms:page-header-actions");

/**
 * Called by a layout that renders a page header: returns the render function
 * the page in its slot asked for, if any.
 */
export const providePageHeaderActions = (): ShallowRef<PageHeaderActionsRender | null> => {
  const actions = shallowRef<PageHeaderActionsRender | null>(null);
  provide(PAGE_HEADER_ACTIONS_KEY, actions);
  return actions;
};

/**
 * Puts actions in the page header (a primary button, a status pill…) from a
 * page rendered inside a layout. The actions are removed when the page
 * unmounts. Outside such a layout the call does nothing.
 *
 * @param render Render function of the actions, e.g. `() => h(UButton, …)`
 */
export const usePageHeaderActions = (render: PageHeaderActionsRender): void => {
  const actions = inject(PAGE_HEADER_ACTIONS_KEY, null);
  if (!actions) return;
  actions.value = render;
  onBeforeUnmount(() => {
    if (actions.value === render) actions.value = null;
  });
};
