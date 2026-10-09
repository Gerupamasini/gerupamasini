import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { PerspectiveCamera } from 'three';
import type { App } from '../../app/App';

/** Frame the 3D subject in the uncovered area without moving its orbit or hiding its model. */
export function usePanelViewport(app: App, panel: RefObject<HTMLElement>, camera: PerspectiveCamera, top = 0, frameTank = false) {
  useEffect(() => {
    if (!app.input.touchDevice || !panel.current) return;
    const homeView = frameTank ? app.tank.captureView() : null;
    const update = () => {
      const r = panel.current!.getBoundingClientRect(), w = window.innerWidth, h = window.innerHeight;
      const side = w > h && h <= 600;
      const freeW = side ? Math.max(100, r.left - 8) : w;
      const freeH = Math.max(100, (side ? h - 8 : r.top - 8) - top);
      camera.setViewOffset(freeW, freeH, 0, -top, w, h);
      if (frameTank) app.tank.frameTank(true);
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel.current);
    window.addEventListener('resize', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); camera.clearViewOffset(); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); if (homeView) app.tank.restoreView(homeView); };
  }, [app, panel, camera, top, frameTank]);
}
