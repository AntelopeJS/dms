import { Category } from "@antelopejs/interface-dms/page";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pagesSection } from "../sections";

export const pageAccessCategory = Category("page-access", {
  displayName: "Page access",
  icon: "i-ph-key",
  order: 30,
  category: pagesSection,
});

export const memberAccessCategory = Category("access-members", {
  displayName: "Member access",
  icon: "i-ph-users",
  order: 30,
  category: pageAccessCategory,
  memberAccess: true,
  layout: FormPageLayout(),
});

export const PAGE_ACCESS_URL = pageAccessCategory.fullSlug;
