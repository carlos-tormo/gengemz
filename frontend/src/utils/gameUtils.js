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

export const findExistingGameIdByTitle = (data, title) => {
    const norm = (title || '').trim().toLowerCase();
    if (!norm) return null;
    const match = Object.values(data.games || {}).find(g => (g.title || '').trim().toLowerCase() === norm);
    return match?.id || null;
};

export const getGameColumnId = (data, gameId) => {
    return data.columnOrder.find(colId => data.columns[colId].itemIds.includes(gameId)) || null;
};

export const isGameOnBoard = (data, item) => {
  return Object.values(data.games || {}).some(g => 
    (item.originId && g.id === item.originId) ||
    (g.title?.toLowerCase() === item.title?.toLowerCase() && g.platform === item.platform)
  );
};
