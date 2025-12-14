import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, Gamepad2, Trophy, Clock, X, GripVertical, Trash2, 
  LogIn, LogOut, User as UserIcon, Loader2, Check, Edit2, Search, Image as ImageIcon
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, signOut, onAuthStateChanged, signInAnonymously, 
  signInWithCustomToken, updateProfile, signInWithPopup, GoogleAuthProvider
} from "firebase/auth";
import { 
  getFirestore, doc, onSnapshot, setDoc 
} from "firebase/firestore";

// --- Firebase Setup ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Constants ---

// Hardcoded for prototype convenience. 
// In a real production app, this should be proxied through a backend to prevent theft.
const RAWG_API_KEY = "e5fe5c904b9d4a518083fbb724b406b7"; 

const PLACEHOLDER_COVERS = [
  "linear-gradient(to bottom right, #ef4444, #b91c1c)",
  "linear-gradient(to bottom right, #3b82f6, #1d4ed8)", 
  "linear-gradient(to bottom right, #10b981, #047857)",
  "linear-gradient(to bottom right, #8b5cf6, #6d28d9)",
  "linear-gradient(to bottom right, #f59e0b, #b45309)",
];

const INITIAL_DATA = {
  games: {
    'g1': { id: 'g1', title: 'Elden Ring', platform: 'PC', genre: 'RPG', cover: null, coverIndex: 0 },
    'g2': { id: 'g2', title: 'Cyberpunk 2077', platform: 'PS5', genre: 'Action', cover: null, coverIndex: 1 },
    'g3': { id: 'g3', title: 'Hollow Knight', platform: 'Switch', genre: 'Metroidvania', cover: null, coverIndex: 2 },
    'g4': { id: 'g4', title: 'God of War: Ragnarok', platform: 'PS5', genre: 'Action', cover: null, coverIndex: 3 },
    'g5': { id: 'g5', title: 'Stardew Valley', platform: 'PC', genre: 'Sim', cover: null, coverIndex: 4 },
  },
  columns: {
    'backlog': { id: 'backlog', title: 'To Play', icon: 'clock', itemIds: ['g3', 'g5'] },
    'playing': { id: 'playing', title: 'Currently Playing', icon: 'gamepad', itemIds: ['g1'] },
    'completed': { id: 'completed', title: 'Victory Road', icon: 'trophy', itemIds: ['g2', 'g4'] },
  },
  columnOrder: ['backlog', 'playing', 'completed'],
};

// Helper to render icons stored as strings in DB
const IconRenderer = ({ iconName, size = 20 }) => {
  if (iconName === 'clock') return <Clock size={size} />;
  if (iconName === 'gamepad') return <Gamepad2 size={size} />;
  if (iconName === 'trophy') return <Trophy size={size} />;
  return null;
};

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

const GameCard = ({ game, index, columnId, onDragStart, onMoveRequest, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, game.id, columnId)}
      className="group relative bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-purple-500/50 rounded-xl p-3 mb-3 shadow-lg hover:shadow-purple-900/20 transition-all duration-200 cursor-grab active:cursor-grabbing select-none touch-manipulation"
    >
      <div className="flex gap-3">
        {/* Cover Art */}
        <div 
          className="w-16 h-20 rounded-lg shrink-0 shadow-inner flex items-center justify-center bg-cover bg-center relative overflow-hidden"
          style={{ 
            background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[game.coverIndex % PLACEHOLDER_COVERS.length] 
          }}
        >
          {!game.cover && <span className="text-white/20 font-bold text-xl relative z-10">{game.title.charAt(0)}</span>}
          {/* Gradient overlay for text readability if needed, mostly for the placeholder */}
          {!game.cover && <div className="absolute inset-0 bg-black/10" />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h4 className="text-slate-100 font-semibold text-sm truncate leading-tight mb-1">{game.title}</h4>
          <div className="flex flex-wrap gap-1 mb-2">
            {game.platform && (
               <span className="px-1.5 py-0.5 bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider font-bold rounded max-w-full truncate">{game.platform}</span>
            )}
            <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-[10px] rounded">{game.genre}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-1" ref={menuRef}>
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
          >
            <MoreVertical size={16} />
          </button>
          
          {showMenu && (
            <div className="absolute right-2 top-8 bg-slate-900 border border-slate-700 shadow-xl rounded-lg z-20 w-40 overflow-hidden py-1">
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
  );
};

const Column = ({ column, games, onDragOver, onDrop, onDragStart, onMoveRequest, onDelete, isDraggingOver }) => {
  return (
    <div 
      onDragOver={(e) => onDragOver(e, column.id)}
      onDrop={(e) => onDrop(e, column.id)}
      className={`flex-shrink-0 w-80 max-w-[90vw] flex flex-col rounded-xl transition-colors duration-200 ${
        isDraggingOver ? 'bg-slate-800/50 ring-2 ring-purple-500/30' : 'bg-slate-900/40'
      }`}
    >
      {/* Column Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-800/50">
        <div className="flex items-center gap-2 text-slate-200 font-bold tracking-wide">
          <span className={`p-2 rounded-lg ${
            column.id === 'backlog' ? 'bg-slate-800 text-slate-400' :
            column.id === 'playing' ? 'bg-blue-500/20 text-blue-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            <IconRenderer iconName={column.icon} />
          </span>
          {column.title}
          <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {column.itemIds.length}
          </span>
        </div>
      </div>

      {/* Drop Zone / List */}
      <div className="p-3 flex-1 overflow-y-auto min-h-[150px] max-h-[calc(100vh-220px)] custom-scrollbar">
        {column.itemIds.map((gameId, index) => {
          const game = games[gameId];
          if (!game) return null;
          return (
            <GameCard 
              key={game.id} 
              game={game} 
              index={index} 
              columnId={column.id} 
              onDragStart={onDragStart}
              onMoveRequest={onMoveRequest}
              onDelete={onDelete}
            />
          );
        })}
        {column.itemIds.length === 0 && (
          <div className="h-32 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl">
            <GripVertical size={24} className="mb-2 opacity-50" />
            <span className="text-sm">Drop games here</span>
          </div>
        )}
      </div>
    </div>
  );
};

const UserMenu = ({ user, onOpenProfile, onLogin, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const displayName = user.isAnonymous ? 'Guest' : (user.displayName || 'User');

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold uppercase">
              {displayName[0]}
          </div>
        )}
        <span className="text-sm font-medium text-slate-300 max-w-[100px] truncate hidden sm:block">
          {displayName}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
            <div className="p-3 border-b border-slate-800">
              <div className="text-xs text-slate-500 mb-1">Currently playing as</div>
              <div className="text-sm text-white font-medium truncate">{displayName}</div>
            </div>
            <div className="p-2 flex flex-col gap-1">
              {user.isAnonymous ? (
                <button 
                  onClick={() => { onLogin(); setIsOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  <LogIn size={16} /> Sign In with Google
                </button>
              ) : (
                <>
                  <button 
                    onClick={() => { onOpenProfile(); setIsOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} /> Edit Name
                  </button>
                  <button 
                    onClick={() => { onLogout(); setIsOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </>
              )}
              
              {user.isAnonymous && (
                <button 
                    onClick={() => { onOpenProfile(); setIsOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} /> Edit Guest Name
                </button>
              )}
            </div>
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [activeDropZone, setActiveDropZone] = useState(null);
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Profile Form
  const [profileName, setProfileName] = useState('');

  const saveTimeoutRef = useRef(null);

  // --- Auth & Persistence Logic ---

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
          await signInWithCustomToken(auth, __initial_auth_token);
        } catch (e) {
          await signInAnonymously(auth);
        }
      } else {
        await signInAnonymously(auth);
      }
      setIsAuthLoading(false);
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        signInAnonymously(auth).catch(console.error);
      } else {
        setProfileName(currentUser.displayName || '');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Load board data
    const boardRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'board');
    const unsabBoard = onSnapshot(boardRef, (docSnap) => {
      if (docSnap.exists()) setData(docSnap.data());
    });

    return () => {
      unsabBoard();
    };
  }, [user]);

  // Debounced Save
  const saveData = (newData) => {
    setData(newData);
    if (!user) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'board');
      setDoc(userDocRef, newData, { merge: true }).catch(err => console.error("Save failed:", err));
    }, 1000);
  };

  // --- RAWG Search Logic ---

  const searchGames = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      // Using the hardcoded global key
      const response = await fetch(`https://us-central1-gengemztest-9582e.cloudfunctions.net/searchGames`);
      const data = await response.json();
      
      if (data.results) {
        setSearchResults(data.results);
      } else {
        setSearchError("No results found.");
      }
    } catch (err) {
      console.error(err);
      setSearchError("Failed to fetch games. Please check network connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddGameFromSearch = (game) => {
    const newId = `g${Date.now()}`;
    
    // Extract platform names (take first 2 or default)
    const platformName = game.platforms 
      ? game.platforms.map(p => p.platform.name).slice(0, 2).join(', ') 
      : 'Unknown';

    // Extract genre (take first)
    const genreName = game.genres && game.genres.length > 0 
      ? game.genres[0].name 
      : 'General';

    const newGame = {
      id: newId,
      title: game.name,
      platform: platformName,
      genre: genreName,
      cover: game.background_image || null,
      coverIndex: Math.floor(Math.random() * 5), // Fallback index
    };

    const newData = {
      ...data,
      games: { ...data.games, [newId]: newGame },
      columns: {
        ...data.columns,
        'backlog': {
          ...data.columns.backlog,
          itemIds: [newId, ...data.columns.backlog.itemIds]
        }
      }
    };

    saveData(newData);
    setIsAddModalOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // --- Auth Handlers ---

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("Login failed: " + error.message);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      await updateProfile(user, { displayName: profileName });
      setUser({ ...user, displayName: profileName });
      setIsProfileModalOpen(false);
    } catch (error) {
      alert("Could not update profile");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setData(INITIAL_DATA); 
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // --- DnD Handlers ---

  const onDragStart = (e, gameId, sourceColId) => {
    setIsDragging(true);
    setDraggedItem({ gameId, sourceColId });
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e, colId) => {
    e.preventDefault();
    if (activeDropZone !== colId) {
      setActiveDropZone(colId);
    }
  };

  const onDrop = (e, destColId) => {
    e.preventDefault();
    setIsDragging(false);
    setActiveDropZone(null);

    if (!draggedItem) return;
    const { gameId, sourceColId } = draggedItem;

    if (sourceColId === destColId) return;

    const startCol = data.columns[sourceColId];
    const finishCol = data.columns[destColId];

    const newStartItemIds = Array.from(startCol.itemIds);
    newStartItemIds.splice(newStartItemIds.indexOf(gameId), 1);

    const newFinishItemIds = Array.from(finishCol.itemIds);
    newFinishItemIds.push(gameId);

    const newData = {
      ...data,
      columns: {
        ...data.columns,
        [sourceColId]: { ...startCol, itemIds: newStartItemIds },
        [destColId]: { ...finishCol, itemIds: newFinishItemIds },
      },
    };

    saveData(newData);
    setDraggedItem(null);
  };

  const handleManualMove = (gameId, destColId) => {
    let sourceColId = null;
    for (const colId in data.columns) {
      if (data.columns[colId].itemIds.includes(gameId)) {
        sourceColId = colId;
        break;
      }
    }

    if (!sourceColId || sourceColId === destColId) return;

    const startCol = data.columns[sourceColId];
    const finishCol = data.columns[destColId];

    const newStartItemIds = startCol.itemIds.filter(id => id !== gameId);
    const newFinishItemIds = [...finishCol.itemIds, gameId];

    const newData = {
      ...data,
      columns: {
        ...data.columns,
        [sourceColId]: { ...startCol, itemIds: newStartItemIds },
        [destColId]: { ...finishCol, itemIds: newFinishItemIds },
      },
    };
    saveData(newData);
  };

  const handleDeleteGame = (gameId) => {
    let sourceColId = null;
    for (const colId in data.columns) {
      if (data.columns[colId].itemIds.includes(gameId)) {
        sourceColId = colId;
        break;
      }
    }

    const newGames = { ...data.games };
    delete newGames[gameId];

    const newColumns = { ...data.columns };
    if (sourceColId) {
      newColumns[sourceColId] = {
        ...newColumns[sourceColId],
        itemIds: newColumns[sourceColId].itemIds.filter(id => id !== gameId)
      };
    }

    saveData({ ...data, games: newGames, columns: newColumns });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-purple-500/30 selection:text-purple-200">
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 z-40 flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 p-2 rounded-lg shadow-lg shadow-purple-500/20">
            <Gamepad2 size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
            QuestLog
          </h1>
        </div>

        <div className="flex items-center gap-4">
           {/* User Menu */}
           {isAuthLoading ? (
             <Loader2 className="animate-spin text-slate-500" size={20} />
           ) : (
             <UserMenu 
                user={user} 
                onLogin={handleLogin}
                onOpenProfile={() => setIsProfileModalOpen(true)} 
                onLogout={handleLogout} 
             />
           )}

          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20 active:scale-95"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Game</span>
          </button>
        </div>
      </nav>

      {/* Main Board Area */}
      <main className="pt-24 pb-10 px-4 md:px-8 h-screen overflow-x-hidden">
        <div className="flex flex-col md:flex-row gap-6 items-start h-full overflow-x-auto pb-4">
          {data.columnOrder.map((colId) => {
            const column = data.columns[colId];
            return (
              <Column
                key={column.id}
                column={column}
                games={data.games}
                isDraggingOver={activeDropZone === column.id}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragStart={onDragStart}
                onMoveRequest={handleManualMove}
                onDelete={handleDeleteGame}
              />
            );
          })}
        </div>
      </main>

      {/* Search / Add Game Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Search for a Quest"
      >
        <div className="space-y-4">
          <form onSubmit={searchGames} className="flex gap-2">
            <div className="relative flex-1">
               <Search className="absolute left-3 top-3 text-slate-500" size={18} />
               <input 
                autoFocus
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search database..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <button 
              type="submit"
              disabled={isSearching}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? <Loader2 className="animate-spin" size={20} /> : 'Search'}
            </button>
          </form>

          {searchError && (
            <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-200 text-sm">
              {searchError}
            </div>
          )}

          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
            {searchResults.length > 0 ? (
              searchResults.map(game => (
                <button
                  key={game.id}
                  onClick={() => handleAddGameFromSearch(game)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all text-left group"
                >
                  <div 
                    className="w-12 h-16 bg-slate-900 rounded shrink-0 bg-cover bg-center shadow-sm"
                    style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}
                  >
                    {!game.background_image && <ImageIcon className="w-full h-full p-3 text-slate-700" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-200 group-hover:text-white truncate">{game.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{game.released ? game.released.split('-')[0] : 'Unknown'}</span>
                      {game.metacritic && (
                        <span className={`px-1.5 rounded ${
                          game.metacritic >= 75 ? 'bg-green-900/50 text-green-400' : 
                          game.metacritic >= 50 ? 'bg-yellow-900/50 text-yellow-400' : 
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {game.metacritic}
                        </span>
                      )}
                    </div>
                  </div>
                  <Plus size={18} className="text-slate-600 group-hover:text-purple-400" />
                </button>
              ))
            ) : (
               !isSearching && !searchError && (
                 <div className="text-center text-slate-500 py-8 text-sm">
                   Enter a game title to begin your quest.
                 </div>
               )
            )}
          </div>
        </div>
      </Modal>

       {/* Profile Modal */}
       <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title="Edit Profile"
      >
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <p className="text-sm text-slate-400">Set a display name for your quest log.</p>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label>
            <input 
              type="text" 
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none"
            />
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setIsProfileModalOpen(false)} className="flex-1 px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-lg">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg">Save Profile</button>
          </div>
        </form>
      </Modal>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #334155;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #475569;
        }
      `}</style>
    </div>
  );
}