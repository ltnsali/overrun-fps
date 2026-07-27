"use strict";
/* ---------------------------------------------------------------------------
   14b. MULTIPLAYER — NETWORKED DEATHMATCH

   The transport is a dumb broadcast bus: server/relay.js forwards a message to
   everyone else in the room, and BroadcastChannel does exactly the same between
   tabs on one device. There is no authoritative server, so:
     - every client simulates only its own player,
     - a shooter reports a hit and the victim applies it (a client is the only
       authority on its own health),
     - scores are derived identically everywhere from the death messages.
--------------------------------------------------------------------------- */

var MP_TICK = 1/15;      /* snapshot send rate */
var MP_LERP = 0.13;      /* render remote players this far in the past (s) */
var MP_DROP = 5;         /* forget a peer after this many silent seconds */
var MP_SYNC = 2;         /* the leader re-broadcasts the rules this often */
var MP_PROTO = 1;

var MATCH = {
  on:false, ended:false, online:false,
  fragLimit:20, timeLimit:300, respawnDelay:3, bots:4,
  t:0, respawnIn:0, killedBy:'', winner:'',
  kills:0, deaths:0,
  boardOpen:false, botTimer:0, syncT:0, hudT:0
};

var NET = {
  kind:'off',            /* 'off' | 'local' | 'ws' */
  id:'', name:'PLAYER', room:'ARENA',
  status:'offline', err:'',
  sock:null, chan:null,
  peers:{},              /* id -> remote player */
  acc:0
};

function mpNow(){ return performance.now()/1000; }
function mpOnline(){ return NET.kind !== 'off'; }

function mpId(){
  var s = '';
  for(var i=0;i<8;i++) s += '0123456789abcdef'[(Math.random()*16)|0];
  return s;
}
/* Stable per-player colour so you can tell opponents apart at a glance. */
function mpColor(id){
  var h = 2166136261;
  for(var i=0;i<id.length;i++){ h ^= id.charCodeAt(i); h = (h*16777619)>>>0; }
  var c = new THREE.Color();
  c.setHSL((h % 360)/360, 0.62, 0.56);
  return c.getHex();
}
function mpClean(s, max){
  return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, max);
}

/* Every client in a room must stand in the same arena, so deathmatch geometry is
   generated from a PRNG seeded with the room code instead of Math.random. */
function mpSeededRandom(room){
  var h = 2166136261;
  for(var i=0;i<room.length;i++){ h ^= room.charCodeAt(i); h = (h*16777619)>>>0; }
  var s = (h >>> 0) || 1;
  return function(){
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
function mpBuildSeededWorld(room){
  var real = Math.random;
  Math.random = mpSeededRandom(room || 'ARENA');
  try{ buildWorld(); }
  finally{ Math.random = real; }
}

/* ---- transport ---------------------------------------------------------- */

/* An explicit ?relay= always wins. Otherwise a relay can only be guessed for pages
   served over plain http (localhost / LAN dev): an https page is not allowed to open
   a ws:// socket, and a static host such as GitHub Pages has no relay behind it at
   all. Returning null means "no server here" so the caller can use the local arena. */
function mpRelayUrl(){
  try{
    var q = new URLSearchParams(location.search).get('relay');
    if(q) return q;
  }catch(e){}
  if(location.protocol !== 'http:') return null;
  return 'ws://' + (location.hostname || '127.0.0.1') + ':8787';
}

function mpConnect(kind, room, name, onReady){
  mpDisconnect();
  NET.id = mpId();
  NET.name = mpClean(name, 12) || 'PLAYER';
  NET.room = mpClean(room, 8) || 'ARENA';
  NET.peers = {};
  NET.err = '';

  if(kind === 'off'){
    NET.kind = 'off';
    mpStatus('solo', false);
    onReady(true);
    return;
  }

  if(kind === 'local'){
    try{
      NET.chan = new BroadcastChannel('overrun-' + NET.room);
      NET.chan.onmessage = function(ev){ mpRecv(ev.data); };
      NET.kind = 'local';
      mpStatus('local arena ' + NET.room, false);
      onReady(true);
    }catch(e){
      NET.err = 'This browser cannot open a local arena.';
      onReady(false);
    }
    return;
  }

  var base = mpRelayUrl();
  if(!base){ NET.err = 'No arena server is reachable from this page.'; onReady(false); return; }
  var url = base + '/?room=' + encodeURIComponent(NET.room);
  var sock;
  try{ sock = new WebSocket(url); }
  catch(e){ NET.err = 'Bad relay address.'; onReady(false); return; }

  var settled = false;
  var giveUp = setTimeout(function(){
    if(settled) return;
    settled = true;
    try{ sock.close(); }catch(e){}
    NET.err = 'No arena server answered at ' + base + '.';
    onReady(false);
  }, 4000);

  sock.onopen = function(){
    if(settled) return;
    settled = true; clearTimeout(giveUp);
    NET.sock = sock; NET.kind = 'ws';
    mpStatus('arena ' + NET.room, false);
    onReady(true);
  };
  sock.onmessage = function(ev){
    var m = null;
    try{ m = JSON.parse(ev.data); }catch(e){ return; }
    mpRecv(m);
  };
  sock.onerror = function(){
    if(settled) return;
    settled = true; clearTimeout(giveUp);
    try{ sock.close(); }catch(e){}
    NET.err = 'Could not reach the arena server at ' + base + '.';
    onReady(false);
  };
  sock.onclose = function(){
    if(NET.kind === 'ws' && MATCH.on){
      NET.kind = 'off';
      NET.sock = null;
      NET.peers = {};
      mpStatus('relay lost — playing solo', true);
    }
  };
}

function mpDisconnect(){
  if(NET.sock){ try{ NET.sock.onclose = null; NET.sock.close(); }catch(e){} }
  if(NET.chan){ try{ NET.chan.close(); }catch(e){} }
  NET.sock = null; NET.chan = null;
  for(var id in NET.peers) mpDropPeer(id);
  NET.peers = {};
  NET.kind = 'off';
  mpStatus('', false);
}

function mpRaw(obj){
  if(NET.kind === 'ws'){
    if(NET.sock && NET.sock.readyState === 1){
      try{ NET.sock.send(JSON.stringify(obj)); }catch(e){}
    }
  } else if(NET.kind === 'local'){
    if(NET.chan){ try{ NET.chan.postMessage(obj); }catch(e){} }
  }
}
function mpSend(t, m){
  if(!mpOnline()) return;
  m = m || {};
  m.t = t; m.id = NET.id;
  mpRaw(m);
}

function mpStatus(text, bad){
  NET.status = text || '';
  var el = document.getElementById('netStat');
  if(!el) return;
  el.textContent = text || '';
  el.classList.toggle('on', !!text);
  el.classList.toggle('bad', !!bad);
}

/* ---- remote players ----------------------------------------------------- */

function mpNameTag(name, col){
  var c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  var x = c.getContext('2d');
  x.font = 'bold 34px Rajdhani, Segoe UI, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.85)';
  x.strokeText(name, 128, 34);
  x.fillStyle = '#' + ('000000' + col.toString(16)).slice(-6);
  x.fillText(name, 128, 34);
  var tex = new THREE.CanvasTexture(c);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false}));
  sp.scale.set(2.4, 0.6, 1);
  sp.renderOrder = 999;
  return sp;
}

function mpBuildAvatar(col){
  var g = new THREE.Group();
  var body = new THREE.MeshLambertMaterial({color:col});
  var dark = new THREE.MeshLambertMaterial({color:new THREE.Color(col).multiplyScalar(0.34).getHex()});
  var visor = new THREE.MeshBasicMaterial({color:0x9ff0ff});

  var root = new THREE.Group(); g.add(root);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.74,0.34), body);
  torso.position.y = 1.16; root.add(torso);
  var chest = new THREE.Mesh(new THREE.BoxGeometry(0.66,0.24,0.4), dark);
  chest.position.y = 1.44; root.add(chest);
  var hips = new THREE.Mesh(new THREE.BoxGeometry(0.48,0.26,0.3), dark);
  hips.position.y = 0.8; root.add(hips);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.33,0.34,0.33), body);
  head.position.y = 1.74; root.add(head);
  var vis = new THREE.Mesh(new THREE.BoxGeometry(0.29,0.1,0.03), visor);
  vis.position.set(0,1.76,-0.18); root.add(vis);

  function limb(w,h,d,mat){
    var geo = new THREE.BoxGeometry(w,h,d);
    geo.translate(0,-h/2,0);
    return new THREE.Mesh(geo, mat);
  }
  var armL = limb(0.17,0.7,0.17, body); armL.position.set(-0.4,1.5,0); root.add(armL);
  var armR = limb(0.17,0.7,0.17, body); armR.position.set( 0.4,1.5,0); root.add(armR);
  var legL = limb(0.2,0.78,0.21, dark); legL.position.set(-0.15,0.8,0); root.add(legL);
  var legR = limb(0.2,0.78,0.21, dark); legR.position.set( 0.15,0.8,0); root.add(legR);

  var gun = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.12,0.66),
      new THREE.MeshLambertMaterial({color:0x22262c}));
  gun.position.set(0.4,1.26,-0.26); root.add(gun);

  g.traverse(function(o){ if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
  return {group:g, root:root, head:head, armL:armL, armR:armR, legL:legL, legR:legR};
}

function mpMakePeer(id, name){
  var col = mpColor(id);
  var av = mpBuildAvatar(col);
  var tag = mpNameTag(name || 'PLAYER', col);
  tag.position.y = 2.15;
  av.group.add(tag);
  G.scene.add(av.group);
  return {
    id:id, name:name || 'PLAYER', col:col, av:av, tag:tag, mesh:av.group,
    buf:[], pos:new THREE.Vector3(), yaw:0, pitch:0, crouch:false,
    alive:true, hp:100, kills:0, deaths:0, last:mpNow(), anim:0, speed:0,
    hitHead:{minx:0,miny:0,minz:0,maxx:0,maxy:0,maxz:0},
    hitBody:{minx:0,miny:0,minz:0,maxx:0,maxy:0,maxz:0}
  };
}

function mpDropPeer(id){
  var rp = NET.peers[id];
  if(!rp) return;
  G.scene.remove(rp.mesh);
  if(rp.tag && rp.tag.material){
    if(rp.tag.material.map) rp.tag.material.map.dispose();
    rp.tag.material.dispose();
  }
  disposeMesh(rp.mesh);
  delete NET.peers[id];
}

/* ---- protocol ----------------------------------------------------------- */

function mpRecv(m){
  if(!m || typeof m.t !== 'string') return;
  if(!m.id || m.id === NET.id) return;

  if(m.t === 's'){
    var rp = NET.peers[m.id];
    if(!rp){
      rp = NET.peers[m.id] = mpMakePeer(m.id, m.n);
      if(MATCH.on) notice(rp.name + ' JOINED');
    }
    rp.last = mpNow();
    rp.alive = m.al !== 0;
    rp.hp = m.hp || 0;
    rp.kills = m.k || 0;
    rp.deaths = m.d || 0;
    rp.buf.push({ at:rp.last, x:m.x, y:m.y, z:m.z, yaw:m.a, pitch:m.b, crouch:m.c === 1 });
    if(rp.buf.length > 24) rp.buf.shift();
    return;
  }

  if(m.t === 'h'){                       /* somebody claims to have hit someone */
    if(m.to === NET.id) mpTakeHit(m);
    return;
  }

  if(m.t === 'd'){                       /* a player died */
    var victim = NET.peers[m.id];
    if(victim){ victim.alive = false; victim.deaths++; }
    var killerName = mpNameOf(m.by);
    var victimName = victim ? victim.name : mpNameOf(m.id);
    if(m.by === NET.id){
      MATCH.kills++;
      addKillFeed(victimName, !!m.hd, 100, null);
      AUD.kill && AUD.kill();
    } else {
      var killer = NET.peers[m.by];
      if(killer) killer.kills++;
    }
    if(MATCH.on && m.by !== NET.id) notice(killerName + ' \u2716 ' + victimName);
    mpRefreshBoard();
    mpCheckEnd();
    return;
  }

  if(m.t === 'm'){                       /* rules broadcast from the leader */
    if(mpLeader() === NET.id) return;
    MATCH.fragLimit = m.fl || MATCH.fragLimit;
    MATCH.timeLimit = m.tl || MATCH.timeLimit;
    MATCH.t = Math.max(MATCH.t, m.el || 0);
    return;
  }

  if(m.t === 'bye'){ mpDropPeer(m.id); return; }
}

function mpNameOf(id){
  if(!id) return 'SOMEONE';
  if(id === NET.id) return NET.name;
  var rp = NET.peers[id];
  return rp ? rp.name : 'PLAYER';
}
/* The lowest id in the room owns the clock and the rule set. */
function mpLeader(){
  var best = NET.id;
  for(var id in NET.peers) if(id < best) best = id;
  return best;
}

function mpTakeHit(m){
  if(!MATCH.on || !PL.alive) return;
  PL.lastAttacker = m.id;
  var from = null;
  var rp = NET.peers[m.id];
  if(rp) from = rp.pos;
  damagePlayer(m.dm || 0, from, false);
}

/* Called by hitscan when a bullet lands on a remote player. */
function mpReportHit(rp, dmg, isHead, point, weapon){
  if(!rp || !rp.alive) return;
  mpSend('h', {to:rp.id, dm:dmg, hd:isHead?1:0, w:weapon});
  hitmarker(isHead);
  if(isHead) G.headshots++;
  if(point) addDamageNumber(point, dmg, isHead ? 'head' : 'normal');
}

/* ---- interpolation ------------------------------------------------------ */

function mpUpdateRemotes(dt){
  var now = mpNow();
  var target = now - MP_LERP;
  for(var id in NET.peers){
    var rp = NET.peers[id];
    if(now - rp.last > MP_DROP){ mpDropPeer(id); continue; }

    var b = rp.buf, n = b.length;
    if(n === 0) continue;
    var px = rp.pos.x, py = rp.pos.y, pz = rp.pos.z;

    if(n === 1 || target <= b[0].at){
      rp.pos.set(b[0].x, b[0].y, b[0].z);
      rp.yaw = b[0].yaw; rp.pitch = b[0].pitch; rp.crouch = b[0].crouch;
    } else if(target >= b[n-1].at){
      rp.pos.set(b[n-1].x, b[n-1].y, b[n-1].z);
      rp.yaw = b[n-1].yaw; rp.pitch = b[n-1].pitch; rp.crouch = b[n-1].crouch;
      while(rp.buf.length > 2) rp.buf.shift();
    } else {
      for(var i=0;i<n-1;i++){
        if(b[i].at <= target && target <= b[i+1].at){
          var span = b[i+1].at - b[i].at;
          var k = span > 0.0001 ? (target - b[i].at)/span : 0;
          rp.pos.set(lerp(b[i].x,b[i+1].x,k), lerp(b[i].y,b[i+1].y,k), lerp(b[i].z,b[i+1].z,k));
          var dy = b[i+1].yaw - b[i].yaw;
          while(dy >  Math.PI) dy -= Math.PI*2;
          while(dy < -Math.PI) dy += Math.PI*2;
          rp.yaw = b[i].yaw + dy*k;
          rp.pitch = lerp(b[i].pitch, b[i+1].pitch, k);
          rp.crouch = b[i+1].crouch;
          if(i > 0) rp.buf.splice(0, i);
          break;
        }
      }
    }

    rp.speed = Math.hypot(rp.pos.x-px, rp.pos.z-pz) / Math.max(dt, 0.001);
    mpPoseAvatar(rp, dt);
    mpRemoteBoxes(rp);
  }
}

function mpPoseAvatar(rp, dt){
  var g = rp.mesh;
  g.visible = rp.alive;
  if(!rp.alive) return;
  var h = rp.crouch ? 0.62 : 1;
  g.position.copy(rp.pos);
  g.rotation.y = rp.yaw;
  g.scale.set(1, h, 1);
  rp.av.head.rotation.x = clamp(-rp.pitch, -0.7, 0.7);
  rp.anim += dt * clamp(rp.speed, 0, 9) * 1.6;
  var sw = Math.sin(rp.anim) * clamp(rp.speed/6, 0, 1) * 0.7;
  rp.av.legL.rotation.x =  sw;
  rp.av.legR.rotation.x = -sw;
  rp.av.armL.rotation.x = -sw*0.55;
}

function mpRemoteBoxes(rp){
  var r = 0.42;
  var hh = (rp.crouch ? 1.15 : 1.85);
  var p = rp.pos;
  rp.hitBody.minx = p.x-r; rp.hitBody.maxx = p.x+r;
  rp.hitBody.minz = p.z-r; rp.hitBody.maxz = p.z+r;
  rp.hitBody.miny = p.y+0.05; rp.hitBody.maxy = p.y+hh*0.86;
  rp.hitHead.minx = p.x-0.24; rp.hitHead.maxx = p.x+0.24;
  rp.hitHead.minz = p.z-0.24; rp.hitHead.maxz = p.z+0.24;
  rp.hitHead.miny = p.y+hh*0.86; rp.hitHead.maxy = p.y+hh*1.04;
}

/* ---- match -------------------------------------------------------------- */

function mpStartMatch(opts){
  MATCH.on = true;
  MATCH.ended = false;
  MATCH.online = mpOnline();
  MATCH.fragLimit = opts.fragLimit;
  MATCH.timeLimit = opts.timeLimit;
  MATCH.bots = MATCH.online ? 0 : opts.bots;   /* no shared authority for bots */
  MATCH.t = 0;
  MATCH.kills = 0; MATCH.deaths = 0;
  MATCH.respawnIn = 0; MATCH.killedBy = ''; MATCH.winner = '';
  MATCH.botTimer = 0; MATCH.syncT = 0;
  MATCH.boardOpen = false;
  MATCH.hudT = 0;
  PL.lastAttacker = '';
  mpShowBoard(false);
  mpShowRespawn(false);
  UI.waveTitle.textContent = 'DEATHMATCH';
  mpHudScore();
  if(MATCH.bots > 0) mpFillBots();
}

function mpEndMatch(){
  if(MATCH.ended) return;
  MATCH.ended = true;
  MATCH.on = false;
  var rows = mpBoard();
  MATCH.winner = rows.length ? rows[0].name : NET.name;
  mpShowRespawn(false);
  mpShowBoard(false);
  UI.hud.classList.remove('on');
  setTouchUI(false);
  document.exitPointerLock && document.exitPointerLock();
  G.state = 'menu';
  document.getElementById('moverTitle').textContent =
    (rows.length && rows[0].me) ? 'YOU WIN' : MATCH.winner + ' WINS';
  mpRenderRows(document.getElementById('moverRows'), rows);
  document.getElementById('moverFoot').textContent =
    'FRAG LIMIT ' + MATCH.fragLimit + '  \u00B7  ' + fmtTime(MATCH.t) + ' PLAYED';
  showScreen('mover');
}

function mpCheckEnd(){
  if(!MATCH.on || MATCH.ended) return;
  var rows = mpBoard();
  if(rows.length && rows[0].kills >= MATCH.fragLimit) mpEndMatch();
}

function mpUpdate(dt){
  if(!MATCH.on) return;
  MATCH.t += dt;

  /* respawn countdown */
  if(!PL.alive){
    MATCH.respawnIn -= dt;
    var el = document.getElementById('respawnT');
    if(el) el.textContent = Math.max(1, Math.ceil(MATCH.respawnIn));
    if(MATCH.respawnIn <= 0) mpRespawn();
  }

  /* keep the arena stocked with bots in solo practice */
  if(MATCH.bots > 0){
    var alive = 0;
    for(var i=0;i<ENEMIES.length;i++) if(!ENEMIES[i].dead) alive++;
    MATCH.botTimer -= dt;
    if(alive < MATCH.bots && MATCH.botTimer <= 0){
      mpSpawnBot();
      MATCH.botTimer = 1.6;
    }
  }

  /* outbound snapshot */
  if(mpOnline()){
    NET.acc += dt;
    if(NET.acc >= MP_TICK){
      NET.acc = 0;
      mpSend('s', {
        n:NET.name,
        x:+PL.pos.x.toFixed(2), y:+PL.pos.y.toFixed(2), z:+PL.pos.z.toFixed(2),
        a:+PL.yaw.toFixed(3), b:+PL.pitch.toFixed(3),
        c:PL.crouch?1:0, al:PL.alive?1:0,
        hp:Math.round(PL.hp), k:MATCH.kills, d:MATCH.deaths
      });
    }
    MATCH.syncT -= dt;
    if(MATCH.syncT <= 0){
      MATCH.syncT = MP_SYNC;
      if(mpLeader() === NET.id){
        mpSend('m', {fl:MATCH.fragLimit, tl:MATCH.timeLimit, el:+MATCH.t.toFixed(1)});
      }
    }
  }

  mpHudScore();
  if(MATCH.boardOpen) mpRefreshBoard();
  if(MATCH.t >= MATCH.timeLimit) mpEndMatch();
  else mpCheckEnd();
}

function mpHudScore(){
  MATCH.hudT -= G.dt;
  if(MATCH.hudT > 0) return;
  MATCH.hudT = 0.2;
  var rows = mpBoard();
  var lead = rows.length ? rows[0].kills : 0;
  UI.waveNum.textContent = MATCH.kills + ' / ' + MATCH.fragLimit;
  var left = Math.max(0, MATCH.timeLimit - MATCH.t);
  UI.enemiesLeft.textContent = fmtTime(left) + ' \u00B7 LEAD ' + lead;
}

/* ---- death & respawn ---------------------------------------------------- */

function mpPlayerDied(){
  PL.alive = false;
  PL.hp = 0;
  MATCH.deaths++;
  MATCH.respawnIn = MATCH.respawnDelay;
  MATCH.killedBy = mpNameOf(PL.lastAttacker) ;
  AUD.tone(220,60,0.9,.28,'sawtooth');
  addShake(0.9, 0.7);
  IN.down[0] = false; IN.down[2] = false;
  if(IS_TOUCH) resetTouchState();
  mpSend('d', {by:PL.lastAttacker || '', hd:0});
  var by = document.getElementById('respawnBy');
  if(by) by.textContent = PL.lastAttacker ? ('FRAGGED BY ' + MATCH.killedBy) : 'ELIMINATED';
  mpShowRespawn(true);
  updateHUDVitals();
  mpRefreshBoard();
  mpCheckEnd();
}

function mpRespawn(){
  var sp = mpSpawnPoint();
  PL.pos.set(sp.x, sp.y, sp.z);
  PL.vel.set(0,0,0);
  PL.hp = PL.maxHp; PL.armor = 0; PL.stam = PL.maxStam;
  PL.alive = true;
  PL.crouch = false; PL.h = PL.standH;
  PL.ads = 0; PL.adsTarget = 0;
  PL.reloading = 0; PL.fireCd = 0.4; PL.heat = 0;
  PL.hurtCd = 0; PL.regenTimer = 0;
  PL.lastAttacker = '';
  PL.yaw = Math.atan2(-sp.x, -sp.z);
  for(var i=0;i<PL.weapons.length;i++){
    PL.weapons[i].ammo = PL.weapons[i].def.mag;
    PL.weapons[i].reserve = Math.max(PL.weapons[i].reserve, Math.round(PL.weapons[i].def.reserve*0.5));
  }
  PL.grenades = Math.max(PL.grenades, 1);
  mpShowRespawn(false);
  updateHUDVitals(); updateHUDWeapon();
  banner('RESPAWN', 'GET BACK IN THERE', 900);
}

/* Farthest spawn point from every live opponent. */
function mpSpawnPoint(){
  var best = null, bestScore = -1;
  var pts = WORLD.spawnPoints;
  for(var i=0;i<pts.length;i++){
    var sp = pts[i];
    if(blockedAt(sp.x, 0, sp.z, PL.radius, PL.standH)) continue;
    var near = 1e9;
    for(var id in NET.peers){
      var rp = NET.peers[id];
      if(!rp.alive) continue;
      near = Math.min(near, Math.hypot(rp.pos.x-sp.x, rp.pos.z-sp.z));
    }
    for(var e=0;e<ENEMIES.length;e++){
      if(ENEMIES[e].dead) continue;
      near = Math.min(near, Math.hypot(ENEMIES[e].pos.x-sp.x, ENEMIES[e].pos.z-sp.z));
    }
    var score = Math.min(near, 70) + rand(0, 8);
    if(score > bestScore){ bestScore = score; best = sp; }
  }
  return best || new THREE.Vector3(0,0,26);
}

/* ---- bots (solo practice) ----------------------------------------------- */

var MP_BOT_NAMES = ['VIPER','ECHO','RAVEN','NOMAD','HAVOC','ZERO','ONYX','CIPHER','WRAITH','TALON'];
var MP_BOT_TYPES = ['soldier','runner','grunt','heavy'];

function mpSpawnBot(){
  var type = pick(MP_BOT_TYPES);
  var e = spawnEnemy(type, mpSpawnPoint());
  e.isBot = true;
  e.botName = pick(MP_BOT_NAMES) + '-' + ((Math.random()*90+10)|0);
  e.hp = e.maxHp = 100 + Math.random()*40;
  return e;
}
function mpFillBots(){
  for(var i=0;i<MATCH.bots;i++) mpSpawnBot();
}

/* ---- scoreboard --------------------------------------------------------- */

function mpBoard(){
  var rows = [{
    id:NET.id || 'me', name:NET.name, col:mpColor(NET.id || 'me'),
    kills:MATCH.kills, deaths:MATCH.deaths, alive:PL.alive, me:true
  }];
  for(var id in NET.peers){
    var rp = NET.peers[id];
    rows.push({id:id, name:rp.name, col:rp.col, kills:rp.kills, deaths:rp.deaths,
               alive:rp.alive, me:false});
  }
  if(MATCH.bots > 0){
    for(var i=0;i<ENEMIES.length;i++){
      var e = ENEMIES[i];
      if(!e.isBot) continue;
      rows.push({id:'bot'+i, name:e.botName, col:e.def.col, kills:e.botKills||0,
                 deaths:e.botDeaths||0, alive:!e.dead, me:false, bot:true});
    }
  }
  rows.sort(function(a,b){ return (b.kills - a.kills) || (a.deaths - b.deaths); });
  return rows;
}

function mpRenderRows(host, rows){
  if(!host) return;
  var html = '';
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    var ratio = r.deaths ? (r.kills/r.deaths).toFixed(2) : r.kills.toFixed(2);
    var dot = '<i class="bdot" style="background:#' +
      ('000000' + r.col.toString(16)).slice(-6) + '"></i>';
    html += '<div class="brow' + (r.me ? ' me' : '') + (r.alive ? '' : ' out') + '">' +
            '<span>' + dot + mpEsc(r.name) + '</span>' +
            '<span>' + r.kills + '</span>' +
            '<span>' + r.deaths + '</span>' +
            '<span>' + ratio + '</span></div>';
  }
  host.innerHTML = html;
}
function mpEsc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function mpRefreshBoard(){
  if(!MATCH.boardOpen) return;
  mpRenderRows(document.getElementById('boardRows'), mpBoard());
  document.getElementById('boardFoot').textContent =
    'FIRST TO ' + MATCH.fragLimit + '  \u00B7  ' + fmtTime(Math.max(0, MATCH.timeLimit - MATCH.t)) + ' LEFT' +
    (MATCH.online ? '  \u00B7  ARENA ' + NET.room : '  \u00B7  SOLO');
}
function mpShowBoard(on){
  MATCH.boardOpen = !!on;
  var el = document.getElementById('board');
  if(el) el.classList.toggle('on', !!on);
  if(on) mpRefreshBoard();
}
function mpShowRespawn(on){
  var el = document.getElementById('respawn');
  if(el) el.classList.toggle('on', !!on);
}

/* ---- lobby -------------------------------------------------------------- */

var MPOPT = {fragLimit:20, timeLimit:300, bots:4};

function mpBindOptions(){
  [['mpFrags','fragLimit'],['mpTime','timeLimit'],['mpBots','bots']].forEach(function(pair){
    var host = document.getElementById(pair[0]);
    if(!host) return;
    host.addEventListener('click', function(e){
      var t = e.target;
      if(!t || !t.classList.contains('mpopt')) return;
      var kids = host.querySelectorAll('.mpopt');
      for(var i=0;i<kids.length;i++) kids[i].classList.remove('sel');
      t.classList.add('sel');
      MPOPT[pair[1]] = parseInt(t.getAttribute('data-v'), 10);
    });
  });
  var name = document.getElementById('mpName');
  try{
    var saved = localStorage.getItem('overrun_name');
    if(saved) name.value = saved;
  }catch(e){}
}

function mpLobbyError(msg){
  var el = document.getElementById('mpErr');
  if(el) el.textContent = msg || '';
}
function mpRosterText(msg){
  var el = document.getElementById('mpRoster');
  if(el) el.innerHTML = msg || '';
}

function mpEnterArena(solo){
  var name = mpClean(document.getElementById('mpName').value, 12) || 'PLAYER';
  var room = mpClean(document.getElementById('mpRoom').value, 8) || 'ARENA';
  document.getElementById('mpName').value = name;
  document.getElementById('mpRoom').value = room;
  try{ localStorage.setItem('overrun_name', name); }catch(e){}
  mpLobbyError('');

  if(solo){
    mpRosterText('STARTING SOLO PRACTICE\u2026');
    mpConnect('off', room, name, function(){ mpRosterText(''); startGame('dm'); });
    return;
  }

  /* No server to talk to (static host, https page, file://)? The same-device arena
     is still real multiplayer between tabs, so go straight there. */
  var relay = mpRelayUrl();
  if(!relay || mpLocalWanted()){ mpJoinLocalArena(room, name, !relay); return; }

  mpRosterText('CONNECTING TO ARENA ' + room + '\u2026');
  mpConnect('ws', room, name, function(ok){
    if(ok){ mpRosterText(''); startGame('dm'); return; }
    /* Never dead-end the player on a missing server - drop to the local arena. */
    mpJoinLocalArena(room, name, true);
  });
}

function mpJoinLocalArena(room, name, explain){
  mpRosterText('OPENING LOCAL ARENA ' + room + '\u2026');
  mpConnect('local', room, name, function(ok){
    mpRosterText('');
    if(!ok){ mpLobbyError(NET.err || 'This browser cannot open an arena.'); return; }
    startGame('dm');
    if(explain) notice('LOCAL ARENA \u00B7 OPEN A SECOND TAB WITH CODE ' + room);
  });
}
/* ?net=local forces the cross-tab arena even when a relay is available. */
function mpLocalWanted(){
  try{ return new URLSearchParams(location.search).get('net') === 'local'; }
  catch(e){ return false; }
}
