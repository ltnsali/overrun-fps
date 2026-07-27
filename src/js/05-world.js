"use strict";
/* ---------------------------------------------------------------------------
   5. WORLD
--------------------------------------------------------------------------- */
var WORLD = {
  colliders:[],      // {minx,miny,minz,maxx,maxy,maxz}
  mapRects:[],       // for minimap {x,z,w,d}
  group:null,
  size: 78,          // half-extent of arena
  spawnPoints:[],
  barrels:[],
  lights:[],
  mats:{}
};

function makeBox(x,y,z,w,h,d,mat,opts){
  opts = opts||{};
  var geo = new THREE.BoxGeometry(w,h,d);
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x, y+h/2, z);
  m.castShadow = opts.noShadow?false:true;
  m.receiveShadow = true;
  WORLD.group.add(m);
  if(!opts.noCollide){
    WORLD.colliders.push({minx:x-w/2, miny:y, minz:z-d/2, maxx:x+w/2, maxy:y+h, maxz:z+d/2, tall:h});
    WORLD.mapRects.push({x:x-w/2, z:z-d/2, w:w, d:d, h:h});
  }
  return m;
}
function tileMat(tex, rx, ry, color){
  var t = tex.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return new THREE.MeshLambertMaterial({map:t, color: color||0xffffff});
}
function neonStrip(x,y,z,w,h,d,color){
  var m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
      new THREE.MeshBasicMaterial({color:color}));
  m.position.set(x,y,z);
  WORLD.group.add(m);
  return m;
}

function buildWorld(){
  var S = WORLD.size;
  WORLD.colliders.length = 0;
  WORLD.mapRects.length = 0;
  WORLD.spawnPoints.length = 0;
  WORLD.barrels.length = 0;
  WORLD.buildings = [];
  if(WORLD.group){ G.scene.remove(WORLD.group); disposeMesh(WORLD.group); }
  WORLD.group = new THREE.Group();
  G.scene.add(WORLD.group);

  var M = WORLD.mats;
  M.floor  = M.floor  || texFloor();
  M.wall   = M.wall   || texWall();
  M.crate  = M.crate  || texCrate();
  M.metal  = M.metal  || texMetal('#4a5560');
  M.metal2 = M.metal2 || texMetal('#5a4a3a');

  /* ---- ground ---- */
  var gTex = M.floor.clone(); gTex.needsUpdate=true;
  gTex.wrapS=gTex.wrapT=THREE.RepeatWrapping; gTex.repeat.set(S/3, S/3);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(S*2, S*2),
      new THREE.MeshLambertMaterial({map:gTex}));
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  WORLD.group.add(ground);

  /* ---- sky dome ---- */
  var sky = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16),
      new THREE.MeshBasicMaterial({map: texSky(), side:THREE.BackSide, fog:false}));
  WORLD.group.add(sky);

  /* ---- perimeter walls ---- */
  var wm = tileMat(M.wall, S/2, 3);
  var WH = 15;
  makeBox(0,0,-S, S*2, WH, 3, wm);
  makeBox(0,0, S, S*2, WH, 3, wm);
  makeBox(-S,0,0, 3, WH, S*2, tileMat(M.wall,S/2,3));
  makeBox( S,0,0, 3, WH, S*2, tileMat(M.wall,S/2,3));
  // neon perimeter accents
  for(var i=-1;i<=1;i+=2){
    neonStrip(0, 5.2, i*(S-1.6), S*2-6, 0.22, 0.12, 0x39d7ff);
    neonStrip(i*(S-1.6), 5.2, 0, 0.12, 0.22, S*2-6, 0x39d7ff);
  }

  /* ---- central command structure ---- */
  var cm = tileMat(M.metal, 3, 2);
  makeBox(0,0,0, 18, 5.4, 18, cm);                     // main block (roof top = 5.4)
  // roof railings, with 4m gaps on ±X where the stairs arrive
  makeBox(0,5.4,-8.7, 18, 1.1, 0.6, cm);
  makeBox(0,5.4, 8.7, 18, 1.1, 0.6, cm);
  makeBox(-8.7,5.4,-6.0, 0.6, 1.1, 5.4, cm);
  makeBox(-8.7,5.4, 6.0, 0.6, 1.1, 5.4, cm);
  makeBox( 8.7,5.4,-6.0, 0.6, 1.1, 5.4, cm);
  makeBox( 8.7,5.4, 6.0, 0.6, 1.1, 5.4, cm);
  neonStrip(0, 5.45, 0, 17.4, 0.06, 17.4, 0x1a3a4a);
  // stairs ascend toward the block and land flush with its roof at x = ±9
  var cL = stairLen(5.4);
  buildStair( 9 + cL, 0, 0, 5.4, 3.8, '-x', cm);
  buildStair(-9 - cL, 0, 0, 5.4, 3.8,  'x', cm);

  /* ---- quadrant buildings ---- */
  var bm = tileMat(M.wall, 4, 2);
  var quads = [[1,1],[1,-1],[-1,1],[-1,-1]];
  for(var q=0;q<4;q++){
    var qx = quads[q][0], qz = quads[q][1];
    var bx = qx*34, bz = qz*34;
    var bw = rand(15,20), bd = rand(15,20), bh = rand(6.5,9);
    var stairSide = qx>0 ? 'x+' : 'x-';
    buildRoom(bx, bz, bw, bd, bh, bm, cm, q, stairSide);
    // exterior staircase up to the roof, landing flush with the roof plate
    var roofTop = bh + 0.5;
    var edge = bw/2 + 0.35;
    var sLen = stairLen(roofTop);
    if(qx > 0) buildStair(bx + edge + sLen, 0, bz, roofTop, 3.6, '-x', cm);
    else       buildStair(bx - edge - sLen, 0, bz, roofTop, 3.6,  'x', cm);
    WORLD.buildings.push({x:bx, z:bz, w:bw, d:bd, h:bh, qx:qx, roofTop:roofTop, stairStart:bx + qx*(edge+sLen)});
  }

  /* ---- scattered cover ---- */
  var crateM = tileMat(M.crate, 1, 1);
  var conM   = tileMat(M.metal2, 2, 1);
  var placed = 0, tries = 0;
  while(placed < 46 && tries < 1400){
    tries++;
    var x = rand(-S+8, S-8), z = rand(-S+8, S-8);
    var r = Math.random(), hw, hd;
    if(r < 0.45){ hw = hd = 1.3; }
    else if(r < 0.72){ hw = 4.6; hd = 1.5; if(Math.random()<0.5){ var sw0=hw; hw=hd; hd=sw0; } }
    else if(r < 0.86){ hw = hd = 0.8; }
    else { hw = 5.6; hd = 0.6; }
    if(!footprintClear(x, z, hw, hd, 2.2)) continue;
    if(r < 0.45){
      var sz = rand(1.6,2.4);
      makeBox(x,0,z, sz, sz, sz, crateM);
      if(Math.random()<0.45) makeBox(x+rand(-.4,.4),sz,z+rand(-.4,.4), sz*0.85, sz*0.85, sz*0.85, crateM);
    } else if(r < 0.72){
      makeBox(x,0,z, hw*2, 2.6, hd*2, conM);
      neonStrip(x, 1.45, z, hw*1.8, 0.05, hd*2.02, 0x2a3a44);
    } else if(r < 0.86){
      makeBox(x,0,z, 1.2, rand(4,7), 1.2, tileMat(M.metal,1,2));
    } else {
      makeBox(x,0,z, hw*2, 1.35, hd*2, tileMat(M.wall,2,1));
    }
    placed++;
  }

  /* ---- explosive barrels ---- */
  var nb = 0, bt = 0;
  while(nb < 18 && bt < 600){
    bt++;
    var bxp = rand(-S+7,S-7), bzp = rand(-S+7,S-7);
    if(!footprintClear(bxp, bzp, 0.55, 0.55, 1.4)) continue;
    spawnBarrel(bxp, bzp);
    nb++;
  }

  /* ---- catwalk bridge across arena ---- */
  var cw2 = tileMat(M.metal, 6, 1);
  makeBox(0,7.2,-46, 44, 0.5, 4, cw2);            // deck top = 7.7
  makeBox(0,7.7,-48, 44, 1.0, 0.3, cw2);
  makeBox(0,7.7,-44, 44, 1.0, 0.3, cw2);
  buildStair(-22 - stairLen(7.7), 0, -46, 7.7, 3.8,  'x', cw2);   // lands at x = -22
  buildStair( 22 + stairLen(7.7), 0, -46, 7.7, 3.8, '-x', cw2);   // lands at x =  22
  neonStrip(0, 7.1, -46, 43, 0.06, 3.6, 0x224455);

  /* ---- lighting ---- */
  WORLD.lights.length = 0;
  var hemi = new THREE.HemisphereLight(0x8aa6cc, 0x3a352e, 0.85);
  G.scene.add(hemi); WORLD.lights.push(hemi);

  var sun = new THREE.DirectionalLight(0xffe0bc, 1.15);
  sun.position.set(48, 78, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.width = sun.shadow.mapSize.height = SET.shadows?2048:512;
  var d2 = 68;
  sun.shadow.camera.left=-d2; sun.shadow.camera.right=d2;
  sun.shadow.camera.top=d2; sun.shadow.camera.bottom=-d2;
  sun.shadow.camera.near=1; sun.shadow.camera.far=220;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  G.scene.add(sun); G.scene.add(sun.target);
  WORLD.sun = sun; WORLD.lights.push(sun);

  var rim = new THREE.DirectionalLight(0x5f8fff, 0.45);
  rim.position.set(-40, 30, -50);
  G.scene.add(rim); WORLD.lights.push(rim);

  var amb = new THREE.AmbientLight(0x5a6478, 0.5);
  G.scene.add(amb); WORLD.lights.push(amb);

  /* ---- spawn points around the perimeter & mid-field ---- */
  for(i=0;i<40;i++){
    var a = (i/40)*Math.PI*2, rr = S*0.82;
    WORLD.spawnPoints.push(new THREE.Vector3(Math.cos(a)*rr, 0, Math.sin(a)*rr));
  }
  for(i=0;i<16;i++){
    var a2 = (i/16)*Math.PI*2, rr2 = S*0.5;
    WORLD.spawnPoints.push(new THREE.Vector3(Math.cos(a2)*rr2, 0, Math.sin(a2)*rr2));
  }

  buildGrid();
}

function overlapsAny(x,z,pad){
  return !footprintClear(x,z,0,0,pad);
}
/* true when an axis-aligned footprint keeps `pad` clearance from every collider */
function footprintClear(x,z,hw,hd,pad){
  for(var i=0;i<WORLD.colliders.length;i++){
    var c = WORLD.colliders[i];
    if(c.disabled) continue;
    if(x+hw > c.minx-pad && x-hw < c.maxx+pad &&
       z+hd > c.minz-pad && z-hd < c.maxz+pad) return false;
  }
  return true;
}

/* ---- uniform grid over static colliders (broad phase) ---- */
var _stamp = null, _stampN = 0;
var _nA = [], _nB = [], _nC = [];
function buildGrid(){
  WORLD.cell = 8;
  WORLD.grid = {};
  var cs = WORLD.cell;
  for(var i=0;i<WORLD.colliders.length;i++){
    var c = WORLD.colliders[i];
    c.id = i;
    var x0 = Math.floor(c.minx/cs), x1 = Math.floor(c.maxx/cs);
    var z0 = Math.floor(c.minz/cs), z1 = Math.floor(c.maxz/cs);
    for(var cx=x0;cx<=x1;cx++) for(var cz=z0;cz<=z1;cz++){
      var k = cx+':'+cz;
      (WORLD.grid[k] || (WORLD.grid[k]=[])).push(i);
    }
  }
  _stamp = new Int32Array(WORLD.colliders.length);
  _stampN = 0;
}
function gridAdd(c){
  var cs = WORLD.cell, idx = WORLD.colliders.length-1;
  c.id = idx;
  var x0 = Math.floor(c.minx/cs), x1 = Math.floor(c.maxx/cs);
  var z0 = Math.floor(c.minz/cs), z1 = Math.floor(c.maxz/cs);
  for(var cx=x0;cx<=x1;cx++) for(var cz=z0;cz<=z1;cz++){
    var k = cx+':'+cz;
    (WORLD.grid[k] || (WORLD.grid[k]=[])).push(idx);
  }
  var s = new Int32Array(WORLD.colliders.length);
  if(_stamp) s.set(_stamp);
  _stamp = s;
}

function collectNear(x,z,r,out){
  var n = 0;
  if(!WORLD.grid) return 0;
  var cs = WORLD.cell, g = WORLD.grid;
  var x0 = Math.floor((x-r)/cs), x1 = Math.floor((x+r)/cs);
  var z0 = Math.floor((z-r)/cs), z1 = Math.floor((z+r)/cs);
  _stampN++;
  for(var cx=x0;cx<=x1;cx++) for(var cz=z0;cz<=z1;cz++){
    var arr = g[cx+':'+cz];
    if(!arr) continue;
    for(var i=0;i<arr.length;i++){
      var idx = arr[i];
      if(_stamp[idx] === _stampN) continue;
      _stamp[idx] = _stampN;
      var c = WORLD.colliders[idx];
      if(c.disabled) continue;
      out[n++] = c;
    }
  }
  return n;
}

/* stepped staircase. Treads are wider than the player so the collision box
   never straddles two risers. Ascends from (x,z) in `dir`; returns its length. */
var STAIR_RISE = 0.42, STAIR_TREAD = 1.05;
function stairSteps(h){ return Math.max(4, Math.ceil(h/STAIR_RISE)); }
function stairLen(h){ return stairSteps(h) * STAIR_TREAD; }
function buildStair(x, y, z, h, wide, dir, mat){
  var steps = stairSteps(h);
  var sh = h/steps, sl = STAIR_TREAD;
  for(var i=0;i<steps;i++){
    var px=x, pz=z, w=sl, d=wide;
    if(dir==='x'){ px = x + sl*(i+0.5); }
    else if(dir==='-x'){ px = x - sl*(i+0.5); }
    else if(dir==='z'){ pz = z + sl*(i+0.5); w=wide; d=sl; }
    else { pz = z - sl*(i+0.5); w=wide; d=sl; }
    makeBox(px, y, pz, w, sh*(i+1), d, mat);
  }
  return steps*sl;
}

/* hollow room with a door gap; `stairSide` omits one roof rail for stair access */
function buildRoom(cx, cz, w, d, h, wallMat, trimMat, seed, stairSide){
  var t = 0.7;
  var doorSide = seed % 4;
  var doorW = 4.2;
  // -Z wall
  addWallWithDoor(cx, cz-d/2, w, h, t, 'x', doorSide===0?doorW:0, wallMat);
  addWallWithDoor(cx, cz+d/2, w, h, t, 'x', doorSide===1?doorW:0, wallMat);
  addWallWithDoor(cx-w/2, cz, d, h, t, 'z', doorSide===2?doorW:0, wallMat);
  addWallWithDoor(cx+w/2, cz, d, h, t, 'z', doorSide===3?doorW:0, wallMat);
  // roof
  makeBox(cx, h, cz, w+t, 0.5, d+t, trimMat);
  // roof rails (the stair side is left open)
  makeBox(cx, h+0.5, cz-d/2, w, 1.0, 0.3, trimMat);
  makeBox(cx, h+0.5, cz+d/2, w, 1.0, 0.3, trimMat);
  if(stairSide !== 'x-') makeBox(cx-w/2, h+0.5, cz, 0.3, 1.0, d, trimMat);
  if(stairSide !== 'x+') makeBox(cx+w/2, h+0.5, cz, 0.3, 1.0, d, trimMat);
  // interior pillar + light
  neonStrip(cx, h-0.35, cz, w*0.5, 0.12, 0.5, 0xffe0a0);
  var pl = new THREE.PointLight(0xffc98a, 0.85, 22, 2);
  pl.position.set(cx, h-0.8, cz);
  G.scene.add(pl);
  WORLD.lights.push(pl);
}
function addWallWithDoor(x, z, len, h, t, axis, doorW, mat){
  if(doorW <= 0){
    if(axis==='x') makeBox(x, 0, z, len, h, t, mat);
    else makeBox(x, 0, z, t, h, len, mat);
    return;
  }
  var side = (len - doorW)/2;
  if(axis==='x'){
    makeBox(x - (doorW/2 + side/2), 0, z, side, h, t, mat);
    makeBox(x + (doorW/2 + side/2), 0, z, side, h, t, mat);
    makeBox(x, 3.0, z, doorW, h-3.0, t, mat);
  } else {
    makeBox(x, 0, z - (doorW/2 + side/2), t, h, side, mat);
    makeBox(x, 0, z + (doorW/2 + side/2), t, h, side, mat);
    makeBox(x, 3.0, z, t, h-3.0, doorW, mat);
  }
}

/* ---- explosive barrels ---- */
function spawnBarrel(x,z){
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.52,0.52,1.5,14),
      new THREE.MeshLambertMaterial({color:0xc03a20}));
  body.position.y = 0.75; body.castShadow=true; body.receiveShadow=true;
  g.add(body);
  var ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.53,0.05,6,14),
      new THREE.MeshLambertMaterial({color:0x2a2a2a}));
  ring1.rotation.x = Math.PI/2; ring1.position.y = 1.2; g.add(ring1);
  var ring2 = ring1.clone(); ring2.position.y = 0.36; g.add(ring2);
  var top = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.12,10),
      new THREE.MeshLambertMaterial({color:0xffcc33, emissive:0x553300}));
  top.position.y = 1.55; g.add(top);
  g.position.set(x,0,z);
  WORLD.group.add(g);
  var b = {mesh:g, pos:g.position, hp:34, dead:false, r:0.6, flash:0};
  WORLD.barrels.push(b);
  WORLD.colliders.push({minx:x-0.5,miny:0,minz:z-0.5,maxx:x+0.5,maxy:1.5,maxz:z+0.5,barrel:b});
  return b;
}
function damageBarrel(b, dmg){
  if(b.dead) return;
  b.hp -= dmg; b.flash = 0.12;
  if(b.hp <= 0) explodeBarrel(b);
}
function explodeBarrel(b){
  if(b.dead) return;
  b.dead = true;
  var p = b.mesh.position.clone(); p.y += 0.8;
  WORLD.group.remove(b.mesh);
  disposeMesh(b.mesh);
  for(var i=0;i<WORLD.colliders.length;i++){
    if(WORLD.colliders[i].barrel === b){ WORLD.colliders[i].disabled = true; break; }
  }
  doExplosion(p, 9.5, 130, true);
}
