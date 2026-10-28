import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { dynamicNavigationCategory } from "./category";

const SECTION_PATH = "/dynamic-nav/section";
const SECTION_ARCHIVE_PATH = "/dynamic-nav/section-archive";

@RegisterPage()
export class NavigationSectionPage extends PageController(
  "section",
  {
    displayName: "Section",
    icon: "i-ph-folder",
    category: dynamicNavigationCategory,
    description:
      "Demonstrates: sibling pages whose slugs share a prefix. Open Section archive: only that entry is active.",
  },
  DefaultLayout({}),
) {
  static notice = Banner({
    tone: "info",
    icon: "i-ph-folder",
    title: "/section is a prefix of /section-archive, not its parent",
    description:
      "Only Section is highlighted in the sidebar here. Open its sibling: only Section archive is highlighted there.",
    actions: [{ label: "Open Section archive", to: SECTION_ARCHIVE_PATH }],
  });
}

@RegisterPage()
export class NavigationSectionArchivePage extends PageController(
  "section-archive",
  {
    displayName: "Section archive",
    icon: "i-ph-archive",
    category: dynamicNavigationCategory,
    description:
      "Demonstrates: sibling pages whose slugs share a prefix. Only this entry is active here, not Section.",
  },
  DefaultLayout({}),
) {
  static notice = Banner({
    tone: "info",
    icon: "i-ph-archive",
    title: "Only Section archive is highlighted in the sidebar",
    description:
      "Its slug starts with section, yet Section is a sibling, not a parent: its entry stays inactive.",
    actions: [{ label: "Back to Section", to: SECTION_PATH }],
  });
}
