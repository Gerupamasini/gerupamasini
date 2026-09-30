import { App } from './App.js';

const params = new URLSearchParams(location.search);
const app = new App(document.getElementById('app'), {
  mode: params.get('mode') || 'aquarium',
  fishCount: params.has('fish') ? Number(params.get('fish')) : undefined,
  seed: params.has('seed') ? Number(params.get('seed')) : undefined,
  gui: params.get('gui') !== '0',
  quality: params.get('quality') || 'auto',
  test: params.get('test') || null,
  params,
});
app.init().then(() => {
  document.getElementById('loading')?.remove();
  window.__app = app;
  window.__ready = true;
});
