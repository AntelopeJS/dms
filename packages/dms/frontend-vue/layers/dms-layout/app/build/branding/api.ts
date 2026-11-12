import type {
  OpResult,
  SetThemeDraft,
  ThemeLayer,
  ThemeStructure,
} from "./theme-types";

const THEME_URL = "/api/branding/theme";
const LAYER_URL = "/api/branding/theme/layer";

/**
 * The `/api/branding` routes. A builder refusal comes back as `{ ok: false }`,
 * and so does a request that failed on its way (`request_failed`): no call
 * throws.
 */
export interface BrandingApi {
  readTheme: () => Promise<OpResult<ThemeStructure>>;
  saveTheme: (
    draft: SetThemeDraft,
    expectedVersion: string,
  ) => Promise<OpResult<{ version: string }>>;
  createLayer: () => Promise<OpResult<ThemeLayer>>;
}

async function answerOf<T>(
  request: Promise<OpResult<T>>,
): Promise<OpResult<T>> {
  try {
    return await request;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "request_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function useBrandingApi(): BrandingApi {
  const { $authFetch } = useAuthFetch();
  return {
    readTheme: () => answerOf($authFetch<OpResult<ThemeStructure>>(THEME_URL)),
    saveTheme: (draft, expectedVersion) =>
      answerOf(
        $authFetch<OpResult<{ version: string }>>(THEME_URL, {
          method: "PUT",
          body: { draft, expectedVersion },
        }),
      ),
    createLayer: () =>
      answerOf($authFetch<OpResult<ThemeLayer>>(LAYER_URL, { method: "POST" })),
  };
}
