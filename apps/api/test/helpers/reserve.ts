/**
 * AUC-003 — asserts the reserve is nowhere in a response.
 *
 * The obvious version, `JSON.stringify(body).not.toContain('4500')`, is wrong
 * often enough to matter: a uuid like `f9ff32a4-77ea-4500-a096-…` contains
 * "4500" without disclosing anything, and which uuids a run generates is
 * random. That made the suite fail perhaps one run in ten for a reason that
 * had nothing to do with the reserve.
 *
 * This walks the response instead and compares whole values, so a reserve
 * hidden in the middle of an identifier is not mistaken for a leak — and a
 * reserve that genuinely appears as a value is still caught, wherever it is
 * nested.
 */
export function expectNoReserve(body: unknown, reserve: number | string): void {
  const needle = String(reserve);
  const trail: string[] = [];

  const walk = (node: unknown, path: string): void => {
    if (node === null || node === undefined) return;

    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        // the field itself must never appear, whatever it holds
        if (key === 'reservePrice') trail.push(`${path}.${key}`);
        walk(value, `${path}.${key}`);
      }
      return;
    }

    if (typeof node === 'number' || typeof node === 'string') {
      // a whole value, not a fragment of a longer identifier
      if (String(node) === needle) trail.push(path);
    }
  };

  walk(body, 'body');

  expect(trail).toEqual([]);
}
