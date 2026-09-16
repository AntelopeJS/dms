const DEFAULT_HOMEPAGE = "/";

export const useHomepage = (): string => {
  const config = useDmsRuntimeConfig();
  return config.public.dms.homepage || DEFAULT_HOMEPAGE;
};
