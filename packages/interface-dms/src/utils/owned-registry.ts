import { EventProxy } from "@antelopejs/interface-core";

type EntryVisitor<V> = (value: V, entry: RegistryEntry<V>) => void;

type RegistryEntry<V> = (visit: EntryVisitor<V>) => void;

type EntryMatcher<V> = (value: V) => boolean;

/**
 * Registrations the interface package holds for the modules that make them,
 * each released with the module generation that made it.
 *
 * The package is evaluated once per process and outlives every generation of
 * every module. A plain collection here keeps what a reloaded module
 * registered: its next generation registers again beside it, and the leftover
 * still runs -- inside a destroyed context, where it throws
 * `ModuleContextInvalidatedError`, or twice when it holds none.
 *
 * Each value is kept by an `EventProxy` handler, registered in the caller's
 * context. The runtime records that context's owner, and when the owner is
 * destroyed it drops the handler along with everything else that generation
 * registered. A `ModuleDestroyed` listener of our own could not do it: the
 * runtime's listener runs first and invalidates the owner, so the destroyed
 * context can no longer be read by the time ours would run.
 */
export class OwnedRegistry<V> {
  private readonly entries = new EventProxy<RegistryEntry<V>>();

  /** Keeps `value` until its registering module generation is destroyed. */
  public add(value: V): void {
    const entry: RegistryEntry<V> = (visit) => visit(value, entry);
    this.entries.register(entry);
  }

  /**
   * Drops the oldest live registration `matches` accepts, for a module that
   * lets go of one while staying loaded.
   */
  public remove(matches: EntryMatcher<V>): void {
    const entry = this.findEntry(matches);
    if (entry) this.entries.unregister(entry);
  }

  /** Whether a live registration satisfies `matches`. */
  public has(matches: EntryMatcher<V>): boolean {
    return this.findEntry(matches) !== undefined;
  }

  /** The live registrations, oldest first. */
  public values(): V[] {
    const values: V[] = [];
    this.entries.emit((value) => values.push(value));
    return values;
  }

  private findEntry(matches: EntryMatcher<V>): RegistryEntry<V> | undefined {
    let found: RegistryEntry<V> | undefined;
    this.entries.emit((value, entry) => {
      if (!found && matches(value)) found = entry;
    });
    return found;
  }
}
