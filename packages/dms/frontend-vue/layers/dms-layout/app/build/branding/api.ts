import type {
  OpResult,
  SetThemeDraft,
  ThemeLayer,
  ThemeStructure,
} from "./theme-types";

const THEME_URL = "/api/branding/theme";
const LAYER_URL = "/api/branding/theme/layer";

/** The `/api/branding` routes, which answer every builder refusal as `{ ok: false }`. */
export interface BrandingApi {
  readTheme: () => Promise<OpResult<ThemeStructure>>;
  saveTheme: (
    draft: SetThemeDraft,
    expectedVersion: string,
  ) => Promise<OpResult<{ version: string }>>;
  createLayer: () => Promise<OpResult<ThemeLayer>>;
}

export function useBrandingApi(): BrandingApi {
  const { $authFetch } = useAuthFetch();
  return {
    readTheme: () => $authFetch<OpResult<ThemeStructure>>(THEME_URL),
    saveTheme: (draft, expectedVersion) =>
      $authFetch<OpResult<{ version: string }>>(THEME_URL, {
        method: "PUT",
        body: { draft, expectedVersion },
      }),
    createLayer: () =>
      $authFetch<OpResult<ThemeLayer>>(LAYER_URL, { method: "POST" }),
  };
}
