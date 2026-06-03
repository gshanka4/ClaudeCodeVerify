/** Conditional className joiner. Replace with `clsx` + `tailwind-merge` if/when
 * class conflict resolution is needed. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
