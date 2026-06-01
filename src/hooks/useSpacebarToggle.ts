import { useEffect } from 'react';
import { useEngineStore } from '../store/useEngineStore';

// Global spacebar listener with input-focus guard
export function useSpacebarToggle() {
  const togglePause = useEngineStore(state => state.togglePause);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName;
        
        // Do not intercept spacebar when an input is focused
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          return;
        }

        e.preventDefault();

        // Force-blur any UI element currently holding focus (e.g. dropdowns)
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        togglePause();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause]);
}