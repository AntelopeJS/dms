import { onMounted, ref, type Ref } from "vue";
import { isObject } from "../../../../../dms-core/app/utils/type-check";

/** `localStorage` key of which side panels of the mockup viewer are open. */
export const MOCKUP_PANELS_STORAGE_KEY = "dms-mockup-panels";

/** A side panel of the viewer: the block catalog, layers and pages on the left, the inspector on the right. */
export type MockupPanelSide = "left" | "right";

export type MockupPanelsOpen = Record<MockupPanelSide, boolean>;

/** The viewer's side panels: which are open, and the action that opens or closes one. */
export interface MockupPanels {
  open: Readonly<Ref<MockupPanelsOpen>>;
  toggle: (side: MockupPanelSide) => void;
}

const BOTH_OPEN: MockupPanelsOpen = { left: true, right: true };

function readStored(): MockupPanelsOpen {
  try {
    const value: Parameters<typeof isObject>[0] = JSON.parse(
      localStorage.getItem(MOCKUP_PANELS_STORAGE_KEY) ?? "null",
    );
    if (!isObject(value) || value === null || Array.isArray(value)) {
      return BOTH_OPEN;
    }
    return { left: value.left !== false, right: value.right !== false };
  } catch {
    return BOTH_OPEN;
  }
}

function store(open: MockupPanelsOpen): void {
  try {
    localStorage.setItem(MOCKUP_PANELS_STORAGE_KEY, JSON.stringify(open));
  } catch {
    return;
  }
}

/**
 * Which side panels of the viewer are open, both at first. The choice is kept
 * in this browser and read once mounted, so the server render and the
 * hydrating browser draw the same panels.
 */
export function useMockupPanels(): MockupPanels {
  const open = ref<MockupPanelsOpen>(BOTH_OPEN);
  onMounted(() => {
    open.value = readStored();
  });

  function toggle(side: MockupPanelSide): void {
    open.value = { ...open.value, [side]: !open.value[side] };
    store(open.value);
  }

  return { open, toggle };
}
