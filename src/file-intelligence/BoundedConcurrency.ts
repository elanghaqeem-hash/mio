export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('Concurrency must be an integer between 1 and 16');
  }
  const results = new Array<R>(items.length);
  let cursor = 0;

  const run = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      if (index >= items.length) return;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}
