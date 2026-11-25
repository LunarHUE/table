// Counts live in the page, keyed by the counter's id, so a component that
// unmounts and mounts again keeps counting from where it was.
const counts = new Map<string, number>();

/**
 * Adds one to the count for `id` and returns the new count. Each app calls it
 * once per render of the component it counts, on the client only, and writes
 * the result into that component's counter element.
 */
export function countRender(id: string): number {
  const next = (counts.get(id) ?? 0) + 1;
  counts.set(id, next);
  return next;
}
