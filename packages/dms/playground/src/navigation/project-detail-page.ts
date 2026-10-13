import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { dynamicNavigationCategory, NAVIGATION_DEMO_API } from "./category";

// Reached only through the "resto-lucca (path)" dynamic entry, whose `params`
// fill the `:projectId` segment of this page's slug.
@RegisterPage()
export class DynamicNavigationProjectDetailPage extends PageController(
  "project-detail",
  {
    displayName: "Project (path)",
    icon: "i-ph-path",
    urlSlug: "projects/:projectId",
    category: dynamicNavigationCategory,
    hidden: true,
    description:
      "Demonstrates: a :param page slug filled by a dynamic entry's params, read back by a block through {{params.projectId}}.",
  },
  DefaultLayout({ fullWidth: false }),
) {
  static project = KeyValueList({
    title: "This page's route parameter",
    fetchUrl: `${NAVIGATION_DEMO_API}/projects/{{params.projectId}}`,
  });
}
