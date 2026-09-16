export interface AuthLink {
  id: string;
  page: string;
  label: string;
  to: string;
  order: number;
}

const links = ref<AuthLink[]>([]);

function compareByOrder(a: AuthLink, b: AuthLink): number {
  return a.order - b.order;
}

export function registerAuthLink(link: AuthLink): void {
  const existingIndex = links.value.findIndex((entry) => entry.id === link.id);

  if (existingIndex === -1) {
    links.value = [...links.value, link];
    return;
  }

  const next = [...links.value];
  next[existingIndex] = link;
  links.value = next;
}

export function useAuthLinks(page: string) {
  const sortedLinks = computed<AuthLink[]>(() =>
    links.value.filter((link) => link.page === page).sort(compareByOrder),
  );
  return { links: sortedLinks };
}
