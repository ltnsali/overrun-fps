'use strict';
/**
 * OVERRUN deathmatch relay.
 *
 * A dumb broadcast bus with no dependencies: whatever a client sends is
 * forwarded verbatim to every other client in the same room. No game state
 * lives here, so the relay cannot desync a match and has nothing worth
 * attacking. It speaks raw RFC 6455 WebSocket over the built-in http server.
 *
 *   node server/relay.js [port]
 *   npm run relay
 *
 * Clients connect to  ws://<host>:<port>/?room=CODE&name=NAME
 */

const http = require('http');
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

/* Hard limits. A snapshot is ~150 bytes at 15Hz, so these are generous. */
const MAX_PAYLOAD = 8 * 1024;
const MAX_CLIENTS = 128;
const MAX_PER_ROOM = 12;
const MSG_BUDGET = 240; // messages per second per client
const IDLE_MS = 45_000;
const ROOM_RE = /^[A-Z0-9]{1,8}$/;

const rooms = new Map(); // code -> Set<client>
let clientCount = 0;
let nextId = 1;

/* ---------------------------------------------------------------- framing */

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function encode(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, payload]);
}

/** Pull as many complete frames as possible out of a client's buffer. */
function drain(client, onText) {
  for (;;) {
    const buf = client.buf;
    if (buf.length < 2) return;

    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let off = 2;

    if (len === 126) {
      if (buf.length < off + 2) return;
      len = buf.readUInt16BE(off);
      off += 2;
    } else if (len === 127) {
      if (buf.length < off + 8) return;
      const hi = buf.readUInt32BE(off);
      const lo = buf.readUInt32BE(off + 4);
      if (hi !== 0) return close(client, 1009, 'too big');
      len = lo;
      off += 8;
    }

    // Clients MUST mask, and we refuse anything oversized or fragmented.
    if (!masked) return close(client, 1002, 'unmasked');
    if (len > MAX_PAYLOAD) return close(client, 1009, 'too big');
    if (!fin || opcode === 0x0) return close(client, 1003, 'fragmented');

    if (buf.length < off + 4 + len) return;
    const mask = buf.subarray(off, off + 4);
    off += 4;
    const payload = Buffer.from(buf.subarray(off, off + len));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    client.buf = buf.subarray(off + len);

    if (opcode === 0x8) return close(client, 1000, 'bye');
    if (opcode === 0x9) {
      send(client, 0xa, payload);
      continue;
    }
    if (opcode === 0xa) continue; // pong
    if (opcode !== 0x1) return close(client, 1003, 'binary'); // text only

    onText(payload.toString('utf8'));
    if (client.dead) return;
  }
}

function send(client, opcode, payload) {
  if (client.dead || !client.socket.writable) return;
  client.socket.write(encode(opcode, payload));
}

function sendText(client, text) {
  send(client, 0x1, Buffer.from(text, 'utf8'));
}

function close(client, code, reason) {
  if (client.dead) return;
  client.dead = true;
  const body = Buffer.alloc(2 + Buffer.byteLength(reason));
  body.writeUInt16BE(code, 0);
  body.write(reason, 2);
  try {
    send({ ...client, dead: false }, 0x8, body);
  } catch (e) {
    /* socket already gone */
  }
  client.socket.destroy();
  leave(client);
}

/* ------------------------------------------------------------------ rooms */

function join(client, code) {
  let set = rooms.get(code);
  if (!set) {
    set = new Set();
    rooms.set(code, set);
  }
  if (set.size >= MAX_PER_ROOM) return false;
  set.add(client);
  client.room = code;
  return true;
}

function leave(client) {
  if (!client.room) return;
  const set = rooms.get(client.room);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) rooms.delete(client.room);
  // Tell the room the peer is gone so avatars disappear immediately.
  broadcast(client, JSON.stringify({ t: 'bye', id: client.gid }));
  client.room = null;
}

function broadcast(from, text) {
  const set = rooms.get(from.room);
  if (!set) return;
  for (const peer of set) {
    if (peer !== from) sendText(peer, text);
  }
}

/* ----------------------------------------------------------------- server */

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clientCount, rooms: rooms.size }));
    return;
  }
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('This endpoint speaks WebSocket only.');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  if (!key || version !== '13') return socket.destroy();
  if (clientCount >= MAX_CLIENTS) return socket.destroy();

  let room;
  try {
    room = new URL(req.url, 'http://localhost').searchParams.get('room') || '';
  } catch (e) {
    return socket.destroy();
  }
  room = String(room).toUpperCase();
  if (!ROOM_RE.test(room)) return socket.destroy();

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' +
      acceptKey(key) +
      '\r\n\r\n'
  );

  const client = {
    socket,
    buf: Buffer.alloc(0),
    room: null,
    gid: 'r' + nextId++,
    dead: false,
    tokens: MSG_BUDGET,
    lastSeen: Date.now()
  };

  if (!join(client, room)) {
    close(client, 1013, 'room full');
    return;
  }
  clientCount++;
  socket.setNoDelay(true);

  sendText(client, JSON.stringify({ t: 'ready', room, peers: rooms.get(room).size - 1 }));

  socket.on('data', (chunk) => {
    client.lastSeen = Date.now();
    if (client.buf.length + chunk.length > MAX_PAYLOAD * 4) return close(client, 1009, 'backlog');
    client.buf = Buffer.concat([client.buf, chunk]);
    drain(client, (text) => {
      if (--client.tokens < 0) return close(client, 1008, 'flood');
      // Only well-formed game messages are relayed.
      let msg;
      try {
        msg = JSON.parse(text);
      } catch (e) {
        return;
      }
      if (!msg || typeof msg.t !== 'string' || msg.t.length > 12) return;
      broadcast(client, text);
    });
  });

  const done = () => {
    if (!client.dead) {
      client.dead = true;
      leave(client);
    }
    clientCount--;
  };
  socket.on('close', done);
  socket.on('error', done);
});

/* Refill the rate-limit budget and drop silent sockets. */
setInterval(() => {
  const now = Date.now();
  for (const set of rooms.values()) {
    for (const client of set) {
      client.tokens = MSG_BUDGET;
      if (now - client.lastSeen > IDLE_MS) close(client, 1001, 'idle');
    }
  }
}, 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`OVERRUN relay listening on ws://${HOST}:${PORT}/?room=CODE`);
});
