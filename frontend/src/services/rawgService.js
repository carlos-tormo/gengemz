import { BACKEND_URL } from '../config/constants';
import { auth } from '../config/firebase';

// searchGames requires a Firebase ID token. Anonymous sessions have one, but
// the auth listener in App.jsx may still be signing in on first load, so wait
// briefly for a user before giving up.
const waitForUser = () =>
  new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const timer = setTimeout(() => { unsubscribe(); resolve(null); }, 5000);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) { clearTimeout(timer); unsubscribe(); resolve(user); }
    });
  });

const fetchBackend = async (query) => {
  const user = await waitForUser();
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  return fetch(`${BACKEND_URL}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const normalizeQuery = (query) => query.toLowerCase().trim().replace(/\s+/g, ' ');

export const generateQueryVariants = (query) => {
  const base = normalizeQuery(query);
  const variants = [base];
  const spaced = base
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2');
  if (spaced !== base) variants.push(spaced);
  return [...new Set(variants.filter(Boolean))];
};

export const searchGamesWithVariants = async (rawQuery, fallbackQuery) => {
  const variants = rawQuery.trim() ? generateQueryVariants(rawQuery) : [];
  if (fallbackQuery) variants.push(fallbackQuery);
  if (variants.length === 0) return [];

  for (const variant of variants) {
    const response = await fetchBackend(`search=${encodeURIComponent(variant)}`);
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results;
    }
  }

  return [];
};

export const browseGames = async ({ filters, search }) => {
  const params = new URLSearchParams();
  params.append('ordering', filters.ordering || '-metacritic');
  params.append('page_size', filters.page_size || 50);
  if (filters.platformId) params.append('platforms', filters.platformId);

  const startDate = filters.year ? `${filters.year}-01-01` : filters.startDate;
  const endDate = filters.year ? `${filters.year}-12-31` : filters.endDate;
  const datesStr = [startDate, endDate].filter(Boolean).join(',');
  if (datesStr) params.append('dates', datesStr);
  if (search) params.append('search', search);

  const response = await fetchBackend(params.toString());
  if (!response.ok) throw new Error('Browse failed');
  const data = await response.json();
  const now = new Date();
  const seen = new Set();
  let deduped = [];

  (data.results || []).forEach((game) => {
    if (!game) return;
    const key = game.slug || `${game.name || ''}-${game.released || ''}`;
    if (seen.has(key)) return;
    if (filters.ordering === '-released' && game.released) {
      const releaseDate = new Date(game.released);
      if (releaseDate > now) return;
    }
    seen.add(key);
    deduped.push(game);
  });

  if (filters.minRating) {
    deduped = deduped.filter((game) => (game.rating || 0) >= filters.minRating);
  }

  if (filters.genreId) {
    const genreKey = filters.genreId.toString();
    deduped = deduped.filter((game) =>
      (game.genres || []).some((genre) => genre.id?.toString() === genreKey || genre.slug === genreKey),
    );
  }

  if (filters.year) {
    deduped = deduped.filter((game) => (game.released || '').startsWith(filters.year.toString()));
  }

  return deduped;
};
