import type {
  HtmlTemplateRef,
  LocaleMessages,
} from "@antelopejs/interface-dms/html-render";
import { getHtmlRenderConfig } from "../../config";
import { SERVICE_JWT_HEADER } from "./constants";
import { generateServiceToken } from "./service-jwt";

export * from "./service-jwt";
export * from "./template-registry";

interface RenderResponse {
  html: string;
}

interface RenderErrorResponse {
  message?: string;
  error?: string | boolean;
  statusMessage?: string;
}

/** The frontend route serving the texts, next to the render route. */
const LOCALE_MESSAGES_PATH = "messages";

async function failureMessage(response: Response): Promise<string> {
  const errorData = (await response
    .json()
    .catch(() => ({}))) as RenderErrorResponse;
  return (
    errorData.message ||
    (typeof errorData.error === "string" ? errorData.error : null) ||
    errorData.statusMessage ||
    `HTTP ${response.status}`
  );
}

export async function GetLocaleMessages(
  language: string,
): Promise<LocaleMessages> {
  const config = getHtmlRenderConfig();
  const response = await fetch(
    new URL(LOCALE_MESSAGES_PATH, config.renderEndpoint),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SERVICE_JWT_HEADER]: generateServiceToken(),
      },
      body: JSON.stringify({ locale: language }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to read the locale messages: ${await failureMessage(response)}`,
    );
  }
  return (await response.json()) as LocaleMessages;
}

export async function GenerateHtml<TData = unknown>(
  template: HtmlTemplateRef<TData>,
  props: TData,
  language?: string,
): Promise<string> {
  const config = getHtmlRenderConfig();
  const serviceToken = generateServiceToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    [SERVICE_JWT_HEADER]: serviceToken,
  });
  if (language) headers.set("x-content-language", language);

  const response = await fetch(config.renderEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      templateName: template.name,
      props,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to render HTML template: ${await failureMessage(response)}`,
    );
  }

  const result = (await response.json()) as RenderResponse;
  return result.html;
}
