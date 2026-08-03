#!/usr/bin/env node
/**
 * Keeps the adb reverse tunnels the app depends on alive.
 *
 * The app talks to the backend over `http://localhost:5000`, which on a physical
 * device means the device itself — so it only works through an adb reverse
 * tunnel. Expo/RN CLI establishes tcp:8081 (Metro) automatically but knows
 * nothing about the API port, and `npx expo run:android` bypasses npm scripts,
 * so the usual `predev`-style hook never fires. The result is a build that
 * launches fine and fails every API call with "Network error".
 *
 * Reverse tunnels are also not durable: they are lost on unplug/replug, device
 * reboot, and adb server restart. A one-shot `adb reverse` at launch therefore
 * fixes it only until the next cable wobble.
 *
 * Run with --watch (see `npm run adb:reverse:watch`) to re-establish tunnels
 * whenever a device appears or a tunnel goes missing, regardless of how the app
 * was launched. Without --watch it applies once and exits, which is what the
 * `dev` / `android` scripts use.
 *
 *   node scripts/adb-reverse.js            # one-shot
 *   node scripts/adb-reverse.js --watch    # keep alive
 *   node scripts/adb-reverse.js 5000 8081  # explicit ports
 */
const { execFileSync } = require('child_process');

const POLL_MS = 3000;
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const ports = args.filter(a => /^\d+$/.test(a)).map(Number);
const PORTS = ports.length > 0 ? ports : [8081, 5000];

function adb(deviceArgs) {
  try {
    return execFileSync('adb', deviceArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return null;
  }
}

/** Serials of devices in the `device` state — `unauthorized`/`offline` can't hold tunnels. */
function connectedDevices() {
  const out = adb(['devices']);
  if (out === null) return null; // adb itself missing or not on PATH
  return out
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(parts => parts.length >= 2 && parts[1] === 'device')
    .map(parts => parts[0]);
}

function activeReverses(serial) {
  const out = adb(['-s', serial, 'reverse', '--list']);
  if (!out) return new Set();
  // Lines look like: `UsbFfs tcp:8081 tcp:8081`
  const found = new Set();
  for (const line of out.split('\n')) {
    const match = line.match(/tcp:(\d+)\s+tcp:(\d+)/);
    if (match) found.add(Number(match[1]));
  }
  return found;
}

/** Ensures every required port is tunnelled for `serial`. Returns ports newly added. */
function ensureTunnels(serial) {
  const active = activeReverses(serial);
  const added = [];
  for (const port of PORTS) {
    if (active.has(port)) continue;
    if (adb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]) !== null) {
      added.push(port);
    }
  }
  return added;
}

let warnedNoAdb = false;
let lastSeen = new Set();

function tick(verbose) {
  const devices = connectedDevices();

  if (devices === null) {
    if (!warnedNoAdb) {
      console.warn('[adb-reverse] adb not found on PATH — skipping. Install platform-tools to enable device API access.');
      warnedNoAdb = true;
    }
    return;
  }
  warnedNoAdb = false;

  if (devices.length === 0) {
    if (verbose || lastSeen.size > 0) {
      console.log('[adb-reverse] no device connected — waiting.');
    }
    lastSeen = new Set();
    return;
  }

  for (const serial of devices) {
    const added = ensureTunnels(serial);
    if (added.length > 0) {
      console.log(`[adb-reverse] ${serial}: tunnelled ${added.map(p => `tcp:${p}`).join(', ')}`);
    } else if (verbose && !lastSeen.has(serial)) {
      console.log(`[adb-reverse] ${serial}: tunnels already active (${PORTS.map(p => `tcp:${p}`).join(', ')})`);
    }
  }
  lastSeen = new Set(devices);
}

// A missing tunnel must never fail the build/dev command it is chained in front
// of — the app still runs, it just cannot reach the API, and a hard exit here
// would be a worse failure than the one it is trying to prevent.
tick(true);

if (watch) {
  console.log(`[adb-reverse] watching for devices; keeping ${PORTS.map(p => `tcp:${p}`).join(', ')} alive. Ctrl+C to stop.`);
  setInterval(() => tick(false), POLL_MS);
}
