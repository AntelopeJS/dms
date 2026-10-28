import { PreviewScopeCache } from "../permission-preview";
import type { PageLayout } from "@antelopejs/interface-dms/page";
import type { PreviewPageLossCheck } from "./types";

export const PREVIEW_LOSS_TTL_MS = 30_000;

export const PREVIEW_LOSS_MAX_SCOPES = 16;

export const PREVIEW_PAGE_CONCURRENCY = 4;

export const viewerLayoutCache = new PreviewScopeCache<PageLayout>(
  PREVIEW_LOSS_TTL_MS,
  PREVIEW_LOSS_MAX_SCOPES,
);

export const previewLossCaches = new WeakMap<
  PreviewPageLossCheck,
  PreviewScopeCache<boolean>
>();

export function previewLossCacheFor(
  check: PreviewPageLossCheck,
): PreviewScopeCache<boolean> {
  let cache = previewLossCaches.get(check);
  if (!cache) {
    cache = new PreviewScopeCache<boolean>(
      PREVIEW_LOSS_TTL_MS,
      PREVIEW_LOSS_MAX_SCOPES,
    );
    previewLossCaches.set(check, cache);
  }
  return cache;
}
