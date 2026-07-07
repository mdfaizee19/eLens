import { createContext, useContext, useMemo, useState } from 'react';

// Contract 3: exposes which block is "active" (currently being read) so a
// future gaze/attention-tracking mechanism can drive reading-focused UI
// (e.g. highlighting the active card). This file only provides the
// context/state plumbing - no tracking logic lives here. The default value
// is a permanent no-op, so any consumer works correctly even if no provider
// (or a provider that never calls setActiveBlockId) is present.
const ActiveBlockContext = createContext({
  activeBlockId: null,
  setActiveBlockId: () => {},
});

export function ActiveBlockProvider({ children }) {
  const [activeBlockId, setActiveBlockId] = useState(null);

  const value = useMemo(
    () => ({ activeBlockId, setActiveBlockId }),
    [activeBlockId],
  );

  return (
    <ActiveBlockContext.Provider value={value}>
      {children}
    </ActiveBlockContext.Provider>
  );
}

export function useActiveBlock() {
  return useContext(ActiveBlockContext);
}
