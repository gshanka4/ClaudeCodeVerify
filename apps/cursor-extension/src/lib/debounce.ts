/** Debounce rapid saves to avoid request storms (P7-EC-05). */
export function createDebouncer(delayMs: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key: string, fn: () => void): void {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn();
        }, delayMs),
      );
    },
    cancel(key: string): void {
      const t = timers.get(key);
      if (t) {
        clearTimeout(t);
        timers.delete(key);
      }
    },
    pendingCount(): number {
      return timers.size;
    },
    clear(): void {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
