/**
 * The capture tool's safety rules, as PURE functions (no I/O), so a unit test can pin each one
 * (tests/uxCaptureGuard.test.ts). The tool reads only:
 *
 *   1. it refuses to run against anything but a loopback host;
 *   2. it aborts every request that is not GET / HEAD / OPTIONS (a server action, a form post
 *      and a Supabase write are all POST / PATCH / PUT / DELETE), and it closes every WebSocket
 *      except the dev server's own hot-reload socket (Playwright's `route` does not see socket
 *      traffic, and a Supabase Realtime socket can send broadcast and presence messages with the
 *      signed-in user's token);
 *   3. it signs in only through the dev-only GET route, only for the three seeded test addresses;
 *   4. a plan can only name a path on that host: it can never move the browser to another one.
 *
 * The local environment uses the PRODUCTION database. Do not weaken these without the owner.
 */

export class GuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "GuardError";
  }
}

/** The only hosts the tool will talk to. `new URL()` writes an IPv6 host with its brackets. */
export const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

/** The three seeded test accounts (scripts/seed-test-users.ts). The dev route accepts the same list. */
export const TEST_ADDRESSES = ["master@cata.test", "par1@cata.test", "par2@cata.test"];

/** The methods that cannot change anything on a well-behaved server. */
const READ_ONLY_METHODS = ["GET", "HEAD", "OPTIONS"];

/** @param {unknown} method */
export function isReadOnlyMethod(method) {
  return READ_ONLY_METHODS.includes(String(method).toUpperCase());
}

/** The path prefix of the dev server's own sockets (hot reload): `/_next/webpack-hmr`. */
export const ALLOWED_SOCKET_PATH_PREFIX = "/_next/";

/**
 * Which WebSockets the browser context closes. The answer is "all, except one kind":
 *
 *   allowed = a socket to the tool's OWN base (same host AND port as `--base`, `ws:` for `http:`,
 *             `wss:` for `https:`, no userinfo) whose path is under `/_next/`.
 *
 * That is the Next dev server's hot-reload socket. A page does not hydrate while it is closed (Next 16
 * dev), and a capture of server HTML alone cannot see anything client-side (an inert shell, a hydrated
 * control, a client-rendered state). It carries hot-reload messages only and reaches no database.
 * Every other socket is closed without connecting to any server and counted: Supabase Realtime (it can
 * send broadcast and presence messages with the user's token), any other host, the same host on
 * another port, any other path. Playwright's `route` does not see socket traffic, so this is the only gate.
 *
 * Fails closed: anything that does not parse is blocked. The path must be exactly what the URL parser
 * keeps (a `..` segment, even percent-encoded, is resolved by the parser and so leaves `/_next/`) and
 * may hold only letters, digits and `. _ - /`, so no encoded slash or backslash can be read differently
 * by the server.
 * @param {unknown} url the socket's URL
 * @param {string} origin the tool's base origin, already checked by assertLocalBase
 * @returns {boolean} true = close it
 */
export function shouldBlockWebSocket(url, origin) {
  try {
    const socket = new URL(String(url));
    const base = new URL(String(origin));
    const expected = base.protocol === "https:" ? "wss:" : base.protocol === "http:" ? "ws:" : null;
    if (!expected || socket.protocol !== expected) return true;
    if (socket.username || socket.password) return true;
    if (socket.host !== base.host) return true; // host AND port
    const path = socket.pathname;
    if (!path.startsWith(ALLOWED_SOCKET_PATH_PREFIX)) return true;
    if (!/^\/_next\/[A-Za-z0-9._\-/]*$/.test(path)) return true;
    if (path.split("/").some((segment) => segment === ".." || segment === ".")) return true;
    return false;
  } catch {
    return true;
  }
}

/** @param {unknown} hostname */
export function isLocalHostname(hostname) {
  return LOCAL_HOSTNAMES.includes(String(hostname).toLowerCase());
}

/**
 * Validates the `--base` value and returns its origin (path, query and hash dropped).
 * Throws GuardError for anything that is not http(s) on localhost, 127.0.0.1 or [::1].
 * @param {string} input
 * @returns {string}
 */
export function assertLocalBase(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new GuardError(`Refusing to run: "${input}" is not a URL. Use http://localhost:3000.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GuardError(`Refusing to run: "${url.protocol}" is not http or https.`);
  }
  if (url.username || url.password) {
    throw new GuardError("Refusing to run: the base URL must not carry credentials.");
  }
  if (!isLocalHostname(url.hostname)) {
    throw new GuardError(
      `Refusing to run against "${url.hostname}". This tool talks only to ${LOCAL_HOSTNAMES.join(", ")}: ` +
        "the local environment uses the production database and the tool must never touch a deployed app.",
    );
  }
  return url.origin;
}

/**
 * Only the seeded test addresses may be signed in. Returns the address, normalised.
 * @param {string} email
 */
export function assertTestAddress(email) {
  const normalised = String(email ?? "").trim().toLowerCase();
  if (!TEST_ADDRESSES.includes(normalised)) {
    throw new GuardError(
      `Refusing to sign in as "${email}". Only ${TEST_ADDRESSES.join(", ")} are allowed. Never type a real address.`,
    );
  }
  return normalised;
}

/** The dev-only GET route that signs a seeded test account in (app/api/dev/sign-in/route.ts). */
export function signInUrl(origin, email, nextPath = "/es/app") {
  const address = assertTestAddress(email);
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    throw new GuardError("The sign-in redirect must be a path on the same host.");
  }
  return `${origin}/api/dev/sign-in?email=${encodeURIComponent(address)}&next=${encodeURIComponent(nextPath)}`;
}

/**
 * The URL of one screen: origin + "/" + locale + path. `path` is "" (the landing) or starts with
 * one "/" and holds no backslash, no line break and no "//" at its start. The result is checked
 * to stay on the origin it was built for.
 * @param {string} origin
 * @param {string} lang
 * @param {string} path
 */
export function buildTargetUrl(origin, lang, path) {
  if (!/^[a-z]{2}$/.test(lang)) throw new GuardError(`"${lang}" is not a two-letter locale.`);
  if (typeof path !== "string") throw new GuardError("A plan path must be a string.");
  if (path !== "" && !path.startsWith("/")) throw new GuardError(`Plan path "${path}" must start with "/".`);
  if (path.startsWith("//") || /[\\\r\n\t]/.test(path)) throw new GuardError(`Plan path "${path}" is not allowed.`);
  const target = new URL(`/${lang}${path}`, origin);
  if (target.origin !== new URL(origin).origin) {
    throw new GuardError(`Plan path "${path}" would leave ${origin}.`);
  }
  return target.toString();
}
