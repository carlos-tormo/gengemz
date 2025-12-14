import React, { useState, useRef } from 'react';
import { LogIn, LogOut, Settings, Users, UserPlus, Edit2 } from 'lucide-react';
import useClickOutside from '../hooks/useClickOutside';

const UserMenu = ({ user, onOpenProfile, onOpenSettings, onLogin, onLogout, onOpenFriends }) => {
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
              {!user.isAnonymous && onOpenFriends && <button onClick={() => { onOpenFriends(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"><Users size={16} /> Friends</button>}
              {user.isAnonymous ? <button onClick={() => { onLogin(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"><LogIn size={16} /> Sign In with Google</button> : <button onClick={() => { onLogout(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"><LogOut size={16} /> Sign Out</button>}
              {!user.isAnonymous && <button onClick={() => { onOpenProfile(); setIsOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"><Edit2 size={16} /> Edit Name</button>}
            </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
