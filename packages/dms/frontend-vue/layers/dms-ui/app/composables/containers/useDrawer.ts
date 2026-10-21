import { getCurrentInstance } from "vue";
import DynamicDrawer from "../../build/components/containers/drawer/DynamicDrawer.vue";
import DmsRowHeader from "../../build/components/containers/row/RowHeader.vue";
import { drawerRowHeaderProps } from "../../build/components/containers/row/drawerRowHeader";
import { listenRowSteps } from "../../build/composables/actions/rowNavigation";
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

/** The part of a component instance holding what it and its ancestors provide. */
interface InstanceProvides {
  provides?: object;
}

/**
 * Public composable to open a DMS-themed drawer from any module that extends the
 * layer. Wraps the internal DynamicDrawer container; `open` returns a handle
 * whose `result` settles when the drawer is dismissed.
 */
export function useDrawer() {
  const overlay = useOverlay();
  // The drawer mounts under the app's overlay provider, outside the caller's
  // tree: it inherits what the caller provides, as a drawer written in the
  // caller's template does. Read at each opening, as the caller may provide
  // after calling `useDrawer`. Vue keeps them in the instance's `provides`,
  // which its public types do not list.
  const caller = getCurrentInstance() as InstanceProvides | null;

  function open<Result = unknown>(
    options: DrawerOptions,
  ): DrawerInstance<Result> {
    const { rowHeader, ...containerOptions } = options;
    // The row header follows the title and the row it was last patched with.
    let title = options.title;
    let header: DrawerRowHeader | undefined = rowHeader;
    const headerProps = () => header && drawerRowHeaderProps(header, title);
    const instance = openDynamicContainer<
      Result,
      DrawerOptions & DrawerCallerContext
    >(overlay, DynamicDrawer, DRAWER_ID_PREFIX, {
      ...containerOptions,
      callerProvides: caller?.provides,
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
      // Without a row header to update, a patch is a container's.
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
