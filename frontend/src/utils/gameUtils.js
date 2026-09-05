export const getUniquePlatforms = (data) => {
    const platforms = new Set(['All']);
    if (data.games) {
      Object.values(data.games).forEach(game => {
        if (!game.platform) return;
        const p = game.platform;
        if (p.includes('PlayStation')) platforms.add('PlayStation');
        else if (p.includes('Xbox')) platforms.add('Xbox');
        else if (p.includes('PC')) platforms.add('PC');
        else if (p.includes('Nintendo') || p.includes('Switch')) platforms.add('Nintendo');
        else platforms.add(p);
      });
    }
    return Array.from(platforms).sort();
};

export const getHiddenGamesCount = (data, activePlatformFilter) => {
    if (activePlatformFilter === 'All') return 0;
    const allGames = Object.values(data.games || {});
    const visibleCount = allGames.filter(game => 
      game.platform?.toLowerCase().includes(activePlatformFilter.toLowerCase())
    ).length;
    return allGames.length - visibleCount;
};

export const getFavoriteGames = (data) => {
    if (!data.games) return [];
    return Object.values(data.games).filter(game => game.isFavorite);
};

export const createClientId = (prefix = 'id') => {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeGameTitle = (title) => (title || '').trim().toLowerCase();

export const getGameIdentity = (gameOrTitle) => {
  const identities = getGameIdentities(gameOrTitle);
  return identities[0] || null;
};

export const getGameIdentities = (gameOrTitle) => {
  if (typeof gameOrTitle === 'string') {
    const title = normalizeGameTitle(gameOrTitle);
    return title ? [{ type: 'title', value: title }] : [];
  }

  if (!gameOrTitle) return [];

  const identities = [];
  const addIdentity = (type, value) => {
    if (!value && value !== 0) return;
    const normalizedValue = type === 'rawgSlug' || type === 'title'
      ? String(value).trim().toLowerCase()
      : String(value).trim();
    if (!normalizedValue) return;
    if (!identities.some((identity) => identity.type === type && identity.value === normalizedValue)) {
      identities.push({ type, value: normalizedValue });
    }
  };

  addIdentity('rawgId', gameOrTitle.rawgId);
  if (gameOrTitle.name && gameOrTitle.id) addIdentity('rawgId', gameOrTitle.id);
  addIdentity('rawgSlug', gameOrTitle.rawgSlug);
  addIdentity('rawgSlug', gameOrTitle.slug);
  addIdentity('rawgId', gameOrTitle.originRawgId);
  addIdentity('rawgSlug', gameOrTitle.originRawgSlug);

  const title = normalizeGameTitle(gameOrTitle.title || gameOrTitle.name);
  addIdentity('title', title);
  return identities;
};

export const sameGameIdentity = (a, b) => {
  const identitiesA = getGameIdentities(a);
  const identitiesB = getGameIdentities(b);
  return identitiesA.some((identityA) =>
    identitiesB.some((identityB) => identityA.type === identityB.type && identityA.value === identityB.value),
  );
};

export const findExistingGameId = (data, candidate) => {
    const match = Object.values(data.games || {}).find(g => sameGameIdentity(g, candidate));
    return match?.id || null;
};

export const findExistingGameIdByTitle = (data, title) => {
    return findExistingGameId(data, title);
};

export const getGameColumnId = (data, gameId) => {
    return data.columnOrder.find(colId => data.columns[colId].itemIds.includes(gameId)) || null;
};

export const isGameOnBoard = (data, item) => {
  return Object.values(data.games || {}).some(g => sameGameIdentity(g, item));
};
