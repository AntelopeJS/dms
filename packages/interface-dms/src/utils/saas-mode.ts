import { ListModules } from "@antelopejs/interface-core/modules";

const SAAS_MODULE_ID = "@antelopejs/dms-saas";

let cachedSaasMode: boolean | null = null;

export async function detectSaasMode(): Promise<void> {
  const modules = await ListModules();
  cachedSaasMode = modules.includes(SAAS_MODULE_ID);
}

export function isSaasMode(): boolean {
  if (cachedSaasMode === null) {
    throw new Error(
      "isSaasMode() called before detectSaasMode() — ensure DMS start() has run.",
    );
  }
  return cachedSaasMode;
}
