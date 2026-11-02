import { z } from "zod";
import type { HtmlTemplateRef } from "@antelopejs/interface-dms/html-render";
import { getHtmlRenderConfig } from "../../config";
import { SERVICE_JWT_HEADER } from "./constants";
import { generateServiceToken } from "./service-jwt";

export * from "./service-jwt";
export * from "./template-registry";

const RenderResponseSchema = z.object({ html: z.string() });

const RenderErrorSchema = z
  .object({
    message: z.string().optional().catch(undefined),
    error: z.string().optional().catch(undefined),
    statusMessage: z.string().optional().catch(undefined),
  })
  .catch({});

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
    const errorData = RenderErrorSchema.parse(
      await response.json().catch(() => ({})),
    );
    const errorMessage =
      errorData.message ||
      errorData.error ||
      errorData.statusMessage ||
      `HTTP ${response.status}`;
    throw new Error(`Failed to render HTML template: ${errorMessage}`);
  }

  const result = RenderResponseSchema.safeParse(await response.json());
  if (!result.success) {
    throw new Error(
      "Failed to render HTML template: the render service answered no html",
    );
  }
  return result.data.html;
}
