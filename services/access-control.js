const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const COOKIE = 'hrg_access';
const equal = (a, b) => {
  const left = Buffer.from(a || ''); const right = Buffer.from(b || '');
  return left.length === right.length && timingSafeEqual(left, right);
};
function createAccessControl(directory, { hosts } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'lan-access-code');
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(24).toString('base64url'), { mode: 0o600, flag: 'wx' });
  fs.chmodSync(file, 0o600);
  const secret = fs.readFileSync(file, 'utf8').trim();
  if (secret.length < 24) throw new Error('LAN-Zugangscode ist ungültig');
  const sign = (value) => createHmac('sha256', secret).update(value).digest('base64url');
  function validHost(req) {
    let hostname;
    try { hostname = new URL(`http://${req.headers.host}`).hostname.replace(/^\[|\]$/g, ''); } catch { return false; }
    const addresses = hosts || ['localhost', '127.0.0.1', '::1', ...Object.values(os.networkInterfaces()).flat().filter(Boolean).map((entry) => entry.address)];
    return addresses.includes(hostname);
  }
  function sameOrigin(req) {
    if (!validHost(req)) return false;
    if (!req.headers.origin) return true;
    try {
      const origin = new URL(req.headers.origin);
      return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host;
    } catch { return false; }
  }
  function local(req) {
    const address = req.socket.remoteAddress;
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  }
  function authorized(req) {
    if (!sameOrigin(req)) return false;
    if (local(req)) return true;
    const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
    if (!cookie) return false;
    const [expires, signature] = cookie.slice(COOKIE.length + 1).split('.');
    return /^\d+$/.test(expires) && Number(expires) > Date.now() && equal(signature, sign(expires));
  }
  function login(code) {
    if (!equal(code, secret)) return null;
    const expires = String(Date.now() + 12 * 60 * 60 * 1000);
    return `${COOKIE}=${expires}.${sign(expires)}`;
  }
  function install(app, server, wss) {
    const failures = new Map();
    app.use((req, res, next) => {
      if (!sameOrigin(req)) return res.status(403).json({ error: 'Fremder Ursprung oder Host ist nicht erlaubt' });
      if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.get('/api/access', (req, res) => res.json({ authorized: authorized(req), local: local(req) }));
    app.post('/api/access/login', (req, res) => {
      const key = req.socket.remoteAddress;
      const previous = failures.get(key);
      const state = previous?.until > Date.now() ? previous : { count: 0, until: Date.now() + 60000 };
      if (state.count >= 5) return res.status(429).json({ error: 'Zu viele Versuche; in einer Minute erneut anmelden' });
      const cookie = login(typeof req.body?.code === 'string' ? req.body.code : '');
      if (!cookie) {
        state.count++; failures.set(key, state);
        if (failures.size > 1000) for (const [address, item] of failures) if (item.until <= Date.now()) failures.delete(address);
        return res.status(401).json({ error: 'Zugangscode stimmt nicht' });
      }
      failures.delete(key);
      res.setHeader('Set-Cookie', `${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.socket.encrypted ? '; Secure' : ''}`);
      res.json({ authorized: true });
    });
    app.use('/api', (req, res, next) => authorized(req) ? next() : res.status(401).json({ error: 'LAN-Anmeldung erforderlich' }));
    server.on('upgrade', (req, socket, head) => {
      if (!authorized(req)) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
  }
  return { directory, authorized, sameOrigin, login, install };
}
module.exports = { createAccessControl };
