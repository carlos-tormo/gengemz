// Minimal in-memory stand-in for the firebase/firestore functions boardService
// uses, so the migration's read/write choreography can be tested offline.
export const db = { name: 'fake' };

const store = new Map();          // path -> document data
export const commits = [];        // one entry per committed batch

export const reset = () => { store.clear(); commits.length = 0; };
export const seed = (path, data) => store.set(path, { ...data });
export const dump = () => Object.fromEntries([...store.entries()].map(([k, v]) => [k, { ...v }]));

export const serverTimestamp = () => ({ __serverTimestamp: true });
export const doc = (_db, ...segments) => ({ path: segments.join('/') });
export const collection = (_db, ...segments) => ({ path: segments.join('/') });
export const onSnapshot = () => () => {};
export const setDoc = async (ref, data) => { store.set(ref.path, { ...data }); };

export const getDoc = async (ref) => {
  const data = store.get(ref.path);
  return { exists: () => data !== undefined, data: () => ({ ...data }) };
};

export const getDocs = async (ref) => {
  const prefix = `${ref.path}/`;
  const entries = [...store.entries()].filter(([path]) => path.startsWith(prefix)
    && !path.slice(prefix.length).includes('/'));
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
          .map(([key, value]) => [key, value?.__serverTimestamp ? now : value]));
        store.set(operation.path, operation.merge ? { ...store.get(operation.path), ...resolved } : resolved);
      });
    },
  };
};
