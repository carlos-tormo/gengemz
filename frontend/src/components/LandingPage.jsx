import React from 'react';
import { Gamepad2, ArrowRight, LogIn } from 'lucide-react';

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

export default LandingPage;
