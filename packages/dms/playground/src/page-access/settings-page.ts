import {
  PageController,
  RegisterPage,
  workspaceSettingsCategory,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";

// A project's own workspace settings page: no layout argument, so it inherits
// the SettingsLayout of the settings root and sits in the settings navigation.
@RegisterPage()
export class PlaygroundSettingsPage extends PageController("playground", {
  displayName: "Playground",
  icon: "i-ph-flask",
  category: workspaceSettingsCategory,
  order: 90,
  description:
    "Demonstrates: workspaceSettingsCategory. A project's page among the workspace settings, drawn by the inherited SettingsLayout.",
}) {
  static form = Form({
    title: "Playground settings",
    description:
      "Nothing is saved: this form only shows where such a page lands.",
    fields: [
      {
        id: "greeting",
        label: "Greeting",
        type: new DefaultDataTypes.StringType({ placeholder: "Hello!" }),
      },
      {
        id: "beta",
        label: "Show beta demos",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
