import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ggz-theme';

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (err) {
    console.error('Theme load failed', err);
  }
  return 'dark';
};

const useTheme = () => {
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      console.error('Theme save failed', err);
    }
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
};

export default useTheme;
