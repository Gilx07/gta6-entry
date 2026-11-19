// Minimal CDP driver (Node 24 stdlib only): launches headless Chrome, opens a URL,
// collects console errors, waits for a title substring, sends keys, takes screenshots.
// Usage:
//   node tools/cdp-driver.mjs --url URL --wait-title TEXT --timeout MS --shot OUT.jpg [--keys "KeyW:1200,KeyE:100"]
// Keys are dispatched as raw keyDown/keyUp with a hold duration in ms, in order.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME || '/home/hatch/workspace/virtual-browser/chrome-linux64/chrome';
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const m = rawArgs[i].match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] !== undefined ? m[2] : (rawArgs[i + 1] && !rawArgs[i + 1].startsWith('--') ? rawArgs[++i] : true);
}
const url = args.url;
const waitTitle = args['wait-title'] || '';
const timeoutMs = parseInt(args.timeout || '30000', 10);
const shotPath = args.shot || '';
const keysSpec = args.keys || '';

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9333', '--window-size=1280,800',
  '--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--user-data-dir=/tmp/chrome-vb',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, msgId = 0;
const pending = new Map();
const consoleLines = [];
const errors = [];

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9333/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no CDP target');
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const wsUrl = await getTarget();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      consoleLines.push(`[${m.params.type}] ${text}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(`${d.text}: ${d.exception?.description || ''}`);
    }
    if (m.method === 'Network.loadingFailed') {
      errors.push(`network failed: ${m.params.errorText}`);
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  // wait for the title
  const t0 = Date.now();
  let title = '';
  while (Date.now() - t0 < timeoutMs) {
    const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    title = r?.result?.value || '';
    if (!waitTitle || title.includes(waitTitle)) break;
    await sleep(400);
  }
  console.log(`TITLE: ${title}`);
  // keys: "KeyW:1200,KeyE:100" = hold W 1200ms, tap E
  if (keysSpec) {
    for (const part of keysSpec.split(',')) {
      const [code, holdStr] = part.split(':');
      const hold = parseInt(holdStr || '100', 10);
      const key = code.replace(/^Key/, '').toLowerCase();
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: code.charCodeAt(0) });
      await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: code.charCodeAt(0) });
      await sleep(150);
    }
    await sleep(800);
  }
  if (shotPath) {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(shotPath, Buffer.from(r.data, 'base64'));
    console.log(`SHOT SAVED ${shotPath}`);
  }
  // dump console + errors
  for (const l of consoleLines) console.log('CONSOLE ' + l);
  for (const e of errors) console.log('ERROR ' + e);
  console.log(`ERRORS: ${errors.length}`);
  ws.close();
  chrome.kill();
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error('DRIVER FAIL', e.message); chrome.kill(); process.exit(2); });
