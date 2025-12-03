import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, MoreVertical, Gamepad2, Trophy, Clock, X, GripVertical, Trash2, 
  LogIn, LogOut, Loader2, Check, Edit2, Search, Image as ImageIcon,
  ArrowRight, Save, WifiOff, Filter, EyeOff, ArrowLeft, LayoutGrid,
  Pencil, Star, Heart, Zap, Skull, Flame, Bookmark, Sword, Target, Ghost, Lock, Unlock, Calendar,
  Settings, Users, UserPlus, Shield, Wrench, Database
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, signOut, onAuthStateChanged, signInAnonymously, 
  signInWithCustomToken, updateProfile, signInWithPopup, GoogleAuthProvider,
  setPersistence, browserLocalPersistence
} from "firebase/auth";
import { 
  getFirestore, doc, onSnapshot, setDoc, getDoc, collection, query, where, getDocs
} from "firebase/firestore";

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyAjcMauPVcOcHbfUqQ0oHSBbLaBmckP25U",
  authDomain: "gengemztest-9582e.firebaseapp.com",
  projectId: "gengemztest-9582e",
  storageBucket: "gengemztest-9582e.firebasestorage.app",
  messagingSenderId: "189314077160",
  appId: "1:189314077160:web:a4ca2da49789d519a6145d",
  measurementId: "G-WK7HTBNZ4J"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const APP_ID = 'gengemz-prod'; 
const BACKEND_URL = "https://us-central1-gengemztest-9582e.cloudfunctions.net/searchGames";

const PLACEHOLDER_COVERS = [
  "linear-gradient(to bottom right, #ef4444, #b91c1c)",
  "linear-gradient(to bottom right, #3b82f6, #1d4ed8)", 
  "linear-gradient(to bottom right, #10b981, #047857)",
  "linear-gradient(to bottom right, #8b5cf6, #6d28d9)",
  "linear-gradient(to bottom right, #f59e0b, #b45309)",
];

const INITIAL_DATA = {
  games: {},
  columns: {
    'backlog': { id: 'backlog', title: 'To Play', icon: 'clock', itemIds: [] },
    'playing': { id: 'playing', title: 'Currently Playing', icon: 'gamepad', itemIds: [] },
    'completed': { id: 'completed', title: 'Victory Road', icon: 'trophy', itemIds: [] },
  },
  columnOrder: ['backlog', 'playing', 'completed'],
};

const COLUMN_ICONS = {
  clock: Clock, gamepad: Gamepad2, trophy: Trophy, star: Star, heart: Heart, 
  zap: Zap, skull: Skull, flame: Flame, bookmark: Bookmark, sword: Sword, 
  target: Target, ghost: Ghost
};

const IconRenderer = ({ iconName, size = 20, className }) => {
  const IconComponent = COLUMN_ICONS[iconName] || Gamepad2;
  return <IconComponent size={size} className={className} />;
};

// --- CUSTOM HOOKS ---

// 1. useClickOutside: Handles closing menus when clicking elsewhere
const useClickOutside = (ref, handler) => {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
};

// 2. useDebouncedSave: Handles auto-saving to Firestore without spamming writes
const useDebouncedSave = (user) => {
  const [status, setStatus] = useState('idle'); 
  const timeoutRef = useRef(null);

  const save = useCallback((newData) => {
    if (!user) {
      setStatus('idle'); // No user yet, don't error out
      return;
    }
    
    setStatus('saving');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      try {
        const userDocRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'data', 'board');
        await setDoc(userDocRef, newData, { merge: true });
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (error) {
        console.error("Save failed:", error);
        setStatus('error');
      }
    }, 1000); 
  }, [user]);

  return { status, save };
};

// --- Components ---

const Modal = ({ isOpen, onClose, title, children, preventClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          {!preventClose && <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>}
        </div>
        <div className="p-4 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};

const GameCard = ({ game, index, columnId, onDragStart, onMoveRequest, onDelete, onEdit, onToggleFavorite }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setShowMenu(false));

  const handleScoreClick = (e) => { e.stopPropagation(); onEdit(game, true); };
  const handleCardClick = (e) => { if (e.target.closest('button') || e.target.closest('.interactive-area')) return; onEdit(game, false); };

  return (
    <div draggable onDragStart={(e) => onDragStart(e, game.id, columnId)} onClick={handleCardClick} className="group relative bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-purple-500/50 rounded-xl p-3 mb-3 shadow-lg hover:shadow-purple-900/20 transition-all duration-200 cursor-grab active:cursor-grabbing select-none touch-manipulation">
      <div className="flex gap-4">
        <div className="w-20 h-28 rounded-lg shrink-0 shadow-inner flex items-center justify-center bg-cover bg-center relative overflow-hidden" style={{ background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[game.coverIndex % PLACEHOLDER_COVERS.length] }}>{!game.cover && <span className="text-white/20 font-bold text-xl relative z-10">{game.title.charAt(0)}</span>}{!game.cover && <div className="absolute inset-0 bg-black/10" />}</div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div>
            <h4 className="text-slate-100 font-bold text-base truncate leading-tight mb-1 group-hover:text-purple-300 transition-colors">{game.title}</h4>
            <div className="flex flex-wrap gap-1.5 opacity-80">{game.platform && <span className="px-1.5 py-0.5 bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider font-bold rounded max-w-full truncate">{game.platform}</span>}<span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-[10px] rounded">{game.genre}</span></div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-2 interactive-area">
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(game.id); }} className={`p-1.5 rounded-full transition-colors ${game.isFavorite ? 'text-red-500 bg-red-500/10' : 'text-slate-500 hover:text-red-400 hover:bg-slate-700'}`} title={game.isFavorite ? "Remove from Favorites" : "Add to Favorites"}><Heart size={18} className={game.isFavorite ? "fill-current" : ""} /></button>
            <div onClick={handleScoreClick} className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 hover:border-slate-500 cursor-pointer transition-colors"><Star size={12} className={game.rating > 0 ? "text-yellow-400 fill-current" : "text-slate-600"} /><span className={`text-xs font-bold ${game.rating > 0 ? 'text-slate-200' : 'text-slate-500'}`}>{game.rating > 0 ? game.rating : '--'}</span></div>
            <div className="h-4 w-px bg-slate-700 mx-1"></div>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded-full transition-colors"><MoreVertical size={18} /></button>
              {showMenu && (<div className="absolute right-0 top-8 bg-slate-900 border border-slate-700 shadow-xl rounded-lg z-20 w-40 overflow-hidden py-1"><button onClick={() => { onEdit(game, false); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-2"><ImageIcon size={14} /> View Card</button><div className="h-px bg-slate-800 my-1"></div><div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase border-b border-slate-800">Move to...</div><button onClick={() => onMoveRequest(game.id, 'backlog')} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-purple-900/30 hover:text-purple-300">To Play</button><button onClick={() => onMoveRequest(game.id, 'playing')} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-blue-900/30 hover:text-blue-300">Playing</button><button onClick={() => onMoveRequest(game.id, 'completed')} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-green-900/30 hover:text-green-300">Completed</button><div className="h-px bg-slate-800 my-1"></div><button onClick={() => onDelete(game.id)} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"><Trash2 size={14} /> Delete</button></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GridGameCard = ({ game, onMoveRequest, onDelete, onEdit, onToggleFavorite }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setShowMenu(false));

  return (
    <div onClick={() => onEdit(game, false)} className="group relative aspect-[3/4] rounded-xl overflow-hidden shadow-lg hover:shadow-purple-900/40 transition-all duration-300 hover:scale-105 bg-slate-800 border border-slate-700 cursor-pointer">
      <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" style={{ background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[game.coverIndex % PLACEHOLDER_COVERS.length] }}>{!game.cover && <div className="flex items-center justify-center h-full text-white/20 font-bold text-4xl">{game.title.charAt(0)}</div>}</div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />
      <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(game.id); }} className={`absolute top-2 left-2 p-1.5 rounded-full backdrop-blur-md transition-colors z-10 ${game.isFavorite ? 'bg-red-500 text-white shadow-lg' : 'bg-black/30 text-white/70 hover:bg-black/60 hover:text-red-400'}`}><Heart size={16} className={game.isFavorite ? "fill-current" : ""} /></button>
      {game.rating > 0 && (<div onClick={(e) => { e.stopPropagation(); onEdit(game, true); }} className={`absolute bottom-2 right-2 px-2 py-1 rounded-md text-xs font-bold shadow-lg backdrop-blur-sm z-10 flex items-center gap-1 hover:scale-110 transition-transform ${game.rating >= 9 ? 'bg-yellow-500 text-black' : game.rating >= 7 ? 'bg-green-600 text-white' : 'bg-slate-800 text-white border border-slate-600'}`}><Star size={10} className="fill-current" />{game.rating}</div>)}
      <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col justify-end pointer-events-none"><h4 className="text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow-md mb-4 group-hover:mb-1 transition-all">{game.title}</h4><div className="flex items-center gap-2 h-0 opacity-0 group-hover:h-auto group-hover:opacity-100 transition-all duration-300">{game.platform && <span className="text-[10px] text-slate-300 uppercase tracking-wider bg-black/50 px-1.5 py-0.5 rounded">{game.platform}</span>}</div></div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" ref={menuRef}><button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1.5 bg-black/60 text-white hover:bg-purple-600 rounded-full backdrop-blur-md"><MoreVertical size={16} /></button>{showMenu && (<div className="absolute right-0 top-8 bg-slate-900 border border-slate-700 shadow-xl rounded-lg z-20 w-32 overflow-hidden py-1"><button onClick={() => { onEdit(game, false); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2"><ImageIcon size={12} /> View Card</button><div className="h-px bg-slate-800 my-1"></div><button onClick={() => onDelete(game.id)} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/20">Delete</button></div>)}</div>
    </div>
  );
};

const Column = ({ column, games, onDragOver, onDrop, onDragStart, onMoveRequest, onDelete, isDraggingOver, filterPlatform, onHeaderClick, onEditColumn, onEditGame, onToggleFavorite }) => {
  const filteredItemIds = column.itemIds.filter(gameId => { if (!filterPlatform || filterPlatform === 'All') return true; const game = games[gameId]; return game?.platform?.toLowerCase().includes(filterPlatform.toLowerCase()); });
  return (
    <div onDragOver={(e) => onDragOver(e, column.id)} onDrop={(e) => onDrop(e, column.id)} className={`flex-shrink-0 w-80 max-w-[90vw] flex flex-col rounded-xl transition-colors duration-200 ${isDraggingOver ? 'bg-slate-800/50 ring-2 ring-purple-500/30' : 'bg-slate-900/40'}`}>
      <div onClick={() => onHeaderClick(column.id)} className="p-4 flex items-center justify-between border-b border-slate-800/50 cursor-pointer group hover:bg-slate-800/50 rounded-t-xl transition-colors relative"><div className="flex items-center gap-2 text-slate-200 font-bold tracking-wide"><span className={`p-2 rounded-lg transition-transform group-hover:scale-110 ${column.id === 'backlog' ? 'bg-slate-800 text-slate-400' : column.id === 'playing' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}><IconRenderer iconName={column.icon} /></span><span className="group-hover:text-white transition-colors">{column.title}</span><span className="ml-2 text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{filteredItemIds.length}</span></div><div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"><button onClick={(e) => { e.stopPropagation(); onEditColumn(column); }} className="p-1.5 hover:bg-slate-700 rounded-md text-slate-500 hover:text-white" title="Edit List"><Pencil size={14} /></button><LayoutGrid size={16} className="text-slate-600 ml-1" /></div></div>
      <div className="p-3 flex-1 overflow-y-auto min-h-[150px] max-h-[calc(100vh-220px)] custom-scrollbar">
        {filteredItemIds.map((gameId, index) => { const game = games[gameId]; if (!game) return null; return (<GameCard key={game.id} game={game} index={index} columnId={column.id} onDragStart={onDragStart} onMoveRequest={onMoveRequest} onDelete={onDelete} onEdit={onEditGame} onToggleFavorite={onToggleFavorite} />); })}
        {column.itemIds.length === 0 && <div className="h-32 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl"><GripVertical size={24} className="mb-2 opacity-50" /><span className="text-sm">Drop games here</span></div>}
        {column.itemIds.length > 0 && filteredItemIds.length === 0 && <div className="h-32 flex flex-col items-center justify-center text-slate-600"><span className="text-sm">No {filterPlatform} games</span></div>}
      </div>
    </div>
  );
};

const UserMenu = ({ user, onOpenProfile, onOpenSettings, onLogin, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setIsOpen(false));
  if (!user) return null;
  const displayName = user.isAnonymous ? 'Guest' : (user.displayName || 'User');

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all">{user.photoURL ? <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold uppercase">{displayName[0]}</div>}<span className="text-sm font-medium text-slate-300 max-w-[100px] truncate hidden sm:block">{displayName}</span></button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
            <div className="p-3 border-b border-slate-800"><div className="text-xs text-slate-500 mb-1">Currently playing as</div><div className="text-sm text-white font-medium truncate">{displayName}</div></div>
            <div className="p-2 flex flex-col gap-1">
              {!user.isAnonymous && <button onClick={() => { onOpenSettings(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"><Settings size={16} /> Settings</button>}
              {user.isAnonymous ? <button onClick={() => { onLogin(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"><LogIn size={16} /> Sign In with Google</button> : <button onClick={() => { onLogout(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"><LogOut size={16} /> Sign Out</button>}
              {!user.isAnonymous && <button onClick={() => { onOpenProfile(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"><Edit2 size={16} /> Edit Name</button>}
            </div>
        </div>
      )}
    </div>
  );
};

const LandingPage = ({ onStart, onLogin }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-center px-4 animate-in fade-in duration-500">
      <div className="bg-gradient-to-br from-purple-600 to-blue-600 p-6 rounded-3xl shadow-2xl shadow-purple-500/20 mb-8 transform hover:scale-105 transition-transform duration-300"><Gamepad2 size={64} className="text-white" /></div>
      <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">Track Your Gaming Journey</h2>
      <p className="text-slate-400 text-lg mb-10 max-w-md">Organize your backlog, manage current playthroughs, and celebrate your victories.</p>
      <div className="flex flex-col gap-4 w-full max-w-sm"><button onClick={onStart} className="group relative w-full py-4 bg-white text-slate-900 font-bold rounded-xl shadow-lg hover:shadow-white/10 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-2"><span>Start as Guest</span><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></button><div className="flex items-center gap-4 w-full"><div className="h-px bg-slate-800 flex-1"></div><span className="text-slate-600 text-sm">OR</span><div className="h-px bg-slate-800 flex-1"></div></div><button onClick={onLogin} className="w-full py-4 bg-slate-800 text-white font-semibold rounded-xl border border-slate-700 hover:border-slate-600 hover:bg-slate-750 transition-all flex items-center justify-center gap-2"><LogIn size={20} /><span>Continue with Google</span></button></div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true); 
  
  // Optimized Save Hook
  const { status: saveStatus, save: triggerSave } = useDebouncedSave(user);
  
  // View State
  const [activePlatformFilter, setActivePlatformFilter] = useState('All');
  const [zoomedColumnId, setZoomedColumnId] = useState(null); 
  const [isFavoritesView, setIsFavoritesView] = useState(false);
  
  // Modals
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnForm, setColumnForm] = useState({ id: '', title: '', icon: 'gamepad' });
  const [isEditingColumn, setIsEditingColumn] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  
  // Game Card Modal State
  const [isGameCardOpen, setIsGameCardOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [isGameCardEditing, setIsGameCardEditing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // New User Settings State
  const [userSettings, setUserSettings] = useState({
    privacy: '', 
    bio: '',
    displayName: '' // Consolidated Single Source of Truth
  });

  // User Search State
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const dataRef = useRef(INITIAL_DATA);
  const userRef = useRef(null);

  useEffect(() => { dataRef.current = data; }, [data]);

  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [activeDropZone, setActiveDropZone] = useState(null);

  // --- REFACTORED HELPERS (Robust Platform Logic) ---
  const getUniquePlatforms = () => {
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

  const getHiddenGamesCount = () => {
    if (activePlatformFilter === 'All') return 0;
    const allGames = Object.values(data.games || {});
    const visibleCount = allGames.filter(game => 
      game.platform?.toLowerCase().includes(activePlatformFilter.toLowerCase())
    ).length;
    return allGames.length - visibleCount;
  };

  const getFavoriteGames = () => {
    if (!data.games) return [];
    return Object.values(data.games).filter(game => game.isFavorite);
  };

  const hiddenGamesCount = getHiddenGamesCount();
  const favoriteGames = getFavoriteGames();

  // --- REFACTORED SAVEDATA (Functional Updates) ---
  const saveData = (updater) => {
    setData(prev => {
      const newData = typeof updater === 'function' ? updater(prev) : updater;
      triggerSave(newData);
      return newData;
    });
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).then(() => {
      onAuthStateChanged(auth, async (u) => {
        const prev = userRef.current;
        userRef.current = u;
        const guestData = (prev?.isAnonymous && !u?.isAnonymous && u) ? dataRef.current : null;
        setUser(u);
        setIsAuthLoading(false);
        if (u) {
          loadUserSettings(u.uid);
          // Sync Display Name from Auth if not locally set yet
          setUserSettings(prev => ({ ...prev, displayName: u.displayName || prev.displayName }));
          if (guestData) await performSmartMigration(guestData, u.uid);
        } else {
          signInAnonymously(auth);
        }
      });
    });
  }, []);

  const loadUserSettings = (uid) => {
    onSnapshot(doc(db, 'artifacts', APP_ID, 'users', uid, 'data', 'settings'), (snap) => {
      if (snap.exists()) {
        const settings = snap.data();
        setUserSettings(prev => ({ ...prev, ...settings }));
        if (!settings.privacy && !auth.currentUser?.isAnonymous) {
          setIsOnboardingModalOpen(true);
        }
      } else if (!auth.currentUser?.isAnonymous) {
        setIsOnboardingModalOpen(true);
      }
    });
  };

  const saveUserSettings = (newSettings) => {
    setUserSettings(newSettings);
    if (!user) return;
    setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'data', 'settings'), newSettings, { merge: true });
    
    const publicProfileRef = doc(db, 'artifacts', APP_ID, 'public_profiles', user.uid);
    if (newSettings.privacy !== 'private') {
      setDoc(publicProfileRef, {
        uid: user.uid,
        displayName: newSettings.displayName || user.displayName,
        photoURL: user.photoURL,
        privacy: newSettings.privacy,
        bio: newSettings.bio
      }, { merge: true });
    } else {
      setDoc(publicProfileRef, { privacy: 'private' }, { merge: true });
    }
  };

  // --- DEBUG: Force Create Profiles ---
  const createDebugProfiles = async () => {
    if (!user) return;
    try {
      const debugUsers = [
        { uid: 'debug_user_1', displayName: 'PixelWarrior', privacy: 'public', bio: 'I love RPGs' },
        { uid: 'debug_user_2', displayName: 'RetroGamer99', privacy: 'public', bio: 'NES era best era' },
        { uid: 'debug_user_3', displayName: 'SpeedRun_X', privacy: 'public', bio: 'Gotta go fast' }
      ];
      for (const u of debugUsers) await setDoc(doc(db, 'artifacts', APP_ID, 'public_profiles', u.uid), u);
      await setDoc(doc(db, 'artifacts', APP_ID, 'public_profiles', user.uid), { uid: user.uid, displayName: user.displayName || 'Me', privacy: 'public', bio: 'My profile' }, { merge: true });
      alert("Debug profiles created!");
    } catch (e) { alert("Error: " + e.message); }
  };

  const performSmartMigration = async (guestData, targetUid) => {
    if (!guestData?.games) return;
    try {
      // Migration doesn't use saveStatus to avoid conflict
      const targetRef = doc(db, 'artifacts', APP_ID, 'users', targetUid, 'data', 'board');
      const snap = await getDoc(targetRef);
      let finalData = guestData;
      if (snap.exists()) {
        const target = snap.data();
        const mergedGames = { ...target.games, ...guestData.games };
        const mergedCols = { ...target.columns };
        Object.keys(guestData.columns).forEach(cid => {
          if (mergedCols[cid]) {
            const newIds = guestData.columns[cid].itemIds.filter(id => !mergedCols[cid].itemIds.includes(id));
            mergedCols[cid].itemIds = [...mergedCols[cid].itemIds, ...newIds];
          }
        });
        finalData = { games: mergedGames, columns: mergedCols, columnOrder: target.columnOrder || INITIAL_DATA.columnOrder };
      }
      await setDoc(targetRef, finalData, { merge: true });
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!user) { setIsDataLoading(false); return; }
    setIsDataLoading(true);
    const timeout = setTimeout(() => setIsDataLoading(false), 3000);
    const unsub = onSnapshot(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'data', 'board'), (snap) => {
      clearTimeout(timeout);
      setData(snap.exists() ? snap.data() : INITIAL_DATA);
      setIsDataLoading(false);
    });
    return () => { clearTimeout(timeout); unsub(); };
  }, [user]);


  const handleLogin = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert(e.message); } };
  const handleLogout = () => signOut(auth);
  
  const handleUpdateProfile = async (e) => { 
    e.preventDefault(); 
    if(!user) return;
    await updateProfile(user, { displayName: userSettings.displayName });
    saveUserSettings(userSettings);
    setIsSettingsModalOpen(false); 
  };

  const handleOnboardingComplete = (e) => {
    e.preventDefault();
    if (!user) return;
    if (!userSettings.privacy) {
      alert("Please select a privacy level.");
      return;
    }
    saveUserSettings(userSettings);
    updateProfile(user, { displayName: userSettings.displayName });
    setIsOnboardingModalOpen(false);
  };

  const handleUserSearch = async (e) => {
    e.preventDefault();
    if (!userSearchQuery.trim()) {
      setUserSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    try {
      const q = query(collection(db, 'artifacts', APP_ID, 'public_profiles'), where("privacy", "==", "public"));
      const querySnapshot = await getDocs(q);
      const results = [];
      querySnapshot.forEach((doc) => {
        const p = doc.data();
        if (p.displayName && p.displayName.toLowerCase().includes(userSearchQuery.toLowerCase())) {
          results.push(p);
        }
      });
      setUserSearchResults(results);
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const searchGames = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); setSearchError(null); setSearchResults([]); try { const res = await fetch(`${BACKEND_URL}?search=${encodeURIComponent(searchQuery)}`); if (!res.ok) throw new Error(); const d = await res.json(); setSearchResults(d.results || []); } catch { setSearchError("Failed."); } finally { setIsSearching(false); } };
  
  const handleAddGameFromSearch = (g) => { 
    const newId = `g${Date.now()}`; 
    const target = zoomedColumnId || 'backlog'; 
    
    saveData(prev => {
      const newGame = { 
        id: newId, 
        title: g.name, 
        platform: g.platforms ? g.platforms.map(p=>p.platform.name).slice(0,2).join(', ') : 'Unk', 
        genre: g.genres?.[0]?.name || 'Gen', 
        year: g.released?.split('-')[0] || '', 
        cover: g.background_image, 
        coverIndex: 0, 
        rating: 0, 
        isFavorite: false 
      };
      
      return { 
        ...prev, 
        games: { ...prev.games, [newId]: newGame }, 
        columns: { 
          ...prev.columns, 
          [target]: { ...prev.columns[target], itemIds: [newId, ...prev.columns[target].itemIds] } 
        } 
      };
    });
    
    setIsAddModalOpen(false); 
    setSearchQuery(''); 
    setSearchResults([]); 
  };

  const openGameCard = (g, edit) => { setSelectedGame({ ...g }); setIsGameCardEditing(edit); setIsGameCardOpen(true); };
  
  const handleSaveGameCard = (e) => { 
    e.preventDefault(); 
    if (!selectedGame) return; 
    saveData(prev => ({ ...prev, games: { ...prev.games, [selectedGame.id]: selectedGame } })); 
    setIsGameCardEditing(false); 
  };
  
  const handleModalFavoriteToggle = () => { 
    if (!selectedGame) return; 
    const s = !selectedGame.isFavorite; 
    setSelectedGame(p => ({ ...p, isFavorite: s })); 
    saveData(prev => ({ ...prev, games: { ...prev.games, [selectedGame.id]: { ...prev.games[selectedGame.id], isFavorite: s } } })); 
  };

  const onDragStart = (e, id, c) => { setIsDragging(true); setDraggedItem({ gameId: id, sourceColId: c }); }; const onDragOver = (e, c) => { e.preventDefault(); if (activeDropZone !== c) setActiveDropZone(c); }; 
  
  const onDrop = (e, d) => { 
    e.preventDefault(); setIsDragging(false); setActiveDropZone(null); 
    if (!draggedItem || draggedItem.sourceColId === d) return; 
    const { gameId, sourceColId } = draggedItem; 
    
    saveData(prev => {
      const s = prev.columns[sourceColId];
      const f = prev.columns[d];
      return { 
        ...prev, 
        columns: { 
          ...prev.columns, 
          [sourceColId]: { ...s, itemIds: s.itemIds.filter(i => i !== gameId) }, 
          [d]: { ...f, itemIds: [...f.itemIds, gameId] } 
        } 
      };
    });
  };

  const handleManualMove = (id, d) => { 
    saveData(prev => {
      const sKey = Object.keys(prev.columns).find(k => prev.columns[k].itemIds.includes(id)); 
      if (!sKey || sKey === d) return prev; 
      const start = prev.columns[sKey];
      const finish = prev.columns[d];
      return { 
        ...prev, 
        columns: { 
          ...prev.columns, 
          [sKey]: { ...start, itemIds: start.itemIds.filter(i => i !== id) }, 
          [d]: { ...finish, itemIds: [...finish.itemIds, id] } 
        } 
      };
    });
  };

  const handleDeleteGame = (id) => { 
    saveData(prev => {
      const colKey = Object.keys(prev.columns).find(k => prev.columns[k].itemIds.includes(id));
      const ng = { ...prev.games }; 
      delete ng[id]; 
      const nc = { ...prev.columns }; 
      if (colKey) nc[colKey] = { ...nc[colKey], itemIds: nc[colKey].itemIds.filter(i => i !== id) }; 
      return { ...prev, games: ng, columns: nc };
    });
  };

  const toggleFavorite = (id) => { 
    saveData(prev => {
      const g = prev.games[id]; 
      if (!g) return prev;
      return { ...prev, games: { ...prev.games, [id]: { ...g, isFavorite: !g.isFavorite } } };
    });
  };

  const openAddColumnModal = () => { if (data.columnOrder.length < 5) { setColumnForm({ id: `col-${Date.now()}`, title: '', icon: 'gamepad' }); setIsEditingColumn(false); setIsColumnModalOpen(true); }};
  const openEditColumnModal = (c) => { setColumnForm({ id: c.id, title: c.title, icon: c.icon || 'gamepad' }); setIsEditingColumn(true); setIsColumnModalOpen(true); };
  
  const handleSaveColumn = (e) => { 
    e.preventDefault(); if (!columnForm.title.trim()) return; 
    saveData(prev => {
      let nd = { ...prev }; 
      if (isEditingColumn) nd.columns[columnForm.id] = { ...nd.columns[columnForm.id], title: columnForm.title, icon: columnForm.icon }; 
      else { nd.columns[columnForm.id] = { id: columnForm.id, title: columnForm.title, icon: columnForm.icon, itemIds: [] }; nd.columnOrder = [...nd.columnOrder, columnForm.id]; } 
      return nd;
    });
    setIsColumnModalOpen(false); 
  };

  const handleDeleteColumn = () => { 
    if (!isEditingColumn) return; 
    if (!window.confirm("Delete list?")) return; 
    const colId = columnForm.id; 
    saveData(prev => {
      const newOrder = prev.columnOrder.filter(id => id !== colId); 
      const newCols = { ...prev.columns }; 
      delete newCols[colId]; 
      return { ...prev, columnOrder: newOrder, columns: newCols };
    });
    setIsColumnModalOpen(false); 
  };

  const platforms = getUniquePlatforms();
  const showLanding = !isAuthLoading && !isDataLoading && user?.isAnonymous && (!data.games || Object.keys(data.games).length === 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans relative flex flex-col selection:bg-purple-500/30 selection:text-purple-200">
      <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 transition-opacity duration-300 ${saveStatus === 'idle' ? 'opacity-50 hover:opacity-100' : 'opacity-100'}`}>
        <div className="text-[10px] text-slate-600 font-mono bg-slate-900/50 px-2 py-1 rounded">{user ? `ID: ${user.uid.slice(0, 6)}...` : 'No User'}</div>
        <div className={`bg-slate-800 border ${saveStatus === 'error' ? 'border-red-500' : 'border-slate-700'} rounded-full px-4 py-2 flex items-center gap-2 shadow-xl`}>{saveStatus === 'saving' ? <><Loader2 size={16} className="animate-spin text-purple-400" /><span className="text-xs font-medium text-slate-300">Saving...</span></> : saveStatus === 'error' ? <><WifiOff size={16} className="text-red-400" /><span className="text-xs font-medium text-red-300">Sync Error</span></> : <><Check size={16} className="text-green-400" /><span className="text-xs font-medium text-slate-300">Saved</span></>}</div>
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 z-40 flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 p-2 rounded-lg shadow-lg shadow-purple-500/20"><Gamepad2 size={24} className="text-white" /></div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">Gengemz</h1>
          {!showLanding && (
            <div className="hidden md:flex ml-8 relative group">
              <Search className="absolute left-3 top-2.5 text-slate-500 group-focus-within:text-purple-400" size={16} />
              <form onSubmit={handleUserSearch} className="relative">
                <input 
                  type="text" 
                  placeholder="Find players..." 
                  value={userSearchQuery}
                  onChange={(e) => { setUserSearchQuery(e.target.value); }}
                  className="bg-slate-900 border border-slate-800 rounded-full pl-9 pr-10 py-2 text-sm text-white focus:border-purple-500 focus:w-64 w-48 transition-all outline-none"
                />
                <button 
                  type="submit"
                  className="absolute right-2 top-1.5 p-1 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {isSearchingUsers ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                </button>
              </form>
              {userSearchResults.length > 0 && userSearchQuery && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden p-1">
                  {userSearchResults.map(res => (
                    <div key={res.uid} className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded-lg cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs">{res.displayName?.[0]}</div>
                      <div>
                        <div className="text-sm font-bold text-slate-200">{res.displayName}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          {res.privacy === 'invite_only' && <Lock size={10} />}
                          {res.privacy === 'public' ? 'Public Profile' : 'Invite Only'}
                        </div>
                      </div>
                      <button className="ml-auto p-1.5 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600 hover:text-white"><UserPlus size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
           {!showLanding && !isDataLoading && <button onClick={() => { setZoomedColumnId(null); setIsFavoritesView(!isFavoritesView); }} className={`p-2 rounded-full transition-colors ${isFavoritesView ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-red-400 hover:bg-slate-800'}`} title="Favorites"><Heart size={20} className={isFavoritesView ? 'fill-red-400' : ''} /></button>}
           {isAuthLoading ? <Loader2 className="animate-spin text-slate-500" size={20} /> : <UserMenu user={user} onOpenSettings={() => setIsSettingsModalOpen(true)} onLogin={handleLogin} onOpenProfile={() => setIsSettingsModalOpen(true)} onLogout={handleLogout} />}
           {!showLanding && !isDataLoading && !isFavoritesView && <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20 active:scale-95"><Plus size={18} /><span className="hidden sm:inline">Add Game</span></button>}
        </div>
      </nav>

      {/* Onboarding Modal (Forced Privacy Selection) */}
      <Modal isOpen={isOnboardingModalOpen} title="Welcome to Gengemz!" preventClose={true}>
        <div className="space-y-6">
          <p className="text-slate-400 text-sm">To get started, please set up your profile privacy. You can change this later in Settings.</p>
          <form onSubmit={handleOnboardingComplete} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Display Name</label>
              <input 
                type="text" 
                value={userSettings.displayName} 
                onChange={(e) => setUserSettings({...userSettings, displayName: e.target.value})} 
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none" 
                placeholder="How should we call you?"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Privacy Level</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'public', label: 'Public', icon: Users, desc: 'Anyone can find and view your profile.' },
                  { id: 'invite_only', label: 'Invite Only', icon: Shield, desc: 'People can find you, but must request to follow.' },
                  { id: 'private', label: 'Private', icon: Lock, desc: 'Your profile is hidden. No social features.' }
                ].map(opt => (
                  <div 
                    key={opt.id}
                    onClick={() => setUserSettings({ ...userSettings, privacy: opt.id })}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${userSettings.privacy === opt.id ? 'bg-purple-600/10 border-purple-500 text-purple-200' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
                  >
                    <div className={`p-2 rounded-full ${userSettings.privacy === opt.id ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                      <opt.icon size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{opt.label}</div>
                      <div className="text-xs opacity-70">{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg">Start Your Journey</button>
          </form>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings & Privacy">
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Display Name</label>
            <input type="text" value={userSettings.displayName} onChange={(e) => setUserSettings({...userSettings, displayName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Profile Privacy</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'public', label: 'Public', icon: Users, desc: 'Visible to everyone' },
                { id: 'invite_only', label: 'Invite Only', icon: Shield, desc: 'Request to follow' },
                { id: 'private', label: 'Private', icon: Lock, desc: 'Hidden completely' }
              ].map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => setUserSettings({ ...userSettings, privacy: opt.id })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${userSettings.privacy === opt.id ? 'bg-purple-600/10 border-purple-500 text-purple-200' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
                >
                  <opt.icon size={20} className="mb-2" />
                  <div className="font-bold text-sm">{opt.label}</div>
                  <div className="text-[10px] opacity-70">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Bio</label>
            <textarea value={userSettings.bio || ''} onChange={(e) => setUserSettings({...userSettings, bio: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none h-24 resize-none" placeholder="Tell us about your gaming taste..." />
          </div>
          <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg">Save Settings</button>
          
          <div className="pt-4 border-t border-slate-800">
            <button 
              type="button" 
              onClick={createDebugProfiles}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 w-full justify-center p-2 border border-slate-700 rounded-lg hover:bg-slate-800"
            >
              <Database size={12} /> Initialize Database (Fix Search)
            </button>
          </div>
        </form>
      </Modal>

      {!showLanding && !isDataLoading && !zoomedColumnId && !isFavoritesView && platforms.length > 1 && (
        <div className="fixed top-16 left-0 right-0 h-12 bg-slate-950/90 backdrop-blur border-b border-slate-800 z-30 flex items-center justify-center px-4 overflow-x-auto">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <Filter size={14} className="text-slate-500 mr-2 shrink-0" />
            <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
              {platforms.map(p => (
                <button key={p} onClick={() => setActivePlatformFilter(p)} className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${activePlatformFilter === p ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{p}</button>
              ))}
            </div>
            {hiddenGamesCount > 0 && <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-800 animate-in fade-in slide-in-from-left-2"><EyeOff size={14} className="text-slate-600" /><span className="text-xs text-slate-500 font-medium whitespace-nowrap">{hiddenGamesCount} hidden</span></div>}
          </div>
        </div>
      )}

      <main className={`pt-32 pb-10 px-4 md:px-8 h-screen overflow-x-hidden ${showLanding || isFavoritesView ? 'pt-24' : ''} ${zoomedColumnId ? 'pt-24' : ''}`}>
        {isDataLoading ? (
          <div className="h-full flex items-center justify-center animate-in fade-in"><Loader2 size={40} className="animate-spin text-purple-600" /></div>
        ) : showLanding ? (
          <LandingPage onStart={() => setIsAddModalOpen(true)} onLogin={handleLogin} />
        ) : isFavoritesView ? (
          <div className="max-w-7xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6"><button onClick={() => setIsFavoritesView(false)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"><ArrowLeft size={20} /><span className="font-semibold">Back to Board</span></button></div>
            <div className="flex items-center gap-3 mb-6"><div className="p-3 rounded-xl bg-red-500/20 text-red-400"><Heart size={32} className="fill-current" /></div><div><h2 className="text-3xl font-bold text-white">Favorites Vault</h2><p className="text-slate-500 text-sm">{favoriteGames.length} cherished titles</p></div></div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {favoriteGames.map(game => <GridGameCard key={game.id} game={game} onMoveRequest={handleManualMove} onDelete={handleDeleteGame} onEdit={openGameCard} onToggleFavorite={toggleFavorite} />)}
            </div>
            {favoriteGames.length === 0 && <div className="h-64 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl"><Heart size={32} className="mb-4 opacity-50" /><span className="text-lg">No favorites yet. Add some love!</span></div>}
          </div>
        ) : zoomedColumnId ? (
          <div className="max-w-7xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setZoomedColumnId(null)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"><ArrowLeft size={20} /><span className="font-semibold">Back to Board</span></button>
              <div className="flex bg-slate-900 rounded-lg p-1">{data.columnOrder.map(colId => <button key={colId} onClick={() => setZoomedColumnId(colId)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${zoomedColumnId === colId ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>{data.columns[colId].title}</button>)}</div>
            </div>
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-3 rounded-xl ${zoomedColumnId === 'backlog' ? 'bg-slate-800 text-slate-400' : zoomedColumnId === 'playing' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}><IconRenderer iconName={data.columns[zoomedColumnId].icon} size={32} /></div>
              <div><div className="flex items-center gap-3"><h2 className="text-3xl font-bold text-white">{data.columns[zoomedColumnId].title}</h2><button onClick={() => openEditColumnModal(data.columns[zoomedColumnId])} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors"><Pencil size={18} /></button></div><p className="text-slate-500 text-sm">{data.columns[zoomedColumnId].itemIds.length} games in total</p></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {data.columns[zoomedColumnId].itemIds.filter(id => { if (activePlatformFilter === 'All') return true; return data.games[id]?.platform?.toLowerCase().includes(activePlatformFilter.toLowerCase()); }).map(gameId => <GridGameCard key={gameId} game={data.games[gameId]} onMoveRequest={handleManualMove} onDelete={handleDeleteGame} onEdit={openGameCard} onToggleFavorite={toggleFavorite} />)}
            </div>
            {data.columns[zoomedColumnId].itemIds.length === 0 && <div className="h-64 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl"><GripVertical size={32} className="mb-4 opacity-50" /><span className="text-lg">No games here yet</span></div>}
          </div>
        ) : (
          <div className="flex justify-center h-full"> 
            <div className="flex flex-col md:flex-row gap-6 items-start h-full overflow-x-auto pb-4 animate-in fade-in duration-500 max-w-full w-fit mx-auto px-4">
              {data.columnOrder.map((colId) => <Column key={colId} column={data.columns[colId]} games={data.games} isDraggingOver={activeDropZone === colId} onDragOver={onDragOver} onDrop={onDrop} onDragStart={onDragStart} onMoveRequest={handleManualMove} onDelete={handleDeleteGame} onEditGame={openGameCard} onToggleFavorite={toggleFavorite} filterPlatform={activePlatformFilter} onHeaderClick={setZoomedColumnId} onEditColumn={openEditColumnModal} />)}
              {data.columnOrder.length < 5 && <div className="shrink-0 w-80 p-4"><button onClick={openAddColumnModal} className="w-full h-32 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-600 hover:text-slate-400 hover:border-slate-600 hover:bg-slate-900/50 transition-all group"><Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" /><span className="font-semibold">Create List</span></button></div>}
            </div>
          </div>
        )}
      </main>

      <Modal isOpen={isGameCardOpen} onClose={() => setIsGameCardOpen(false)} title="Your Game Card">
        {selectedGame && (
          <form onSubmit={handleSaveGameCard} className="space-y-6">
            <div className="flex gap-5">
              <div className="w-32 h-44 rounded-xl shadow-2xl shrink-0 bg-cover bg-center border border-slate-700" style={{ background: selectedGame.cover ? `url(${selectedGame.cover}) center/cover` : PLACEHOLDER_COVERS[selectedGame.coverIndex % PLACEHOLDER_COVERS.length] }} />
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-start justify-between"><h3 className="text-2xl font-bold text-white leading-tight mb-1">{selectedGame.title}</h3><button type="button" onClick={() => setIsGameCardEditing(!isGameCardEditing)} className={`p-2 rounded-lg transition-colors ${isGameCardEditing ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`} title={isGameCardEditing ? "Editing Mode Active" : "Click to Edit Details"}>{isGameCardEditing ? <Unlock size={18} /> : <Pencil size={18} />}</button></div>
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">{selectedGame.year && <span className="flex items-center gap-1"><Calendar size={14} /> {selectedGame.year}</span>}<span>•</span><span>{selectedGame.platform}</span></div>
                <div className="flex gap-2 mt-auto">
                  <button type="button" onClick={handleModalFavoriteToggle} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${selectedGame.isFavorite ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Heart size={16} className={selectedGame.isFavorite ? "fill-current" : ""} /><span className="text-sm font-medium">{selectedGame.isFavorite ? 'Favorite' : 'Not Favorite'}</span></button>
                  <button type="button" onClick={() => setIsGameCardEditing(true)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${selectedGame.rating > 0 ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}><Star size={16} className={selectedGame.rating > 0 ? "fill-current" : ""} /><span className="text-sm font-bold">{selectedGame.rating || '--'} / 10</span></button>
                </div>
              </div>
            </div>
            {isGameCardEditing && (
              <div className="pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Platform</label><input type="text" value={selectedGame.platform} onChange={(e) => setSelectedGame({ ...selectedGame, platform: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Genre</label><input type="text" value={selectedGame.genre} onChange={(e) => setSelectedGame({ ...selectedGame, genre: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 outline-none" /></div>
                </div>
                <div className="mb-6"><div className="flex justify-between mb-2"><label className="block text-xs font-bold text-slate-500 uppercase">Rating Score</label><span className="text-sm font-mono text-purple-400">{selectedGame.rating} / 10</span></div><input type="range" min="0" max="10" value={selectedGame.rating || 0} onChange={(e) => setSelectedGame({ ...selectedGame, rating: parseInt(e.target.value) })} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-600" /></div>
                <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"><Save size={18} /> Save Changes</button>
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add to your games...">
        <div className="space-y-4">
          <form onSubmit={searchGames} className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-500" size={18} /><input autoFocus type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search database..." className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-purple-500" /></div><button type="submit" disabled={isSearching} className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50">{isSearching ? <Loader2 className="animate-spin" size={20} /> : 'Search'}</button></form>
          {searchError && <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-200 text-sm">{searchError}</div>}
          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">{searchResults.map(game => (<button key={game.id} onClick={() => handleAddGameFromSearch(game)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all text-left group"><div className="w-12 h-16 bg-slate-900 rounded shrink-0 bg-cover bg-center shadow-sm" style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}>{!game.background_image && <ImageIcon className="w-full h-full p-3 text-slate-700" />}</div><div className="flex-1 min-w-0"><h4 className="font-semibold text-slate-200 group-hover:text-white truncate">{game.name}</h4><div className="flex items-center gap-2 text-xs text-slate-500"><span>{game.released ? game.released.split('-')[0] : 'Unknown'}</span>{game.metacritic && (<span className={`px-1.5 rounded ${game.metacritic >= 75 ? 'bg-green-900/50 text-green-400' : game.metacritic >= 50 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-700 text-slate-400'}`}>{game.metacritic}</span>)}</div></div><Plus size={18} className="text-slate-600 group-hover:text-purple-400" /></button>))}</div>
        </div>
      </Modal>

      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Edit Profile">
        <form onSubmit={handleUpdateProfile} className="space-y-4"><p className="text-sm text-slate-400">Set a display name for your quest log.</p><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label><input type="text" value={userSettings.displayName} onChange={(e) => setUserSettings({...userSettings, displayName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none" /></div><div className="pt-4 flex gap-3"><button type="button" onClick={() => setIsProfileModalOpen(false)} className="flex-1 px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-lg">Cancel</button><button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg">Save Profile</button></div></form>
      </Modal>

      <Modal isOpen={isColumnModalOpen} onClose={() => setIsColumnModalOpen(false)} title={isEditingColumn ? "Edit List" : "Create New List"}>
        <form onSubmit={handleSaveColumn} className="space-y-6"><div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">List Title</label><input autoFocus type="text" value={columnForm.title} onChange={(e) => setColumnForm({ ...columnForm, title: e.target.value })} placeholder="e.g. Wishlist" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none" /></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Choose Icon</label><div className="grid grid-cols-6 gap-2">{Object.keys(COLUMN_ICONS).map(iconKey => (<button key={iconKey} type="button" onClick={() => setColumnForm({ ...columnForm, icon: iconKey })} className={`aspect-square flex items-center justify-center rounded-lg transition-all ${columnForm.icon === iconKey ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><IconRenderer iconName={iconKey} size={20} /></button>))}</div></div><div className="pt-2 flex gap-3">{isEditingColumn && <button type="button" onClick={handleDeleteColumn} className="px-4 py-2 bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded-lg border border-red-900/50"><Trash2 size={20} /></button>}<button type="button" onClick={() => setIsColumnModalOpen(false)} className="flex-1 px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-lg">Cancel</button><button type="submit" className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg">{isEditingColumn ? "Save Changes" : "Create List"}</button></div></form>
      </Modal>

      <style>{` .custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 20px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #475569; } `}</style>
    </div>
  );
}