import type { DmsServerEvent } from "#dms/server";
import { privateSecret } from "../../../server/private-options";
import { validRenderToken } from "./render-token";

const SERVICE_TOKEN_HEADER = "x-dms-service-token";

interface LocaleMessagesInput {
  locale?: unknown;
}

function failure(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

/**
 * `POST /api/html/messages`: the application's merged texts of a language and
 * of English, for the DMS backend (`GetLocaleMessages`), which authenticates
 * like a render, with a single-use service token.
 */
export async function readLocaleMessages(
  event: DmsServerEvent,
): Promise<Response> {
  const secret = privateSecret(
    event,
    "htmlRender",
    "serviceSecret",
    "DMS_HTML_RENDER_SECRET",
  );
  if (
    !validRenderToken(event.request.headers.get(SERVICE_TOKEN_HEADER), secret)
  )
    return failure(401, "Invalid service token");
  const { locale } = await event.readJson<LocaleMessagesInput>();
  if (typeof locale !== "string" || locale.trim() === "")
    return failure(400, "Invalid request body");
  return Response.json(await event.localeMessages(locale));
}
