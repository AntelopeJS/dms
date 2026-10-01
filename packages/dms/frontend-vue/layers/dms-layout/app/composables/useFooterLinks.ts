export interface FooterLink {
  id: string;
  label: string;
  to: string;
  order: number;
}

/**
 * The Antelope links every footer starts with. A layer replaces one by
 * registering an entry under the same id.
 */
const DEFAULT_FOOTER_LINKS: FooterLink[] = [
  {
    id: "dms:documentation",
    label: "empty_layout.footer.documentation",
    to: "https://dms.antelopejs.com/docs/",
    order: 10,
  },
  {
    id: "dms:website",
    label: "empty_layout.footer.website",
    to: "https://dms.antelopejs.com/",
    order: 20,
  },
];

const links = ref<FooterLink[]>([...DEFAULT_FOOTER_LINKS]);

function compareByOrder(a: FooterLink, b: FooterLink): number {
  return a.order - b.order;
}

export function registerFooterLink(link: FooterLink): void {
  const existingIndex = links.value.findIndex((entry) => entry.id === link.id);

  if (existingIndex === -1) {
    links.value = [...links.value, link];
    return;
  }

  const next = [...links.value];
  next[existingIndex] = link;
  links.value = next;
}

export function useFooterLinks() {
  const sortedLinks = computed<FooterLink[]>(() =>
    [...links.value].sort(compareByOrder),
  );
  return { links: sortedLinks };
}
