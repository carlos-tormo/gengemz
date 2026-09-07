import { useState } from 'react';
import { Search, Loader2, Image as ImageIcon, Plus } from 'lucide-react';
import useGameSearch from '../hooks/useGameSearch';
import { createBoardGameFromRaw } from '../services/boardService';

/**
 * A quest step that asks the user to find a game and drops it on a given
 * column of their board. Shared by the quest-log onboarding steps that all
 * follow the same shape (search -> pick -> land on a column): issue #9 is
 * the first, #10/#11 reuse it with their own copy/column.
 */
const QuestGameSearchStep = ({ title, description, targetColumnId, addGameToBoard, onSelect }) => {
  const { query, setQuery, results, isSearching, error, hasSearched, search } = useGameSearch();
  const [addedId, setAddedId] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    search(query);
  };

  const handleSelect = (game) => {
    if (addedId) return;
    setAddedId(game.id);
    addGameToBoard(createBoardGameFromRaw(game), targetColumnId);
    onSelect();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-[var(--text-muted)]" size={18} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a game..."
            className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2.5 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          className="px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-bold rounded-lg shadow-lg disabled:opacity-50"
        >
          {isSearching ? <Loader2 className="animate-spin" size={20} /> : 'Search'}
        </button>
      </form>

      {error && <div className="p-3 bg-red-100 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
        {results.map((game) => (
          <button
            type="button"
            key={game.id}
            onClick={() => handleSelect(game)}
            disabled={!!addedId}
            className="w-full flex items-center gap-3 p-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent)]/60 transition-all text-left disabled:opacity-50"
          >
            <div
              className="w-12 h-16 bg-[var(--panel-muted)] rounded shrink-0 bg-cover bg-center shadow-sm border border-[var(--border)]"
              style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}
            >
              {!game.background_image && <ImageIcon className="w-full h-full p-3 text-[var(--text-muted)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-[var(--text)] truncate">{game.name}</h4>
              <span className="text-xs text-[var(--text-muted)]">{game.released ? game.released.split('-')[0] : 'Unknown'}</span>
            </div>
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold shadow shrink-0">
              <Plus size={14} />
              Add
            </span>
          </button>
        ))}
        {!isSearching && hasSearched && query.trim() && results.length === 0 && (
          <div className="text-sm text-[var(--text-muted)] px-2 py-2">No results found.</div>
        )}
      </div>
    </div>
  );
};

export default QuestGameSearchStep;
