const walletLocks = new Map<string, Promise<unknown>>();

export const withWalletLock = <T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const prev = walletLocks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tracked = next.finally(() => {
    if (walletLocks.get(key) === tracked) walletLocks.delete(key);
  });
  walletLocks.set(key, tracked);
  return next;
};

export const withMultiWalletLock = <T>(
  keys: string[],
  fn: () => Promise<T>,
): Promise<T> => {
  const uniqueSorted = [...new Set(keys)].sort();
  return uniqueSorted.reduceRight<() => Promise<T>>(
    (acc, key) => () => withWalletLock(key, acc),
    fn,
  )();
};
