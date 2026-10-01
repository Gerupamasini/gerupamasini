import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const exe = await chromium.executablePath();
console.log('exe', exe);
const browser = await puppeteer.launch({ executablePath: exe, headless: 'shell', args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { webgl2: true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), maxSamples: gl.getParameter(gl.MAX_SAMPLES), gpu: !!navigator.gpu };
});
console.log(JSON.stringify(info));
await browser.close();
