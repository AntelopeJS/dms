import type { DataBlock, PageReport, ViewportRender } from "./report";

function renderFailures(render: ViewportRender): string[] {
  const at = `${render.viewport}:`;
  const blocks = render.blocks.flatMap((block) => {
    if (!block.present)
      return [`${at} block ${block.path} (${block.component}) is missing`];
    if (!block.visible && block.drewNothing !== true)
      return [
        `${at} block ${block.path} (${block.component}) reaches outside the page width`,
      ];
    return [];
  });
  const { layout } = render;
  return [
    ...blocks,
    ...(layout.horizontalOverflow ? [`${at} the page scrolls sideways`] : []),
    ...layout.overlappingBlocks.map(
      ([a, b]) => `${at} blocks ${a} and ${b} overlap`,
    ),
  ];
}

/**
 * A line per block whose data did not load, its source named when its
 * options give one. A block inside one that failed is left out: it fails
 * because its parent did.
 */
function dataFailures(data: readonly DataBlock[]): string[] {
  const failed = data.filter((block) => block.state !== "ok");
  return failed
    .filter(
      (block) =>
        !failed.some(
          (outer) =>
            outer.viewport === block.viewport &&
            outer.path !== "" &&
            block.path.startsWith(`${outer.path}.`),
        ),
    )
    .map(
      (block) =>
        `data: ${block.type || "block"} at ${block.path || "?"} is ${block.state}${block.source === undefined ? "" : ` (reads ${block.source})`}`,
    );
}

function unique(lines: string[]): string[] {
  return [...new Set(lines)];
}

/** One line per failed check of a page, in the order the report lists the checks. */
export function listFailures(
  report: Omit<PageReport, "ok" | "failures">,
): string[] {
  const mockup = report.render.mockup;
  return unique([
    ...report.render.viewports.flatMap(renderFailures),
    ...(mockup?.unavailable ? [`mockup: ${mockup.unavailable}`] : []),
    ...(mockup?.blocks ?? [])
      .filter((block) => block.status === "missing")
      .map(
        (block) =>
          `mockup: block ${block.mockupPath} (${block.type}) has no counterpart on the page`,
      ),
    ...dataFailures(report.data),
    ...report.errors.console.map((error) => `console: ${error.text}`),
    ...report.errors.failedRequests.map(
      (request) =>
        `request: ${request.method} ${request.url} answered ${request.status}`,
    ),
    ...report.interactions
      .filter((interaction) => !interaction.ok)
      .map(
        (interaction) =>
          `${interaction.kind}: ${interaction.target}: ${interaction.detail}`,
      ),
    ...report.permissions
      .filter((access) => !access.ok)
      .map(
        (access) =>
          `permissions: role ${access.role} should be ${access.expected} but the page ${access.observed}`,
      ),
  ]);
}
