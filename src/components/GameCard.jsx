import React, { useState, useRef } from 'react';
import { MoreVertical, Star, Heart, Edit2, Trash2, ImageIcon } from 'lucide-react';
import { PLACEHOLDER_COVERS } from '../config/Constants';
import { useClickOutside } from '../hooks/useClickOutside';

const GameCard = ({ game, index, columnId, onDragStart, onMoveRequest, onDelete, onEdit, onToggleFavorite }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setShowMenu(false));

  const handleScoreClick = (e) => {
    e.stopPropagation();
    onEdit(game, true);
  };

  const handleCardClick = (e) => {
    if (e.target.closest('button') || e.target.closest('.interactive-area')) return;
    onEdit(game, false);
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, game.id, columnId)}
      onClick={handleCardClick}
      className="group relative bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-purple-500/50 rounded-xl p-3 mb-3 shadow-lg hover:shadow-purple-900/20 transition-all duration-200 cursor-grab active:cursor-grabbing select-none touch-manipulation"
    >
      <div className="flex gap-4">
        <div 
          className="w-20 h-28 rounded-lg shrink-0 shadow-inner flex items-center justify-center bg-cover bg-center relative overflow-hidden"
          style={{ 
            background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[game.coverIndex % PLACEHOLDER_COVERS.length] 
          }}
        >
          {!game.cover && <span className="text-white/20 font-bold text-xl relative z-10">{game.title.charAt(0)}</span>}
          {!game.cover && <div className="absolute inset-0 bg-black/10" />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div>
            <h4 className="text-slate-100 font-bold text-base truncate leading-tight mb-1 group-hover:text-purple-300 transition-colors">{game.title}</h4>
            <div className="flex flex-wrap gap-1.5 opacity-80">
              {game.platform && (
                 <span className="px-1.5 py-0.5 bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider font-bold rounded max-w-full truncate">{game.platform}</span>
              )}
              <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-[10px] rounded">{game.genre}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-2 interactive-area">
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(game.id); }}
              className={`p-1.5 rounded-full transition-colors ${
                game.isFavorite 
                  ? 'text-red-500 bg-red-500/10' 
                  : 'text-slate-500 hover:text-red-400 hover:bg-slate-700'
              }`}
              title={game.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Heart size={18} className={game.isFavorite ? "fill-current" : ""} />
            </button>

            <div 
              onClick={handleScoreClick}
              className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 hover:border-slate-500 cursor-pointer transition-colors"
            >
              <Star size={12} className={game.rating > 0 ? "text-yellow-400 fill-current" : "text-slate-600"} />
              <span className={`text-xs font-bold ${game.rating > 0 ? 'text-slate-200' : 'text-slate-500'}`}>
                {game.rating > 0 ? game.rating : '--'}
              </span>
            </div>

            <div className="h-4 w-px bg-slate-700 mx-1"></div>

            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
              >
                <MoreVertical size={18} />
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-8 bg-slate-900 border border-slate-700 shadow-xl rounded-lg z-20 w-40 overflow-hidden py-1">
                  <button onClick={() => { onEdit(game, false); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-2">
                    <ImageIcon size={14} /> View Card
                  </button>
                  <div className="h-px bg-slate-800 my-1"></div>
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase border-b border-slate-800">Move to...</div>
                  <button onClick={() => onMoveRequest(game.id, 'backlog')} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-purple-900/30 hover:text-purple-300">To Play</button>
                  <button onClick={() => onMoveRequest(game.id, 'playing')} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-blue-900/30 hover:text-blue-300">Playing</button>
                  <button onClick={() => onMoveRequest(game.id, 'completed')} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-green-900/30 hover:text-green-300">Completed</button>
                  <div className="h-px bg-slate-800 my-1"></div>
                  <button onClick={() => onDelete(game.id)} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2">
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