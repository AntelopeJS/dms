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
    const errorData = (await response.json()) as RenderErrorResponse;
    const errorMessage =
      (typeof errorData.error === "string" ? errorData.error : null) ||
      errorData.statusMessage ||
      `HTTP ${response.status}`;
    throw new Error(`Failed to render HTML template: ${errorMessage}`);
  }

  const result = (await response.json()) as RenderResponse;
  return result.html;
}
