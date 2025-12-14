import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../config/firebase'; // Assuming APP_ID is also used here

const useDebouncedSave = (user) => {
  const [status, setStatus] = useState('idle'); 
  const timeoutRef = useRef(null);

  const save = useCallback((newData) => {
    if (!user) {
      setStatus('idle'); // No user yet, don't error out
      return;
    }
    
    setStatus('saving');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      try {
        const userDocRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'data', 'board');
        await setDoc(userDocRef, newData, { merge: true });
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (error) {
        console.error("Save failed:", error);
        setStatus('error');
      }
    }, 1000); 
  }, [user]);

  // Clear pending timeout on unmount to avoid late writes/state updates
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { status, save };
};

export default useDebouncedSave;
