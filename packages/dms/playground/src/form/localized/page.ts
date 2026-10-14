import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

@RegisterPage()
export class PageFormLocalized extends PageController(
  "form-localized",
  {
    displayName: "Localized fields",
    icon: "i-ph-translate",
    category: pageCategory,
    order: 30,
    description:
      "Fields holding one value per language. Fill both languages and save: the record stores { en, fr } for each localized field.",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Localized fields",
    description:
      "Title and description are localized; slug and published are not.",
    fetchUrl: "/api/form-localized/get",
    submitUrl: "/api/form-localized/save",
    fields: [
      {
        id: "title",
        label: "Title",
        description: "Enter the title (supports multiple languages)",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter title...",
          maxLength: 200,
        }),
        localized: true,
      },
      {
        id: "description",
        label: "Description",
        description: "Enter a description (supports multiple languages)",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter description...",
        }),
        localized: true,
      },
      {
        id: "slug",
        label: "Slug",
        description: "URL-friendly identifier (not localized)",
        type: new DefaultDataTypes.StringType({
          placeholder: "my-page-slug",
        }),
      },
      {
        id: "published",
        label: "Published",
        description: "Is this content published?",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
