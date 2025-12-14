import { 
  Clock, Gamepad2, Trophy, Star, Heart, 
  Zap, Skull, Flame, Bookmark, Sword, 
  Target, Ghost 
} from 'lucide-react';

export const COLUMN_ICONS = {
  clock: Clock, gamepad: Gamepad2, trophy: Trophy, star: Star, heart: Heart, 
  zap: Zap, skull: Skull, flame: Flame, bookmark: Bookmark, sword: Sword, 
  target: Target, ghost: Ghost
};

export const PLACEHOLDER_COVERS = [
  "linear-gradient(to bottom right, #ef4444, #b91c1c)",
  "linear-gradient(to bottom right, #3b82f6, #1d4ed8)", 
  "linear-gradient(to bottom right, #10b981, #047857)",
  "linear-gradient(to bottom right, #8b5cf6, #6d28d9)",
  "linear-gradient(to bottom right, #f59e0b, #b45309)",
];

export const APP_ID = 'gengemz-prod'; 
export const BACKEND_URL = "https://us-central1-gengemztest-958e.cloudfunctions.net/searchGames";

export const INITIAL_DATA = {
  games: {},
  columns: {
    'backlog': { id: 'backlog', title: 'To Play', icon: 'clock', itemIds: [] },
    'playing': { id: 'playing', title: 'Currently Playing', icon: 'gamepad', itemIds: [] },
    'completed': { id: 'completed', title: 'Victory Road', icon: 'trophy', itemIds: [] },
  },
  columnOrder: ['backlog', 'playing', 'completed'],
};
