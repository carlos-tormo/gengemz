import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, MoreVertical, Gamepad2, X, GripVertical, Trash2,
  LogIn, LogOut, Loader2, Check, Edit2, Search, Image as ImageIcon,
  ArrowRight, Save, WifiOff, Filter, EyeOff, ArrowLeft, LayoutGrid, List,
  Pencil, Lock, Unlock, Calendar, Heart, Star,
  Settings, Users, UserPlus, Shield, Wrench, Database, Moon, Sun
} from 'lucide-react';
// Firebase imports
import { auth, db } from './config/firebase';
import { 
  signOut, onAuthStateChanged, signInAnonymously, 
  updateProfile, signInWithPopup, GoogleAuthProvider,
  setPersistence, browserLocalPersistence
} from "firebase/auth";
import { 
  doc, onSnapshot, setDoc, addDoc, getDoc, deleteDoc, collection, query, where, getDocs, updateDoc, serverTimestamp
} from "firebase/firestore";

// Constants and config
import { 
  APP_ID, BACKEND_URL, PLACEHOLDER_COVERS, INITIAL_DATA, COLUMN_ICONS
} from './config/constants';

// Components
import Modal from './components/Modal';
import IconRenderer from './components/IconRenderer';
import GameCard from './components/GameCard';
import GridGameCard from './components/GridGameCard';
import Column from './components/Column';
import UserMenu from './components/UserMenu';
import LandingPage from './components/LandingPage';

// Hooks
import useClickOutside from './hooks/useClickOutside';
import useDebouncedSave from './hooks/useDebouncedSave';
import useRelationships from './hooks/useRelationships';

// Utilities
import { 
  getUniquePlatforms, getHiddenGamesCount, getFavoriteGames, 
  findExistingGameIdByTitle, getGameColumnId, isGameOnBoard 
} from './utils/gameUtils';
import { saveData } from './utils/dataManagement';

// --- Main App Component ---

export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true); 
  
  // Optimized Save Hook
  const { status: saveStatus, save: triggerSave } = useDebouncedSave(user);
  const { relationships, follow, unfollow, block, unblock } = useRelationships(user);
  
  // View State
  const [activePlatformFilter, setActivePlatformFilter] = useState('All');
  const [zoomedColumnId, setZoomedColumnId] = useState(null); 
  const [isFavoritesView, setIsFavoritesView] = useState(false);
  
  // Modals
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnForm, setColumnForm] = useState({ id: '', title: '', icon: 'gamepad' });
  const [isEditingColumn, setIsEditingColumn] = useState(false);
  const [deleteMode, setDeleteMode] = useState('move'); // 'move' | 'delete'
  const [deleteTarget, setDeleteTarget] = useState('');

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

  // User Search / Social
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [userSearchError, setUserSearchError] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedProfileBoard, setSelectedProfileBoard] = useState(null);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const [isListView, setIsListView] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [isPlaylistsModalOpen, setIsPlaylistsModalOpen] = useState(false);
  const [isPlaylistDetailOpen, setIsPlaylistDetailOpen] = useState(false);
  const [isBrowsePlaylistsModalOpen, setIsBrowsePlaylistsModalOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');
  const [playlistSearchResults, setPlaylistSearchResults] = useState([]);
  const [isSearchingPlaylistGames, setIsSearchingPlaylistGames] = useState(false);
  const [playlistSearchError, setPlaylistSearchError] = useState(null);
  const [duplicateInfo, setDuplicateInfo] = useState(null); // { gameId, currentCol }
  const [duplicateTarget, setDuplicateTarget] = useState('');
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [openPlaylistMenuId, setOpenPlaylistMenuId] = useState(null);
  const [theme, setTheme] = useState('dark');
  const myPlaylists = playlists.filter(pl => pl.ownerUid === user?.uid);
  const publicBrowsePlaylists = playlists.filter(pl => pl.ownerUid && pl.ownerUid !== user?.uid && pl.privacy !== 'private');

  // New User Settings State
  const [userSettings, setUserSettings] = useState({
    privacy: '', 
    bio: '',
    displayName: '' // Consolidated Single Source of Truth
  });

  const dataRef = useRef(INITIAL_DATA);
  const userRef = useRef(null);
  const userSearchRef = useRef(null);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ggz-theme');
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch (err) {
      console.error('Theme load failed', err);
    }
  }, []);

  useEffect(() => {
    if (selectedPlaylist && selectedPlaylist.ownerUid !== user?.uid && selectedPlaylist.privacy === 'private') {
      setSelectedPlaylist(null);
      setIsPlaylistDetailOpen(false);
    }
  }, [selectedPlaylist, user]);

  useEffect(() => {
    try {
      localStorage.setItem('ggz-theme', theme);
    } catch (err) {
      console.error('Theme save failed', err);
    }
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  }, [theme]);

  useClickOutside(userSearchRef, () => {
    setUserSearchResults([]);
    setUserSearchError(null);
  });

  // Load playlists (public)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'playlists'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
      const data = docSnap.data();
      list.push({ id: docSnap.id, ...data, ownerUid: data.ownerUid || 'unknown' });
    });
    setPlaylists(list);
  }, (err) => console.error("Playlists load failed", err));
    return () => unsub();
  }, []);

  // Default delete options when opening the column modal
  useEffect(() => {
    if (!isColumnModalOpen) return;
    if (isEditingColumn) {
      const otherCols = data.columnOrder.filter(id => id !== columnForm.id);
      setDeleteMode(otherCols.length ? 'move' : 'delete');
      setDeleteTarget(otherCols[0] || '');
    } else {
      setDeleteMode('move');
      setDeleteTarget('');
    }
  }, [isColumnModalOpen, isEditingColumn, data.columnOrder, columnForm.id]);

  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [activeDropZone, setActiveDropZone] = useState(null);

  const hiddenGamesCount = getHiddenGamesCount(data, activePlatformFilter);
  const favoriteGames = getFavoriteGames(data);

  // --- REFACTORED SAVEDATA (Functional Updates) ---
  const save = saveData(setData, triggerSave);

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
    setUserSearchError(null);
    try {
      const q = query(collection(db, 'artifacts', APP_ID, 'public_profiles'), where("privacy", "in", ["public", "invite_only"]));
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
      setUserSearchError("Search failed. Try again.");
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const openProfile = async (profile) => {
    setSelectedProfile(profile);
    setSelectedProfileBoard(null);
    setIsProfileViewOpen(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'users', profile.uid, 'data', 'board'));
      if (snap.exists()) setSelectedProfileBoard(snap.data());
    } catch (err) {
      console.error("Failed to load profile board", err);
    }
  };

  const handleFollowAction = async (profile) => {
    if (!user) { alert("Please sign in to follow players."); return; }
    const isFollowing = !!relationships.following[profile.uid];
    const res = isFollowing ? await unfollow(profile.uid) : await follow(profile);
    if (!res?.ok && res?.error) {
      alert(res.error);
    }
  };

  const handleBlockAction = async (profile) => {
    if (!user) return;
    const res = await block(profile);
    if (!res?.ok && res?.error) {
      alert(res.error);
    }
  };

  const handlePlaylistSearch = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!playlistSearchQuery.trim()) {
      setPlaylistSearchResults([]);
      return;
    }
    setIsSearchingPlaylistGames(true);
    setPlaylistSearchError(null);
    try {
      const res = await fetch(`${BACKEND_URL}?search=${encodeURIComponent(playlistSearchQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      const d = await res.json();
      setPlaylistSearchResults(d.results || []);
    } catch (err) {
      console.error("Playlist search failed", err);
      setPlaylistSearchError("Search failed. Try again.");
    } finally {
      setIsSearchingPlaylistGames(false);
    }
  };

  const updatePlaylistFields = async (playlistId, fields) => {
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'playlists', playlistId), { ...fields, updatedAt: serverTimestamp() });
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(prev => prev ? { ...prev, ...fields } : prev);
      }
    } catch (err) {
      alert(err.message || "Failed to update playlist");
    }
  };

  const handleRenamePlaylist = async (pl) => {
    const newTitle = prompt("Edit playlist name", pl.title || '');
    if (!newTitle || !newTitle.trim()) return;
    await updatePlaylistFields(pl.id, { title: newTitle.trim() });
    setOpenPlaylistMenuId(null);
  };

  const handleUpdateDescription = async (pl) => {
    const newDesc = prompt("Playlist description", pl.description || '');
    if (newDesc === null) return;
    await updatePlaylistFields(pl.id, { description: newDesc });
  };

  const handleDeletePlaylist = async (pl) => {
    const confirmDelete = confirm(`Delete playlist "${pl.title}"?`);
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'playlists', pl.id));
      if (selectedPlaylist?.id === pl.id) {
        setSelectedPlaylist(null);
        setIsPlaylistDetailOpen(false);
      }
    } catch (err) {
      alert(err.message || "Failed to delete playlist");
    } finally {
      setOpenPlaylistMenuId(null);
    }
  };

  // --- Playlists ---
  const addPlaylistItemToList = (item, colId) => {
    const existingId = findExistingGameIdByTitle(data, item.title);
    if (existingId) {
      promptDuplicateMove(existingId);
      return;
    }
    const newId = `g${Date.now()}`;
    const target = colId && data.columns[colId] ? colId : data.columnOrder[0];
    save(prev => ({
      ...prev,
      games: { 
        ...prev.games, 
        [newId]: { 
          id: newId,
          title: item.title,
          platform: item.platform,
          genre: item.genre,
          year: item.year,
          cover: item.cover,
          coverIndex: item.coverIndex || 0,
          rating: item.rating || 0,
          isFavorite: item.isFavorite || false
        } 
      },
      columns: {
        ...prev.columns,
        [target]: {
          ...prev.columns[target],
          itemIds: [newId, ...prev.columns[target].itemIds]
        }
      }
    }));
  };

  const addGameToPlaylist = async (playlistId, game) => {
    if (!playlistId || !game) return;
    try {
      const plRef = doc(db, 'artifacts', APP_ID, 'playlists', playlistId);
      const snap = await getDoc(plRef);
      if (!snap.exists()) throw new Error("Playlist not found");
      const current = snap.data().items || [];
      const exists = current.some(item => item.originId === game.id || item.title === game.title);
      if (exists) {
        alert("Game already in playlist");
        return;
      }
      const newItem = {
        title: game.title,
        platform: game.platform,
        genre: game.genre,
        year: game.year,
        cover: game.cover,
        coverIndex: game.coverIndex || 0,
        rating: game.rating || 0,
        isFavorite: item.isFavorite || false,
        originId: game.id,
        sourceType: 'board'
      };
      await updateDoc(plRef, { items: [...current, newItem], updatedAt: serverTimestamp() });
    } catch (err) {
      console.error("Add to playlist failed", err);
      alert(err.message || "Failed to add to playlist");
    }
  };

  const createPlaceholderPlaylist = async () => {
    const baseName = 'New Playlist';
    const suffix = myPlaylists.reduce((max, pl) => {
      const m = pl.title && pl.title.match(/^New Playlist(?: \((\d+)\))?$/);
      if (!m) return max;
      const num = m[1] ? parseInt(m[1], 10) : 1;
      return Number.isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const nextIndex = suffix ? suffix + 1 : 1;
    const title = nextIndex === 1 ? baseName : `${baseName} (${nextIndex})`;
    setIsSavingPlaylist(true);
    try {
      const payload = {
        title,
        description: '',
        ownerUid: user?.uid || 'anon',
        ownerName: user?.displayName || 'Guest',
        privacy: 'public',
        items: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'artifacts', APP_ID, 'playlists'), payload);
      setSelectedPlaylist({ id: ref.id, ...payload });
      setIsPlaylistDetailOpen(true);
      setOpenPlaylistMenuId(null);
    } catch (err) {
      alert(err.message || "Failed to create playlist");
    } finally {
      setIsSavingPlaylist(false);
    }
  };

  const handleTogglePrivacy = async (pl) => {
    const nextPrivacy = pl.privacy === 'private' ? 'public' : 'private';
    await updatePlaylistFields(pl.id, { privacy: nextPrivacy });
    setOpenPlaylistMenuId(null);
  };

  const searchGames = async (e) => { e.preventDefault(); if (!searchQuery.trim()) return; setIsSearching(true); setSearchError(null); setSearchResults([]); try { const res = await fetch(`${BACKEND_URL}?search=${encodeURIComponent(searchQuery)}`); if (!res.ok) throw new Error(); const d = await res.json(); setSearchResults(d.results || []); } catch { setSearchError("Failed."); } finally { setIsSearching(false); } };
  
  const handleAddGameFromSearch = (g) => { 
    const existingId = findExistingGameIdByTitle(data, g.name);
    if (existingId) {
      promptDuplicateMove(existingId);
      return;
    }
    const newId = `g${Date.now()}`; 
    const target = zoomedColumnId || 'backlog'; 
    
    save(prev => {
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
    save(prev => ({ ...prev, games: { ...prev.games, [selectedGame.id]: selectedGame } })); 
    setIsGameCardEditing(false); 
  };
  
  const handleModalFavoriteToggle = () => { 
    if (!selectedGame) return; 
    const s = !selectedGame.isFavorite; 
    setSelectedGame(p => ({ ...p, isFavorite: s })); 
    save(prev => ({ ...prev, games: { ...prev.games, [selectedGame.id]: { ...prev.games[selectedGame.id], isFavorite: s } } })); 
  };

  const onDragStart = (e, id, c) => { setIsDragging(true); setDraggedItem({ gameId: id, sourceColId: c }); }; const onDragOver = (e, c) => { e.preventDefault(); if (activeDropZone !== c) setActiveDropZone(c); }; 
  
  const onDrop = (e, d) => { 
    e.preventDefault(); setIsDragging(false); setActiveDropZone(null); 
    if (!draggedItem || draggedItem.sourceColId === d) return; 
    const { gameId, sourceColId } = draggedItem; 
    
    save(prev => {
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
    save(prev => {
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
    save(prev => {
      const colKey = Object.keys(prev.columns).find(k => prev.columns[k].itemIds.includes(id));
      const ng = { ...prev.games }; 
      delete ng[id]; 
      const nc = { ...prev.columns }; 
      if (colKey) nc[colKey] = { ...nc[colKey], itemIds: nc[colKey].itemIds.filter(i => i !== id) }; 
      return { ...prev, games: ng, columns: nc };
    });
  };

  const toggleFavorite = (id) => { 
    save(prev => {
      const g = prev.games[id]; 
      if (!g) return prev;
      return { ...prev, games: { ...prev.games, [id]: { ...g, isFavorite: !g.isFavorite } } };
    });
  };

  const openAddColumnModal = () => { if (data.columnOrder.length < 5) { setColumnForm({ id: `col-${Date.now()}`, title: '', icon: 'gamepad' }); setIsEditingColumn(false); setIsColumnModalOpen(true); }};
  const openEditColumnModal = (c) => { setColumnForm({ id: c.id, title: c.title, icon: c.icon || 'gamepad' }); setIsEditingColumn(true); setIsColumnModalOpen(true); };
  
  const handleSaveColumn = (e) => { 
    e.preventDefault(); if (!columnForm.title.trim()) return; 
    save(prev => {
      let nd = { ...prev }; 
      if (isEditingColumn) nd.columns[columnForm.id] = { ...nd.columns[columnForm.id], title: columnForm.title, icon: columnForm.icon }; 
      else { nd.columns[columnForm.id] = { id: columnForm.id, title: columnForm.title, icon: columnForm.icon, itemIds: [] }; nd.columnOrder = [...nd.columnOrder, columnForm.id]; } 
      return nd;
    });
    setIsColumnModalOpen(false); 
  };

  const handleDeleteColumn = () => { 
    if (!isEditingColumn) return; 
    const colId = columnForm.id; 
    const otherCols = data.columnOrder.filter(id => id !== colId);

    if (deleteMode === 'move' && otherCols.length === 0) {
      alert("No other lists available. Choose delete or create another list first.");
      return;
    }

    const dest = deleteMode === 'move' ? (deleteTarget || otherCols[0]) : null;

    save(prev => {
      const newOrder = prev.columnOrder.filter(id => id !== colId); 
      const newCols = { ...prev.columns }; 
      const itemsToMove = newCols[colId]?.itemIds || [];
      let newGames = prev.games;

      if (deleteMode === 'move' && dest && newCols[dest]) {
        const deduped = itemsToMove.filter(id => !newCols[dest].itemIds.includes(id));
        newCols[dest] = {
          ...newCols[dest],
          itemIds: [...deduped, ...newCols[dest].itemIds]
        };
      } else if (deleteMode === 'delete') {
        newGames = { ...prev.games };
        itemsToMove.forEach(id => { delete newGames[id]; });
      }

      delete newCols[colId]; 
      return { ...prev, columnOrder: newOrder, columns: newCols, games: newGames };
    });
    setIsColumnModalOpen(false); 
  };

  const platforms = getUniquePlatforms(data);
  const showLanding = !isAuthLoading && !isDataLoading && user?.isAnonymous && (!data.games || Object.keys(data.games).length === 0);
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'theme-light' : 'theme-dark'} bg-[var(--bg)] text-[var(--text)] font-sans relative flex flex-col selection:bg-[var(--accent)] selection:text-[var(--panel)] transition-colors`}>
      <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 transition-opacity duration-300 ${saveStatus === 'idle' ? 'opacity-50 hover:opacity-100' : 'opacity-100'}`}>
        <div className="text-[10px] text-slate-600 font-mono bg-slate-900/50 px-2 py-1 rounded">{user ? `ID: ${user.uid.slice(0, 6)}...` : 'No User'}</div>
        <div className={`bg-slate-800 border ${saveStatus === 'error' ? 'border-red-500' : 'border-slate-700'} rounded-full px-4 py-2 flex items-center gap-2 shadow-xl`}>{saveStatus === 'saving' ? <><Loader2 size={16} className="animate-spin text-purple-400" /><span className="text-xs font-medium text-slate-300">Saving...</span></> : saveStatus === 'error' ? <><WifiOff size={16} className="text-red-400" /><span className="text-xs font-medium text-red-300">Sync Error</span></> : <><Check size={16} className="text-green-400" /><span className="text-xs font-medium text-slate-300">Saved</span></>}</div>
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 bg-[var(--glass)] backdrop-blur-md border-b border-[var(--border)] z-40 flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 p-2 rounded-lg shadow-lg shadow-purple-500/20"><Gamepad2 size={24} className="text-white" /></div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">Gengemz</h1>
          {!showLanding && (
            <div className="hidden md:flex ml-8 relative group" ref={userSearchRef}>
              <Search className="absolute left-3 top-2.5 text-slate-500 group-focus-within:text-purple-400" size={16} />
              <form onSubmit={handleUserSearch} className="relative">
                <input 
                  type="text" 
                  placeholder="Find players..." 
                  value={userSearchQuery}
                  onChange={(e) => { setUserSearchQuery(e.target.value); }}
                  className="bg-[var(--panel)] border border-[var(--border)] rounded-full pl-9 pr-10 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:w-64 w-48 transition-all outline-none placeholder:text-[var(--text-muted)]"
                />
                <button 
                  type="submit"
                  className="absolute right-2 top-1.5 p-1 bg-[var(--panel-muted)] rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-strong)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border)]"
                >
                  {isSearchingUsers ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                </button>
              </form>
              {(userSearchResults.length > 0 || userSearchError) && userSearchQuery && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden z-40 w-80">
                  {userSearchError && <div className="px-3 py-2 text-xs text-red-600 bg-red-100 border-b border-red-200">{userSearchError}</div>}
                  <div className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto custom-scrollbar">
                    {userSearchResults.map(res => (
                      <div key={res.uid} className="flex items-center gap-3 p-2 hover:bg-[var(--panel-muted)] rounded-lg cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-[var(--panel-muted)] flex items-center justify-center font-bold text-xs uppercase text-[var(--text)]">{res.displayName?.[0]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-[var(--text)] truncate">{res.displayName}</div>
                          <div className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                            {res.privacy === 'invite_only' && <Lock size={10} />}
                            {res.privacy === 'public' ? 'Public Profile' : 'Invite Only'}
                          </div>
                        </div>
                        <button onClick={() => openProfile(res)} className="p-1.5 bg-[var(--panel-strong)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-muted)] transition-colors border border-[var(--border)]" title="View profile">
                          <Users size={14} />
                        </button>
                        <button onClick={() => handleFollowAction(res)} className="p-1.5 bg-purple-600/20 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-600 hover:text-white transition-colors" title="Follow">
                          <UserPlus size={14} />
                        </button>
                      </div>
                    ))}
                    {userSearchResults.length === 0 && !userSearchError && (
                      <div className="p-3 text-xs text-[var(--text-muted)]">No players found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
           {!isDataLoading && (
             <button
               onClick={toggleTheme}
               className="p-2 rounded-full bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
               title={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
             >
               {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
             </button>
           )}
           {!showLanding && !isDataLoading && <button onClick={() => { setZoomedColumnId(null); setIsFavoritesView(!isFavoritesView); }} className={`p-2 rounded-full transition-colors ${isFavoritesView ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-red-400 hover:bg-slate-800'}`} title="Favorites"><Heart size={20} className={isFavoritesView ? 'fill-red-400' : ''} /></button>}
           {!showLanding && !isDataLoading && !isFavoritesView && (
             <button
               onClick={() => setIsListView(!isListView)}
               className={`p-2 rounded-full transition-colors ${isListView ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
               title={isListView ? "Grid view" : "List view"}
             >
               <List size={18} />
             </button>
           )}
           {!showLanding && !isDataLoading && !isFavoritesView && (
             <button
               onClick={() => { setIsPlaylistsModalOpen(true); setIsPlaylistDetailOpen(false); }}
               className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
               title="Playlists"
             >
               <LayoutGrid size={18} />
             </button>
           )}
           {isAuthLoading ? <Loader2 className="animate-spin text-slate-500" size={20} /> : <UserMenu user={user} onOpenSettings={() => setIsSettingsModalOpen(true)} onLogin={handleLogin} onOpenProfile={() => setIsSettingsModalOpen(true)} onLogout={handleLogout} onOpenFriends={() => setIsFriendsModalOpen(true)} />}
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
        <div className="fixed top-16 left-0 right-0 h-12 bg-[var(--glass)] backdrop-blur border-b border-[var(--border)] z-30 flex items-center justify-center px-4 overflow-x-auto">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <Filter size={14} className="text-[var(--text-muted)] mr-2 shrink-0" />
            <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
              {platforms.map(p => (
                <button key={p} onClick={() => setActivePlatformFilter(p)} className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${activePlatformFilter === p ? 'bg-[var(--accent)] text-white shadow-lg' : 'bg-[var(--panel)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]'}`}>{p}</button>
              ))}
            </div>
            {hiddenGamesCount > 0 && <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-[var(--border)] animate-in fade-in slide-in-from-left-2"><EyeOff size={14} className="text-[var(--text-muted)]" /><span className="text-xs text-[var(--text-muted)] font-medium whitespace-nowrap">{hiddenGamesCount} hidden</span></div>}
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
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setIsFavoritesView(false)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
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
                <p className="text-[var(--text-muted)] text-sm">{favoriteGames.length} cherished titles</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl-grid-cols-5 gap-6">
              {favoriteGames.map(game => <GridGameCard key={game.id} game={game} onMoveRequest={handleManualMove} onDelete={handleDeleteGame} onEdit={openGameCard} onToggleFavorite={toggleFavorite} />)}
            </div>
            {favoriteGames.length === 0 && (
              <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--panel)]/30">
                <Heart size={32} className="mb-4 opacity-50" />
                <span className="text-lg">No favorites yet. Add some love!</span>
              </div>
            )}
          </div>
        ) : zoomedColumnId ? (
          <div className="max-w-7xl mx-auto animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setZoomedColumnId(null)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"><ArrowLeft size={20} /><span className="font-semibold">Back to Board</span></button>
              <div className="flex bg-slate-900 rounded-lg p-1">{data.columnOrder.map(colId => <button key={colId} onClick={() => setZoomedColumnId(colId)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${colId === zoomedColumnId ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}>{data.columns[colId].title}</button>)}</div>
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
          isListView ? (
          <div className="max-w-6xl mx-auto px-4">
              <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-[var(--border)] text-xs uppercase text-[var(--text-muted)] tracking-wide">All Games</div>
                <div className="divide-y divide-[var(--border)]">
                  {Object.values(data.games)
                    .filter(g => activePlatformFilter === 'All' || g.platform?.toLowerCase().includes(activePlatformFilter.toLowerCase()))
                    .map(game => {
                      const colId = data.columnOrder.find(c => data.columns[c].itemIds.includes(game.id)) || 'unknown';
                      return (
                        <div key={game.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 hover:bg-[var(--panel-muted)] transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-16 rounded-md bg-[var(--panel-muted)] overflow-hidden bg-cover bg-center border border-[var(--border)]" style={{ background: game.cover ? `url(${game.cover}) center/cover` : PLACEHOLDER_COVERS[(game.coverIndex ?? 0) % PLACEHOLDER_COVERS.length] }} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-[var(--text)] truncate">{game.title}</div>
                                {game.rating > 0 && <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--panel-muted)] text-[var(--text)] border border-[var(--border)]">{game.rating}/10</span>}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] truncate">{game.platform} · {game.genre}</div>
                              <div className="text-[11px] text-[var(--text-muted)] mt-1">List: {data.columns[colId]?.title || 'Unknown'}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 ml-auto">
                            <button onClick={() => save(prev => ({ ...prev, games: { ...prev.games, [game.id]: { ...prev.games[game.id], isFavorite: !game.isFavorite } } }))} className={`p-2 rounded-md border ${game.isFavorite ? 'bg-red-100 text-red-600 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/50' : 'bg-[var(--panel)] text-[var(--text-muted)] border-[var(--border)] hover:text-red-500 hover:border-red-300'}`} title="Favorite">
                              <Heart size={16} className={game.isFavorite ? 'fill-current' : ''} />
                            </button>
                            <button onClick={() => openGameCard(game, false)} className="p-2 rounded-md bg-[var(--panel)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)]" title="Open">
                              <Pencil size={16} />
                            </button>
                            <div className="flex items-center gap-1 text-[11px] text-slate-400">
                              {data.columnOrder.map(cid => (
                                <button key={cid} onClick={() => handleManualMove(game.id, cid)} className={`px-2 py-1 rounded border text-[var(--text-muted)] ${cid === colId ? 'border-[var(--border)] bg-[var(--panel-muted)]' : 'border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--text)]'}`}>
                                  {data.columns[cid].title}
                                </button>
                              ))}
                            </div>
                            <button onClick={() => handleDeleteGame(game.id)} className="p-2 rounded-md bg-[var(--panel)] text-red-600 border border-[var(--border)] hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/30" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {Object.keys(data.games).length === 0 && (
                    <div className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">No games yet.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center h-full"> 
              <div className="flex flex-col md:flex-row gap-6 items-start h-full overflow-x-auto pb-4 animate-in fade-in duration-500 max-w-full w-fit mx-auto px-4">
              {data.columnOrder.map((colId) => <Column key={colId} column={data.columns[colId]} games={data.games} isDraggingOver={activeDropZone === colId} onDragOver={onDragOver} onDrop={onDrop} onDragStart={onDragStart} onMoveRequest={handleManualMove} onDelete={handleDeleteGame} onEditGame={openGameCard} onToggleFavorite={toggleFavorite} filterPlatform={activePlatformFilter} onHeaderClick={setZoomedColumnId} onEditColumn={openEditColumnModal} playlists={playlists} onAddToPlaylist={addGameToPlaylist} />)}
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
          )
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
          <form onSubmit={searchGames} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-[var(--text-muted)]" size={18} />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search database..."
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
          {searchError && <div className="p-3 bg-red-100 border border-red-200 rounded-lg text-red-700 text-sm">{searchError}</div>}
          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
            {searchResults.map(game => (
              <button
                key={game.id}
                onClick={() => handleAddGameFromSearch(game)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--panel-muted)] border border-transparent hover:border-[var(--accent)]/40 transition-all text-left group bg-[var(--panel)]"
              >
                <div
                  className="w-12 h-16 bg-[var(--panel-muted)] rounded shrink-0 bg-cover bg-center shadow-sm border border-[var(--border)]"
                  style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}
                >
                  {!game.background_image && <ImageIcon className="w-full h-full p-3 text-[var(--text-muted)]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[var(--text)] group-hover:text-[var(--accent)] truncate">{game.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{game.released ? game.released.split('-')[0] : 'Unknown'}</span>
                    {game.metacritic && (
                      <span className={`px-1.5 rounded ${game.metacritic >= 75 ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : game.metacritic >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' : 'bg-[var(--panel-muted)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                        {game.metacritic}
                      </span>
                    )}
                  </div>
                </div>
                <Plus size={18} className="text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Edit Profile">
        <form onSubmit={handleUpdateProfile} className="space-y-4"><p className="text-sm text-slate-400">Set a display name for your quest log.</p><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label><input type="text" value={userSettings.displayName} onChange={(e) => setUserSettings({...userSettings, displayName: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none" /></div><div className="pt-4 flex gap-3"><button type="button" onClick={() => setIsProfileModalOpen(false)} className="flex-1 px-4 py-2 text-slate-400 hover:bg-slate-800 rounded-lg">Cancel</button><button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg">Save Profile</button></div></form>
      </Modal>

      {/* Duplicate game modal */}
      <Modal isOpen={isDuplicateModalOpen} onClose={() => setIsDuplicateModalOpen(false)} title="Game already added">
        <div className="space-y-4">
          <div className="text-sm text-slate-400">You have this game already added to a list. Would you like to move it to a different list instead?</div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Choose destination list</label>
            <select
              value={duplicateTarget}
              onChange={(e) => setDuplicateTarget(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white text-sm"
            >
              {data.columnOrder.map(cid => (
                <option key={cid} value={cid}>{data.columns[cid].title}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsDuplicateModalOpen(false)} className="px-4 py-2 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm">Close</button>
              <button
                onClick={() => {
                  if (duplicateInfo?.gameId && duplicateTarget) {
                  handleManualMove(duplicateInfo.gameId, duplicateTarget);
                }
                setIsDuplicateModalOpen(false);
              }}
              className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
            >
              Move game
            </button>
          </div>
        </div>
      </Modal>

      {/* Profile View Modal */}
      <Modal isOpen={isProfileViewOpen} onClose={() => setIsProfileViewOpen(false)} title={selectedProfile ? selectedProfile.displayName : 'Profile'}>
        {selectedProfile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[var(--panel-muted)] text-[var(--text)] flex items-center justify-center uppercase font-bold border border-[var(--border)]">
                {selectedProfile.displayName?.[0] || 'P'}
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold text-[var(--text)]">{selectedProfile.displayName}</div>
                <div className="text-xs text-[var(--text-muted)]">{selectedProfile.privacy === 'invite_only' ? 'Invite only' : 'Public profile'}</div>
              </div>
              {user && selectedProfile.uid !== user.uid && (
                <div className="flex gap-2">
                  <button onClick={() => handleFollowAction(selectedProfile)} className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm font-semibold">
                    {relationships.following[selectedProfile.uid] ? 'Unfollow' : (selectedProfile.privacy === 'invite_only' ? 'Request' : 'Follow')}
                  </button>
                  <button onClick={() => handleBlockAction(selectedProfile)} className="px-3 py-1.5 rounded bg-red-100 text-red-700 text-sm border border-red-200 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800">Block</button>
                </div>
              )}
            </div>
            <div className="text-sm text-[var(--text)]">{selectedProfile.bio || 'No bio provided.'}</div>
            <div>
              <div className="text-xs uppercase text-[var(--text-muted)] mb-2">Board Preview</div>
              {selectedProfileBoard ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {selectedProfileBoard.columnOrder.map(colId => (
                    <div key={colId} className="bg-[var(--panel)] border border-[var(--border)] rounded-lg p-3 shadow-sm">
                      <div className="text-sm font-semibold text-[var(--text)] mb-2">{selectedProfileBoard.columns[colId].title}</div>
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {selectedProfileBoard.columns[colId].itemIds.slice(0,5).map(id => (
                          <div key={id} className="text-xs text-[var(--text)] truncate">{selectedProfileBoard.games[id]?.title || 'Untitled'}</div>
                        ))}
                        {selectedProfileBoard.columns[colId].itemIds.length === 0 && <div className="text-xs text-[var(--text-muted)]">Empty</div>}
                        {selectedProfileBoard.columns[colId].itemIds.length > 5 && <div className="text-[11px] text-[var(--text-muted)]">+{selectedProfileBoard.columns[colId].itemIds.length - 5} more</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">Loading board...</div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-[var(--text-muted)]">Select a profile to view.</div>
        )}
      </Modal>

      {/* Friends / Connections Modal */}
      <Modal isOpen={isFriendsModalOpen} onClose={() => setIsFriendsModalOpen(false)} title="Connections">
        <div className="space-y-4">
          <section>
            <div className="text-xs uppercase text-slate-500 mb-2">Following</div>
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {Object.values(relationships.following || {}).map(p => (
                <div key={p.uid} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center uppercase text-sm font-bold">{p.displayName?.[0] || 'P'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{p.displayName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{p.status === 'pending' ? 'Request sent' : 'Following'}</div>
                  </div>
                  <button onClick={() => openProfile(p)} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200">View</button>
                  <button onClick={() => unfollow(p.uid)} className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-200">Unfollow</button>
                </div>
              ))}
              {Object.keys(relationships.following || {}).length === 0 && <div className="text-xs text-slate-600">Not following anyone yet.</div>}
            </div>
          </section>

          <section>
            <div className="text-xs uppercase text-slate-500 mb-2">Followers</div>
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {Object.values(relationships.followers || {}).map(p => (
                <div key={p.uid} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center uppercase text-sm font-bold">{p.displayName?.[0] || 'P'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{p.displayName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{p.status || 'Follower'}</div>
                  </div>
                  <button onClick={() => openProfile(p)} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200">View</button>
                  <button onClick={() => handleBlockAction(p)} className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-200">Block</button>
                </div>
              ))}
              {Object.keys(relationships.followers || {}).length === 0 && <div className="text-xs text-slate-600">No followers yet.</div>}
            </div>
          </section>

          <section>
            <div className="text-xs uppercase text-slate-500 mb-2">Blocked</div>
            <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
              {Object.values(relationships.blocked || {}).map(p => (
                <div key={p.uid} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center uppercase text-sm font-bold">{p.displayName?.[0] || 'P'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{p.displayName}</div>
                    <div className="text-[11px] text-slate-500 truncate">Blocked</div>
                  </div>
                  <button onClick={() => unblock(p.uid)} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200">Unblock</button>
                </div>
              ))}
              {Object.keys(relationships.blocked || {}).length === 0 && <div className="text-xs text-slate-600">No blocked users.</div>}
            </div>
          </section>
        </div>
      </Modal>

      {/* Playlists Modal - Redesigned */}
      <Modal
        isOpen={isPlaylistsModalOpen}
        onClose={() => setIsPlaylistsModalOpen(false)}
        title=""
        contentClassName="max-w-6xl w-full h-[80vh] max-h-[90vh]"
      >
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 h-full min-h-0">
          {/* Left rail */}
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-3 flex flex-col gap-3 h-full min-h-0">
            <div className="flex items-center justify-between px-2">
              <div className="text-sm font-semibold text-[var(--text)]">Your Playlists</div>
              <button
                onClick={() => setIsBrowsePlaylistsModalOpen(true)}
                className="text-[11px] px-2 py-1 rounded bg-[var(--panel-muted)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--accent)]"
              >
                Browse
              </button>
            </div>
            <div className="flex-1 space-y-1 pr-1">
              {myPlaylists.length === 0 && (
                <div className="text-xs text-[var(--text-muted)] px-2 py-2">No playlists yet.</div>
              )}
              {myPlaylists.map(pl => (
                <div key={pl.id} className="relative">
                  <button
                    onClick={() => { setSelectedPlaylist(pl); setIsPlaylistDetailOpen(true); setOpenPlaylistMenuId(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg border pr-10 ${selectedPlaylist?.id === pl.id ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text)] hover:bg-[var(--panel-strong)]' } transition-colors`}
                  >
                    <div className="text-sm font-semibold truncate">{pl.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">{pl.items?.length || 0} games</div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenPlaylistMenuId(openPlaylistMenuId === pl.id ? null : pl.id); }}
                    className="absolute right-1 top-1 p-1 rounded hover:bg-[var(--panel)] text-[var(--text-muted)]"
                    title="Playlist options"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {openPlaylistMenuId === pl.id && (
                    <div className="absolute right-0 mt-1 w-36 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">
                      <button onClick={() => handleRenamePlaylist(pl)} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]">Edit name</button>
                      <button onClick={() => handleUpdateDescription(pl)} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]">Edit description</button>
                      <button onClick={() => handleTogglePrivacy(pl)} className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]">
                        {pl.privacy === 'private' ? 'Make public' : 'Make private'}
                      </button>
                      <button onClick={() => handleDeletePlaylist(pl)} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40">Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={createPlaceholderPlaylist}
              disabled={isSavingPlaylist}
              className="w-full px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm font-semibold disabled:opacity-60"
            >
              {isSavingPlaylist ? 'Creating...' : 'Create Playlist'}
            </button>
          </div>

          {/* Right content */}
          <div className="bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-4">
              {isPlaylistDetailOpen && selectedPlaylist ? (
                <div className="flex flex-col gap-4 h-full">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                    <div className="text-xl font-bold text-[var(--text)]">{selectedPlaylist.title}</div>
                    {selectedPlaylist.description ? (
                      <div className="text-sm text-[var(--text-muted)]">{selectedPlaylist.description}</div>
                    ) : (
                      <button
                        onClick={() => handleUpdateDescription(selectedPlaylist)}
                        className="flex items-center gap-1 text-sm italic text-[var(--text-muted)] opacity-70 hover:opacity-100"
                      >
                        Add your description here (optional)
                        <Pencil size={14} className="text-[var(--text-muted)]" />
                      </button>
                    )}
                    <div className="text-xs text-[var(--text-muted)]">By {selectedPlaylist.ownerName || 'Unknown'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${selectedPlaylist.privacy === 'private' ? 'border-red-400 text-red-500 dark:text-red-300 dark:border-red-600' : 'border-green-400 text-green-700 dark:text-green-300 dark:border-green-600'}`}>
                      {selectedPlaylist.privacy === 'private' ? 'Private' : 'Public'}
                    </span>
                    <div className="text-xs text-[var(--text-muted)]">{selectedPlaylist.items?.length || 0} games</div>
                  </div>
                </div>

                <div className="border border-[var(--border)] rounded-lg overflow-hidden flex-1 bg-[var(--panel-muted)]">
                  <div className="grid grid-cols-[32px_44px_1fr_1fr_140px] px-4 py-2 text-[11px] uppercase text-[var(--text-muted)] border-b border-[var(--border)]">
                    <span>#</span>
                    <span>Cover</span>
                    <span>Title</span>
                    <span>Platform · Genre</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto custom-scrollbar divide-y divide-[var(--border)]">
                    {(selectedPlaylist.items || []).map((item, idx) => {
                      const exists = isGameOnBoard(data, item);
                      return (
                        <div key={`${item.title}-${idx}`} className="grid grid-cols-[32px_44px_1fr_1fr_140px] items-center px-4 py-3 gap-2">
                          <span className="text-xs text-[var(--text-muted)]">{idx + 1}</span>
                          <div className="w-10 h-10 rounded bg-[var(--panel)] border border-[var(--border)] overflow-hidden" style={{ backgroundImage: item.cover ? `url(${item.cover})` : PLACEHOLDER_COVERS[(item.coverIndex ?? 0) % PLACEHOLDER_COVERS.length], backgroundSize: 'cover', backgroundPosition: 'center' }} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--text)] truncate">{item.title}</div>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{item.year ? `${item.year} · ` : ''}{item.platform}</div>
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{item.genre || '—'}</div>
                          <div className="flex items-center gap-2 justify-end">
                            {exists ? (
                              <span className="text-[11px] px-2 py-1 rounded-full border border-green-400 text-green-700 dark:text-green-300 dark:border-green-600">On board</span>
                            ) : (
                              <select
                                onChange={(e) => addPlaylistItemToList(item, e.target.value)}
                                defaultValue=""
                                className="bg-[var(--panel)] border border-[var(--border)] text-[11px] text-[var(--text)] rounded px-2 py-1"
                              >
                                <option value="" disabled>Add to list</option>
                                {data.columnOrder.map(cid => (
                                  <option key={cid} value={cid}>{data.columns[cid].title}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {(selectedPlaylist.items || []).length === 0 && (
                      <div className="px-4 py-8 text-sm text-[var(--text-muted)]">This playlist is empty.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
                Select a playlist to preview. You can also browse or create one.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Browse Public Playlists */}
      <Modal
        isOpen={isBrowsePlaylistsModalOpen}
        onClose={() => setIsBrowsePlaylistsModalOpen(false)}
        title="Browse public playlists"
        contentClassName="max-w-5xl w-full"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {publicBrowsePlaylists.map(pl => (
            <button
              key={pl.id}
              onClick={() => { setSelectedPlaylist(pl); setIsPlaylistDetailOpen(true); setIsBrowsePlaylistsModalOpen(false); setIsPlaylistsModalOpen(true); }}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-[var(--accent)] hover:bg-[var(--panel-strong)] transition-colors text-left overflow-hidden"
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-[var(--accent)]/40 to-blue-500/40 flex items-center justify-center text-[var(--text)] text-xs font-semibold">
                {pl.items?.[0]?.title ? pl.items[0].title.charAt(0) : 'P'}
              </div>
              <div className="p-2">
                <div className="text-sm font-semibold text-[var(--text)] truncate">{pl.title}</div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">{pl.items?.length || 0} games</div>
              </div>
            </button>
          ))}
          {publicBrowsePlaylists.length === 0 && (
            <div className="text-sm text-[var(--text-muted)] col-span-full">There are no public playlists available at the moment.</div>
          )}
        </div>
      </Modal>

      <Modal isOpen={isColumnModalOpen} onClose={() => setIsColumnModalOpen(false)} title={isEditingColumn ? "Edit List" : "Create New List"}>
        <form onSubmit={handleSaveColumn} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">List Title</label>
            <input autoFocus type="text" value={columnForm.title} onChange={(e) => setColumnForm({ ...columnForm, title: e.target.value })} placeholder="e.g. Wishlist" className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] focus:border-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Choose Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {Object.keys(COLUMN_ICONS).map(iconKey => (
                <button key={iconKey} type="button" onClick={() => setColumnForm({ ...columnForm, icon: iconKey })} className={`aspect-square flex items-center justify-center rounded-lg transition-all border ${columnForm.icon === iconKey ? 'bg-[var(--accent)] text-white shadow-lg border-[var(--accent)]' : 'bg-[var(--panel-muted)] text-[var(--text-muted)] border-[var(--border)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]'}`}>
                  <IconRenderer iconName={iconKey} size={20} />
                </button>
              ))}
            </div>
          </div>

          {isEditingColumn && (
            <div className="space-y-3 p-3 border border-[var(--border)] rounded-lg bg-[var(--panel-muted)]">
              <div className="text-sm font-semibold text-[var(--text)]">When deleting this list</div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[var(--text)] text-sm">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="move"
                    checked={deleteMode === 'move'}
                    onChange={() => setDeleteMode('move')}
                    className="accent-purple-600"
                  />
                  Move games to another list
                </label>
                <div className="pl-6">
                  <select
                    value={deleteTarget}
                    onChange={(e) => setDeleteTarget(e.target.value)}
                    disabled={data.columnOrder.filter(id => id !== columnForm.id).length === 0}
                    className="w-full bg-[var(--panel)] border border-[var(--border)] rounded p-2 text-sm text-[var(--text)] disabled:opacity-50"
                  >
                    {data.columnOrder.filter(id => id !== columnForm.id).map(colId => (
                      <option key={colId} value={colId}>{data.columns[colId].title}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[var(--text)] text-sm">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="delete"
                    checked={deleteMode === 'delete'}
                    onChange={() => setDeleteMode('delete')}
                    className="accent-red-500"
                  />
                  Delete games along with this list
                </label>
                <div className="text-xs text-[var(--text-muted)]">
                  {data.columns[columnForm.id]?.itemIds?.length || 0} games currently in this list.
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={handleDeleteColumn} className="px-3 py-2 bg-red-100 text-red-700 rounded border border-red-200 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900/50">
                  Delete List
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setIsColumnModalOpen(false)} className="flex-1 px-4 py-2 text-[var(--text-muted)] hover:bg-[var(--panel-muted)] rounded-lg">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-bold rounded-lg shadow-lg">{isEditingColumn ? "Save Changes" : "Create List"}</button>
          </div>
        </form>
      </Modal>

      <style>{` .custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background-color: var(--border); border-radius: 20px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: var(--text-muted); } `}</style>
    </div>
  );
}
