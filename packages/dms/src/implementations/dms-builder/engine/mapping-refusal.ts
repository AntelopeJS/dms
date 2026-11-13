/** A mapped relation refused, with the reason the caller is told. */
export class MappingRefusal extends Error {}

export function refuse(message: string): never {
  throw new MappingRefusal(message);
}
