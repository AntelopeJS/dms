import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { dynamicNavigationCategory } from "./category";

// Two siblings whose slugs share a prefix without one containing the other: on
// `section-archive`, only that entry is active, since `section` is not one of
// its parents.
@RegisterPage()
export class NavigationSectionPage extends PageController(
  "section",
  {
    displayName: "Section",
    icon: "i-ph-folder",
    category: dynamicNavigationCategory,
    description: "Sibling of Section archive, whose slug extends this one",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Section",
    description: "Its slug is a prefix of /section-archive, not a parent of it",
    fields: [],
  });
}

@RegisterPage()
export class NavigationSectionArchivePage extends PageController(
  "section-archive",
  {
    displayName: "Section archive",
    icon: "i-ph-archive",
    category: dynamicNavigationCategory,
    description: "Sibling of Section, not one of its children",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Section archive",
    description: "Only this entry is active here, not Section",
    fields: [],
  });
}
