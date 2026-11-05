/**
 * @typedef {import("playwright-core").Page} Page
 * @typedef {import("../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../packages/dms/bin/control/journey.mjs").Check} Check
 */

/** The step between two toasts of a collapsed stack (Nuxt UI's `--gap`), times the toasts it keeps (`max`). */
const COLLAPSED_LIMIT_PX = 16 * 5;
/** How long the stack takes to fold back once the pointer leaves it (Nuxt UI's 200ms transition, with slack). */
const COLLAPSE_MS = 300;

/**
 * Records every toast's box on each animation frame, and defines
 * `window.__dmsToastBurst(count, title)`, which appends warning toasts with a
 * Retry action to Nuxt UI's toast list, one per tick, without `useToast()`'s
 * merging of duplicate ids. Retry adds one more, as a refused save that is
 * retried and refused again.
 */
const PROBE = `(() => {
  const host = [...document.querySelectorAll("body *")].find((element) => "__vue_app__" in element);
  const provides = host.__vue_app__._context.provides;
  const runtime = Object.getOwnPropertySymbols(provides)
    .map((key) => provides[key])
    .find((value) => value?.sharedState instanceof Map);
  const toasts = runtime.sharedState.get("nuxt-ui:toasts");
  const frames = [];
  let serial = 0;
  const burst = async (count, title) => {
    for (let index = 0; index < count; index += 1) {
      serial += 1;
      toasts.value = [
        ...toasts.value,
        {
          id: "burst-" + serial,
          open: true,
          title,
          color: "warning",
          icon: "i-ph-warning",
          duration: 5000,
          progress: true,
          actions: [{ label: "Retry", onClick: () => setTimeout(() => burst(1, title), 120) }],
        },
      ].slice(-5);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const sample = () => {
    const viewport = document.querySelector('[data-slot="viewport"]');
    frames.push({
      at: performance.now(),
      expanded: viewport?.dataset.expanded,
      anchor: viewport?.getBoundingClientRect().bottom,
      toasts: [...(viewport?.querySelectorAll(':scope > [data-slot="base"]') ?? [])].map((element) => ({
        state: element.dataset.state,
        front: element.dataset.front,
        top: element.getBoundingClientRect().top,
        height: element.offsetHeight,
      })),
    });
    window.__dmsToastFrame = requestAnimationFrame(sample);
  };
  window.__dmsToastBurst = burst;
  window.__dmsToastFrames = frames;
  window.__dmsToastFrame = requestAnimationFrame(sample);
})()`;

/**
 * Stops the recording and stores in `window.__dmsToastReport` how far any
 * toast, open or closing, rose above its place at the bottom of the stack while
 * the stack was collapsed and done folding back, and in how many such frames a
 * toast behind the front one was closing.
 */
const REPORT = `(() => {
  cancelAnimationFrame(window.__dmsToastFrame);
  let rise = 0;
  let closingFrames = 0;
  let expandedAt = -Infinity;
  for (const frame of window.__dmsToastFrames) {
    if (frame.expanded === "true") expandedAt = frame.at;
    if (frame.at - expandedAt < ${COLLAPSE_MS}) continue;
    if (frame.anchor === undefined) continue;
    if (frame.toasts.some((toast) => toast.state === "closed" && toast.front !== "true")) closingFrames += 1;
    for (const toast of frame.toasts) rise = Math.max(rise, frame.anchor - toast.height - toast.top);
  }
  window.__dmsToastReport = { rise: Math.round(rise), closingFrames };
})()`;

/**
 * Starts recording the toaster of a signed-in dashboard.
 *
 * @param {Page} page The page
 * @returns {Promise<void>}
 */
export async function recordToasts(page) {
  await page.evaluate(PROBE);
}

/**
 * Adds `count` warning toasts with Retry, one per tick, as a burst of refused saves.
 *
 * @param {Page} page The page, recording
 * @param {number} count How many toasts
 * @param {string} title Their title
 * @returns {Promise<void>}
 */
export async function burstToasts(page, count, title) {
  await page.evaluate(`window.__dmsToastBurst(${count}, ${JSON.stringify(title)})`);
}

/**
 * Stops the recording and checks that the collapsed stack held together: some
 * toast closed behind the front one, and none rose above the bottom of the
 * stack by more than the stack's own depth.
 *
 * @param {Ctx} ctx The journey
 * @param {Page} page The page, recording
 * @returns {Promise<Check[]>} The checks
 */
export async function collapsedStackChecks(ctx, page) {
  await page.evaluate(REPORT);
  return [
    ctx.holds(
      "toasts closed behind the front toast",
      await page.evaluate("window.__dmsToastReport.closingFrames > 0"),
      await page.evaluate("window.__dmsToastReport.closingFrames + ' frames'"),
    ),
    ctx.holds(
      `no toast rises more than ${COLLAPSED_LIMIT_PX}px above the bottom of the stack`,
      await page.evaluate(`window.__dmsToastReport.rise <= ${COLLAPSED_LIMIT_PX}`),
      await page.evaluate("'highest rise ' + window.__dmsToastReport.rise + 'px'"),
    ),
  ];
}
