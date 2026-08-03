#!/usr/bin/env node
/**
 * Points the app at this machine's backend, and keeps it pointed there.
 *
 * There are two ways a physical device can reach a backend running on this
 * laptop, and each fails in its own way:
 *
 *   - `http://localhost:5000` + `adb reverse` — works over USB, immune to IP
 *     changes, but the tunnel dies on unplug/replug, device reboot, or an adb
 *     server restart.
 *   - `http://<LAN IP>:5000` — survives unplugging and works over Wi-Fi, but
 *     the address is DHCP-assigned and silently changes when this machine
 *     rejoins a network. Hostname resolution is not an option: Android does not
 *     resolve this machine's name over mDNS or NetBIOS on this network.
 *
 * So this script does both — writes the CURRENT LAN address into .env, and
 * establishes the USB tunnel as a fallback. Run before starting Metro (the
 * `dev` / `android` scripts already do) and the address is correct for that
 * session regardless of which network you are on.
 *
 * NOTE: this is a development-loop concern only. A deployed backend has a
 * stable hostname and none of this applies.
 *
 *   node scripts/dev-network.js            # detect, write .env, tunnel
 *   node scripts/dev-network.js --usb      # force localhost + tunnel instead
 *   node scripts/dev-network.js --print    # show what it would use, change nothing
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = 5000;
const ENV_PATH = path.join(__dirname, '..', '.env');
const ENV_KEY = 'EXPO_PUBLIC_API_BASE_URL';

const args = process.argv.slice(2);
const forceUsb = args.includes('--usb');
const printOnly = args.includes('--print');

/**
 * The LAN address a phone on the same Wi-Fi can actually reach.
 *
 * Interface NAME is the filter, not the address range. This machine has
 * Hyper-V and WSL virtual adapters holding perfectly ordinary-looking private
 * addresses (172.x) that no phone can route to — picking "the first non-internal
 * IPv4" lands on one of those and produces a config that looks right and never
 * connects.
 */
function detectLanAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    // `vEthernet (...)` is Hyper-V/WSL; `Loopback` is self-explanatory.
    if (/vethernet|loopback|virtual|vmware|virtualbox/i.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      candidates.push({ name, address: address.address });
    }
  }

  // Wireless first: the phone is almost always on Wi-Fi, and a wired adapter
  // may sit on a subnet the phone cannot reach.
  const wireless = candidates.find(c => /wi-?fi|wireless|wlan/i.test(c.name));
  return wireless ?? candidates[0] ?? null;
}

function readEnv() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    return '';
  }
}

/** Rewrites the key in place, preserving surrounding comments and ordering. */
function writeBaseUrl(baseUrl) {
  const contents = readEnv();
  const line = `${ENV_KEY}=${baseUrl}`;
  const pattern = new RegExp(`^${ENV_KEY}=.*$`, 'm');

  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}\n${line}\n`;

  if (next === contents) return false;
  fs.writeFileSync(ENV_PATH, next);
  return true;
}

function currentBaseUrl() {
  const match = readEnv().match(new RegExp(`^${ENV_KEY}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function ensureTunnels() {
  try {
    execFileSync('node', [path.join(__dirname, 'adb-reverse.js')], { stdio: 'inherit' });
  } catch {
    // Never fatal: the LAN address may be all that is needed, and a missing
    // tunnel must not block starting the dev server.
  }
}

const lan = forceUsb ? null : detectLanAddress();
const baseUrl = lan
  ? `http://${lan.address}:${PORT}/api/v1`
  : `http://localhost:${PORT}/api/v1`;

if (printOnly) {
  console.log(`[dev-network] would use ${baseUrl}${lan ? ` (via ${lan.name})` : ' (USB tunnel)'}`);
  console.log(`[dev-network] .env currently has ${currentBaseUrl() ?? '<unset>'}`);
} else {
  const changed = writeBaseUrl(baseUrl);
  if (lan) {
    console.log(
      `[dev-network] API base URL -> ${baseUrl} (via ${lan.name})${changed ? '' : ' (unchanged)'}`
    );
  } else {
    console.log(`[dev-network] no reachable LAN address; using USB tunnel -> ${baseUrl}`);
  }
  // Tunnel regardless: harmless when the LAN route is in use, and the thing
  // that keeps `localhost` working if Wi-Fi drops mid-session.
  ensureTunnels();

  if (changed) {
    console.log('[dev-network] .env changed — start Metro with --clear so the new value is bundled.');
  }
}
