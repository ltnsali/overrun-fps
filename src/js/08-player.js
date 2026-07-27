"use strict";
/* ---------------------------------------------------------------------------
   9. PLAYER
--------------------------------------------------------------------------- */
var PL = {
  pos:null, vel:null, yaw:0, pitch:0,
  hp:100, maxHp:100, armor:0, maxArmor:100,
  stam:100, maxStam:100, sprinting:false, exhausted:false,
  radius:0.38, standH:1.78, crouchH:1.05, h:1.78, eye:1.62,
  onGround:true, crouch:false, wasAir:0,
  weapons:[], wi:0, lastWi:1,
  fireCd:0, reloading:0, reloadTotal:0, pendingReload:false,
  ads:0, adsTarget:0, recoilP:0, recoilY:0, punch:0,
  bob:0, bobAmt:0, sway:{x:0,y:0}, viewKick:0, viewRot:0,
  grenades:3, maxGren:3, grenadeCd:0,
  meleeCd:0, meleeAnim:0,
  hurtCd:0, regenTimer:0,
  stepDist:0, alive:true,
  shakeOff:null, camPos:null, lastDamageDir:null,
  killStreak:0, dmgDealt:0
};

var STEP_HEIGHT = 0.62;

function initPlayer(){
  PL.pos = new THREE.Vector3(0,0,26);
  PL.vel = new THREE.Vector3();
  PL.camPos = new THREE.Vector3();
  PL.shakeOff = new THREE.Vector3();
  PL.yaw = Math.PI; PL.pitch = 0;
  PL.hp = PL.maxHp; PL.armor = 0; PL.stam = PL.maxStam;
  PL.weapons = [];
  for(var i=0;i<WDEF.length;i++){
    var d = WDEF[i];
    PL.weapons.push({
      def:d, ammo:d.mag,
      reserve: Math.round(d.reserve * D().ammo),
      owned:true
    });
  }
  PL.wi = 1; PL.lastWi = 0;
  PL.grenades = 3;
  PL.alive = true;
  PL.crouch=false; PL.h=PL.standH;
  PL.ads=0; PL.adsTarget=0; PL.recoilP=0; PL.recoilY=0;
  PL.reloading = 0; PL.fireCd = 0;
  PL.heat = 0; PL.viewKick = 0; PL.viewRot = 0; PL.viewSwitch = 0;
  PL.bob = 0; PL.bobAmt = 0; PL.sway.x = 0; PL.sway.y = 0;
  PL.hurtCd = 0; PL.regenTimer = 0; PL.wasAir = 0; PL.meleeAnim = 0; PL.meleeCd = 0;
  PL.killStreak = 0;

  /* nudge to a free spawn spot if geometry landed on the default one */
  var cands = [[0,26],[0,-26],[26,0],[-26,0],[20,20],[-20,-20],[34,10],[-34,-10]];
  for(var c=0;c<cands.length;c++){
    if(!blockedAt(cands[c][0], 0, cands[c][1], PL.radius, PL.standH)){
      PL.pos.set(cands[c][0], 0, cands[c][1]);
      PL.yaw = Math.atan2(PL.pos.x, PL.pos.z);
      break;
    }
  }
}
function curW(){ return PL.weapons[PL.wi]; }

/* ---- collision helpers ---- */
function boxOverlapPlayer(c, x, y, z, r, h){
  return (x+r > c.minx && x-r < c.maxx &&
          y+h > c.miny && y     < c.maxy &&
          z+r > c.minz && z-r < c.maxz);
}
function blockedAt(x,y,z,r,h){
  var n = collectNear(x,z,r+0.1,_nB);
  for(var i=0;i<n;i++){
    if(boxOverlapPlayer(_nB[i], x,y,z, r, h)) return true;
  }
  return false;
}
/* Highest surface the mover can climb onto from `py`, chaining across the
   colliders it straddles. Returns -1 when something is genuinely a wall. */
var MAX_STEP_TOTAL = 1.05;
function climbTarget(list, n, px, py, pz, r, h, maxStep){
  var top = py, changed = true, guard = 0, i, c, any = false;
  while(changed && guard++ < 6){
    changed = false;
    for(i=0;i<n;i++){
      c = list[i];
      if(!boxOverlapPlayer(c, px, py, pz, r, h)) continue;
      any = true;
      if(c.maxy <= top) continue;
      if(c.maxy - top <= maxStep && c.maxy - py <= MAX_STEP_TOTAL){ top = c.maxy; changed = true; }
    }
  }
  if(!any) return -1;
  for(i=0;i<n;i++){
    c = list[i];
    if(!boxOverlapPlayer(c, px, py, pz, r, h)) continue;
    if(c.maxy > top) return -1;          // a real wall
  }
  return top > py + 0.0005 ? top : -1;
}

function resolvePlayerAxis(axis){
  var r = PL.radius, h = PL.h, p = PL.pos;
  var n = collectNear(p.x, p.z, r+0.7, _nA);
  var i, c;

  if(axis === 'y'){
    for(i=0;i<n;i++){
      c = _nA[i];
      if(!boxOverlapPlayer(c, p.x,p.y,p.z, r, h)) continue;
      var dn = (c.miny - h) - p.y, up = c.maxy - p.y;
      if(Math.abs(dn) < Math.abs(up)){ p.y = c.miny - h - 0.001; if(PL.vel.y>0) PL.vel.y = 0; }
      else { p.y = c.maxy + 0.0005; if(PL.vel.y<0){ PL.vel.y = 0; PL.onGround = true; } }
    }
    return;
  }

  /* phase 1 - climb onto the highest reachable surface */
  var top = climbTarget(_nA, n, p.x, p.y, p.z, r, h, STEP_HEIGHT);
  if(top >= 0 && (PL.onGround || PL.vel.y < 1.5) && !blockedAt(p.x, top+0.02, p.z, r, h)){
    p.y = top + 0.02;
    PL.onGround = true;
    if(PL.vel.y < 0) PL.vel.y = 0;
    return;
  }

  /* phase 2 - slide along the obstruction */
  for(i=0;i<n;i++){
    c = _nA[i];
    if(!boxOverlapPlayer(c, p.x,p.y,p.z, r, h)) continue;
    if(axis === 'x'){
      var l = (c.minx - r) - p.x, rr = (c.maxx + r) - p.x;
      if(Math.abs(l) < Math.abs(rr)){ p.x += l - 0.001; } else { p.x += rr + 0.001; }
      PL.vel.x = 0;
    } else {
      var b = (c.minz - r) - p.z, f = (c.maxz + r) - p.z;
      if(Math.abs(b) < Math.abs(f)){ p.z += b - 0.001; } else { p.z += f + 0.001; }
      PL.vel.z = 0;
    }
  }
}

/* ---- main player update ---- */
function updatePlayer(dt){
  var wasGround = PL.onGround;

  /* waiting to respawn in a deathmatch: freeze the body, keep the view alive */
  if(MATCH.on && !PL.alive){
    updateCamera(dt);
    G.camera.updateMatrixWorld(true);
    return;
  }

  /* look */
  var sens = 0.0022 * SET.sens * (PL.ads>0.5 ? lerp(1, curW().def.zoom, PL.ads*0.9) : 1);
  PL.yaw   -= IN.mouse.x * sens;
  PL.pitch -= IN.mouse.y * sens;
  PL.pitch = clamp(PL.pitch, -1.54, 1.54);

  /* recoil recovery */
  PL.recoilP = damp(PL.recoilP, 0, 7.5, dt);
  PL.recoilY = damp(PL.recoilY, 0, 6.5, dt);
  PL.punch   = damp(PL.punch, 0, 9, dt);

  /* crouch */
  var wantCrouch = IN.isDown('ControlLeft') || IN.isDown('KeyC') || IN.isDown('ControlRight');
  if(!wantCrouch && PL.crouch){
    if(!blockedAt(PL.pos.x, PL.pos.y, PL.pos.z, PL.radius, PL.standH)) PL.crouch = false;
  } else if(wantCrouch) PL.crouch = true;
  var targetH = PL.crouch ? PL.crouchH : PL.standH;
  PL.h = damp(PL.h, targetH, 14, dt);
  PL.eye = PL.h - 0.16;

  /* movement input (keyboard = digital, virtual stick = analog) */
  var fwd = (IN.isDown('KeyW')?1:0) - (IN.isDown('KeyS')?1:0);
  var str = (IN.isDown('KeyD')?1:0) - (IN.isDown('KeyA')?1:0);
  fwd += IN.axis.y; str += IN.axis.x;
  var len = Math.hypot(fwd,str);
  if(len>1){ fwd/=len; str/=len; len = 1; }

  var moving = len > 0.08;
  var wantSprint = (IN.isDown('ShiftLeft') || IN.sprint) && fwd > 0.3 && !PL.crouch && PL.ads < 0.5 && !PL.exhausted;
  PL.sprinting = wantSprint && moving && PL.onGround;

  if(PL.sprinting){
    PL.stam -= 24*dt;
    if(PL.stam <= 0){ PL.stam = 0; PL.exhausted = true; }
  } else {
    PL.stam += (PL.onGround && !moving ? 30 : 18)*dt;
    if(PL.stam >= PL.maxStam){ PL.stam = PL.maxStam; }
    if(PL.exhausted && PL.stam > 32) PL.exhausted = false;
  }

  var baseSpeed = 6.3;
  if(PL.crouch) baseSpeed *= 0.46;
  else if(PL.sprinting) baseSpeed *= 1.62;
  if(PL.ads > 0.5) baseSpeed *= 0.55;
  if(PL.reloading > 0) baseSpeed *= 0.92;

  var sy = Math.sin(PL.yaw), cy = Math.cos(PL.yaw);
  var wishX = (-sy*fwd) + (cy*str);
  var wishZ = (-cy*fwd) + (-sy*str);

  var accel = PL.onGround ? 62 : 13;
  var tx = wishX*baseSpeed, tz = wishZ*baseSpeed;
  if(PL.onGround){
    PL.vel.x = damp(PL.vel.x, tx, accel/6.5, dt);
    PL.vel.z = damp(PL.vel.z, tz, accel/6.5, dt);
    if(!moving){ PL.vel.x = damp(PL.vel.x, 0, 13, dt); PL.vel.z = damp(PL.vel.z, 0, 13, dt); }
  } else {
    PL.vel.x += tx*dt*2.4; PL.vel.z += tz*dt*2.4;
    var hs = Math.hypot(PL.vel.x, PL.vel.z), maxAir = baseSpeed*1.32;
    if(hs > maxAir){ PL.vel.x *= maxAir/hs; PL.vel.z *= maxAir/hs; }
  }

  /* jump */
  if(IN.isDown('Space') && PL.onGround){
    PL.vel.y = 7.0; PL.onGround = false; AUD.jump();
    PL.viewKick -= 0.02;
  }

  /* gravity */
  PL.vel.y -= 24*dt;
  if(PL.vel.y < -60) PL.vel.y = -60;

  /* integrate + collide */
  PL.onGround = false;
  PL.pos.x += PL.vel.x*dt; resolvePlayerAxis('x');
  PL.pos.z += PL.vel.z*dt; resolvePlayerAxis('z');
  PL.pos.y += PL.vel.y*dt; resolvePlayerAxis('y');
  if(PL.pos.y <= 0){ PL.pos.y = 0; if(PL.vel.y<0) PL.vel.y = 0; PL.onGround = true; }

  /* step-down snapping: keeps the player glued to stairs when descending */
  if(!PL.onGround && wasGround && PL.vel.y <= 0.6 && PL.pos.y > 0){
    var origY = PL.pos.y, origVY = PL.vel.y;
    PL.pos.y -= STEP_HEIGHT;
    if(PL.pos.y <= 0){ PL.pos.y = 0; PL.vel.y = 0; PL.onGround = true; }
    else resolvePlayerAxis('y');
    if(!PL.onGround){ PL.pos.y = origY; PL.vel.y = origVY; }
  }

  var S = WORLD.size - 2.2;
  PL.pos.x = clamp(PL.pos.x, -S, S);
  PL.pos.z = clamp(PL.pos.z, -S, S);

  /* landing */
  if(!wasGround && PL.onGround && PL.wasAir > 0.22){
    var f = clamp(PL.wasAir/1.1, 0, 1);
    AUD.land(f); PL.viewKick += 0.055*f; addShake(0.12*f, 0.2);
    if(PL.wasAir > 1.25) damagePlayer((PL.wasAir-1.25)*46, null, true);
    PL.wasAir = 0;
  }
  if(!PL.onGround) PL.wasAir += dt; else PL.wasAir = 0;

  /* head bob + footsteps */
  var hspd = Math.hypot(PL.vel.x, PL.vel.z);
  if(PL.onGround && hspd > 0.6){
    PL.bob += dt * hspd * (PL.sprinting?1.45:1.15);
    PL.stepDist += hspd*dt;
    var stepLen = PL.sprinting ? 2.3 : (PL.crouch?2.6:1.85);
    if(PL.stepDist > stepLen){ PL.stepDist = 0; AUD.step(PL.sprinting); }
  }
  PL.bobAmt = damp(PL.bobAmt, (PL.onGround && hspd>0.6) ? clamp(hspd/8,0,1) : 0, 8, dt);

  /* health regen (delayed) */
  if(PL.hurtCd > 0) PL.hurtCd -= dt;
  else if(PL.hp < PL.maxHp){
    PL.regenTimer += dt;
    if(PL.regenTimer > 0.1){ PL.regenTimer = 0; PL.hp = Math.min(PL.maxHp, PL.hp + (SET.diff<=1?1.4:0.7)); }
  }

  /* camera first so weapons fire along the current frame's aim */
  updateCamera(dt);
  G.camera.updateMatrixWorld(true);

  /* combat inputs */
  updateWeapon(dt);
  updateGrenadeInput(dt);
}

function updateCamera(dt){
  var cam = G.camera;
  var bobX = Math.sin(PL.bob*2)*0.035*PL.bobAmt*(PL.ads>0.5?0.3:1);
  var bobY = Math.abs(Math.cos(PL.bob))*0.05*PL.bobAmt*(PL.ads>0.5?0.3:1);
  var roll = Math.sin(PL.bob*2)*0.012*PL.bobAmt + (-PL.vel.x*Math.cos(PL.yaw) + PL.vel.z*Math.sin(PL.yaw))*0.0032;

  // screen shake
  if(G.shakeTime > 0){
    G.shakeTime -= dt;
    var s = G.shake * clamp(G.shakeTime/0.35,0,1);
    PL.shakeOff.set(rand(-s,s)*0.35, rand(-s,s)*0.35, rand(-s,s)*0.2);
    if(G.shakeTime<=0){ G.shake=0; PL.shakeOff.set(0,0,0); }
  } else PL.shakeOff.set(0,0,0);

  cam.position.set(
    PL.pos.x + bobX + PL.shakeOff.x,
    PL.pos.y + PL.eye + bobY + PL.shakeOff.y,
    PL.pos.z + PL.shakeOff.z
  );
  cam.rotation.set(0,0,0);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = PL.yaw + PL.recoilY*0.01;
  cam.rotation.x = clamp(PL.pitch + PL.recoilP*0.01, -1.56, 1.56);
  cam.rotation.z = roll + PL.shakeOff.z*0.05;

  var w = curW().def;
  var targetFov = SET.fov * (PL.ads>0 ? lerp(1, w.zoom, PL.ads) : 1);
  targetFov -= PL.punch*2.2;
  if(Math.abs(cam.fov - targetFov) > 0.01){
    cam.fov = damp(cam.fov, targetFov, 16, dt);
    cam.updateProjectionMatrix();
  }
  G.viewCam.fov = lerp(66, 54, PL.ads);
  G.viewCam.updateProjectionMatrix();
}
