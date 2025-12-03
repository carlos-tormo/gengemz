import { useState, useRef, useCallback } from 'react';
import { doc, setDoc } from "firebase/firestore";
import { db, APP_ID } from '../config/firebase';

export const useDebouncedSave = (user) => {
  const [status, setStatus] = useState('idle'); 
  const timeoutRef = useRef(null);

  const save = useCallback((newData) => {
    if (!user) {
      setStatus('idle'); 
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

  return { status, save, setStatus };
};