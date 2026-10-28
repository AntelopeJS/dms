import type { HtmlTemplateRef } from "@antelopejs/interface-dms/html-render";
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
    const errorData: RenderErrorResponse = await response
      .json()
      .catch(() => ({}));
    const errorMessage =
      errorData.message ||
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The render service uses error for both boolean failure flags and messages; retain the existing wire-format distinction.
      (typeof errorData.error === "string" ? errorData.error : null) ||
      errorData.statusMessage ||
      `HTTP ${response.status}`;
    throw new Error(`Failed to render HTML template: ${errorMessage}`);
  }

  const result: RenderResponse = await response.json();
  return result.html;
}
