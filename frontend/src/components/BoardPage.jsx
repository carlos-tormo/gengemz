import React from "react";
import {
  Filter,
  EyeOff,
  ArrowLeft,
  Heart,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Column from "./Column";
import GridGameCard from "./GridGameCard";
import IconRenderer from "./IconRenderer";
import { PLACEHOLDER_COVERS } from "../config/constants";

const BoardPage = ({
  data,
  favoriteGames = [],
  platforms = [],
  hiddenGamesCount = 0,
  viewMode,
  setViewMode,
  filters,
  actions,
  playlists = [],
  onAddToPlaylist,
  onCreatePlaylistAndAdd,
}) => {
  const { isListView, isFavoritesView, zoomedColumnId } = viewMode;
  const { setIsFavoritesView, setZoomedColumnId } = setViewMode;
  const { activePlatformFilter, setActivePlatformFilter } = filters;
  const {
    handleManualMove,
    handleDeleteGame,
    openGameCard,
    toggleFavorite,
    onDragOver,
    onDrop,
    onDragStart,
    activeDropZone,
    openAddColumnModal,
    openEditColumnModal,
  } = actions;

  const renderFilterBar =
    !zoomedColumnId && !isFavoritesView && platforms.length > 1 ? (
      <div className="fixed top-16 left-0 right-0 h-12 bg-[var(--glass)] backdrop-blur border-b border-[var(--border)] z-30 flex items-center justify-center px-4 overflow-x-auto">
        <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
          <Filter size={14} className="text-[var(--text-muted)] mr-2 shrink-0" />
          <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => setActivePlatformFilter(p)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  activePlatformFilter === p
                    ? "bg-[var(--accent)] text-white shadow-lg"
                    : "bg-[var(--panel)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {hiddenGamesCount > 0 && (
            <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-[var(--border)] animate-in fade-in slide-in-from-left-2">
              <EyeOff size={14} className="text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)] font-medium whitespace-nowrap">
                {hiddenGamesCount} hidden
              </span>
            </div>
          )}
        </div>
      </div>
    ) : null;

  if (isFavoritesView) {
    return (
      <>
        {renderFilterBar}
        <div className="max-w-7xl mx-auto animate-in zoom-in-95 duration-300 pt-24">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setIsFavoritesView(false)}
              className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="font-semibold">Back to Board</span>
            </button>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-400">
              <Heart size={32} className="fill-current" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-[var(--text)]">Favorites Vault</h2>
              <p className="text-[var(--text-muted)] text-sm">
                {favoriteGames.length} cherished titles
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl-grid-cols-5 gap-6">
            {favoriteGames.map((game) => (
              <GridGameCard
                key={game.id}
                game={game}
                onMoveRequest={handleManualMove}
                onDelete={handleDeleteGame}
                onEdit={openGameCard}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
          {favoriteGames.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--panel)]/30">
              <Heart size={32} className="mb-4 opacity-50" />
              <span className="text-lg">No favorites yet. Add some love!</span>
            </div>
          )}
        </div>
      </>
    );
  }

  if (zoomedColumnId) {
    const column = data.columns[zoomedColumnId];
    const filteredIds = column.itemIds.filter((id) => {
      if (activePlatformFilter === "All") return true;
      return data.games[id]?.platform
        ?.toLowerCase()
        .includes(activePlatformFilter.toLowerCase());
    });

    return (
      <>
        {renderFilterBar}
        <div className="max-w-7xl mx-auto animate-in zoom-in-95 duration-300 pt-24">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setZoomedColumnId(null)}
              className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="font-semibold">Back to Board</span>
            </button>
            <div className="flex bg-[var(--panel)] border border-[var(--border)] rounded-lg p-1 shadow-sm">
              {data.columnOrder.map((colId) => (
                <button
                  key={colId}
                  onClick={() => setZoomedColumnId(colId)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    colId === zoomedColumnId
                      ? "bg-[var(--accent)] text-white shadow"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {data.columns[colId].title}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`p-3 rounded-xl ${
                zoomedColumnId === "backlog"
                  ? "bg-[var(--panel-muted)] text-[var(--text-muted)]"
                  : zoomedColumnId === "playing"
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                  : "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
              }`}
            >
              <IconRenderer iconName={column.icon} size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-[var(--text)]">{column.title}</h2>
                <button
                  onClick={() => openEditColumnModal(column)}
                  className="p-1.5 hover:bg-[var(--panel-muted)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  <Pencil size={18} />
                </button>
              </div>
              <p className="text-[var(--text-muted)] text-sm">
                {column.itemIds.length} games in total
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {filteredIds.map((gameId) => (
              <GridGameCard
                key={gameId}
                game={data.games[gameId]}
                onMoveRequest={handleManualMove}
                onDelete={handleDeleteGame}
                onEdit={openGameCard}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
          {column.itemIds.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--panel)]/30">
              <GripVertical size={32} className="mb-4 opacity-50" />
              <span className="text-lg">No games here yet</span>
            </div>
          )}
        </div>
      </>
    );
  }

  if (isListView) {
    return (
      <>
        {renderFilterBar}
        <div className="max-w-6xl mx-auto px-4 pt-32">
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-[var(--border)] text-xs uppercase text-[var(--text-muted)] tracking-wide">
              All Games
            </div>
            <div className="divide-y divide-[var(--border)]">
              {Object.values(data.games)
                .filter(
                  (g) =>
                    activePlatformFilter === "All" ||
                    g.platform?.toLowerCase().includes(activePlatformFilter.toLowerCase())
                )
                .map((game) => {
                  const colId =
                    data.columnOrder.find((c) => data.columns[c].itemIds.includes(game.id)) ||
                    "unknown";
                  return (
                    <div
                      key={game.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 hover:bg-[var(--panel-muted)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-16 rounded-md bg-[var(--panel-muted)] overflow-hidden bg-cover bg-center border border-[var(--border)]"
                          style={{
                            background: game.cover
                              ? `url(${game.cover}) center/cover`
                              : PLACEHOLDER_COVERS[(game.coverIndex ?? 0) % PLACEHOLDER_COVERS.length],
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[var(--text)] truncate">
                              {game.title}
                            </div>
                            {game.rating > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--panel-muted)] text-[var(--text)] border border-[var(--border)]">
                                {game.rating}/10
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {game.platform} · {game.genre}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-1">
                            List: {data.columns[colId]?.title || "Unknown"}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 ml-auto">
                        <button
                          onClick={() => toggleFavorite(game.id)}
                          className={`p-2 rounded-md border ${
                            game.isFavorite
                              ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/50"
                              : "bg-[var(--panel)] text-[var(--text-muted)] border-[var(--border)] hover:text-red-500 hover:border-red-300"
                          }`}
                          title="Favorite"
                        >
                          <Heart size={16} className={game.isFavorite ? "fill-current" : ""} />
                        </button>
                        <button
                          onClick={() => openGameCard(game, false)}
                          className="p-2 rounded-md bg-[var(--panel)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)]"
                          title="Open"
                        >
                          <Pencil size={16} />
                        </button>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          {data.columnOrder.map((cid) => (
                            <button
                              key={cid}
                              onClick={() => handleManualMove(game.id, cid)}
                              className={`px-2 py-1 rounded border text-[var(--text-muted)] ${
                                cid === colId
                                  ? "border-[var(--border)] bg-[var(--panel-muted)]"
                                  : "border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                              }`}
                            >
                              {data.columns[cid].title}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => handleDeleteGame(game.id)}
                          className="p-2 rounded-md bg-[var(--panel)] text-red-600 border border-[var(--border)] hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/30"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              {Object.keys(data.games).length === 0 && (
                <div className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
                  No games yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {renderFilterBar}
      <div className="flex justify-center h-full pt-32">
        <div className="flex flex-col md:flex-row gap-6 items-start h-full overflow-x-auto pb-4 animate-in fade-in duration-500 max-w-full w-fit mx-auto px-4">
          {data.columnOrder.map((colId) => (
            <Column
              key={colId}
              column={data.columns[colId]}
              games={data.games}
              isDraggingOver={activeDropZone === colId}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragStart={onDragStart}
              onMoveRequest={handleManualMove}
              onDelete={handleDeleteGame}
              onEditGame={openGameCard}
              onToggleFavorite={toggleFavorite}
              filterPlatform={activePlatformFilter}
              onHeaderClick={setZoomedColumnId}
              onEditColumn={openEditColumnModal}
              playlists={playlists}
              onAddToPlaylist={onAddToPlaylist}
              onCreatePlaylistAndAdd={onCreatePlaylistAndAdd}
            />
          ))}
          {data.columnOrder.length < 5 && (
            <div className="shrink-0 w-80 p-4">
              <button
                onClick={openAddColumnModal}
                className="w-full h-32 border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--panel-muted)] transition-all group bg-[var(--panel)]"
              >
                <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                <span className="font-semibold">Create List</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BoardPage;
