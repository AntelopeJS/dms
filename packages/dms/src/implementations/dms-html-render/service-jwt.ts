import { randomUUID } from "node:crypto";
import { sign } from "jsonwebtoken";
import { getHtmlRenderConfig } from "../../config";
import { HTML_RENDER_NAMESPACE } from "./constants";

export function generateServiceToken(): string {
  const config = getHtmlRenderConfig();
  const expiresInSeconds = config.serviceTokenLifetime;

  return sign(
    { namespace: HTML_RENDER_NAMESPACE, purpose: "html-render" },
    config.serviceSecret,
    {
      audience: "dms-frontend",
      expiresIn: expiresInSeconds,
      jwtid: randomUUID(),
    },
  );
}
