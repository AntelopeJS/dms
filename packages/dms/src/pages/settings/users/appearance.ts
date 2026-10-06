import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Section } from "@antelopejs/interface-dms/base/section";
import { userCategory } from "./category";

const TEXTS = "$page.settings.appearance";

interface AppearanceGroup {
  title: string;
  description: string;
  icon: string;
  /** The Vue component drawing the group's controls. */
  component: string;
}

/**
 * One group of the Appearance page: a section around the component that
 * draws its controls. Every control saves on its own, in a cookie of this
 * device.
 */
function appearanceGroup(group: AppearanceGroup) {
  const meta = { name: group.title, icon: group.icon };
  return Section({ title: group.title, description: group.description })
    .child("controls", CustomComponent(group.component).meta(meta))
    .meta(meta);
}

@RegisterPage()
export class AppearanceSettingsController extends PageController("appearance", {
  displayName: "$menu.appearance",
  category: userCategory,
  icon: "i-ph-swatches",
  order: 7,
  description: "$page.settings.description.appearance",
}) {
  static themeComponent = appearanceGroup({
    title: `${TEXTS}.theme_title`,
    description: `${TEXTS}.theme_description`,
    icon: "i-ph-circle-half",
    component: "DmsAppearanceTheme",
  });

  static scaleComponent = appearanceGroup({
    title: `${TEXTS}.scale_title`,
    description: `${TEXTS}.scale_description`,
    icon: "i-ph-text-aa",
    component: "DmsAppearanceScale",
  });

  static accessibilityComponent = appearanceGroup({
    title: `${TEXTS}.accessibility.title`,
    description: `${TEXTS}.accessibility.description`,
    icon: "i-ph-person-arms-spread",
    component: "DmsAppearanceAccessibility",
  });

  static sidebarComponent = appearanceGroup({
    title: `${TEXTS}.sidebar_title`,
    description: `${TEXTS}.sidebar_description`,
    icon: "i-ph-sidebar-simple",
    component: "DmsAppearanceSidebar",
  });

  static developerComponent = appearanceGroup({
    title: `${TEXTS}.developer_title`,
    description: `${TEXTS}.developer_description`,
    icon: "i-ph-brackets-curly",
    component: "DmsAppearanceDeveloper",
  });
}
