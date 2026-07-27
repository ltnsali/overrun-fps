"use strict";
/* ---------------------------------------------------------------------------
   10. WEAPON LOGIC
--------------------------------------------------------------------------- */
var VM = { group:null, models:[], cur:null, offset:null, rot:null };

function buildViewModels(){
  VM.group = new THREE.Group();
  G.viewScene.add(VM.group);
  for(var i=0;i<WDEF.length;i++){
    var m = buildGunModel(WDEF[i].id);
    m.visible = false;
    VM.group.add(m);
    VM.models.push(m);
  }
  // arms light
  var l1 = new THREE.DirectionalLight(0xffffff, 0.95); l1.position.set(0.6,1,1);
  var l2 = new THREE.DirectionalLight(0x88aaff, 0.5); l2.position.set(-1,0.4,-0.6);
  var amb = new THREE.AmbientLight(0x8899bb, 0.75);
  G.viewScene.add(l1); G.viewScene.add(l2); G.viewScene.add(amb);
}
function matte(c){ return new THREE.MeshLambertMaterial({color:c}); }
function shiny(c){ return new THREE.MeshPhongMaterial({color:c, shininess:60, specular:0x556677}); }

function addPart(parent, geo, mat, x,y,z, rx,ry,rz){
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x,y,z);
  if(rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0);
  parent.add(m);
  return m;
}
function buildHands(g, wide){
  var skin = matte(0x3a4250);
  var glove = matte(0x232830);
  var rh = new THREE.Group();
  addPart(rh, new THREE.BoxGeometry(0.075,0.1,0.13), glove, 0,0,0);
  addPart(rh, new THREE.BoxGeometry(0.07,0.19,0.075), skin, 0,-0.11,0.02);
  rh.position.set(0.005,-0.075,0.05);
  g.add(rh);
  var lh = new THREE.Group();
  addPart(lh, new THREE.BoxGeometry(0.075,0.1,0.14), glove, 0,0,0);
  addPart(lh, new THREE.BoxGeometry(0.07,0.2,0.075), skin, 0,-0.11,-0.03);
  lh.position.set(wide?-0.075:-0.04,-0.07,-0.19);
  lh.rotation.x = 0.4;
  g.add(lh);
  return {r:rh,l:lh};
}
function buildGunModel(id){
  var g = new THREE.Group();
  var dark = matte(0x1c2026), mid = matte(0x2e3540), metal = shiny(0x585f6b),
      accent = new THREE.MeshBasicMaterial({color:0x39d7ff}), wood = matte(0x4a3320);
  if(id==='pistol'){
    addPart(g, new THREE.BoxGeometry(0.085,0.11,0.42), dark, 0,0,-0.06);          // slide
    addPart(g, new THREE.BoxGeometry(0.07,0.09,0.30), mid, 0,-0.085,-0.02);       // frame
    addPart(g, new THREE.BoxGeometry(0.075,0.22,0.10), mid, 0,-0.2,0.07, 0.22,0,0); // grip
    addPart(g, new THREE.CylinderGeometry(0.018,0.018,0.06,8), metal, 0,0.005,-0.28, Math.PI/2,0,0);
    addPart(g, new THREE.BoxGeometry(0.012,0.02,0.02), accent, 0,0.07,-0.24);
    g.userData.muzzle = new THREE.Vector3(0,0.005,-0.31);
    g.userData.eject  = new THREE.Vector3(0.07,0.03,-0.03);
    g.userData.base = new THREE.Vector3(0.20,-0.20,-0.42);
    g.userData.ads  = new THREE.Vector3(0.0,-0.126,-0.30);
  } else if(id==='smg'){
    addPart(g, new THREE.BoxGeometry(0.09,0.15,0.5), dark, 0,0,-0.08);
    addPart(g, new THREE.BoxGeometry(0.10,0.10,0.16), mid, 0,0.03,0.14);
    addPart(g, new THREE.BoxGeometry(0.075,0.24,0.10), mid, 0,-0.19,0.06, 0.18,0,0);
    addPart(g, new THREE.BoxGeometry(0.055,0.26,0.09), dark, 0,-0.17,-0.10, -0.12,0,0); // mag
    addPart(g, new THREE.CylinderGeometry(0.022,0.022,0.22,10), metal, 0,0.01,-0.4, Math.PI/2,0,0);
    addPart(g, new THREE.BoxGeometry(0.03,0.055,0.16), dark, 0,0.10,-0.14);  // rail sight
    addPart(g, new THREE.BoxGeometry(0.016,0.016,0.016), accent, 0,0.135,-0.2);
    addPart(g, new THREE.BoxGeometry(0.012,0.03,0.14), accent, 0.048,0.0,-0.06);
    g.userData.muzzle = new THREE.Vector3(0,0.01,-0.52);
    g.userData.eject  = new THREE.Vector3(0.07,0.04,-0.02);
    g.userData.base = new THREE.Vector3(0.22,-0.22,-0.40);
    g.userData.ads  = new THREE.Vector3(0.0,-0.155,-0.28);
  } else if(id==='shotgun'){
    addPart(g, new THREE.BoxGeometry(0.10,0.13,0.72), dark, 0,0,-0.12);
    addPart(g, new THREE.CylinderGeometry(0.032,0.032,0.62,10), metal, 0,0.045,-0.34, Math.PI/2,0,0);
    addPart(g, new THREE.CylinderGeometry(0.026,0.026,0.5,8), mid, 0,-0.02,-0.30, Math.PI/2,0,0); // tube
    var pump = addPart(g, new THREE.BoxGeometry(0.085,0.075,0.17), wood, 0,-0.02,-0.3);
    g.userData.pump = pump;
    addPart(g, new THREE.BoxGeometry(0.08,0.22,0.10), wood, 0,-0.18,0.08, 0.24,0,0);
    addPart(g, new THREE.BoxGeometry(0.08,0.13,0.25), wood, 0,-0.055,0.24, -0.06,0,0); // stock
    addPart(g, new THREE.BoxGeometry(0.014,0.024,0.02), accent, 0,0.10,-0.55);
    g.userData.muzzle = new THREE.Vector3(0,0.045,-0.66);
    g.userData.eject  = new THREE.Vector3(0.075,0.02,-0.02);
    g.userData.base = new THREE.Vector3(0.21,-0.23,-0.36);
    g.userData.ads  = new THREE.Vector3(0.0,-0.15,-0.28);
  } else if(id==='sniper'){
    addPart(g, new THREE.BoxGeometry(0.09,0.13,0.85), dark, 0,0,-0.16);
    addPart(g, new THREE.CylinderGeometry(0.026,0.03,0.85,10), metal, 0,0.03,-0.55, Math.PI/2,0,0);
    addPart(g, new THREE.CylinderGeometry(0.042,0.042,0.1,10), dark, 0,0.03,-0.94, Math.PI/2,0,0); // brake
    addPart(g, new THREE.CylinderGeometry(0.045,0.045,0.34,12), dark, 0,0.135,-0.16, Math.PI/2,0,0); // scope
    addPart(g, new THREE.CylinderGeometry(0.05,0.05,0.03,12), new THREE.MeshBasicMaterial({color:0x0a2233}), 0,0.135,-0.33, Math.PI/2,0,0);
    addPart(g, new THREE.BoxGeometry(0.08,0.24,0.10), mid, 0,-0.19,0.10, 0.2,0,0);
    addPart(g, new THREE.BoxGeometry(0.085,0.16,0.3), mid, 0,-0.05,0.30, -0.04,0,0);
    addPart(g, new THREE.BoxGeometry(0.05,0.16,0.08), dark, 0,-0.13,-0.08);
    addPart(g, new THREE.BoxGeometry(0.012,0.03,0.3), accent, 0.047,0.0,-0.2);
    g.userData.bolt = addPart(g, new THREE.BoxGeometry(0.04,0.04,0.13), metal, 0.07,0.03,0.06);
    g.userData.muzzle = new THREE.Vector3(0,0.03,-1.0);
    g.userData.eject  = new THREE.Vector3(0.08,0.05,0.02);
    g.userData.base = new THREE.Vector3(0.21,-0.24,-0.34);
    g.userData.ads  = new THREE.Vector3(0.0,-0.185,-0.30);
  } else {
    addPart(g, new THREE.CylinderGeometry(0.075,0.075,0.95,12), matte(0x2f4030), 0,0,-0.2, Math.PI/2,0,0);
    addPart(g, new THREE.CylinderGeometry(0.1,0.055,0.26,12), matte(0x27331f), 0,0,0.36, Math.PI/2,0,0);
    var wh = addPart(g, new THREE.ConeGeometry(0.1,0.3,12), matte(0x8a3a2a), 0,0,-0.78, -Math.PI/2,0,0);
    g.userData.warhead = wh;
    addPart(g, new THREE.BoxGeometry(0.07,0.22,0.1), matte(0x22301c), 0,-0.18,0.02, 0.15,0,0);
    addPart(g, new THREE.BoxGeometry(0.05,0.12,0.2), matte(0x22301c), 0,0.1,-0.05);
    addPart(g, new THREE.BoxGeometry(0.02,0.03,0.03), accent, 0,0.17,-0.14);
    g.userData.muzzle = new THREE.Vector3(0,0,-0.95);
    g.userData.eject  = new THREE.Vector3(0.05,0,0.3);
    g.userData.base = new THREE.Vector3(0.22,-0.20,-0.36);
    g.userData.ads  = new THREE.Vector3(0.02,-0.15,-0.30);
  }
  buildHands(g, id==='shotgun'||id==='sniper'||id==='launcher');
  g.traverse(function(o){ o.castShadow=false; o.receiveShadow=false; });
  return g;
}

function switchWeapon(i, silent){
  if(i === PL.wi || i<0 || i>=PL.weapons.length) return;
  PL.lastWi = PL.wi;
  PL.wi = i;
  PL.reloading = 0; PL.pendingReload = false;
  PL.fireCd = Math.max(PL.fireCd, 0.32);
  PL.viewSwitch = 1;
  PL.adsTarget = 0;
  if(!silent && AUD.ready){ AUD.reload(0); }
  updateHUDWeapon();
}

function updateWeapon(dt){
  var W = curW(), d = W.def;

  /* selection */
  var codes = ['Digit1','Digit2','Digit3','Digit4','Digit5'];
  for(var i=0;i<codes.length;i++) if(IN.hit(codes[i])) switchWeapon(i);
  if(IN.hit('KeyQ')) switchWeapon(PL.lastWi);
  if(IN.wheel !== 0){
    var n = (PL.wi + (IN.wheel>0?1:-1) + PL.weapons.length) % PL.weapons.length;
    switchWeapon(n);
  }

  /* ADS */
  PL.adsTarget = (IN.down[2] && PL.reloading<=0 && PL.meleeAnim<=0) ? 1 : 0;
  if(PL.sprinting) PL.adsTarget = 0;
  PL.ads = damp(PL.ads, PL.adsTarget, d.scope?11:15, dt);

  /* scope overlay */
  var so = document.getElementById('scopeOverlay');
  var scoped = d.scope && PL.ads > 0.72;
  so.style.opacity = scoped ? 1 : 0;
  document.getElementById('crosshair').style.opacity = scoped ? 0 : 1;

  /* reload */
  if(PL.reloading > 0){
    PL.reloading -= dt;
    var prog = 1 - PL.reloading/PL.reloadTotal;
    if(!W.rlStage) W.rlStage = 0;
    if(prog > 0.22 && W.rlStage===0){ W.rlStage=1; AUD.reload(0); ejectMag(); }
    if(prog > 0.62 && W.rlStage===1){ W.rlStage=2; AUD.reload(1); }
    if(PL.reloading <= 0){
      W.rlStage = 0;
      var need = d.mag - W.ammo;
      var take = Math.min(need, W.reserve);
      W.ammo += take; W.reserve -= take;
      AUD.reload(2);
      updateHUDWeapon();
    }
    var rb = document.getElementById('reloadBar');
    rb.style.display='block'; rb.firstElementChild.style.width = (prog*100)+'%';
  } else {
    document.getElementById('reloadBar').style.display='none';
  }

  if(IN.hit('KeyR')) tryReload();

  /* melee */
  if(PL.meleeCd > 0) PL.meleeCd -= dt;
  if(PL.meleeAnim > 0){
    PL.meleeAnim -= dt;
    if(PL.meleeAnim <= 0.24 && !PL.meleeHit){ PL.meleeHit = true; doMelee(); }
  }
  if(IN.hit('KeyF') && PL.meleeCd<=0 && PL.reloading<=0){
    PL.meleeCd = 0.75; PL.meleeAnim = 0.42; PL.meleeHit = false;
    AUD.noise(0.13,.22,'bandpass',420,1.4);
  }

  /* firing */
  if(PL.fireCd > 0) PL.fireCd -= dt;
  var wantFire = d.auto ? IN.down[0] : (IN.down[0] && !PL.firedThis);
  if(!IN.down[0]) PL.firedThis = false;
  if(PL.sprinting) wantFire = false;
  if(PL.reloading > 0 || PL.meleeAnim > 0) wantFire = false;

  if(wantFire && PL.fireCd <= 0){
    if(W.ammo > 0){
      fireWeapon();
      PL.firedThis = true;
    } else {
      PL.firedThis = true;
      PL.fireCd = 0.25;
      AUD.dry();
      tryReload();
    }
  }
  animateViewModel(dt);
}

function tryReload(){
  var W = curW(), d = W.def;
  if(PL.reloading>0 || W.ammo >= d.mag || W.reserve <= 0) return;
  PL.reloading = PL.reloadTotal = d.reload;
  W.rlStage = 0;
  PL.adsTarget = 0;
}
function ejectMag(){
  var d = curW().def;
  var m = VM.cur; if(!m) return;
  var wp = worldMuzzle(m.userData.eject);
  for(var i=0;i<3;i++){
    FX.smoke.emit(wp.x,wp.y,wp.z, rand(-2,2), rand(-1,1), rand(-2,2), 0.25,0.25,0.28, rand(.06,.12), rand(.7,1.2), -20, 1.0, 1);
  }
}

/* convert a view-model local point to an approximate world position */
function worldMuzzle(local){
  var cam = G.camera;
  var v = TMPV.copy(local);
  if(VM.cur) v.applyMatrix4(VM.cur.matrixWorld);
  // view scene shares camera orientation; map into world using camera basis
  var out = TMPV2.set(0,0,0);
  var e = cam.matrixWorld.elements;
  out.x = e[0]*v.x + e[4]*v.y + e[8]*v.z + e[12];
  out.y = e[1]*v.x + e[5]*v.y + e[9]*v.z + e[13];
  out.z = e[2]*v.x + e[6]*v.y + e[10]*v.z + e[14];
  return out.clone();
}

function currentSpread(){
  var W = curW(), d = W.def;
  var sp = lerp(d.spread, d.adsSpread, PL.ads);
  var hspd = Math.hypot(PL.vel.x, PL.vel.z);
  sp += d.moveSpread * clamp(hspd/8,0,1) * (PL.crouch?0.4:1) * (1-PL.ads*0.55);
  if(!PL.onGround) sp += d.moveSpread*1.5;
  if(PL.crouch) sp *= 0.7;
  sp += PL.heat*0.0009;
  return sp;
}

function fireWeapon(){
  var W = curW(), d = W.def;
  W.ammo--;
  PL.fireCd = 60/d.rpm;
  PL.heat = (PL.heat||0) + 1;
  G.shotsFired++;

  var cam = G.camera;
  var dir = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
  var origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  var muzzleW = VM.cur ? worldMuzzle(VM.cur.userData.muzzle) : origin.clone();

  AUD.shot(d.sound, null);
  fxMuzzle(muzzleW, dir, d.id==='shotgun'||d.id==='sniper'?1.7:1);
  addFlash(muzzleW, 0xffcc77, d.id==='sniper'?5:2.6, 0.06);

  // shell casing
  var ej = VM.cur ? worldMuzzle(VM.cur.userData.eject) : origin;
  var right = new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
  if(d.id !== 'launcher'){
    FX.smoke.emit(ej.x,ej.y,ej.z,
      right.x*rand(2,4)+PL.vel.x, rand(1.5,3.4)+PL.vel.y, right.z*rand(2,4)+PL.vel.z,
      d.shellCol[0],d.shellCol[1],d.shellCol[2], 0.055, 1.5, -20, 0.7, 1);
  }

  if(d.projectile === 'rocket'){
    spawnRocket(muzzleW, dir);
  } else {
    var sp = currentSpread();
    var anyHit = false;
    for(var p=0;p<d.pellets;p++){
      var pd = dir.clone();
      if(sp>0){
        pd.x += rand(-sp,sp); pd.y += rand(-sp,sp); pd.z += rand(-sp,sp);
        pd.normalize();
      }
      if(hitscan(origin, pd, d, muzzleW)) anyHit = true;
    }
    if(anyHit) G.shotsHit++;
  }

  // recoil
  var rmul = lerp(1, 0.62, PL.ads) * (PL.crouch?0.82:1);
  PL.recoilP += d.recoil * rmul * rand(0.85,1.15);
  PL.recoilY += rand(-d.recoilH, d.recoilH) * rmul;
  PL.punch += d.kick*3.2;
  PL.viewKick += d.kick;
  PL.viewRot += d.kick*1.6;
  addShake(d.kick*0.9, 0.18);
  updateHUDWeapon();
}

/* Cast a ray through the world; damage enemies. Returns true if an enemy was hit */
function hitscan(origin, dir, d, muzzleW){
  var maxT = d.range;
  var pierce = d.pierce || 0;
  var hitEnemy = false;
  var curOrigin = origin.clone();
  var remaining = maxT;
  var traceStart = muzzleW ? muzzleW.clone() : origin.clone();

  for(var iter=0; iter<=pierce; iter++){
    // world hit distance
    var wallT = remaining, wallBox = null, groundHit = false;
    for(var i=0;i<WORLD.colliders.length;i++){
      var c = WORLD.colliders[i];
      if(c.disabled) continue;
      var t = rayAABB(curOrigin.x,curOrigin.y,curOrigin.z, dir.x,dir.y,dir.z, c, wallT);
      if(t >= 0 && t < wallT){ wallT = t; wallBox = c; }
    }
    if(dir.y < -0.0001 && curOrigin.y > 0){
      var tg = -curOrigin.y/dir.y;
      if(tg >= 0 && tg < wallT){ wallT = tg; wallBox = null; groundHit = true; }
    }
    // enemy hit
    var best = null, bestT = wallT, bestPart='body', bestRemote = null;
    for(i=0;i<ENEMIES.length;i++){
      var e = ENEMIES[i];
      if(e.dead || e.ignoreRay) continue;
      var hb = e.hitHead, bb = e.hitBody;
      var th = rayAABB(curOrigin.x,curOrigin.y,curOrigin.z, dir.x,dir.y,dir.z, hb, bestT);
      var tb = rayAABB(curOrigin.x,curOrigin.y,curOrigin.z, dir.x,dir.y,dir.z, bb, bestT);
      if(th >= 0 && th < bestT){ bestT = th; best = e; bestPart='head'; }
      if(tb >= 0 && tb < bestT){ bestT = tb; best = e; bestPart='body'; }
    }
    /* remote players are hit targets too, using their interpolated boxes */
    if(MATCH.on){
      for(var rid in NET.peers){
        var rp = NET.peers[rid];
        if(!rp.alive) continue;
        var rth = rayAABB(curOrigin.x,curOrigin.y,curOrigin.z, dir.x,dir.y,dir.z, rp.hitHead, bestT);
        var rtb = rayAABB(curOrigin.x,curOrigin.y,curOrigin.z, dir.x,dir.y,dir.z, rp.hitBody, bestT);
        if(rth >= 0 && rth < bestT){ bestT = rth; best = null; bestRemote = rp; bestPart='head'; }
        if(rtb >= 0 && rtb < bestT){ bestT = rtb; best = null; bestRemote = rp; bestPart='body'; }
      }
    }

    var point = curOrigin.clone().addScaledVector(dir, bestT);
    if(bestRemote){
      hitEnemy = true;
      var rdmg = d.dmg;
      var rdist = origin.distanceTo(point);
      if(rdist > d.falloff) rdmg *= clamp(1 - (rdist-d.falloff)/(d.falloff*1.6), 0.32, 1);
      if(bestPart==='head') rdmg *= d.headMul;
      mpReportHit(bestRemote, Math.round(rdmg), bestPart==='head', point, d.id);
      fxImpact(point, TMPV.copy(dir).negate(), 'flesh');
      fxBlood(point, TMPV3.copy(dir), 5);
      addTracer(traceStart, point, d.tracerCol, d.id==='sniper'?0.06:0.035, 0.055);
      AUD.impact(point,'flesh');
      break;
    }
    if(best){
      hitEnemy = true;
      var dmg = d.dmg;
      var dist = origin.distanceTo(point);
      if(dist > d.falloff) dmg *= clamp(1 - (dist-d.falloff)/(d.falloff*1.6), 0.32, 1);
      if(bestPart==='head') dmg *= d.headMul;
      damageEnemy(best, dmg, bestPart==='head', point, d.id);
      var back = TMPV3.copy(dir).multiplyScalar(1);
      fxImpact(point, TMPV.copy(dir).negate(), 'flesh');
      fxBlood(point, back, 5);
      addTracer(traceStart, point, d.tracerCol, d.id==='sniper'?0.06:0.035, 0.055);
      AUD.impact(point,'flesh');
      if(iter < pierce){
        best.ignoreRay = true;
        curOrigin = point.clone().addScaledVector(dir, 0.25);
        remaining = maxT - origin.distanceTo(curOrigin);
        traceStart = curOrigin.clone();
        if(remaining <= 0.5) break;
        continue;
      }
      break;
    } else {
      if(wallBox){
        if(wallBox.barrel){
          damageBarrel(wallBox.barrel, d.dmg*(d.pellets>1?1:1.1));
        }
        var n = aabbNormal(wallBox, point.x, point.y, point.z, TMPV.set(0,1,0));
        fxImpact(point, n, 'wall');
        addDecal(point, n, rand(0.16,0.3));
        AUD.impact(point,'wall');
      } else if(groundHit){
        var gn = new THREE.Vector3(0,1,0);
        fxImpact(point, gn, 'wall');
        addDecal(point, gn, rand(0.18,0.32));
        AUD.impact(point,'wall');
      }
      addTracer(traceStart, point, d.tracerCol, d.id==='sniper'?0.06:0.035, 0.055);
      break;
    }
  }
  for(i=0;i<ENEMIES.length;i++) ENEMIES[i].ignoreRay = false;
  return hitEnemy;
}

function doMelee(){
  var cam = G.camera;
  var dir = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
  var origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  var hit = false;
  for(var i=0;i<ENEMIES.length;i++){
    var e = ENEMIES[i]; if(e.dead) continue;
    var to = TMPV.copy(e.pos).setY(e.pos.y+e.height*0.5).sub(origin);
    var dist = to.length();
    if(dist > 3.0) continue;
    to.normalize();
    if(to.dot(dir) < 0.6) continue;
    damageEnemy(e, 85, false, e.pos.clone(), 'melee');
    e.knock.set(dir.x*11, 4.5, dir.z*11);
    e.stun = 0.4;
    hit = true;
  }
  for(i=0;i<WORLD.barrels.length;i++){
    var b = WORLD.barrels[i]; if(b.dead) continue;
    if(b.mesh.position.distanceTo(origin) < 3.2) damageBarrel(b, 60);
  }
  if(hit){ AUD.impact(origin,'flesh'); hitmarker(false); addShake(0.16,0.15); }
  else AUD.noise(0.09,.12,'highpass',900,1);
}

/* ---- view model animation ---- */
function animateViewModel(dt){
  var W = curW(), d = W.def, m = VM.models[PL.wi];
  if(VM.cur !== m){
    for(var i=0;i<VM.models.length;i++) VM.models[i].visible = (i===PL.wi);
    VM.cur = m;
  }
  // scoped optics replace the weapon model entirely
  m.visible = !(d.scope && PL.ads > 0.72);
  var base = m.userData.base, ads = m.userData.ads;
  var tx = lerp(base.x, ads.x, PL.ads);
  var ty = lerp(base.y, ads.y, PL.ads);
  var tz = lerp(base.z, ads.z, PL.ads);

  // sway from mouse
  PL.sway.x = damp(PL.sway.x, clamp(-IN.mouse.x*0.0016,-0.06,0.06), 9, dt);
  PL.sway.y = damp(PL.sway.y, clamp(-IN.mouse.y*0.0016,-0.06,0.06), 9, dt);
  tx += PL.sway.x; ty += PL.sway.y;

  // bob
  var b = PL.bobAmt*(1-PL.ads*0.85);
  tx += Math.sin(PL.bob*2)*0.028*b;
  ty += Math.abs(Math.cos(PL.bob))*0.024*b - 0.012*b;

  // sprint pose
  var sp = PL.sprinting ? 1 : 0;
  m.userData.sprint = damp(m.userData.sprint||0, sp, 9, dt);
  var spv = m.userData.sprint;
  tx += spv*0.06; ty -= spv*0.06; tz += spv*0.08;

  // switch anim
  PL.viewSwitch = damp(PL.viewSwitch||0, 0, 7, dt);
  ty -= PL.viewSwitch*0.5;

  // recoil kick
  PL.viewKick = damp(PL.viewKick, 0, 11, dt);
  PL.viewRot  = damp(PL.viewRot, 0, 10, dt);
  tz += PL.viewKick*1.1;

  // reload anim
  var rp = 0;
  if(PL.reloading > 0){
    var pr = 1 - PL.reloading/PL.reloadTotal;
    rp = Math.sin(Math.PI*clamp(pr,0,1));
    ty -= rp*0.20; tz += rp*0.05;
  }
  // melee anim
  var mp = 0;
  if(PL.meleeAnim > 0){
    mp = Math.sin(Math.PI*(1-PL.meleeAnim/0.42));
    tx -= mp*0.22; tz += mp*0.28; ty += mp*0.05;
  }

  m.position.set(
    damp(m.position.x, tx, 22, dt),
    damp(m.position.y, ty, 22, dt),
    damp(m.position.z, tz, 22, dt)
  );
  m.rotation.set(
    damp(m.rotation.x, -PL.viewKick*2.6 - rp*0.75 + spv*0.18 + PL.sway.y*1.6, 20, dt),
    damp(m.rotation.y, PL.sway.x*2.4 + spv*0.55 - mp*0.9, 20, dt),
    damp(m.rotation.z, PL.viewRot*0.5 + spv*0.30 + rp*0.35 + mp*0.6, 20, dt)
  );

  // per-weapon extras
  if(d.id==='shotgun' && m.userData.pump){
    var pk = (PL.fireCd>0 && PL.fireCd < 60/d.rpm) ? Math.sin(Math.PI*clamp(1-PL.fireCd/(60/d.rpm),0,1)) : 0;
    m.userData.pump.position.z = -0.3 + pk*0.16;
  }
  if(d.id==='sniper' && m.userData.bolt){
    var bk = (PL.fireCd>0) ? Math.sin(Math.PI*clamp(1-PL.fireCd/(60/d.rpm),0,1)) : 0;
    m.userData.bolt.position.z = 0.06 + bk*0.14;
  }
  if(d.id==='launcher' && m.userData.warhead){
    m.userData.warhead.visible = (curW().ammo > 0);
  }
  PL.heat = damp(PL.heat||0, 0, 3.2, dt);
}
