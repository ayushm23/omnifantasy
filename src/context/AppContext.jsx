import { createContext, useContext } from 'react';

/**
 * Shared application context for state that both DraftView and LeagueView need.
 *
 * Provided by omnifantasy-app.jsx around the view rendering block.
 * Consumed in DraftView and LeagueView via useAppContext().
 *
 * Moving shared state here eliminates ~22 repeated props from each view's
 * prop signature and makes it trivial to expose new shared state in future.
 */
export const AppContext = createContext(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppContext.Provider');
  return ctx;
}
