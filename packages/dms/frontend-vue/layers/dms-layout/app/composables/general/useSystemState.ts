import type { SystemState } from "./types";

const SYSTEM_STATE_CACHE_KEY = "dms-system-state";
const SYSTEM_STATE_ENDPOINT = "/api/system-state";

const DEFAULT_SYSTEM_STATE: SystemState = {
  has_onboarded: false,
  meta: {
    title: "",
    description: "",
  },
};

export const useSystemState = () => {
  const {
    data: systemState,
    error,
    refresh,
  } = useDmsLazyAsyncData(
    SYSTEM_STATE_CACHE_KEY,
    async () => {
      const { $authFetch } = useAuthFetch();
      return await $authFetch<SystemState>(SYSTEM_STATE_ENDPOINT);
    },
    {
      default: () => ({ ...DEFAULT_SYSTEM_STATE }),
      server: true,
    },
  );

  const metaTitle = computed(() => systemState.value?.meta?.title ?? "");
  const metaDescription = computed(
    () => systemState.value?.meta?.description ?? "",
  );

  return {
    systemState: readonly(systemState),
    metaTitle,
    metaDescription,
    error: readonly(error),
    refresh,
  };
};
