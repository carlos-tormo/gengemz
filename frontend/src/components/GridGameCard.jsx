import React, { useState, useRef } from 'react';
import { MoreVertical, ImageIcon, Heart, Star } from 'lucide-react';
import useClickOutside from '../hooks/useClickOutside';
import { PLACEHOLDER_COVERS } from '../config/constants';

const GridGameCard = ({ game, onMoveRequest, onDelete, onEdit, onToggleFavorite }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setShowMenu(false));

  return (
    <div onClick={() => onEdit(game, false)} className="group relative aspect-[3/4] rounded-xl overflow-hidden shadow-lg hover:shadow-[var(--shadow)] transition-all duration-300 hover:scale-105 bg-[var(--panel)] border border-[var(--border)] cursor-pointer">
      <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" style={{ background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[game.coverIndex % PLACEHOLDER_COVERS.length] }}>{!game.cover && <div className="flex items-center justify-center h-full text-white/20 font-bold text-4xl">{game.title.charAt(0)}</div>}</div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
      <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(game.id); }} className={`absolute top-2 left-2 p-1.5 rounded-full backdrop-blur-md transition-colors z-10 ${game.isFavorite ? 'bg-red-500 text-white shadow-lg' : 'bg-black/30 text-white/70 hover:bg-black/60 hover:text-red-400'}`}><Heart size={16} className={game.isFavorite ? "fill-current" : ""} /></button>
      {game.rating > 0 && (<div onClick={(e) => { e.stopPropagation(); onEdit(game, true); }} className={`absolute bottom-2 right-2 px-2 py-1 rounded-md text-xs font-bold shadow-lg backdrop-blur-sm z-10 flex items-center gap-1 hover:scale-110 transition-transform ${game.rating >= 9 ? 'bg-yellow-500 text-black' : game.rating >= 7 ? 'bg-green-600 text-white' : 'bg-slate-800 text-white border border-slate-600'}`}><Star size={10} className="fill-current" />{game.rating}</div>)}
      <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col justify-end pointer-events-none"><h4 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-md mb-4 group-hover:mb-1 transition-all">{game.title}</h4><div className="flex items-center gap-2 h-0 opacity-0 group-hover:h-auto group-hover:opacity-100 transition-all duration-300">{game.platform && <span className="text-[10px] text-slate-300 uppercase tracking-wider bg-black/50 px-1.5 py-0.5 rounded">{game.platform}</span>}</div></div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" ref={menuRef}><button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1.5 bg-black/60 text-white hover:bg-[var(--accent)] rounded-full backdrop-blur-md"><MoreVertical size={16} /></button>{showMenu && (<div className="absolute right-0 top-8 bg-[var(--panel)] border border-[var(--border)] shadow-xl rounded-lg z-20 w-32 overflow-hidden py-1"><button onClick={() => { onEdit(game, false); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-[var(--text)] hover:bg-[var(--panel-muted)] flex items-center gap-2"><ImageIcon size={12} /> View Card</button><div className="h-px bg-[var(--border)] my-1"></div><button onClick={() => onDelete(game.id)} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20">Delete</button></div>)}</div>
    </div>
  );
};

export default GridGameCard;
