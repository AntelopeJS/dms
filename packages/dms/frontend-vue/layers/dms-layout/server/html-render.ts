import type { DmsServerEvent } from "#dms/server";
import { privateSecret } from "../../../server/private-options";
import { validRenderToken } from "./render-token";
import { isObject, isString } from "../../dms-core/app/utils/type-check";

const SERVICE_TOKEN_HEADER = "x-dms-service-token";

interface RenderInput {
  templateName?: unknown;
  props?: unknown;
}

function failure(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

function renderSecret(event: DmsServerEvent): string | undefined {
  return privateSecret(
    event,
    "htmlRender",
    "serviceSecret",
    "DMS_HTML_RENDER_SECRET",
  );
}

/**
 * `POST /api/html/render`: renders one of the application's email templates
 * for the DMS backend (`GenerateHtml`), which authenticates with a
 * single-use service token rather than a browser session.
 */
export async function renderHtml(event: DmsServerEvent): Promise<Response> {
  if (
    !validRenderToken(
      event.request.headers.get(SERVICE_TOKEN_HEADER),
      renderSecret(event),
    )
  )
    return failure(401, "Invalid service token");
  const input = await event.readJson<RenderInput>();
  if (
    !isString(input.templateName) ||
    input.templateName.trim() === "" ||
    !isObject(input.props)
  )
    return failure(400, "Invalid request body");
  try {
    const html = await event.renderEmail(
      input.templateName,
      input.props ?? {},
      { locale: event.request.headers.get("x-content-language") ?? undefined },
    );
    return Response.json({ html });
  } catch {
    return failure(
      404,
      `Template "${input.templateName}" not found or render failed`,
    );
  }
}
