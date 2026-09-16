import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";

@RegisterPage()
export class DemoModuleFormPage extends PageController(
  "contact",
  {
    displayName: "Contact Form",
    icon: "i-ph-envelope",
    module: "demo",
    order: 1,
    description: "A simple contact form to demonstrate forms inside a module",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Contact Us",
    description: "Send us a message and we'll get back to you",
    fields: [
      {
        id: "name",
        label: "Full Name",
        description: "Your full name",
        type: new DefaultDataTypes.StringType({
          placeholder: "Jane Doe",
          maxLength: 100,
        }),
      },
      {
        id: "email",
        label: "Email",
        description: "Your email address",
        type: new DefaultDataTypes.EmailType({
          placeholder: "jane@example.com",
        }),
      },
      {
        id: "subject",
        label: "Subject",
        description: "What is your message about?",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "General Question", value: "general" },
            { label: "Feedback", value: "feedback" },
            { label: "Bug Report", value: "bug" },
            { label: "Feature Request", value: "feature" },
          ],
          placeholder: "Select a subject...",
        }),
      },
      {
        id: "message",
        label: "Message",
        description: "Your message",
        type: new DefaultDataTypes.StringType({
          placeholder: "Write your message here...",
          maxLength: 1000,
          textarea: true,
          rows: 6,
        }),
      },
      {
        id: "subscribe",
        label: "Subscribe to newsletter",
        description: "Receive product news and updates",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
