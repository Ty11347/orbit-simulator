import { useEffect } from 'react';
import { useEngineStore } from '../store/useEngineStore';

// 全局空格键监听器，包含输入框防误触机制
export function useSpacebarToggle() {
  const togglePause = useEngineStore(state => state.togglePause);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName;
        
        // 处于输入状态时，不拦截空格键
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          return;
        }

        e.preventDefault();

        // 强行移除当前霸占焦点的 UI 元素（如下拉菜单）
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