// A React Server Component graph passes client components as proxies that
// throw on any property read. Column and table helpers must only copy them.

/** A stand-in for a client reference: a proxy whose every trap throws, and a count of how often one ran. */
export function clientReference() {
  const reads: string[] = [];
  const fail = (trap: string) => () => {
    reads.push(trap);
    throw new Error(`Read the client reference (${trap}).`);
  };
  const traps: Required<ProxyHandler<() => unknown>> = {
    apply: fail("apply"),
    construct: fail("construct"),
    defineProperty: fail("defineProperty"),
    deleteProperty: fail("deleteProperty"),
    get: fail("get"),
    getOwnPropertyDescriptor: fail("getOwnPropertyDescriptor"),
    getPrototypeOf: fail("getPrototypeOf"),
    has: fail("has"),
    isExtensible: fail("isExtensible"),
    ownKeys: fail("ownKeys"),
    preventExtensions: fail("preventExtensions"),
    set: fail("set"),
    setPrototypeOf: fail("setPrototypeOf"),
  };
  return { reference: new Proxy(() => undefined, traps), reads };
}
