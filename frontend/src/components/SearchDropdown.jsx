import React from "react";
import { Search, Loader2, Gamepad2, Users, Plus, Check } from "lucide-react";
import { findExistingGameId } from "../utils/gameUtils";

/**
 * Compact dropdown for the top-bar search.
 * Supports switching between Games and Users and reuses the parent handlers/state.
 */
const SearchDropdown = ({
  isOpen,
  onClose,
  navSearchMode,
  setNavSearchMode,
  userSearchQuery,
  setUserSearchQuery,
  userSearchResults = [],
  userSearchError,
  isSearchingUsers,
  navGameResults = [],
  navGameError,
  isSearchingNavGames,
  navGameHasSearched,
  setUserSearchResults,
  setUserSearchError,
  setNavGameResults,
  setNavGameError,
  setNavGameHasSearched,
  handleUserSearch,
  handleFollowAction,
  openProfile,
  handleBrowseListAction,
  data = {},
}) => {
  if (!isOpen) return null;

  const renderGameRow = (g) => {
    const onBoard = !!findExistingGameId(data, g);
    return (
      <div
        key={g.id}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--panel)] transition-colors"
      >
        <div className="w-12 h-12 rounded-md overflow-hidden bg-[var(--panel-strong)] flex-shrink-0">
          {g.background_image ? (
            <img
              src={g.background_image}
              alt={g.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-xs text-[var(--text-muted)]">
              No cover
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)] truncate">
            {g.name}
          </p>
          <p className="text-xs text-[var(--text-muted)] truncate">
            {(g.released || "").split("-")[0] || "—"}
          </p>
        </div>
        {onBoard ? (
          <span className="px-3 py-1 text-xs rounded-md bg-slate-600/60 text-slate-100 flex items-center gap-1">
            <Check size={14} /> On board
          </span>
        ) : (
          <button
            onClick={() => handleBrowseListAction(g)}
            className="px-3 py-1 text-xs rounded-md bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-strong)] transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    );
  };

  const renderUserRow = (u) => (
    <div
      key={u.uid}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--panel)] transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-[var(--panel-strong)] text-[var(--text)] grid place-items-center font-bold uppercase flex-shrink-0">
        {(u.displayName || "U")[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text)] truncate">
          {u.displayName || "Unknown"}
        </p>
        <p className="text-xs text-[var(--text-muted)] truncate">Public Profile</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => openProfile(u)}
          className="px-3 py-1 text-xs rounded-md border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
        >
          View
        </button>
        <button
          onClick={() => handleFollowAction(u)}
          className="px-3 py-1 text-xs rounded-md bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-strong)] transition-colors"
        >
          Follow
        </button>
      </div>
    </div>
  );

  const showNoResults =
    navSearchMode === "games"
      ? navGameHasSearched && !isSearchingNavGames && navGameResults.length === 0 && !navGameError
      : !!userSearchQuery.trim() &&
        !isSearchingUsers &&
        userSearchResults.length === 0 &&
        !userSearchError;

  return (
    <div className="absolute right-0 mt-2 w-[380px] bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl z-50">
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-2">
        <div className="flex rounded-full overflow-hidden bg-[var(--panel-strong)] border border-[var(--border)]">
          <button
            className={`flex items-center gap-1 px-3 py-2 text-sm font-semibold transition-colors ${
              navSearchMode === "games"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)]"
            }`}
            onClick={() => {
              setNavSearchMode("games");
              setUserSearchResults([]);
              setUserSearchError(null);
            }}
          >
            <Gamepad2 size={14} /> Games
          </button>
          <button
            className={`flex items-center gap-1 px-3 py-2 text-sm font-semibold transition-colors ${
              navSearchMode === "players"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)]"
            }`}
            onClick={() => {
              setNavSearchMode("players");
              setNavGameResults([]);
              setNavGameError(null);
              setNavGameHasSearched(false);
            }}
          >
            <Users size={14} /> Users
          </button>
        </div>
        <form onSubmit={handleUserSearch} className="flex-1 flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 h-10 rounded-full bg-[var(--panel-strong)] border border-[var(--border)] flex-1">
            <Search size={16} className="text-[var(--text-muted)]" />
            <input
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder={`Find ${navSearchMode === "games" ? "games" : "users"}...`}
              className="bg-transparent text-sm text-[var(--text)] w-full outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <button
            type="submit"
            className="h-10 px-4 rounded-full bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-strong)] shadow"
          >
            Go
          </button>
        </form>
      </div>

      <div className="max-h-96 overflow-y-auto p-3 space-y-2">
        {navSearchMode === "games" && isSearchingNavGames && (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
            <Loader2 className="animate-spin" size={16} /> Searching games...
          </div>
        )}
        {navSearchMode === "players" && isSearchingUsers && (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
            <Loader2 className="animate-spin" size={16} /> Searching users...
          </div>
        )}

        {navSearchMode === "games" && navGameError && (
          <p className="text-xs text-red-400">{navGameError}</p>
        )}
        {navSearchMode === "players" && userSearchError && (
          <p className="text-xs text-red-400">{userSearchError}</p>
        )}

        {showNoResults && (
          <p className="text-xs text-[var(--text-muted)] px-1">No results found.</p>
        )}

        {navSearchMode === "games" &&
          navGameResults.map((g) => (
            <React.Fragment key={g.id}>{renderGameRow(g)}</React.Fragment>
          ))}

        {navSearchMode === "players" &&
          userSearchResults.map((u) => (
            <React.Fragment key={u.uid}>{renderUserRow(u)}</React.Fragment>
          ))}
      </div>

      <div className="p-3 flex justify-end">
        <button
          onClick={onClose}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SearchDropdown;
