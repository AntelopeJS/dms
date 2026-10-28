import { Controller, Get } from "@antelopejs/interface-api";
import type {
  CodeBlockResponse,
  KeyValueListItem,
} from "@antelopejs/interface-dms/base";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  GenerateHtml,
  GetAllHtmlTemplates,
  GetHtmlTemplate,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";

export const EMAILS_DEMO_API = "/api/playground/email";
const PREVIEW_LANGUAGE = "fr";
const DIGEST_COUNT = 3;

interface DigestProps {
  userName: string;
  count: number;
  /** The template picks its texts and the document `lang` from it. */
  locale: string;
}

/** Rendered from playground/frontend-vue/app/emails/EmailPlaygroundDigest.vue. */
export const PlaygroundDigestTemplate = RegisterHtmlTemplate<DigestProps>(
  "EmailPlaygroundDigest",
);

interface ItemsResponse {
  items: KeyValueListItem[];
}

function renderError(error: PromiseRejectedResult["reason"]): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<!-- GenerateHtml failed: ${message} -->\n<!-- The email bundle is built by the frontend server: start it with pnpm --dir packages/dms frontend:dev. -->`;
}

export class EmailsDemoController extends Controller(EMAILS_DEMO_API) {
  @Get("preview")
  async preview(@AuthUser() user: User): Promise<CodeBlockResponse> {
    try {
      const html = await GenerateHtml(
        PlaygroundDigestTemplate,
        { userName: user.name, count: DIGEST_COUNT, locale: PREVIEW_LANGUAGE },
        PREVIEW_LANGUAGE,
      );
      return { code: html, language: "html" };
    } catch (error) {
      return { code: renderError(error), language: "html" };
    }
  }

  @Get("templates")
  async templates(@AuthUser() _user: User): Promise<ItemsResponse> {
    const templates = await GetAllHtmlTemplates();
    const own = await GetHtmlTemplate(PlaygroundDigestTemplate.name);
    return {
      items: Object.keys(templates)
        .sort()
        .map((name) => ({
          label: name,
          value: name === own?.name ? "Playground" : "DMS",
          type: "status",
          tone: name === own?.name ? "primary" : "neutral",
        })),
    };
  }
}
