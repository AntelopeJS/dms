import DynamicDrawer from "../../build/components/containers/drawer/DynamicDrawer.vue";
import { openDynamicContainer } from "./openDynamicContainer";
import type { ContainerInstance, DrawerOptions } from "./types";

const DRAWER_ID_PREFIX = "drawer";

/**
 * Public composable to open a DMS-themed drawer from any module that extends the
 * layer. Wraps the internal DynamicDrawer container; `open` returns a handle
 * whose `result` settles when the drawer is dismissed.
 */
export function useDrawer() {
  const overlay = useOverlay();

  function open<Result = unknown>(
    options: DrawerOptions,
  ): ContainerInstance<Result> {
    return openDynamicContainer<Result, DrawerOptions>(
      overlay,
      DynamicDrawer,
      DRAWER_ID_PREFIX,
      options,
    );
  }

  return { open };
}
