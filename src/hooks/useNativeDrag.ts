import { useEffect, useRef } from 'react';

// Native DOM-level panel drag that bypasses the React render cycle for better performance
export function useNativeDrag(active: any) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // Only allow dragging via the top drag handle
    const handle = panel.querySelector('.drag-handle') as HTMLElement;
    if (!handle) return;

    // Centralized drag state variables
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialMouseX = 0;
    let initialMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      initialMouseX = e.clientX;
      initialMouseY = e.clientY;
      document.body.style.userSelect = 'none'; // Prevent accidental text selection while dragging
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - initialMouseX;
      const dy = e.clientY - initialMouseY;
      // Direct DOM style manipulation for smooth movement
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