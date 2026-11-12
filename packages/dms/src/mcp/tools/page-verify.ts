import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { z } from "zod";
import { DEFAULT_CLIENT_BASE_URL, getClientBaseUrl } from "../../config";
import { NAMED_VIEWPORTS } from "../page-verify/report";
import { defineTool, textResult } from "../tool";

const MAX_PAGES = 10;
const MAX_VIEWPORTS = 4;
const MIN_SIDE_PX = 240;
const MAX_SIDE_PX = 3_840;

const ViewportSchema = z.union([
  z.enum(["desktop", "mobile"]).transform((name) => NAMED_VIEWPORTS[name]),
  z.object({
    name: z.string().min(1).max(40),
    width: z.number().int().min(MIN_SIDE_PX).max(MAX_SIDE_PX),
    height: z.number().int().min(MIN_SIDE_PX).max(MAX_SIDE_PX),
  }),
]);

const PageVerifyInput = z.object({
  page: z
    .union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1).max(MAX_PAGES),
    ])
    .describe(
      "The page to open, or a list of them: its route as list_pages answers it (a concrete one for a route with `:params`, such as `/orders/42`), or its full id.",
    ),
  role: z
    .string()
    .optional()
    .describe(
      "The role to open the pages as, by name or id: a member holding only that role is signed in. `owner` (the default) signs the platform owner in.",
    ),
  viewports: z
    .array(ViewportSchema)
    .min(1)
    .max(MAX_VIEWPORTS)
    .optional()
    .describe(
      "Window sizes to render at: `desktop` (1440×900), `mobile` (390×844) or `{name, width, height}`. Default: desktop and mobile.",
    ),
  mockup: z
    .string()
    .optional()
    .describe(
      "A mockup under `mockups/<name>/` to compare each page with, block by block.",
    ),
  mockupPage: z
    .string()
    .optional()
    .describe(
      "The mockup page id to compare with. Default: the mockup's first page.",
    ),
  submit: z
    .boolean()
    .optional()
    .describe(
      "Let forms submit (required fields get sample values) and let any other write through. Default false: every write the page tries is held back.",
    ),
});

const verifyPageTool = defineTool({
  name: "page_verify",
  title: "Verify pages in a browser",
  description:
    "Opens each page in a headless Chromium signed in as a role and answers a JSON report: `ok`, then per page `failures` (one line per failed check: read these first), the render at each viewport (every block present and visible, a screenshot per block and of the page, sideways scrolling, overlapping blocks), the data state of each table, chart and KPI (`ok`, `empty`, `error`, `loading`, `needs_backend`), console errors and failed requests, interactions (links answer, tabs select, sort and search respond, forms open and validate on an empty submit) and, for every role of the workspace, whether the page opens as the role's grants say. With `mockup`, each mockup block is paired with a page block and both are screenshotted for a side-by-side look. Screenshots are written under `.antelope/page-verify/` in the project; their paths are project-relative. Writes are held back unless `submit` is true. The first call installs Chromium (about 330 MB, once, in Playwright's browser cache). Development only.",
  effect: "read",
  input: PageVerifyInput,
  async run(args) {
    const { verifyPages } = await import("../page-verify");
    const { projectPath } = await GetRuntimeInfo();
    try {
      const report = await verifyPages({
        pages: Array.isArray(args.page) ? args.page : [args.page],
        ...(args.role !== undefined && { role: args.role }),
        viewports: args.viewports ?? Object.values(NAMED_VIEWPORTS),
        ...(args.mockup !== undefined && {
          mockup: {
            name: args.mockup,
            ...(args.mockupPage !== undefined && { page: args.mockupPage }),
          },
        }),
        submit: args.submit ?? false,
        origin: (getClientBaseUrl() ?? DEFAULT_CLIENT_BASE_URL).replace(
          /\/+$/,
          "",
        ),
        projectPath,
      });
      return textResult(JSON.stringify(report), !report.ok);
    } catch (error) {
      return textResult(
        `page_verify could not run: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  },
});

export const PAGE_VERIFY_TOOLS = [verifyPageTool];
