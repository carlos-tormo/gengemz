import React from 'react';
import { Search, Check, Plus, Star, ArrowLeft } from 'lucide-react';
import { findExistingGameId } from '../utils/gameUtils';

const BrowsePage = ({
  filters,
  setFilters,
  search,
  setSearch,
  isLoading,
  error,
  results,
  data,
  onBrowse,
  onAddToList,
  onBack,
}) => {
  const isOnBoard = (game) => !!findExistingGameId(data, game);

  const addToList = (game, colId) => {
    onAddToList(game, colId || data.columnOrder[0]);
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 md:px-6 lg:px-8 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--text)]">Browse Games</h2>
        <button onClick={onBack} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1">
          <ArrowLeft size={16} /> Back to board
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-2">
          <span className="text-[11px] uppercase text-[var(--text-muted)]">Browse by</span>
          <select
            value={filters.year}
            onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value }))}
            className="bg-transparent text-sm text-[var(--text)] border border-[var(--border)] rounded px-2 py-1"
          >
            <option value="">Any year</option>
            {Array.from({ length: 35 }, (_, i) => 2025 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={filters.minRating}
            onChange={(e) => setFilters((prev) => ({ ...prev, minRating: Number(e.target.value) }))}
            className="bg-transparent text-sm text-[var(--text)] border border-[var(--border)] rounded px-2 py-1"
          >
            <option value={0}>Any rating</option>
            <option value={9}>9+</option>
            <option value={8}>8+</option>
            <option value={7}>7+</option>
            <option value={6}>6+</option>
          </select>
          <select
            value={filters.ordering}
            onChange={(e) => setFilters((prev) => ({ ...prev, ordering: e.target.value }))}
            className="bg-transparent text-sm text-[var(--text)] border border-[var(--border)] rounded px-2 py-1"
          >
            <option value="-metacritic">Popular (Metacritic)</option>
            <option value="-rating">Popular (User)</option>
            <option value="-added">Most added</option>
            <option value="-released">Newest</option>
          </select>
          <select
            value={filters.genreId}
            onChange={(e) => setFilters((prev) => ({ ...prev, genreId: e.target.value }))}
            className="bg-transparent text-sm text-[var(--text)] border border-[var(--border)] rounded px-2 py-1"
          >
            <option value="">All genres</option>
            <option value="4">Action</option>
            <option value="3">Adventure</option>
            <option value="5">RPG</option>
            <option value="2">Shooter</option>
            <option value="7">Puzzle</option>
            <option value="14">Simulator</option>
          </select>
          <select
            value={filters.platformId}
            onChange={(e) => setFilters((prev) => ({ ...prev, platformId: e.target.value }))}
            className="bg-transparent text-sm text-[var(--text)] border border-[var(--border)] rounded px-2 py-1"
          >
            <option value="">All platforms</option>
            <option value="4">PC</option>
            <option value="187">PlayStation 5</option>
            <option value="18">PlayStation 4</option>
            <option value="1">Xbox One</option>
            <option value="186">Xbox Series X/S</option>
            <option value="7">Nintendo Switch</option>
          </select>
        </div>
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-[var(--text-muted)]" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a game..."
              className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            />
          </div>
          <button
            onClick={onBrowse}
            disabled={isLoading}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm rounded disabled:opacity-60"
          >
            {isLoading ? 'Loading...' : 'Browse'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">Popular picks</h3>
        {error && <div className="text-xs text-red-500">{error}</div>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {results.slice(0, 5).map((game) => {
          const exists = isOnBoard(game);
          return (
            <div key={game.id} className="bg-[var(--panel)] border border-[var(--border)] rounded-lg overflow-hidden shadow-sm flex flex-col">
              <div
                className="aspect-[2/3] bg-cover bg-center relative"
                style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}
              >
                {!game.background_image && (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-xs">No cover</div>
                )}
                {exists && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/40 text-white text-[11px] flex items-center gap-1">
                    <Check size={12} /> On your library
                  </div>
                )}
                <button
                  className="absolute top-2 right-2 p-1.5 bg-[var(--panel)]/80 text-[var(--text)] rounded-full border border-[var(--border)] hover:border-[var(--accent)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    addToList(game, data.columnOrder[0]);
                  }}
                  title="Add to board list"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="p-2 space-y-1">
                <div className="text-sm font-semibold text-[var(--text)] truncate">{game.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                  <span>{game.released ? game.released.split('-')[0] : 'Unknown'}</span>
                  {game.metacritic && (
                    <span className="px-1.5 rounded bg-[var(--panel-muted)] border border-[var(--border)] text-[var(--text)]">{game.metacritic}</span>
                  )}
                  {game.rating && (
                    <span className="px-1.5 rounded bg-[var(--panel-muted)] border border-[var(--border)] text-[var(--text)] flex items-center gap-1">
                      <Star size={12} /> {game.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {exists ? (
                    <span className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--panel-muted)] text-[var(--text-muted)] border border-[var(--border)]">
                      On board
                    </span>
                  ) : (
                    <button
                      onClick={() => addToList(game)}
                      className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2">
        <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">More results</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 flex-1 overflow-y-auto custom-scrollbar">
        {results.slice(5).map((game) => {
          const exists = isOnBoard(game);
          return (
            <div key={game.id} className="bg-[var(--panel)] border border-[var(--border)] rounded-lg overflow-hidden shadow-sm flex flex-col">
              <div
                className="aspect-[2/3] bg-cover bg-center relative"
                style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}
              >
                {!game.background_image && (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-xs">No cover</div>
                )}
                {exists && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/40 text-white text-[11px] flex items-center gap-1">
                    <Check size={12} /> On your library
                  </div>
                )}
                <button
                  className="absolute top-2 right-2 p-1.5 bg-[var(--panel)]/80 text-[var(--text)] rounded-full border border-[var(--border)] hover:border-[var(--accent)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    addToList(game, data.columnOrder[0]);
                  }}
                  title="Add to board list"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="p-2 space-y-1">
                <div className="text-sm font-semibold text-[var(--text)] truncate">{game.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                  <span>{game.released ? game.released.split('-')[0] : 'Unknown'}</span>
                  {game.metacritic && (
                    <span className="px-1.5 rounded bg-[var(--panel-muted)] border border-[var(--border)] text-[var(--text)]">{game.metacritic}</span>
                  )}
                  {game.rating && (
                    <span className="px-1.5 rounded bg-[var(--panel-muted)] border border-[var(--border)] text-[var(--text)] flex items-center gap-1">
                      <Star size={12} /> {game.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {exists ? (
                    <span className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--panel-muted)] text-[var(--text-muted)] border border-[var(--border)]">
                      On board
                    </span>
                  ) : (
                    <button
                      onClick={() => addToList(game)}
                      className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!isLoading && results.length === 0 && (
          <div className="text-sm text-[var(--text-muted)] col-span-full">No games to display.</div>
        )}
      </div>
    </div>
  );
};

export default BrowsePage;
