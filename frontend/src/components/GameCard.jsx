import React, { useState, useRef } from 'react';
import { MoreVertical, ImageIcon, Trash2, Heart, Star } from 'lucide-react';
import useClickOutside from '../hooks/useClickOutside';
import { PLACEHOLDER_COVERS } from '../config/constants';

const GameCard = ({ game, index, columnId, onDragStart, onMoveRequest, onDelete, onEdit, onToggleFavorite, playlists, onAddToPlaylist }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setShowMenu(false));

  const handleScoreClick = (e) => { e.stopPropagation(); onEdit(game, true); };
  const handleCardClick = (e) => { if (e.target.closest('button') || e.target.closest('.interactive-area')) return; onEdit(game, false); };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, game.id, columnId)}
      onClick={handleCardClick}
      className="group relative bg-[var(--panel-muted)] hover:bg-[var(--panel-strong)] border border-[var(--border)] hover:border-[var(--accent)]/50 rounded-xl p-3 mb-3 shadow-lg hover:shadow-[var(--shadow)] transition-all duration-200 cursor-grab active:cursor-grabbing select-none touch-manipulation"
    >
      <div className="flex gap-4">
        <div className="w-20 h-28 rounded-lg shrink-0 shadow-inner flex items-center justify-center bg-cover bg-center relative overflow-hidden" style={{ background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[game.coverIndex % PLACEHOLDER_COVERS.length] }}>{!game.cover && <span className="text-white/20 font-bold text-xl relative z-10">{game.title.charAt(0)}</span>}{!game.cover && <div className="absolute inset-0 bg-black/10" />}</div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div>
            <h4 className="text-[var(--text)] font-bold text-base truncate leading-tight mb-1 group-hover:text-[var(--accent)] transition-colors">{game.title}</h4>
            <div className="flex flex-wrap gap-1.5 opacity-90">
              {game.platform && <span className="px-1.5 py-0.5 bg-[var(--panel)] text-[var(--text-muted)] text-[10px] uppercase tracking-wider font-bold rounded max-w-full truncate border border-[var(--border)]">{game.platform}</span>}
              <span className="px-1.5 py-0.5 bg-[var(--panel-strong)] text-[var(--text)] text-[10px] rounded border border-[var(--border)]">{game.genre}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-2 interactive-area">
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(game.id); }} className={`p-1.5 rounded-full transition-colors ${game.isFavorite ? 'text-red-500 bg-red-500/10' : 'text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--panel)]'}`} title={game.isFavorite ? "Remove from Favorites" : "Add to Favorites"}><Heart size={18} className={game.isFavorite ? "fill-current" : ""} /></button>
            <div onClick={handleScoreClick} className="flex items-center gap-1.5 bg-[var(--panel)] px-2 py-1 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors">
              <Star size={12} className={game.rating > 0 ? "text-yellow-500 fill-current" : "text-[var(--text-muted)]"} />
              <span className={`text-xs font-bold ${game.rating > 0 ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{game.rating > 0 ? game.rating : '--'}</span>
            </div>
            <div className="h-4 w-px bg-[var(--border)] mx-1"></div>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel)] rounded-full transition-colors"><MoreVertical size={18} /></button>
              {showMenu && (
                <div className="absolute right-0 top-8 bg-[var(--panel)] border border-[var(--border)] shadow-xl rounded-lg z-20 w-48 overflow-hidden py-1">
                  <button onClick={() => { onEdit(game, false); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)] flex items-center gap-2">
                    <ImageIcon size={14} /> View Card
                  </button>
                  <div className="h-px bg-[var(--border)] my-1"></div>
                  <div className="px-3 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase border-b border-[var(--border)]">Move to...</div>
                  <button onClick={() => onMoveRequest(game.id, 'backlog')} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/30 dark:hover:text-purple-300">To Play</button>
                  <button onClick={() => onMoveRequest(game.id, 'playing')} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300">Playing</button>
                  <button onClick={() => onMoveRequest(game.id, 'completed')} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-300">Completed</button>
                  <div className="h-px bg-[var(--border)] my-1"></div>
                  <div className="px-3 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase border-b border-[var(--border)]">Add to playlist</div>
                  {(playlists && playlists.length > 0) ? (
                    playlists.map(pl => (
                      <button
                        key={pl.id}
                        onClick={() => { onAddToPlaylist(pl.id, game); setShowMenu(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)] truncate"
                      >
                        {pl.title}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No playlists yet</div>
                  )}
                  <div className="h-px bg-[var(--border)] my-1"></div>
                  <button onClick={() => onDelete(game.id)} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 flex items-center gap-2">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameCard;
