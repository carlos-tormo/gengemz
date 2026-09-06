// ESM hooks that let the frontend's boardService be imported by plain node:
// `config/firebase` needs a live Firebase app and `config/constants` reads
// Vite's import.meta.env, neither of which exists outside the bundler. The
// real constants source is kept (INITIAL_DATA must not drift), only the
// browser-only bits are neutralised.
// Vite resolves extensionless relative imports; node does not.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await resolveFirestore(specifier, context, nextResolve);
  } catch (error) {
    if (!specifier.startsWith('.')) throw error;
    for (const extension of ['.js', '.jsx', '/index.js']) {
      try {
        return await nextResolve(specifier + extension, context);
      } catch { /* try the next one */ }
    }
    throw error;
  }
}

// Opt-in (GGZ_FAKE_FIRESTORE=1): swap the Firestore SDK for the in-memory fake
// so the migration's reads and write batches can be asserted without a server.
export async function resolveFirestore(specifier, context, nextResolve) {
  if (process.env.GGZ_FAKE_FIRESTORE === '1' && specifier === 'firebase/firestore') {
    return { url: new URL('./fakeFirestore.mjs', import.meta.url).href, format: 'module', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('/config/firebase.js')) {
    return { format: 'module', shortCircuit: true, source: 'export const db = {};\nexport const auth = {};\n' };
  }
  if (url.endsWith('/config/constants.js')) {
    const result = await nextLoad(url, context);
    const source = String(result.source)
      .replaceAll('import.meta.env', '({})')
      .replace('const isLocal =', 'const location = { hostname: "localhost" };\nconst isLocal =')
      .replace(/^console\.log\("BACKEND_URL:.*$/m, '');
    return { ...result, source };
  }
  return nextLoad(url, context);
}
