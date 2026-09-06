// Minimal in-memory stand-in for the firebase/firestore functions boardService
// uses, so the migration's read/write choreography can be tested offline.
export const db = { name: 'fake' };

const store = new Map();          // path -> document data
export const commits = [];        // one entry per committed batch

export const reset = () => { store.clear(); commits.length = 0; };
export const seed = (path, data) => store.set(path, { ...data });
export const dump = () => Object.fromEntries([...store.entries()].map(([k, v]) => [k, { ...v }]));

export const serverTimestamp = () => ({ __serverTimestamp: true });
export const deleteField = () => ({ __deleteField: true });
export const doc = (_db, ...segments) => ({ path: segments.join('/') });
export const collection = (_db, ...segments) => ({ path: segments.join('/') });
export const onSnapshot = () => () => {};
export const setDoc = async (ref, data) => { store.set(ref.path, { ...data }); };

/* Query constraints: enough of the shape for subscribeToUserGames/getUserGames. */
export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ kind: 'orderBy', field, direction });
export const limit = (count) => ({ kind: 'limit', count });
export const startAfter = (value) => ({ kind: 'startAfter', value });
export const query = (ref, ...constraints) => ({ path: ref.path, constraints });

const applyConstraints = (entries, constraints = []) => {
  let rows = entries;
  constraints.filter((c) => c.kind === 'where').forEach((c) => {
    rows = rows.filter(([, data]) => (c.op === '==' ? data[c.field] === c.value : true));
  });
  const order = constraints.find((c) => c.kind === 'orderBy');
  if (order) {
    const sign = order.direction === 'desc' ? -1 : 1;
    rows = [...rows].sort(([, a], [, b]) => sign * ((a[order.field] ?? 0) - (b[order.field] ?? 0)));
    const after = constraints.find((c) => c.kind === 'startAfter');
    if (after) rows = rows.filter(([, data]) => sign * ((data[order.field] ?? 0) - after.value) > 0);
  }
  const max = constraints.find((c) => c.kind === 'limit');
  return max ? rows.slice(0, max.count) : rows;
};

export const getDoc = async (ref) => {
  const data = store.get(ref.path);
  return { exists: () => data !== undefined, data: () => ({ ...data }) };
};

export const getDocs = async (ref) => {
  const prefix = `${ref.path}/`;
  const entries = applyConstraints(
    [...store.entries()].filter(([path]) => path.startsWith(prefix)
      && !path.slice(prefix.length).includes('/')),
    ref.constraints,
  );
  return {
    forEach: (cb) => entries.forEach(([path, data]) => cb({ id: path.slice(prefix.length), data: () => ({ ...data }) })),
    size: entries.length,
  };
};

export const writeBatch = () => {
  const operations = [];
  return {
    set: (ref, data, options) => operations.push({ type: 'set', path: ref.path, data, merge: !!options?.merge }),
    delete: (ref) => operations.push({ type: 'delete', path: ref.path }),
    commit: async () => {
      commits.push(operations.map((operation) => ({ ...operation })));
      operations.forEach((operation) => {
        if (operation.type === 'delete') { store.delete(operation.path); return; }
        const now = new Date('2026-09-06T10:00:00Z');
        const resolved = Object.fromEntries(Object.entries(operation.data)
          .filter(([, value]) => !value?.__deleteField)
          .map(([key, value]) => [key, value?.__serverTimestamp ? now : value]));
        const merged = operation.merge ? { ...store.get(operation.path), ...resolved } : resolved;
        Object.entries(operation.data)
          .filter(([, value]) => value?.__deleteField)
          .forEach(([key]) => { delete merged[key]; });
        store.set(operation.path, merged);
      });
    },
  };
};
