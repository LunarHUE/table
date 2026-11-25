import { useId } from "#lunarhue/react";

/**
 * An id for a table's elements, kept for the life of the component. A
 * placeholder that runs `#lunarhue/react` end to end until the adapter lands.
 */
export function useTableId(): string {
  return useId();
}
