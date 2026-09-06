import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { APP_ID } from '../config/constants';

/**
 * Save status + two ways to persist:
 *   - `save(legacyDoc)`: debounced full overwrite of data/board. Only used while
 *     an account is still on board schema 1 (until S3 migrates it).
 *   - `run(asyncWrite)`: immediate write (schema 2 batches), tracked with the
 *     same saving / saved / error status so the UI indicator keeps working.
 */
const useDebouncedSave = (user) => {
  const [status, setStatus] = useState('idle');
  const timeoutRef = useRef(null);
  const idleTimeoutRef = useRef(null);
  const pendingRef = useRef(0);

  const settle = useCallback((nextStatus) => {
    setStatus(nextStatus);
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    if (nextStatus === 'saved') idleTimeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
  }, []);

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
        // Full overwrite on purpose: `newData` is the whole document. With
        // { merge: true } Firestore deep-merges the `games`/`columns` maps, so
        // keys deleted on the client would never be deleted on the server.
        await setDoc(userDocRef, newData);
        settle('saved');
      } catch (error) {
        console.error('Save failed:', error);
        settle('error');
      }
    }, 1000);
  }, [user, settle]);

  const run = useCallback(async (write) => {
    if (!user) return;
    pendingRef.current += 1;
    setStatus('saving');
    try {
      await write();
      pendingRef.current -= 1;
      if (pendingRef.current === 0) settle('saved');
    } catch (error) {
      pendingRef.current -= 1;
      console.error('Save failed:', error);
      settle('error');
    }
  }, [user, settle]);

  // Clear pending timeouts on unmount to avoid late writes/state updates
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  return { status, save, run };
};

export default useDebouncedSave;
