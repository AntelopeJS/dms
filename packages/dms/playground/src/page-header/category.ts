import { Category } from "@antelopejs/interface-dms/page";
import { pagesSection } from "../sections";

export const pageHeaderCategory = Category("page-header", {
  displayName: "Page header",
  icon: "i-ph-cursor-click",
  order: 20,
  category: pagesSection,
});

export const PAGE_HEADER_DEMO_API = "/api/playground/page-header";
export const PAGE_HEADER_PAGE_ID = "page-header-actions";
export const PAGE_HEADER_PAGE_URL = `${pageHeaderCategory.fullSlug}/${PAGE_HEADER_PAGE_ID}`;
/** The page action the "Audit" header button names as `permission`. */
export const PAGE_HEADER_AUDIT_PERMISSION_ID = `${pageHeaderCategory.fullId}.${PAGE_HEADER_PAGE_ID}.audit`;
