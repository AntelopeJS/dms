import { Controller, JSONBody, Post } from "@antelopejs/interface-api";

export const DEMO_CONTACT_API = "/api/demo-module/contact";

interface ContactMessage {
  name?: string;
  subject?: string;
}

interface ContactReceipt {
  success: true;
  receivedFrom: string;
}

/** Takes the Contact Form's message; the demo keeps nothing. */
export class DemoModuleContactApiController extends Controller(
  DEMO_CONTACT_API,
) {
  @Post("")
  send(@JSONBody() body: ContactMessage): ContactReceipt {
    return { success: true, receivedFrom: body.name ?? "" };
  }
}
