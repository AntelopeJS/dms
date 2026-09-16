export interface FooterLink {
  id: string;
  label: string;
  to: string;
  order: number;
}

const links = ref<FooterLink[]>([]);

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
