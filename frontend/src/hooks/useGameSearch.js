import { useCallback, useState } from 'react';
import { searchGamesWithVariants } from '../services/rawgService';

const useGameSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    setHasSearched(false);
    setIsSearching(false);
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setHasSearched(false);
  }, []);

  const search = useCallback(async (rawQuery = query, fallbackQuery) => {
    if (!rawQuery.trim() && !fallbackQuery) {
      clearResults();
      return [];
    }

    setHasSearched(true);
    setIsSearching(true);
    setError(null);

    try {
      const nextResults = await searchGamesWithVariants(rawQuery, fallbackQuery);
      setResults(nextResults);
      return nextResults;
    } catch (searchError) {
      console.error('Game search failed', searchError);
      setError('Search failed. Try again.');
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [clearResults, query]);

  return {
    query,
    setQuery,
    results,
    setResults,
    isSearching,
    error,
    setError,
    hasSearched,
    setHasSearched,
    search,
    reset,
    clearResults,
  };
};

export default useGameSearch;
