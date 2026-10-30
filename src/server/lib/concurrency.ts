/**
 * Runs `fn` over `items` with at most `limit` calls in flight. Results keep
 * input order. `shouldStop` is checked before each new item starts, so a caller
 * can stop early (e.g. the worker lost its lease) without killing calls already running.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldStop: () => boolean = () => false,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(runners);
  return results;
}
