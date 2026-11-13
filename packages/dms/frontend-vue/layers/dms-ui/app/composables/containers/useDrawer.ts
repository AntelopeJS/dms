import { getCurrentInstance, type ComponentInternalInstance } from "vue";
import DynamicDrawer from "../../build/components/containers/drawer/DynamicDrawer.vue";
import DmsRowHeader from "../../build/components/containers/row/RowHeader.vue";
import { drawerRowHeaderProps } from "../../build/components/containers/row/drawerRowHeader";
import { listenRowSteps } from "../../build/composables/actions/rowNavigation";
import { DMS_OWN_DRAWER } from "../../build/composables/containers/context";
import { componentSizeKey } from "../../build/composables/containers/drawerSize";
import { openDynamicContainer } from "./openDynamicContainer";
import type {
  DrawerInstance,
  DrawerOptions,
  DrawerPatch,
  DrawerRowHeader,
} from "./types";

const DRAWER_ID_PREFIX = "drawer";

/** What `useDrawer` hands the drawer besides its options. */
interface DrawerCallerContext {
  /** The provides of the component that called `useDrawer` (see DynamicDrawer). */
  callerProvides?: object;
}

/** What `instance` and its ancestors provide, read when the drawer opens. */
function providesOf(
  instance: ComponentInternalInstance | null,
): object | undefined {
  if (!instance || !("provides" in instance)) return undefined;
  const { provides } = instance;
  return typeof provides === "object" && provides !== null
    ? provides
    : undefined;
}

/**
 * Public composable to open a DMS-themed drawer from any module that extends the
 * layer. Wraps the internal DynamicDrawer container; `open` returns a handle
 * whose `result` settles when the drawer is dismissed.
 */
export function useDrawer() {
  const overlay = useOverlay();

  const caller = getCurrentInstance();

  function open<Result = unknown>(
    options: DrawerOptions,
  ): DrawerInstance<Result> {
    const { rowHeader, ...containerOptions } = options;

    let title = options.title;
    let header: DrawerRowHeader | undefined = rowHeader;
    const headerProps = () => header && drawerRowHeaderProps(header, title);
    const instance = openDynamicContainer<
      Result,
      DrawerOptions & DrawerCallerContext
    >(overlay, DynamicDrawer, DRAWER_ID_PREFIX, {
      ...containerOptions,

      callerProvides:
        DMS_OWN_DRAWER in options ? undefined : providesOf(caller),
      ...(rowHeader && {
        headerComponent: DmsRowHeader,
        headerComponentOptions: headerProps(),
      }),
      sizeKey:
        options.sizeKey ??
        options.containerId ??
        componentSizeKey(options.component),
    });
    if (!rowHeader) {
      return {
        ...instance,
        patch: ({ rowHeader: _rowHeader, ...patch }: DrawerPatch) =>
          instance.patch(patch),
      };
    }
    const stopSteps = listenRowSteps(() => header?.navigation);
    instance.result.then(stopSteps, stopSteps);
    return {
      ...instance,
      patch: ({ rowHeader: nextHeader, ...patch }: DrawerPatch) => {
        title = patch.title ?? title;
        header = nextHeader ?? header;
        instance.patch({ ...patch, headerComponentOptions: headerProps() });
      },
    };
  }

  return { open };
}
