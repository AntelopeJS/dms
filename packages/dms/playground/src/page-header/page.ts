import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  KeyValueList,
  type KeyValueListItem,
  NavCardGrid,
  type NavCardItem,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  DefaultLayout,
  type PageHeaderButton,
} from "@antelopejs/interface-dms/base/layouts";
import type { ComponentFilterContext } from "@antelopejs/interface-dms/component";
import {
  PAGE_HEADER_DEMO_API,
  PAGE_HEADER_PAGE_ID,
  PAGE_HEADER_PAGE_URL,
  pageHeaderCategory,
} from "./category";

const ARCHIVED_WORKSPACE = "archive";

function publishAvailability({ query }: ComponentFilterContext) {
  return query?.workspace === ARCHIVED_WORKSPACE
    ? { reason: "$demo.pages.header.archived" }
    : undefined;
}

function settingsAvailability({ query }: ComponentFilterContext) {
  return query?.workspace ? undefined : { hidden: true as const };
}

const HEADER_BUTTONS: PageHeaderButton[] = [
  {
    id: "download",
    label: "$demo.pages.header.download",
    icon: "i-ph-download-simple",
    order: 10,
    target: {
      type: "download",
      url: `${PAGE_HEADER_DEMO_API}/export?workspace={{query.workspace}}&locale={{query.locale}}`,
      filename: "{{query.locale}}.json",
    },
  },
  {
    id: "publish",
    label: "Publish",
    icon: "i-ph-paper-plane-tilt",
    color: "primary",
    order: 30,
    target: {
      type: "api",
      method: "POST",
      url: `${PAGE_HEADER_DEMO_API}/publish?workspace={{query.workspace}}`,
      successMessage: "Published",
    },
    availability: publishAvailability,
  },
  {
    id: "settings",
    label: "Workspace settings",
    icon: "i-ph-gear",
    order: 40,
    target: {
      type: "page",
      url: `${PAGE_HEADER_PAGE_URL}?workspace={{query.workspace}}&locale={{query.locale}}&tab=danger`,
    },
    availability: settingsAvailability,
  },
  {
    id: "audit",
    label: "Audit",
    icon: "i-ph-scroll",
    order: 50,
    permission: "audit",
    target: {
      type: "external",
      url: "https://dms.antelopejs.com/docs?workspace={{query.workspace}}",
      newTab: true,
    },
  },
];

const SWITCHER: NavCardItem[] = [
  {
    icon: "i-ph-globe",
    title: "?workspace=web&locale=fr",
    description: "Every button shows; Download saves fr.json.",
    to: `${PAGE_HEADER_PAGE_URL}?workspace=web&locale=fr`,
  },
  {
    icon: "i-ph-archive",
    title: "?workspace=archive&locale=en",
    description: "Publish is disabled with a reason.",
    to: `${PAGE_HEADER_PAGE_URL}?workspace=archive&locale=en`,
  },
  {
    icon: "i-ph-eye-slash",
    title: "?locale=de",
    description: "No workspace: Workspace settings is hidden.",
    to: `${PAGE_HEADER_PAGE_URL}?locale=de`,
  },
];

const BUTTONS_EXPLAINED: KeyValueListItem[] = [
  {
    label: "Download {locale}.json",
    value: "download target, label from the query",
    detail:
      "Fetched with your session from a route behind AuthUser; filename and URL take {{query.X}}.",
  },
  {
    label: "Client action",
    value: "usePageHeaderActions(render, { order: 20 })",
    detail:
      "Added by a Vue component of the page, sorted between Download (10) and Publish (30).",
  },
  {
    label: "Publish",
    value: "availability: { reason }",
    detail:
      "Disabled on ?workspace=archive, asked again whenever the query changes.",
  },
  {
    label: "Workspace settings",
    value: "availability: { hidden: true }, page link",
    detail:
      "Hidden without ?workspace=; its link keeps the page's workspace and locale.",
  },
  {
    label: "Audit",
    value: 'permission: "audit"',
    detail:
      "An action of the page, relative to its permission id; grant it in Settings › Roles.",
  },
];

@RegisterPage()
export class PageHeaderActionsPage extends PageController(
  PAGE_HEADER_PAGE_ID,
  {
    displayName: "Header buttons",
    icon: "i-ph-cursor-click",
    category: pageHeaderCategory,
    order: 0,
    query: { workspace: "web", locale: "fr" },
    description:
      "Demonstrates: DefaultLayout headerActions following the page query (labels, URLs, availability, order, download). Switch the query below and watch the header.",
  },
  DefaultLayout({ headerActions: HEADER_BUTTONS }),
) {
  static switcher = NavCardGrid({
    title: "Change the page query",
    columns: 3,
    items: SWITCHER,
  });

  static order = CustomComponent("PageHeaderOrderDemo").meta({
    name: "Client header action",
    icon: "i-ph-plus-circle",
  });

  static buttons = KeyValueList({
    title: "What each header button shows",
    items: BUTTONS_EXPLAINED,
  });
}
