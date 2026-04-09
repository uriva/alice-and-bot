export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: (value: T) => void) => () => void;
};

export const createStore = <T>(initial: T): Store<T> => {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l(next));
    },
    subscribe: (listener: (v: T) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
