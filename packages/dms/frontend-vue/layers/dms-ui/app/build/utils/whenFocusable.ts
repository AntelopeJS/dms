/**
 * The first element of `root` matching `selector`, as soon as there is one:
 * a control resolved lazily renders its element only once its code loaded,
 * after the render that mounted it. `undefined` past `timeoutMs`, or once
 * `root` left the page.
 */
export function whenFocusable(
  root: HTMLElement,
  selector: string,
  timeoutMs: number,
): Promise<HTMLElement | undefined> {
  const found = root.querySelector<HTMLElement>(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const settle = (element: HTMLElement | undefined) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      if (!root.isConnected) {
        settle(undefined);
        return;
      }
      const element = root.querySelector<HTMLElement>(selector);
      if (element) settle(element);
    });
    const timer = setTimeout(() => settle(undefined), timeoutMs);
    observer.observe(root, { childList: true, subtree: true });
  });
}
