import { 
  Clock, Gamepad2, Trophy, Star, Heart, 
  Zap, Skull, Flame, Bookmark, Sword, 
  Target, Ghost 
} from 'lucide-react';

/* =======================
   UI CONSTANTS (unchanged)
   ======================= */

export const COLUMN_ICONS = {
  clock: Clock,
  gamepad: Gamepad2,
  trophy: Trophy,
  star: Star,
  heart: Heart,
  zap: Zap,
  skull: Skull,
  flame: Flame,
  bookmark: Bookmark,
  sword: Sword,
  target: Target,
  ghost: Ghost,
};

export const PLACEHOLDER_COVERS = [
  "linear-gradient(to bottom right, #ef4444, #b91c1c)",
  "linear-gradient(to bottom right, #3b82f6, #1d4ed8)", 
  "linear-gradient(to bottom right, #10b981, #047857)",
  "linear-gradient(to bottom right, #8b5cf6, #6d28d9)",
  "linear-gradient(to bottom right, #f59e0b, #b45309)",
];

/* =======================
   APP / BACKEND CONFIG
   ======================= */

export const APP_ID = 'gengemz-prod';

// 🔎 Detect local vs deployed
const isLocal =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

// 🔗 Use the SAME project Firebase is already using
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const REGION = "us-central1";

// 🌍 BACKEND_URL still points directly to searchGames
export const BACKEND_URL = isLocal
  ? `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/searchGames`
  : `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/searchGames`;

/* =======================
   INITIAL APP DATA
   ======================= */

export const INITIAL_DATA = {
  games: {},
  columns: {
    backlog: {
      id: 'backlog',
      title: 'To Play',
      icon: 'clock',
      itemIds: [],
    },
    playing: {
      id: 'playing',
      title: 'Currently Playing',
      icon: 'gamepad',
      itemIds: [],
    },
    completed: {
      id: 'completed',
      title: 'Victory Road',
      icon: 'trophy',
      itemIds: [],
    },
  },
  columnOrder: ['backlog', 'playing', 'completed'],
};

console.log("BACKEND_URL:", BACKEND_URL);
