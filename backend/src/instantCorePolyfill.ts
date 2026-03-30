// deno-lint-ignore-file no-explicit-any
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { search: "" },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
  };
}

if (typeof (globalThis as any).indexedDB === "undefined") {
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {};
      setTimeout(() => {
        if (req.onsuccess) {
          req.onsuccess({
            target: {
              result: {
                objectStoreNames: { contains: () => true },
                transaction: () => ({
                  objectStore: () => ({
                    get: () => {
                      const r: any = {};
                      setTimeout(() => r.onsuccess?.(), 0);
                      return r;
                    },
                    put: () => {
                      const r: any = {};
                      setTimeout(() => r.onsuccess?.(), 0);
                      return r;
                    },
                    delete: () => {
                      const r: any = {};
                      setTimeout(() => r.onsuccess?.(), 0);
                      return r;
                    },
                    getAllKeys: () => {
                      const r: any = { result: [] };
                      setTimeout(() => r.onsuccess?.(), 0);
                      return r;
                    },
                  }),
                  abort: () => {},
                }),
                createObjectStore: () => {},
              },
            },
          });
        }
      }, 0);
      return req;
    },
  };
}

if (typeof navigator === "undefined" || !(navigator as any).onLine) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    writable: true,
  });
}
