import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Banner,
  KeyValueList,
  type KeyValueListItem,
} from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { dynamicNavigationCategory, NAVIGATION_DEMO_API } from "./category";

const ENTRIES: KeyValueListItem[] = [
  {
    label: "invoicer, resto-lucca, sleepy-api",
    value: "query entries, status dot, badge",
    detail:
      "One hidden page serves the three through ?project=. Rotate the statuses to see the menu refresh live.",
  },
  {
    label: "resto-lucca (path)",
    value: "params",
    detail:
      "Fills the :projectId segment of a page whose urlSlug is projects/:projectId.",
  },
  {
    label: "Launch checklist",
    value: "variant, description, permissionId",
    detail:
      "Accent entry, listed only to a role holding this Overview page (try Preview as role).",
  },
  {
    label: "Unknown project",
    value: "validation.redirectTo",
    detail:
      "The project page's customFunctionId refuses it, and redirectTo brings you back here.",
  },
  {
    label: "New project",
    value: "static page, variant: accent",
    detail: "A static page sorted after the dynamic entries.",
  },
  {
    label: "Section, Section archive",
    value: "sibling slugs",
    detail:
      "Their slugs share a prefix: on Section archive only that entry is active.",
  },
];

@RegisterPage()
export class DynamicNavigationOverviewPage extends PageController(
  "overview",
  {
    displayName: "Overview",
    icon: "i-ph-info",
    category: dynamicNavigationCategory,
    order: -1,
    description:
      "Demonstrates: RegisterDynamicMenuProvider and NotifyMenuChanged. Rotate the statuses, then open each entry below.",
  },
  DefaultLayout({
    headerActions: [
      {
        id: "rotate",
        label: "Rotate the project statuses",
        icon: "i-ph-arrows-clockwise",
        target: {
          type: "api",
          method: "POST",
          url: `${NAVIGATION_DEMO_API}/rotate-status`,
          successMessage: "Menu refreshed",
        },
      },
    ],
  }),
) {
  static redirected = Banner({
    fetchUrl: `${NAVIGATION_DEMO_API}/redirected?missing={{query.missing}}`,
  });

  static entries = KeyValueList({
    title: "What each entry of this category shows",
    items: ENTRIES,
  });
}
