import React from 'react';
import { GripVertical, Pencil, LayoutGrid } from 'lucide-react';
import GameCard from './GameCard';
import IconRenderer from './IconRenderer';

const Column = ({ column, games, onDragOver, onDrop, onDragStart, onMoveRequest, onDelete, isDraggingOver, filterPlatform, onHeaderClick, onEditColumn, onEditGame, onToggleFavorite, playlists, onAddToPlaylist }) => {
  const filteredItemIds = column.itemIds.filter(gameId => { if (!filterPlatform || filterPlatform === 'All') return true; const game = games[gameId]; return game?.platform?.toLowerCase().includes(filterPlatform.toLowerCase()); });
  return (
    <div onDragOver={(e) => onDragOver(e, column.id)} onDrop={(e) => onDrop(e, column.id)} className={`flex-shrink-0 w-80 max-w-[90vw] flex flex-col rounded-xl transition-colors duration-200 ${isDraggingOver ? 'bg-slate-800/50 ring-2 ring-purple-500/30' : 'bg-slate-900/40'}`}>
      <div onClick={() => onHeaderClick(column.id)} className="p-4 flex items-center justify-between border-b border-slate-800/50 cursor-pointer group hover:bg-slate-800/50 rounded-t-xl transition-colors relative"><div className="flex items-center gap-2 text-slate-200 font-bold tracking-wide"><span className={`p-2 rounded-lg transition-transform group-hover:scale-110 ${column.id === 'backlog' ? 'bg-slate-800 text-slate-400' : column.id === 'playing' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}><IconRenderer iconName={column.icon} /></span><span className="group-hover:text-white transition-colors">{column.title}</span><span className="ml-2 text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{filteredItemIds.length}</span></div><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"><button onClick={(e) => { e.stopPropagation(); onEditColumn(column); }} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-500 hover:text-white" title="Edit List"><Pencil size={14} /></button><LayoutGrid size={16} className="text-slate-600 ml-1" /></div></div>
      <div className="p-3 flex-1 overflow-y-auto min-h-[150px] max-h-[calc(100vh-220px)] custom-scrollbar">
        {filteredItemIds.map((gameId, index) => { const game = games[gameId]; if (!game) return null; return (<GameCard key={game.id} game={game} index={index} columnId={column.id} onDragStart={onDragStart} onMoveRequest={onMoveRequest} onDelete={onDelete} onEdit={onEditGame} onToggleFavorite={onToggleFavorite} playlists={playlists} onAddToPlaylist={onAddToPlaylist} />); })}
        {column.itemIds.length === 0 && <div className="h-32 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl"><GripVertical size={24} className="mb-2 opacity-50" /><span className="text-sm">Drop games here</span></div>}
        {column.itemIds.length > 0 && filteredItemIds.length === 0 && <div className="h-32 flex flex-col items-center justify-center text-slate-600"><span className="text-sm">No {filterPlatform} games</span></div>}
      </div>
    </div>
  );
};

export default Column;
