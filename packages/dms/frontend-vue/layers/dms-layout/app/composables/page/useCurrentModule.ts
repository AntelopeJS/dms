import type { ComputedRef } from "vue";

export interface CurrentModule {
  id: string;
  info: ModuleInfo & { hasAccess: boolean };
}

function extractModuleIdFromPath(path: string): string | null {
  const prefix = `${MODULE_URL_PREFIX}/`;
  if (!path.startsWith(prefix)) {
    return null;
  }
  const remainder = path.slice(prefix.length);
  const slashIndex = remainder.indexOf("/");
  const segment =
    slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  return segment.length > 0 ? segment : null;
}

export const useCurrentModule = (): ComputedRef<CurrentModule | null> => {
  const route = useDmsRoute();
  const { modules } = useSiteLayout();

  return computed(() => {
    const moduleId = extractModuleIdFromPath(route.path);
    if (!moduleId) return null;

    const info = modules.value?.[moduleId];
    if (!info) return null;

    return { id: moduleId, info };
  });
};
