import {
  type ModuleStoreEntry,
  storeActions,
  toModuleStoreEntry,
} from "../../layers/dms-layout/app/build/utils/module-store-catalog";
import type {
  MissingInterface,
  StoreListingEntry,
} from "../../layers/dms-layout/app/types/module-store";
import en from "../../layers/dms-layout/i18n/locales/layout-en-GB.json";
import { isObject, isString } from "../../layers/dms-core/app/utils/type-check";

interface Messages {
  [key: string]: string | Messages;
}

export function lookup(messages: Messages, key: string) {
  return key
    .split(".")
    .reduce<
      string | Messages | undefined
    >((node, part) => (node && isObject(node) ? node[part] : undefined), messages);
}

export const resolve = (value: string): string => {
  if (!value.startsWith("$")) return value;
  const text = lookup(en, value.slice(1));
  return isString(text) ? text : value;
};

export function listingEntry(
  id: string,
  overrides: Partial<StoreListingEntry> = {},
): StoreListingEntry {
  return {
    id,
    package: `@antelopejs/dms-${id}`,
    icon: "i-ph-cube",
    category: "data",
    title: id[0].toUpperCase() + id.slice(1),
    description: `${id} description`,
    state: "available",
    updateAvailable: false,
    compatible: true,
    frontend: "none",
    missingInterfaces: [],
    dependents: [],
    ...overrides,
  };
}

export function storeEntry(
  id: string,
  overrides: Partial<ModuleStoreEntry> = {},
): ModuleStoreEntry {
  return {
    ...toModuleStoreEntry(listingEntry(id)),
    catalogCategory: "Data",
    ...overrides,
  };
}

export const catalog = [
  storeEntry("media", {
    catalogCategory: "Content",
    description: "Asset library",
  }),
  storeEntry("database", { state: "active", installedVersion: "0.1.2" }),
  storeEntry("lang", { title: "Translations", catalogCategory: "Content" }),
  storeEntry("ai", {
    catalogCategory: "AI",
    state: "disabled",
    installedVersion: "0.2.1",
  }),
];

export const actionKinds = (entry: StoreListingEntry) =>
  storeActions(entry).map((action) => action.kind);

export const REDIS: MissingInterface = {
  interfacePackage: "@antelopejs/interface-redis",
  candidates: [
    { name: "redis", package: "@antelopejs/redis" },
    { name: "valkey", package: "@antelopejs/valkey" },
  ],
};
export const QUEUE: MissingInterface = {
  interfacePackage: "@antelopejs/interface-queue",
  candidates: [],
};

export const FRONTEND_REQUIREMENT = {
  range: ">=0.7.0",
  running: "0.6.0",
  target: "0.7.2",
  command: "pnpm add @antelopejs/dms-frontend@0.7.2",
  breaks: [],
};

export function versionDetailsFixture() {
  const installed = [
    {
      id: "media",
      title: "Media",
      description: "",
      icon: "i-ph-image",
      hasAccess: true,
      landingSlug: "/modules/media",
    },
    {
      id: "api",
      title: "API",
      description: "",
      icon: "i-ph-plug",
      hasAccess: true,
      landingSlug: "/modules/api",
      version: "0.4.1",
      catalogCategory: "$api.category",
    },
  ];
  const store = [
    listingEntry("media", {
      category: "content",
      installedVersion: "0.5.0",
      source: "npm",
    }),
    listingEntry("api", { installedVersion: "0.9.0", source: "github" }),
  ];
  return { installed, store };
}

export function categoryInstalledFixture() {
  return [
    {
      id: "mailing",
      title: "Mailing",
      description: "",
      icon: "i-ph-envelope-simple",
      hasAccess: true,
      landingSlug: "/modules/mailing",
      catalogCategory: "$dms_mailing.catalog_category",
    },
    {
      id: "media",
      title: "Media",
      description: "",
      icon: "i-ph-image",
      hasAccess: true,
      landingSlug: "/modules/media",
    },
  ];
}
