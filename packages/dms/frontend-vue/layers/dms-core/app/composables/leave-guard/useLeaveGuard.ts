import type {
  LeaveGuardCallback,
  LeaveGuardEntry,
  LeaveGuardRegistry,
  UseLeaveGuardReturn,
} from "./types";

const GUARD_ID_PREFIX = "guard";

const registry = shallowRef<LeaveGuardRegistry>(new Map());

function generateGuardId(): string {
  return `${GUARD_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function runGuardsSequentially(
  guards: LeaveGuardEntry[],
): Promise<boolean> {
  for (const guard of guards) {
    try {
      const result = await guard.callback();
      if (result === false) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function isClientSide(): boolean {
  return !import.meta.env.SSR;
}

function updateRegistry(
  mutate: (map: Map<string, LeaveGuardEntry[]>) => void,
): void {
  const newMap = new Map(registry.value);
  mutate(newMap);
  registry.value = newMap;
}

export const useLeaveGuard = (): UseLeaveGuardReturn => {
  function addGuard(
    containerId: string,
    callback: LeaveGuardCallback,
  ): () => void {
    if (!isClientSide()) {
      return () => {};
    }

    const guardId = generateGuardId();
    const entry: LeaveGuardEntry = { id: guardId, callback };

    updateRegistry((map) => {
      const existingGuards = map.get(containerId) || [];
      map.set(containerId, [...existingGuards, entry]);
    });

    return () => removeGuard(containerId, guardId);
  }

  function removeGuard(containerId: string, guardId: string): void {
    if (!isClientSide()) return;

    const guards = registry.value.get(containerId);
    if (!guards) return;

    const filtered = guards.filter((g) => g.id !== guardId);

    updateRegistry((map) => {
      if (filtered.length === 0) {
        map.delete(containerId);
      } else {
        map.set(containerId, filtered);
      }
    });
  }

  async function executeGuards(containerId: string): Promise<boolean> {
    if (!isClientSide()) return true;

    const guards = registry.value.get(containerId);
    if (!guards || guards.length === 0) {
      return true;
    }
    return runGuardsSequentially(guards);
  }

  function clearGuards(containerId: string): void {
    if (!isClientSide()) return;

    updateRegistry((map) => {
      map.delete(containerId);
    });
  }

  return {
    addGuard,
    removeGuard,
    executeGuards,
    clearGuards,
  };
};
