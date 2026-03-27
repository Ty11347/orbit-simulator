import { useEffect, useRef } from 'react';

// 提供原生 DOM 级别的面板拖拽功能，绕过 React 渲染周期以提升性能
export function useNativeDrag(active: any) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // 仅允许通过顶部拖拽把手进行拖拽
    const handle = panel.querySelector('.drag-handle') as HTMLElement;
    if (!handle) return;

    // 拖拽状态变量集中声明
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialMouseX = 0;
    let initialMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      document.body.style.userSelect = 'none'; // 防止拖拽时误选文本
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - initialMouseX;
      const dy = e.clientY - initialMouseY;
      // 直接操作 DOM 样式实现平滑移动
      panel.style.transform = `translate(${currentX + dx}px, ${currentY + dy}px)`;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      currentX += e.clientX - initialMouseX;
      currentY += e.clientY - initialMouseY;
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [active]);

  return panelRef;
}