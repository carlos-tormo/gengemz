import React from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
import logoWordmarkLight from '../assets/logo-wordmark-light.svg';
import logoWordmarkDark from '../assets/logo-wordmark-dark.svg';

const LandingPage = ({ onStart, onLogin, theme }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-center px-4 animate-in fade-in duration-500 bg-[var(--bg)] text-[var(--text)]">
      <img
        src={theme === 'light' ? logoWordmarkLight : logoWordmarkDark}
        alt="Gengemz"
        className="h-14 md:h-16 mb-6"
      />
      <h2 className="text-4xl md:text-5xl font-bold text-[var(--text)] mb-4 tracking-tight">Track Your Gaming Journey</h2>
      <p className="text-[var(--text-muted)] text-lg mb-10 max-w-md">Organize your backlog, manage current playthroughs, and celebrate your victories.</p>
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          onClick={onStart}
          className="group relative w-full py-4 bg-[var(--panel)] text-[var(--text)] font-bold rounded-xl shadow-lg hover:shadow-[var(--shadow)] hover:bg-[var(--panel-muted)] transition-all active:scale-95 flex items-center justify-center gap-2 border border-[var(--border)]"
        >
          <span>Start as Guest</span>
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
        <div className="flex items-center gap-4 w-full">
          <div className="h-px bg-[var(--border)] flex-1"></div>
          <span className="text-[var(--text-muted)] text-sm">OR</span>
          <div className="h-px bg-[var(--border)] flex-1"></div>
        </div>
        <button
          onClick={onLogin}
          className="w-full py-4 bg-[var(--panel-muted)] text-[var(--text)] font-semibold rounded-xl border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--panel-strong)] transition-all flex items-center justify-center gap-2"
        >
          <LogIn size={20} />
          <span>Continue with Google</span>
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
