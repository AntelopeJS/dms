import { readdir } from "node:fs/promises";
import path from "node:path";
import { Controller, Get } from "@antelopejs/interface-api";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-registry";
import { GetRegisteredPageIds } from "@antelopejs/interface-dms/page";

// Page ids are the dotted path of their categories. The DMS registers its own
// pages (settings, sign-in, onboarding, the module home); a TableView in page
// mode generates a view, a new and an edit page for its records.
const BUILT_IN_PAGE_PATTERN =
  /^(?:settings(?:\.|$)|modules$|pages\.(?:auth|onboarding)\b)/;
const GENERATED_PAGE_PATTERN = /\.(?:view|new|edit)$/;
const PLAYGROUND_COMPONENTS_DIR = path.join(
  __dirname,
  "../../frontend-vue/app/components",
);
const VUE_EXTENSION = ".vue";

interface WelcomeStat {
  icon: string;
  eyebrow: string;
  value: number;
  detail: string;
}

interface PageCounts {
  declared: number;
  generated: number;
  builtIn: number;
}

function countPages(pageIds: string[]): PageCounts {
  const own = pageIds.filter((id) => !BUILT_IN_PAGE_PATTERN.test(id));
  const generated = own.filter((id) => GENERATED_PAGE_PATTERN.test(id)).length;
  return {
    declared: own.length - generated,
    generated,
    builtIn: pageIds.length - own.length,
  };
}

async function countVueFiles(directory: string): Promise<number> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(VUE_EXTENSION),
  ).length;
}

async function welcomeStats(): Promise<WelcomeStat[]> {
  const pages = countPages(GetRegisteredPageIds());
  return [
    {
      icon: "i-ph-files",
      eyebrow: "Demo pages",
      value: pages.declared,
      detail: `Plus ${pages.builtIn} built-in`,
    },
    {
      icon: "i-ph-magic-wand",
      eyebrow: "Generated record pages",
      value: pages.generated,
      detail: "View, new and edit",
    },
    {
      icon: "i-ph-cube",
      eyebrow: "Block types",
      value: ListBlockTypes().length,
      detail: "From the backend",
    },
    {
      icon: "i-ph-file-vue",
      eyebrow: "Custom Vue components",
      value: await countVueFiles(PLAYGROUND_COMPONENTS_DIR),
      detail: "In the playground",
    },
  ];
}

/** Live figures of the welcome page's stat strip, counted at request time. */
export class PlaygroundWelcomeApiController extends Controller(
  "/api/playground-welcome",
) {
  @Get("stats")
  async getStats() {
    return { items: await welcomeStats() };
  }
}
