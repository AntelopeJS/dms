interface ApexGlobal {
  Apex?: {
    chart?: { locales?: unknown[]; defaultLocale?: string };
  };
}

const APEX_LOCALE_LOADERS: Record<string, () => Promise<unknown>> = {
  en: () => import("apexcharts/dist/locales/en.json"),
  fr: () => import("apexcharts/dist/locales/fr.json"),
};

const APEX_LOCALE_FALLBACK = "en";
const loadedLocales = new Set<string>();

function resolveLocaleKey(locale: string): string {
  const short = locale.split("-")[0]?.toLowerCase();
  if (short && APEX_LOCALE_LOADERS[short]) return short;
  return APEX_LOCALE_FALLBACK;
}

export async function ensureApexLocale(locale: string): Promise<void> {
  if (typeof window === "undefined") return;
  const key = resolveLocaleKey(locale);
  const apexGlobal = window as unknown as ApexGlobal;
  apexGlobal.Apex = apexGlobal.Apex || {};
  apexGlobal.Apex.chart = apexGlobal.Apex.chart || {};

  if (!loadedLocales.has(key)) {
    try {
      const mod = await APEX_LOCALE_LOADERS[key]!();
      const locales = apexGlobal.Apex.chart.locales || [];
      const localeData = (mod as { default?: unknown }).default ?? mod;
      apexGlobal.Apex.chart.locales = [...locales, localeData];
      loadedLocales.add(key);
    } catch (err) {
      console.warn(`[dms] Failed to load ApexCharts locale "${key}":`, err);
      return;
    }
  }

  apexGlobal.Apex.chart.defaultLocale = key;
}
