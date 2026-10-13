import { Category } from "@antelopejs/interface-dms/page";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pagesSection } from "../sections";

export const pageAccessCategory = Category("page-access", {
  displayName: "Page access",
  icon: "i-ph-key",
  order: 30,
  category: pagesSection,
});

// Every signed-in member opens what is declared under it without a role
// grant, and its pages inherit its layout unless they declare their own.
export const memberAccessCategory = Category("access-members", {
  displayName: "Member access",
  icon: "i-ph-users",
  order: 30,
  category: pageAccessCategory,
  memberAccess: true,
  layout: FormPageLayout(),
});

export const PAGE_ACCESS_URL = pageAccessCategory.fullSlug;
