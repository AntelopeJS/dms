import type { PageReport, ViewportRender } from "./report";

function renderFailures(render: ViewportRender): string[] {
  const at = `${render.viewport}:`;
  const blocks = render.blocks.flatMap((block) => {
    if (!block.present)
      return [`${at} block ${block.path} (${block.component}) is missing`];
    if (!block.visible)
      return [
        `${at} block ${block.path} (${block.component}) is not drawn inside the page width`,
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
    ...report.data
      .filter((block) => block.state !== "ok")
      .map(
        (block) =>
          `data: ${block.type || "block"} at ${block.path || "?"} is ${block.state}`,
      ),
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
