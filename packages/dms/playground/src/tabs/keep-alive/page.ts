import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

const profileForm = Form({
  title: "Profile",
  description: "Type a value, switch tabs and come back: it is still here",
  fields: [
    {
      id: "fullName",
      label: "Full Name",
      type: new DefaultDataTypes.StringType({ placeholder: "Jane Doe" }),
    },
    {
      id: "email",
      label: "Email",
      type: new DefaultDataTypes.EmailType({
        placeholder: "jane.doe@example.com",
      }),
    },
  ],
});

const notesForm = Form({
  title: "Notes",
  description: "Draft text is kept while the tab is hidden",
  fields: [
    {
      id: "notes",
      label: "Notes",
      type: new DefaultDataTypes.StringType({
        placeholder: "Write a few lines...",
        textarea: true,
      }),
    },
  ],
});

const preferencesForm = Form({
  title: "Preferences",
  description: "Toggles keep their state across tab switches",
  fields: [
    {
      id: "newsletter",
      label: "Subscribe to the newsletter",
      type: new DefaultDataTypes.BooleanType(),
    },
    {
      id: "theme",
      label: "Theme",
      type: new DefaultDataTypes.SelectType({
        items: [
          { label: "Light", value: "light" },
          { label: "Dark", value: "dark" },
          { label: "System", value: "system" },
        ],
      }),
    },
  ],
});

@RegisterPage()
export class PageTabsKeepAlive extends PageController("tabs-keep-alive", {
  displayName: "Keep Alive Tabs",
  icon: "i-ph-memory",
  category: pageCategory,
  order: 10,
  description:
    "Tabs that keep their forms mounted: values typed in one tab survive switching",
}) {
  static tabsKeepAlive = Tab({
    unmountOnHide: false,
    items: [
      {
        label: "Profile",
        icon: "i-ph-user",
        slot: "persistent1",
      },
      {
        label: "Notes",
        icon: "i-ph-note-pencil",
        slot: "persistent2",
      },
      {
        label: "Preferences",
        icon: "i-ph-sliders",
        slot: "persistent3",
      },
    ],
    color: Color.primary,
    size: Size.medium,
  })
    .child("profileForm", profileForm, { slot: "persistent1" })
    .child("notesForm", notesForm, { slot: "persistent2" })
    .child("preferencesForm", preferencesForm, { slot: "persistent3" });
}
