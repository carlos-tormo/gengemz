import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams, matchPath } from 'react-router';
import {
  Plus, MoreVertical, Gamepad2, X, Trash2,
  LogIn, LogOut, Loader2, Check, Edit2, Search, Image as ImageIcon,
  ArrowRight, Save, WifiOff, LayoutGrid, List,
  Pencil, Lock, Unlock, Calendar, Heart, Star,
  Settings, Users, UserPlus, Shield, Wrench, Database, Moon, Sun, Menu
} from 'lucide-react';
// Firebase imports
import { auth } from './config/firebase';
import { 
  signOut, onAuthStateChanged, signInAnonymously, 
  updateProfile, signInWithPopup, GoogleAuthProvider,
  setPersistence, browserLocalPersistence
} from "firebase/auth";

// Constants and config
import { 
  PLACEHOLDER_COVERS, COLUMN_ICONS
} from './config/constants';

// Components
import Modal from './components/Modal';
import IconRenderer from './components/IconRenderer';
import GameCard from './components/GameCard';
import UserMenu from './components/UserMenu';
import LandingPage from './components/LandingPage';
import BrowsePage from './components/BrowsePage';
import SearchDropdown from './components/SearchDropdown';
import BoardPage from './components/BoardPage';
import ProfilePage from './components/ProfilePage';
import ConnectionsPage from './components/ConnectionsPage';
import logoWordmarkLight from './assets/logo-justword-light-2026.svg';
import logoWordmarkDark from './assets/logo-justword-dark-2026.svg';

// Hooks
import useClickOutside from './hooks/useClickOutside';
import useRelationships from './hooks/useRelationships';
import useTheme from './hooks/useTheme';
import usePlaylists from './hooks/usePlaylists';
import useUserProfile from './hooks/useUserProfile';
import useBoard from './hooks/useBoard';
import useGameSearch from './hooks/useGameSearch';
import { browseGames } from './services/rawgService';
import { findPlaylistForGame as findPlaylistForGameInList } from './services/playlistService';
import { createBoardGameFromRaw } from './services/boardService';

// Utilities
import { 
  getUniquePlatforms, getHiddenGamesCount, getFavoriteGames, 
  createClientId, findExistingGameId, getGameColumnId, isGameOnBoard, sameGameIdentity
} from './utils/gameUtils';

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const { data, dataRef, isDataLoading, saveStatus, performSmartMigration, boardActions } = useBoard(user);
  const {
    relationships, friends, isLoading: areRelationshipsLoading,
    follow, unfollow, block, unblock, acceptRequest, declineRequest,
  } = useRelationships(user);
  const {
    userSettings,
    setUserSettings,
    isOnboardingModalOpen,
    setIsOnboardingModalOpen,
    saveUserSettings,
    createDebugProfiles: seedDebugProfiles,
    searchPublicProfiles,
    getPublicProfile,
    loadProfileBoardModel,
    subscribeToUserGames,
  } = useUserProfile(user);

  // --- URL state (react-router) ---
  // Views live in the URL: / (board, ?view=list), /board/:columnId, /favorites,
  // /browse, /playlists, /playlists/:id, /u/:uid.
  const { pathname, search: locationSearch } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const zoomedColumnId = matchPath('/board/:columnId', pathname)?.params.columnId || null;
  const isFavoritesView = pathname === '/favorites';
  const isBrowsePage = pathname === '/browse';
  const isListView = pathname === '/' && searchParams.get('view') === 'list';
  const playlistsMatch = matchPath('/playlists/:id?', pathname);
  const isPlaylistsModalOpen = !!playlistsMatch;
  const routePlaylistId = playlistsMatch?.params.id || null;
  const goToBoard = () => navigate('/');
  const setZoomedColumnId = (colId) => navigate(colId ? `/board/${colId}` : '/');
  const setIsFavoritesView = (on) => navigate(on ? '/favorites' : '/');
  const setIsListView = (on) => navigate(on ? '/?view=list' : '/');
  const openPlaylists = () => navigate('/playlists');
  const openPlaylist = (id) => navigate(id ? `/playlists/${id}` : '/playlists');
  const closePlaylists = () => navigate('/');
  const openConnections = () => navigate('/connections');
  
  // View State
  const [activePlatformFilter, setActivePlatformFilter] = useState('All');
  
  // Modals
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnForm, setColumnForm] = useState({ id: '', title: '', icon: 'gamepad', isCompletion: false, isPlaying: false });
  const [isEditingColumn, setIsEditingColumn] = useState(false);
  const [deleteMode, setDeleteMode] = useState('move'); // 'move' | 'delete'
  const [deleteTarget, setDeleteTarget] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  
  // Game Card Modal State
  const [isGameCardOpen, setIsGameCardOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [ratingHover, setRatingHover] = useState(null);
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const [isPlaylistSelectorOpen, setIsPlaylistSelectorOpen] = useState(false);

  const addGameSearch = useGameSearch();
  const navGameSearch = useGameSearch();
  const playlistGameSearch = useGameSearch();
  const gameDetailSearch = useGameSearch();
  const selectedGameDetail = gameDetailSearch.results?.[0] || null;

  // User Search / Social
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [userSearchError, setUserSearchError] = useState(null);
  const [navSearchMode, setNavSearchMode] = useState('games'); // 'players' | 'games'
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);
  const [isBrowsePlaylistsModalOpen, setIsBrowsePlaylistsModalOpen] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null); // { gameId, currentCol }
  const [duplicateTarget, setDuplicateTarget] = useState('');
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [openPlaylistMenuId, setOpenPlaylistMenuId] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const { playlists, myPlaylists, publicBrowsePlaylists, isSavingPlaylist, playlistActions } = usePlaylists(user);
  const selectedPlaylist = useMemo(
    () => (routePlaylistId ? playlists.find(pl => pl.id === routePlaylistId) || null : null),
    [playlists, routePlaylistId],
  );
  const isPlaylistDetailOpen = !!selectedPlaylist;
  const [browseGamesResults, setBrowseGamesResults] = useState([]);
  const [browseFilters, setBrowseFilters] = useState({ ordering: '-metacritic', page_size: 50, platformId: '', startDate: '', endDate: '', genreId: '', minRating: 0, year: '' });
  const [isBrowsingGames, setIsBrowsingGames] = useState(false);
  const [browseGamesError, setBrowseGamesError] = useState(null);
  const [browseSearch, setBrowseSearch] = useState('');
  const [isPlaylistAddOpen, setIsPlaylistAddOpen] = useState(false);
  const [hoveredPlaylistItemIdx, setHoveredPlaylistItemIdx] = useState(null);
  const [selectedPlaylistItemIdx, setSelectedPlaylistItemIdx] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isSearching,
    error: searchError,
    hasSearched: searchHasSearched,
    search: runAddGameSearch,
    reset: resetAddGameSearch,
  } = addGameSearch;
  const {
    results: navGameResults,
    setResults: setNavGameResults,
    isSearching: isSearchingNavGames,
    error: navGameError,
    setError: setNavGameError,
    hasSearched: navGameHasSearched,
    setHasSearched: setNavGameHasSearched,
    search: runNavGameSearch,
  } = navGameSearch;
  const {
    query: playlistSearchQuery,
    setQuery: setPlaylistSearchQuery,
    results: playlistSearchResults,
    setResults: setPlaylistSearchResults,
    isSearching: isSearchingPlaylistGames,
    error: playlistSearchError,
    hasSearched: playlistSearchHasSearched,
    search: runPlaylistGameSearch,
    reset: resetPlaylistGameSearch,
  } = playlistGameSearch;
  const {
    isSearching: isLoadingGameDetail,
    error: gameDetailError,
    search: runGameDetailSearch,
    reset: resetGameDetailSearch,
  } = gameDetailSearch;

  const userRef = useRef(null);
  // const userSearchRef = useRef(null);
  const moveMenuRef = useRef(null);
  const playlistMenuRef = useRef(null);
  const desktopSearchRef = useRef(null);
  const mobileMenuRef = useRef(null);

  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (selectedPlaylist && selectedPlaylist.ownerUid !== user?.uid && selectedPlaylist.privacy === 'private') {
      navigate('/playlists', { replace: true });
    }
  }, [selectedPlaylist, user, navigate]);

  // Legacy search click outside (desktop search now handled via desktopSearchRef)
  useClickOutside(moveMenuRef, () => setIsMoveMenuOpen(false));
  useClickOutside(playlistMenuRef, () => { setIsPlaylistMenuOpen(false); setIsPlaylistSelectorOpen(false); });
  useClickOutside(desktopSearchRef, () => setIsSearchBarOpen(false));
  useClickOutside(mobileMenuRef, () => setIsMobileMenuOpen(false));

  useEffect(() => {
    if (isPlaylistsModalOpen && !routePlaylistId && myPlaylists.length > 0) {
      navigate(`/playlists/${myPlaylists[0].id}`, { replace: true });
    }
  }, [isPlaylistsModalOpen, routePlaylistId, myPlaylists, navigate]);

  // A zoomed column that no longer exists (deleted, or a stale link) falls back to the board.
  useEffect(() => {
    if (zoomedColumnId && !isDataLoading && !data.columns?.[zoomedColumnId]) {
      navigate('/', { replace: true });
    }
  }, [zoomedColumnId, isDataLoading, data.columns, navigate]);

  useEffect(() => {
    if (!isPlaylistsModalOpen) {
      setIsPlaylistAddOpen(false);
      resetPlaylistGameSearch();
    }
  }, [isPlaylistsModalOpen, resetPlaylistGameSearch]);

  useEffect(() => {
    setIsPlaylistAddOpen(false);
    resetPlaylistGameSearch();
    setHoveredPlaylistItemIdx(null);
    setSelectedPlaylistItemIdx(null);
  }, [selectedPlaylist?.id, resetPlaylistGameSearch]);

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

  const [, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [activeDropZone, setActiveDropZone] = useState(null);

  const hiddenGamesCount = getHiddenGamesCount(data, activePlatformFilter);
  const favoriteGames = getFavoriteGames(data);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).then(() => {
      onAuthStateChanged(auth, async (u) => {
        const prev = userRef.current;
        userRef.current = u;
        const guestData = (prev?.isAnonymous && !u?.isAnonymous && u) ? dataRef.current : null;
        setUser(u);
        setIsAuthLoading(false);
        if (u) {
          if (guestData) await performSmartMigration(guestData, u.uid);
        } else {
          signInAnonymously(auth);
        }
      });
    });
  }, [dataRef, performSmartMigration]);

  // --- DEBUG: Force Create Profiles ---
  const createDebugProfiles = async () => {
    try {
      await seedDebugProfiles();
      alert("Debug profiles created!");
    } catch (e) { alert("Error: " + e.message); }
  };

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
    if (navSearchMode === 'players') {
      if (!userSearchQuery.trim()) {
        setUserSearchResults([]);
        return;
      }
      setIsSearchingUsers(true);
      setUserSearchError(null);
      try {
        setUserSearchResults(await searchPublicProfiles(userSearchQuery));
      } catch (e) {
        console.error("Search failed", e);
        setUserSearchError("Search failed. Try again.");
      } finally {
        setIsSearchingUsers(false);
      }
    } else {
      if (!userSearchQuery.trim()) {
        setNavGameResults([]);
        setNavGameHasSearched(false);
        return;
      }
      setNavGameHasSearched(true);
      setNavGameError(null);
      try {
        await runNavGameSearch(userSearchQuery);
      } catch (e) {
        console.error("Game search failed", e);
        setNavGameError("Search failed. Try again.");
      }
    }
  };

  const openProfile = (profile) => {
    const uid = typeof profile === 'string' ? profile : profile?.uid;
    if (!uid) return;
    setIsSearchBarOpen(false);
    navigate(`/u/${uid}`);
  };

  const profileLink = (uid) => `${window.location.origin}/u/${uid}`;
  const copyOwnProfileLink = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(profileLink(user.uid));
    } catch {
      prompt('Copy this link', profileLink(user.uid));
    }
  };

  const handleRequestAction = async (requester, accept) => {
    if (!user) return;
    const res = accept ? await acceptRequest(requester) : await declineRequest(requester.uid);
    if (!res?.ok && res?.error) {
      alert(res.error);
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
    await runPlaylistGameSearch(playlistSearchQuery);
  };

  const updatePlaylistFields = async (playlistId, fields) => {
    try {
      await playlistActions.updateFields(playlistId, fields);
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

  const handleRemovePlaylistItem = async (pl, idx) => {
    if (!pl?.id) return;
    const items = pl.items || [];
    const target = items[idx];
    if (!target) return;
    const confirmed = confirm(`Remove "${target.title}" from ${pl.title}?`);
    if (!confirmed) return;
    try {
      await playlistActions.removeItemAtIndex(pl, idx);
    } catch (err) {
      alert(err.message || "Failed to remove game");
    }
  };

  const handleDeletePlaylist = async (pl) => {
    const confirmDelete = confirm(`Delete playlist "${pl.title}"?`);
    if (!confirmDelete) return;
    try {
      await playlistActions.removePlaylist(pl.id);
      if (selectedPlaylist?.id === pl.id) {
        navigate('/playlists', { replace: true });
      }
    } catch (err) {
      alert(err.message || "Failed to delete playlist");
    } finally {
      setOpenPlaylistMenuId(null);
    }
  };

  // --- Playlists ---
  const promptDuplicateMove = (gameId) => {
    const currentCol = getGameColumnId(data, gameId);
    setDuplicateInfo({ gameId, currentCol });
    setDuplicateTarget(currentCol || data.columnOrder[0]);
    setIsDuplicateModalOpen(true);
  };

  const addPlaylistItemToList = (item, colId) => {
    const existingId = findExistingGameId(data, item);
    if (existingId) {
      promptDuplicateMove(existingId);
      return;
    }
    const target = colId && data.columns[colId] ? colId : data.columnOrder[0];
    boardActions.addGameToBoard({
      title: item.title,
      platform: item.platform,
      genre: item.genre,
      year: item.year,
      cover: item.cover,
      coverIndex: item.coverIndex || 0,
      rating: item.rating || 0,
      isFavorite: item.isFavorite || false
    }, target);
  };

  const gameFromRaw = createBoardGameFromRaw;

  const handleBrowseListAction = (rawGame, targetColId) => {
    const target = targetColId || data.columnOrder[0];
    const gameData = gameFromRaw(rawGame);
    const existingId = findExistingGameId(data, gameData);
    if (existingId) {
      const currentCol = getGameColumnId(data, existingId);
      if (currentCol === target) {
        if (!confirm(`Remove "${gameData.title}" from ${data.columns[currentCol]?.title || 'this list'}?`)) return;
        boardActions.removeGame(existingId);
      } else {
        boardActions.moveGame(existingId, target);
      }
    } else {
      boardActions.addGameToBoard(gameData, target);
    }
  };

  const addGameToPlaylist = async (playlistId, game) => {
    if (!playlistId || !game) return;
    try {
      const result = await playlistActions.addGame(playlistId, game);
      if (result.alreadyExists) {
        alert("Game already in playlist");
        return;
      }
    } catch (err) {
      console.error("Add to playlist failed", err);
      alert(err.message || "Failed to add to playlist");
    }
  };

  const createPlaceholderPlaylist = async (initialGame = null) => {
    try {
      const newPlaylist = await playlistActions.createPlaceholderPlaylist(initialGame);
      openPlaylist(newPlaylist.id);
      setOpenPlaylistMenuId(null);
    } catch (err) {
      alert(err.message || "Failed to create playlist");
    }
  };

  const handleTogglePrivacy = async (pl) => {
    const nextPrivacy = pl.privacy === 'private' ? 'public' : 'private';
    await updatePlaylistFields(pl.id, { privacy: nextPrivacy });
    setOpenPlaylistMenuId(null);
  };

  const searchGames = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!searchQuery.trim()) return;
    await runAddGameSearch(searchQuery);
  };
  const browseTopGames = async () => {
    setIsBrowsingGames(true);
    setBrowseGamesError(null);
    try {
      setBrowseGamesResults(await browseGames({ filters: browseFilters, search: browseSearch }));
    } catch (err) {
      console.error("Browse games failed", err);
      setBrowseGamesError("Failed to load games.");
      setBrowseGamesResults([]);
    } finally {
      setIsBrowsingGames(false);
    }
  };
  useEffect(() => {
    if (isBrowsePage) browseTopGames();
    // browseTopGames reads the current filters; re-running on every filter change would double-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrowsePage]);
  
  const handleAddGameFromSearch = (g) => { 
    const existingId = findExistingGameId(data, g);
    if (existingId) {
      promptDuplicateMove(existingId);
      return;
    }
    const target = zoomedColumnId || 'backlog'; 
    const gameData = {
      ...gameFromRaw(g),
      platform: g.platforms ? g.platforms.map(p=>p.platform.name).slice(0,2).join(', ') : 'Unk',
      genre: g.genres?.[0]?.name || 'Gen',
      rating: 0,
    };
    boardActions.addGameToBoard(gameData, target);
    
    setIsAddModalOpen(false); 
    resetAddGameSearch();
  };

  const openGameCard = (g) => {
    const mapped = g?.background_image ? gameFromRaw(g) : { ...g };
    setSelectedGame(mapped);
    resetGameDetailSearch();
    setIsGameCardOpen(true);
    if (mapped?.title) runGameDetailSearch(mapped.title);
  };
  
  const handleModalFavoriteToggle = () => { 
    if (!selectedGame) return; 
    const targetId = boardActions.ensureGameOnBoard(selectedGame); 
    const s = !(selectedGame.isFavorite); 
    setSelectedGame(p => ({ ...p, isFavorite: s, id: targetId || p?.id })); 
    if (!targetId) return;
    boardActions.patchGame(targetId, { isFavorite: s });
  };

  const onDragStart = (e, id, c) => { setIsDragging(true); setDraggedItem({ gameId: id, sourceColId: c }); }; const onDragOver = (e, c) => { e.preventDefault(); if (activeDropZone !== c) setActiveDropZone(c); }; 
  
  const onDrop = (e, d) => { 
    e.preventDefault(); setIsDragging(false); setActiveDropZone(null); 
    if (!draggedItem || draggedItem.sourceColId === d) return; 
    const { gameId } = draggedItem; 
    boardActions.moveGame(gameId, d);
  };

  const handleManualMove = (id, d) => { 
    boardActions.moveGame(id, d);
  };

  const ensureGameOnBoard = (game, targetColId = data.columnOrder[0]) => {
    const gameId = boardActions.ensureGameOnBoard(game, targetColId);
    if (gameId) setSelectedGame(s => s ? { ...s, id: gameId } : s);
    return gameId;
  };

  const handleSetGameRating = (val) => {
    if (!selectedGame) return;
    const targetId = ensureGameOnBoard(selectedGame);
    if (!targetId) return;
    setSelectedGame(prev => prev ? { ...prev, rating: val } : prev);
    boardActions.patchGame(targetId, { rating: val });
    boardActions.cleanDuplicates(targetId, selectedGame.title, getGameColumnId(data, targetId));
  };

  const handleGameCardMove = (colId) => {
    if (!selectedGame || !colId) return;
    const targetId = ensureGameOnBoard(selectedGame, colId);
    handleManualMove(targetId, colId);
  };

  const findPlaylistForGame = (game) => {
    return findPlaylistForGameInList(myPlaylists, game);
  };

  const removeGameFromPlaylist = async (plId, game) => {
    if (!plId || !game) return;
    try {
      await playlistActions.removeGame(plId, game);
    } catch (err) {
      console.error('Remove from playlist failed', err);
    }
  };

  const getRatingColor = (val) => {
    if (val >= 7) return '#2ecc71';
    if (val >= 4) return '#f1c40f';
    return '#e74c3c';
  };

  const getScoreLabel = (val) => {
    if (!val && val !== 0) return 'No score yet';
    if (val >= 9) return 'Exceptional / Must-play';
    if (val >= 7) return 'Great';
    if (val >= 5) return 'Mixed';
    if (val >= 3) return 'Weak';
    return 'Dropped / Not enjoyable';
  };

  const handleDeleteGame = (id) => { 
    boardActions.removeGame(id);
  };

  const toggleFavorite = (id) => { 
    boardActions.toggleFavorite(id);
  };

  // The list currently flagged as "currently playing" (at most one).
  const playingListTitle = data.columnOrder
    .map((id) => data.columns[id])
    .find((column) => column?.isPlaying === true)?.title || '';

  const openAddColumnModal = () => { if (data.columnOrder.length < 5) { setColumnForm({ id: createClientId('col'), title: '', icon: 'gamepad', isCompletion: false, isPlaying: false }); setIsEditingColumn(false); setIsColumnModalOpen(true); }};
  const openEditColumnModal = (c) => { setColumnForm({ id: c.id, title: c.title, icon: c.icon || 'gamepad', isCompletion: c.isCompletion === true, isPlaying: c.isPlaying === true }); setIsEditingColumn(true); setIsColumnModalOpen(true); };
  
  const handleSaveColumn = (e) => {
    e.preventDefault(); if (!columnForm.title.trim()) return;
    // Unticking "games here count as finished" deletes the dates of every game
    // in the list, and the same Save button also does rename/icon — so ask.
    const column = data.columns[columnForm.id];
    if (isEditingColumn && column?.isCompletion === true && !columnForm.isCompletion) {
      const dated = (column.itemIds || []).filter(id => data.games[id]?.completedAt).length;
      const ok = dated === 0 || window.confirm(
        `${dated} game${dated === 1 ? '' : 's'} in "${column.title}" will lose ${dated === 1 ? 'its' : 'their'} completion date. This cannot be undone.`
      );
      if (!ok) return;
    }
    boardActions.saveColumn(columnForm, isEditingColumn);
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

    boardActions.deleteColumn(colId, deleteMode, dest);
    setIsColumnModalOpen(false); 
  };

  const platforms = getUniquePlatforms(data);
  const showLanding = !isAuthLoading && !isDataLoading && user?.isAnonymous && (!data.games || Object.keys(data.games).length === 0);
  const boardElement = isDataLoading ? (
    <div className="h-full flex items-center justify-center animate-in fade-in">
      <Loader2 size={40} className="animate-spin text-purple-600" />
    </div>
  ) : showLanding ? (
    <LandingPage
      theme={theme}
      onStart={() => setIsAddModalOpen(true)}
      onLogin={handleLogin}
    />
  ) : (
    <BoardPage
      data={data}
      favoriteGames={favoriteGames}
      platforms={platforms}
      hiddenGamesCount={hiddenGamesCount}
      viewMode={{ isListView, isFavoritesView, zoomedColumnId: data.columns?.[zoomedColumnId] ? zoomedColumnId : null }}
      setViewMode={{ setIsListView, setIsFavoritesView, setZoomedColumnId }}
      filters={{ activePlatformFilter, setActivePlatformFilter }}
      actions={{
        handleManualMove,
        handleDeleteGame,
        openGameCard,
        toggleFavorite,
        onDragOver,
        onDrop,
        onDragStart,
        activeDropZone,
        openAddColumnModal,
        openEditColumnModal,
      }}
      playlists={myPlaylists}
      onAddToPlaylist={addGameToPlaylist}
      onCreatePlaylistAndAdd={createPlaceholderPlaylist}
    />
  );
  return (
    <div className={`min-h-screen ${theme === 'light' ? 'theme-light' : 'theme-dark'} bg-[var(--bg)] text-[var(--text)] font-sans relative flex flex-col selection:bg-[var(--accent)] selection:text-[var(--panel)] transition-colors`}>
      <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 transition-opacity duration-300 ${saveStatus === 'idle' ? 'opacity-50 hover:opacity-100' : 'opacity-100'}`}>
        <div className="text-[10px] text-[var(--text-muted)] font-mono bg-[var(--panel)]/70 px-2 py-1 rounded border border-[var(--border)]">
          {user ? `ID: ${user.uid.slice(0, 6)}...` : 'No User'}
        </div>
        <div className={`bg-[var(--panel)] border ${saveStatus === 'error' ? 'border-red-500' : 'border-[var(--border)]'} rounded-full px-4 py-2 flex items-center gap-2 shadow-xl`}>
          {saveStatus === 'saving' ? (
            <>
              <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
              <span className="text-xs font-medium text-[var(--text-muted)]">Saving...</span>
            </>
          ) : saveStatus === 'error' ? (
            <>
              <WifiOff size={16} className="text-red-500" />
              <span className="text-xs font-medium text-red-500">Sync Error</span>
            </>
          ) : (
            <>
              <Check size={16} className="text-green-500" />
              <span className="text-xs font-medium text-[var(--text-muted)]">Saved</span>
            </>
          )}
        </div>
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 bg-[var(--glass)] backdrop-blur-md border-b border-[var(--border)] z-40 px-4 md:px-8 flex items-center">
        {/* Mobile bar */}
        <div className="flex items-center justify-between w-full gap-2 md:hidden">
          <div className="flex items-center gap-2">
            <div className="relative" ref={mobileMenuRef}>
              <button
                onClick={() => setIsMobileMenuOpen(v => !v)}
                className="p-2 rounded-lg bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)]"
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>
              {isMobileMenuOpen && (
                <div className="absolute left-0 top-12 w-56 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="divide-y divide-[var(--border)] text-sm text-[var(--text)]">
                    <button onClick={() => { openPlaylists(); setIsMobileMenuOpen(false); }} className="w-full px-3 py-2 text-left hover:bg-[var(--panel-muted)]">Playlists</button>
                    <button onClick={() => { setIsFavoritesView(!isFavoritesView); setIsMobileMenuOpen(false); }} className="w-full px-3 py-2 text-left hover:bg-[var(--panel-muted)]">{isFavoritesView ? 'Exit favorites' : 'Favorites'}</button>
                    <button onClick={() => { setIsListView(!isListView); setIsMobileMenuOpen(false); }} className="w-full px-3 py-2 text-left hover:bg-[var(--panel-muted)]">{isListView ? 'Grid view' : 'List view'}</button>
                    <button onClick={() => { setIsSettingsModalOpen(true); setIsMobileMenuOpen(false); }} className="w-full px-3 py-2 text-left hover:bg-[var(--panel-muted)]">Settings</button>
                    <button onClick={() => { openConnections(); setIsMobileMenuOpen(false); }} className="w-full px-3 py-2 text-left hover:bg-[var(--panel-muted)]">Connections</button>
                  </div>
                </div>
              )}
            </div>
            <img
              src={theme === 'light' ? logoWordmarkLight : logoWordmarkDark}
              alt="Gengemz"
              className="h-6 w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => navigate('/browse')}
              className="p-2 rounded-full bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
              aria-label="Browse games"
            >
              <Database size={18} />
            </button>
            <button
              onClick={() => { setIsSettingsModalOpen(true); }}
              className="rounded-full border border-[var(--border)] overflow-hidden w-10 h-10 flex items-center justify-center bg-[var(--panel)]"
              aria-label="Profile"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-sm font-bold uppercase">
                  {(user?.displayName || 'G')[0]}
                </div>
              )}
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold shadow-md hover:bg-[var(--accent-strong)]"
              aria-label="Add game"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Desktop bar */}
        <div className="hidden md:flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <img
              src={theme === 'light' ? logoWordmarkLight : logoWordmarkDark}
              alt="Gengemz"
              className="h-8 w-auto"
            />
            <span className="sr-only">Gengemz</span>
            {!isDataLoading && (
              <button
                onClick={() => navigate('/browse')}
                className="px-3 py-2 rounded-full bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] font-semibold text-sm"
              >
                Browse Games
              </button>
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
             {!showLanding && !isDataLoading && <button onClick={() => setIsFavoritesView(!isFavoritesView)} className={`p-2 rounded-full transition-colors ${isFavoritesView ? 'bg-red-500/20 text-red-400' : 'text-slate-400 hover:text-red-400 hover:bg-slate-800'}`} title="Favorites"><Heart size={20} className={isFavoritesView ? 'fill-red-400' : ''} /></button>}
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
                onClick={openPlaylists}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Playlists"
              >
                <LayoutGrid size={18} />
              </button>
            )}
            {!showLanding && (
              <div className="relative" ref={desktopSearchRef}>
                <button
                  onClick={() => setIsSearchBarOpen((v) => !v)}
                  className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Search players/games"
                >
                  <Search size={18} />
                </button>
                <SearchDropdown
                  isOpen={isSearchBarOpen}
                  onClose={() => setIsSearchBarOpen(false)}
                  navSearchMode={navSearchMode}
                  setNavSearchMode={setNavSearchMode}
                  userSearchQuery={userSearchQuery}
                  setUserSearchQuery={setUserSearchQuery}
                  userSearchResults={userSearchResults}
                  userSearchError={userSearchError}
                  isSearchingUsers={isSearchingUsers}
                  navGameResults={navGameResults}
                  navGameError={navGameError}
                  isSearchingNavGames={isSearchingNavGames}
                  navGameHasSearched={navGameHasSearched}
                  setUserSearchResults={setUserSearchResults}
                  setUserSearchError={setUserSearchError}
                  setNavGameResults={setNavGameResults}
                  setNavGameError={setNavGameError}
                  setNavGameHasSearched={setNavGameHasSearched}
                  handleUserSearch={handleUserSearch}
                  handleFollowAction={handleFollowAction}
                  openProfile={openProfile}
                  handleBrowseListAction={handleBrowseListAction}
                  data={data}
                  currentUid={user?.uid}
                  relationships={relationships}
                  friends={friends}
                />
              </div>
            )}
            {isAuthLoading ? <Loader2 className="animate-spin text-slate-500" size={20} /> : <UserMenu user={user} onOpenSettings={() => setIsSettingsModalOpen(true)} onLogin={handleLogin} onOpenProfile={() => setIsSettingsModalOpen(true)} onLogout={handleLogout} onOpenFriends={openConnections} onOpenMyProfile={() => navigate('/u/me')} onCopyProfileLink={copyOwnProfileLink} />}
            {!showLanding && !isDataLoading && !isFavoritesView && <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20 active:scale-95"><Plus size={18} /><span className="hidden sm:inline">Add Game</span></button>}
         </div>
        </div>
      </nav>

      {/* Onboarding Modal (Forced Privacy Selection) */}
      <Modal isOpen={isOnboardingModalOpen} title="Welcome to Gengemz!" preventClose={true}>
        <div className="space-y-6">
          <p className="text-[var(--text-muted)] text-sm">To get started, please set up your profile privacy. You can change this later in Settings.</p>
          <form onSubmit={handleOnboardingComplete} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Display Name</label>
              <input 
                type="text" 
                value={userSettings.displayName} 
                onChange={(e) => setUserSettings({...userSettings, displayName: e.target.value})} 
                className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] focus:border-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]" 
                placeholder="How should we call you?"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Privacy Level</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'public', label: 'Public', icon: Users, desc: 'Anyone can find and view your profile.' },
                  { id: 'invite_only', label: 'Invite Only', icon: Shield, desc: 'People can find you, but must request to follow.' },
                  { id: 'private', label: 'Private', icon: Lock, desc: 'Your profile is hidden. No social features.' }
                ].map(opt => (
                  <div 
                    key={opt.id}
                    onClick={() => setUserSettings({ ...userSettings, privacy: opt.id })}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${userSettings.privacy === opt.id ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text)]' : 'bg-[var(--panel-muted)] border-[var(--border)] hover:border-[var(--accent)]'}`}
                  >
                    <div className={`p-2 rounded-full ${userSettings.privacy === opt.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--panel)] text-[var(--text-muted)]'}`}>
                      <opt.icon size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{opt.label}</div>
                      <div className="text-xs text-[var(--text-muted)]">{opt.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-bold rounded-lg shadow-lg">Start Your Journey</button>
          </form>
        </div>
      </Modal>

      {/* Browse Games Page Section */}
      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings & Privacy">
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Display Name</label>
            <input type="text" value={userSettings.displayName} onChange={(e) => setUserSettings({...userSettings, displayName: e.target.value})} className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] focus:border-[var(--accent)] outline-none placeholder:text-[var(--text-muted)]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Profile Privacy</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'public', label: 'Public', icon: Users, desc: 'Visible to everyone' },
                { id: 'invite_only', label: 'Invite Only', icon: Shield, desc: 'Request to follow' },
                { id: 'private', label: 'Private', icon: Lock, desc: 'Hidden completely' }
              ].map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => setUserSettings({ ...userSettings, privacy: opt.id })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${userSettings.privacy === opt.id ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text)]' : 'bg-[var(--panel-muted)] border-[var(--border)] hover:border-[var(--accent)]'}`}
                >
                  <opt.icon size={20} className="mb-2" />
                  <div className="font-bold text-sm">{opt.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Bio</label>
            <textarea value={userSettings.bio || ''} onChange={(e) => setUserSettings({...userSettings, bio: e.target.value})} className="w-full bg-[var(--panel)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] focus:border-[var(--accent)] outline-none h-24 resize-none placeholder:text-[var(--text-muted)]" placeholder="Tell us about your gaming taste..." />
          </div>
          <button type="submit" className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-bold rounded-lg shadow-lg">Save Settings</button>
          
          <div className="pt-4 border-t border-[var(--border)]">
            <button 
              type="button" 
              onClick={createDebugProfiles}
              className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] w-full justify-center p-2 border border-[var(--border)] rounded-lg hover:bg-[var(--panel-muted)]"
            >
              <Database size={12} /> Initialize Database (Fix Search)
            </button>
          </div>
        </form>
      </Modal>

<main className={`pb-10 px-4 md:px-8 min-h-screen overflow-x-hidden ${showLanding ? 'pt-24' : isBrowsePage ? 'pt-28' : 'pt-32'}`}>
        <Routes>
          <Route
            path="/browse"
            element={
              <BrowsePage
                filters={browseFilters}
                setFilters={setBrowseFilters}
                search={browseSearch}
                setSearch={setBrowseSearch}
                isLoading={isBrowsingGames}
                error={browseGamesError}
                results={browseGamesResults}
                data={data}
                playlists={myPlaylists}
                onBrowse={browseTopGames}
                onAddToList={handleBrowseListAction}
                onBack={goToBoard}
              />
            }
          />
          <Route
            path="/u/:uid"
            element={
              <ProfilePage
                user={user}
                relationships={relationships}
                getPublicProfile={getPublicProfile}
                loadProfileBoardModel={loadProfileBoardModel}
                subscribeToUserGames={subscribeToUserGames}
                onFollowAction={handleFollowAction}
                onBlockAction={handleBlockAction}
                onUnblock={unblock}
              />
            }
          />
          <Route
            path="/connections"
            element={
              <ConnectionsPage
                user={user}
                isAuthLoading={isAuthLoading}
                isLoading={areRelationshipsLoading}
                relationships={relationships}
                friends={friends}
                onOpenProfile={openProfile}
                onUnfollow={unfollow}
                onUnblock={unblock}
                onRequestAction={handleRequestAction}
                onBlockAction={handleBlockAction}
                loadProfileBoardModel={loadProfileBoardModel}
                subscribeToUserGames={subscribeToUserGames}
              />
            }
          />
          {/* The spec named /friends; it is the default tab of the page. */}
          <Route path="/friends" element={<Navigate to={`/connections${locationSearch}`} replace />} />
          {['/', '/board/:columnId', '/favorites', '/playlists', '/playlists/:id'].map(path => (
            <Route key={path} path={path} element={boardElement} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Modal isOpen={isGameCardOpen} onClose={() => setIsGameCardOpen(false)} title="Game Card">
        {selectedGame && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="w-32 h-44 rounded-xl shadow-2xl shrink-0 bg-cover bg-center border border-[var(--border)]" style={{ background: selectedGame.cover ? `url(${selectedGame.cover}) center/cover` : PLACEHOLDER_COVERS[selectedGame.coverIndex % PLACEHOLDER_COVERS.length] }} />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-bold text-[var(--text)] leading-tight mb-1">{selectedGame.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)] text-sm">
                      {(selectedGame.year || selectedGameDetail?.released) && (
                        <span className="flex items-center gap-1"><Calendar size={14} />{selectedGame.year || selectedGameDetail?.released?.split('-')?.[0]}</span>
                      )}
                      {(selectedGame.platform || selectedGameDetail?.platforms) && (
                        <span>• {selectedGame.platform || selectedGameDetail?.platforms?.map(p => p.platform?.name).slice(0,3).join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="relative" ref={playlistMenuRef}>
                    <button
                      type="button"
                      onClick={() => { setIsPlaylistMenuOpen(v => !v); setIsPlaylistSelectorOpen(false); }}
                      className="p-2 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
                      aria-label="Playlist options"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {isPlaylistMenuOpen && (
                      <div className="absolute right-0 mt-2 w-60 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="divide-y divide-[var(--border)]">
                          <button
                            onClick={() => setIsPlaylistSelectorOpen(v => !v)}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]"
                          >
                            {findPlaylistForGame(selectedGame) ? 'Change / Remove playlist' : 'Add to playlist'}
                          </button>
                          {isPlaylistSelectorOpen && (
                            <div className="max-h-64 overflow-y-auto">
                              {findPlaylistForGame(selectedGame) && (
                                <button
                                  onClick={() => { removeGameFromPlaylist(findPlaylistForGame(selectedGame)?.id, selectedGame); setIsPlaylistMenuOpen(false); setIsPlaylistSelectorOpen(false); }}
                                  className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20"
                                >
                                  Remove from playlist
                                </button>
                              )}
                              {(myPlaylists && myPlaylists.length > 0) ? (
                                myPlaylists.map(pl => (
                                  <button
                                    key={pl.id}
                                    onClick={() => { addGameToPlaylist(pl.id, selectedGame); setIsPlaylistMenuOpen(false); setIsPlaylistSelectorOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)] truncate"
                                  >
                                    {findPlaylistForGame(selectedGame)?.id === pl.id ? '✓ ' : ''}{pl.title}
                                  </button>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No playlists yet</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={handleModalFavoriteToggle} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${selectedGame.isFavorite ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-[var(--panel)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}><Heart size={16} className={selectedGame.isFavorite ? "fill-current" : ""} /><span className="text-sm font-medium">{selectedGame.isFavorite ? 'Favorite' : 'Not favorite'}</span></button>
                  <div className="flex flex-col gap-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg px-3 py-2 min-w-[220px]">
                    <span className="text-[11px] uppercase text-[var(--text-muted)] tracking-wide">My Score</span>
                    <div className="flex items-center gap-3">
                      <div className="grid grid-cols-10 gap-1 flex-1">
                        {[...Array(10).keys()].map(idx => {
                          const val = idx + 1;
                          const activeVal = ratingHover ?? selectedGame.rating;
                          const color = getRatingColor(activeVal || val);
                          const filled = activeVal >= val;
                          return (
                            <button
                              key={val}
                              onMouseEnter={() => setRatingHover(val)}
                              onMouseLeave={() => setRatingHover(null)}
                              onClick={() => handleSetGameRating(val)}
                              className="h-4 flex items-center justify-center"
                              aria-label={`Set score ${val}`}
                            >
                              <Star
                                size={14}
                                className={`${filled ? '' : 'text-[var(--text-muted)]'} transition-colors`}
                                style={{ color: filled ? color : undefined, fill: filled ? color : 'none' }}
                              />
                            </button>
                          );
                        })}
                      </div>
                      <div
                        className="px-3 h-9 rounded-md flex items-center justify-center text-sm font-bold text-white"
                        style={{ backgroundColor: getRatingColor(selectedGame.rating || 0) }}
                      >
                        {selectedGame.rating || '--'}
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {getScoreLabel(ratingHover ?? selectedGame.rating)}
                    </div>
                  </div>
                  <div className="relative" ref={moveMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsMoveMenuOpen(v => !v)}
                      className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 text-sm ${getGameColumnId(data, selectedGame.id) ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text)]' : 'bg-[var(--panel)] border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'}`}
                    >
                      <Check size={16} className={`${getGameColumnId(data, selectedGame.id) ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                      <span className="truncate">
                        {getGameColumnId(data, selectedGame.id) ? data.columns[getGameColumnId(data, selectedGame.id)]?.title : 'Not on a board list'}
                      </span>
                    </button>
                    {isMoveMenuOpen && (
                      <div className="absolute mt-2 w-64 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)] px-3 py-2 border-b border-[var(--border)]">Add to board list</div>
                        <div className="divide-y divide-[var(--border)]">
                          {data.columnOrder.map(cid => (
                            <button
                              key={cid}
                              onClick={() => { handleGameCardMove(cid); setIsMoveMenuOpen(false); }}
                              className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--panel-muted)]"
                            >
                              {data.columns[cid].title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-4 space-y-2">
              <div className="text-sm text-[var(--text-muted)]">
                {isLoadingGameDetail && 'Loading details...'}
                {gameDetailError && <span className="text-red-400">{gameDetailError}</span>}
                {!isLoadingGameDetail && !gameDetailError && (
                  <div className="space-y-2">
                    {selectedGameDetail?.description_raw ? (
                      <p className="text-[var(--text)] text-sm line-clamp-4">{selectedGameDetail.description_raw}</p>
                    ) : (
                      <p className="text-[var(--text-muted)] text-sm">No additional description available.</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                      {selectedGameDetail?.genres?.map(g => <span key={g.id} className="px-2 py-1 rounded bg-[var(--panel)] border border-[var(--border)]">{g.name}</span>)}
                      {selectedGameDetail?.metacritic && <span className="px-2 py-1 rounded bg-[var(--panel)] border border-[var(--border)]">Metacritic: {selectedGameDetail.metacritic}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
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
            {searchResults.map(game => {
              const exists = findExistingGameId(data, game);
              return (
                <div
                  key={game.id}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent)]/60 transition-all"
                >
                  <div
                    className="w-12 h-16 bg-[var(--panel-muted)] rounded shrink-0 bg-cover bg-center shadow-sm border border-[var(--border)]"
                    style={{ backgroundImage: game.background_image ? `url(${game.background_image})` : 'none' }}
                  >
                    {!game.background_image && <ImageIcon className="w-full h-full p-3 text-[var(--text-muted)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-[var(--text)] truncate">{game.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{game.released ? game.released.split('-')[0] : 'Unknown'}</span>
                      {game.metacritic && (
                        <span className={`px-1.5 rounded ${game.metacritic >= 75 ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : game.metacritic >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' : 'bg-[var(--panel-muted)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                          {game.metacritic}
                        </span>
                      )}
                    </div>
                  </div>
                  {exists ? (
                    <span className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--panel-muted)] text-[var(--text-muted)] border border-[var(--border)]">
                      On board
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddGameFromSearch(game)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm font-semibold shadow"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  )}
                </div>
              );
            })}
            {!isSearching && searchHasSearched && searchQuery.trim() && searchResults.length === 0 && (
              <div className="text-sm text-[var(--text-muted)] px-2 py-2">No results found.</div>
            )}
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

      {/* Playlists Modal - Redesigned */}
      <Modal
        isOpen={isPlaylistsModalOpen}
        onClose={closePlaylists}
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
                    onClick={() => { openPlaylist(pl.id); setOpenPlaylistMenuId(null); }}
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
              onClick={() => createPlaceholderPlaylist()}
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
                    <button
                      onClick={() => setIsPlaylistAddOpen(prev => !prev)}
                      className="text-[11px] px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-semibold"
                    >
                      Add games
                    </button>
                  </div>
                </div>

                {isPlaylistAddOpen && (
                  <div className="border border-[var(--border)] rounded-lg bg-[var(--panel-muted)] p-3">
                    <form onSubmit={handlePlaylistSearch} className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-2.5 text-[var(--text-muted)]" />
                        <input
                          className="w-full pl-9 pr-9 py-2 rounded border border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--text)] focus:border-[var(--accent)] outline-none"
                          placeholder="Search games to add..."
                          value={playlistSearchQuery}
                          onChange={(e) => setPlaylistSearchQuery(e.target.value)}
                        />
                        {playlistSearchQuery && (
                          <button
                            type="button"
                            onClick={resetPlaylistGameSearch}
                            className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-[var(--text)]"
                            aria-label="Clear search"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm font-semibold"
                      >
                        {isSearchingPlaylistGames ? 'Searching...' : 'Search'}
                      </button>
                    </form>
                    {playlistSearchError && (
                      <div className="text-xs text-red-400 mt-2">{playlistSearchError}</div>
                    )}
                    <div className="mt-3 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                      {isSearchingPlaylistGames && (
                        <div className="text-sm text-[var(--text-muted)]">Searching games...</div>
                      )}
                      {!isSearchingPlaylistGames && playlistSearchHasSearched && playlistSearchQuery.trim() && playlistSearchResults.length === 0 && (
                        <div className="text-sm text-[var(--text-muted)]">No results found.</div>
                      )}
                      {playlistSearchResults.map((g) => {
                        const mapped = gameFromRaw(g);
                        const exists = (selectedPlaylist.items || []).some((item) => sameGameIdentity(item, mapped));
                        return (
                          <div key={g.id || mapped.title} className="flex items-center gap-3 p-2 rounded border border-[var(--border)] bg-[var(--panel)]">
                            <div
                              className="w-12 h-12 rounded bg-[var(--panel-muted)] border border-[var(--border)] flex-shrink-0 overflow-hidden"
                              style={{ backgroundImage: mapped.cover ? `url(${mapped.cover})` : PLACEHOLDER_COVERS[(mapped.coverIndex ?? 0) % PLACEHOLDER_COVERS.length], backgroundSize: 'cover', backgroundPosition: 'center' }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-[var(--text)] truncate">{mapped.title}</div>
                              <div className="text-[11px] text-[var(--text-muted)] truncate">
                                {(mapped.year || '').toString()} {mapped.year ? '·' : ''} {mapped.platform}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (exists) {
                                  const idx = (selectedPlaylist.items || []).findIndex((item) => sameGameIdentity(item, mapped));
                                  if (idx > -1) handleRemovePlaylistItem(selectedPlaylist, idx);
                                } else {
                                  addGameToPlaylist(selectedPlaylist.id, mapped);
                                }
                              }}
                              className={`text-xs px-3 py-1.5 rounded font-semibold ${
                                exists
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                  : 'bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white'
                              }`}
                            >
                              {exists ? 'In playlist' : 'Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                      const isHovered = hoveredPlaylistItemIdx === idx;
                      const isSelected = selectedPlaylistItemIdx === idx;
                      return (
                        <div
                          key={`${item.title}-${idx}`}
                          className={`grid grid-cols-[32px_44px_1fr_1fr_140px] items-center px-4 py-3 gap-2 ${isSelected ? 'bg-[var(--panel)]/60' : ''}`}
                          onMouseEnter={() => setHoveredPlaylistItemIdx(idx)}
                          onMouseLeave={() => setHoveredPlaylistItemIdx(null)}
                          onClick={() => setSelectedPlaylistItemIdx(idx)}
                        >
                          <span className="text-xs text-[var(--text-muted)]">{idx + 1}</span>
                          <div className="w-10 h-10 rounded bg-[var(--panel)] border border-[var(--border)] overflow-hidden" style={{ backgroundImage: item.cover ? `url(${item.cover})` : PLACEHOLDER_COVERS[(item.coverIndex ?? 0) % PLACEHOLDER_COVERS.length], backgroundSize: 'cover', backgroundPosition: 'center' }} />
                          <div className="min-w-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); openGameCard(item, false); }}
                              className="text-sm font-semibold text-[var(--text)] truncate hover:text-[var(--accent)] text-left w-full"
                            >
                              {item.title}
                            </button>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{item.year ? `${item.year} · ` : ''}{item.platform}</div>
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">{item.genre || '—'}</div>
                          <div className="flex items-center gap-2 justify-end">
                            {(isHovered || isSelected) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemovePlaylistItem(selectedPlaylist, idx); }}
                                className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400"
                                title="Remove from playlist"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            {exists ? (
                              <span className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--panel-muted)] text-[var(--text-muted)] border border-[var(--border)]">
                                On board
                              </span>
                            ) : (
                              <select
                                onChange={(e) => addPlaylistItemToList(item, e.target.value)}
                                defaultValue=""
                                className="bg-[var(--panel)] border border-[var(--border)] text-[11px] text-[var(--text)] rounded px-2 py-1"
                              >
                                <option value="" disabled>Add to board list</option>
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
              onClick={() => { setIsBrowsePlaylistsModalOpen(false); openPlaylist(pl.id); }}
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

          <label className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg bg-[var(--panel-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={columnForm.isCompletion === true}
              onChange={(e) => setColumnForm({
                ...columnForm,
                isCompletion: e.target.checked,
                isPlaying: e.target.checked ? false : columnForm.isPlaying,
              })}
              className="mt-0.5 accent-purple-600"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--text)]">Games here count as finished</span>
              <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                Moving a game into this list stamps the date you completed it, and it shows up in your profile stats.
                {' '}
                {columnForm.isCompletion
                  ? 'Unticking this clears those dates for the games in this list.'
                  : 'Ticking this dates the games already in this list as completed now.'}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg bg-[var(--panel-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={columnForm.isPlaying === true}
              onChange={(e) => setColumnForm({
                ...columnForm,
                isPlaying: e.target.checked,
                isCompletion: e.target.checked ? false : columnForm.isCompletion,
              })}
              className="mt-0.5 accent-purple-600"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--text)]">This is my &ldquo;currently playing&rdquo; list</span>
              <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                Moving a game here tells your friends you started it, and it is the game shown next to your name.
                {' '}
                {playingListTitle && playingListTitle !== columnForm.title && !columnForm.isPlaying
                  ? `Right now that is "${playingListTitle}" \u2014 ticking this moves it here.`
                  : 'Only one list can be this at a time.'}
              </span>
            </span>
          </label>

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
