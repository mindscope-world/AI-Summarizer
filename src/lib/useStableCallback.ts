import {useCallback, useRef} from 'react';

/**
 * A function whose identity never changes but which always runs the latest version passed in.
 * Lets a parent hand handlers to memoised children without defeating the memoisation on every render.
 */
export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: Args) => latest.current(...args), []);
}
