// Takes the screenshots in shots.json: serves game/ with serve.ts, opens each
// ?shot= replay in a headless Chromium at 1280x720, waits for the game's
// window.__shotReady, and writes a JPEG into screenshots/. The replays are
// deterministic (seeded RNG, frozen simulation), so the same command writes the
// same bytes.
//
// Usage: node capture.mjs [--port 8931]
// Needs playwright-core resolvable (PLAYWRIGHT_CORE_PATH, or the /tmp/capture-tool
// install, or a local node_modules) and a Chromium headless shell in the
// Playwright cache (~/.cache/ms-playwright) or CHROMIUM_EXECUTABLE set.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const portArg = process.argv.indexOf('--port');
const port = portArg === -1 ? 8931 : Number(process.argv[portArg + 1]);

let playwright;
try {
  const localRequire = createRequire(join(here, 'package.json'));
  playwright = localRequire('playwright-core');
} catch {
  try {
    const toolRequire = createRequire('/tmp/capture-tool/package.json');
    playwright = toolRequire('playwright-core');
  } catch {
    console.error('playwright-core not found: install it (npm i playwright-core) and retry.');
    process.exit(1);
  }
}
const { chromium } = playwright;

const executablePath = process.env.CHROMIUM_EXECUTABLE
  || (existsSync(join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'))
    ? join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell')
    : undefined);

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: here, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitForServer(tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not come up: ${serverLog}`);
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  mkdirSync(join(here, 'screenshots'), { recursive: true });
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(`http://127.0.0.1:${port}/${shot.query}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
    const outPath = join(here, 'screenshots', shot.name);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 82 });
    const bytes = statSync(outPath).size;
    console.log(`${shot.name}: ${bytes} bytes${bytes > 262144 ? '  OVER 256 KiB!' : ''}${errors.length ? `  console errors: ${errors.join(' | ')}` : ''}`);
    await page.close();
  }
  await browser.close();
  console.log('done.');
} finally {
  server.kill();
}
