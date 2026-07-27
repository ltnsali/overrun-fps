"use strict";
/* ---------------------------------------------------------------------------
   11. ENEMIES
--------------------------------------------------------------------------- */
var ENEMIES = [];
var PROJ = [];
var PICKUPS = [];
var _pEye=null, _eToP=null, _eEye=null, _eMove=null;

var EDEF = {
  grunt:   {hp:110, speed:3.6, dmg:15, range:2.4, scale:1.0, col:0x8f3b34, acc:0x2a1512, score:100,
            melee:true, cd:1.15, wind:0.35, name:'GRUNT'},
  runner:  {hp:60,  speed:7.0, dmg:11, range:2.1, scale:0.86,col:0xb5622c, acc:0x33200c, score:130,
            melee:true, cd:0.8, wind:0.22, name:'STALKER'},
  soldier: {hp:135, speed:3.1, dmg:13, range:30,  scale:1.02,col:0x35688f, acc:0x122736, score:170,
            ranged:true, cd:1.5, burst:3, projSpeed:40, prefer:17, name:'MARKSMAN'},
  heavy:   {hp:300, speed:2.5, dmg:22, range:26,  scale:1.25,col:0x4a7a45, acc:0x1a2b18, score:260,
            ranged:true, cd:2.0, burst:6, projSpeed:32, prefer:13, name:'GUNNER'},
  brute:   {hp:620, speed:2.6, dmg:38, range:3.2, scale:1.75,col:0x6a3a80, acc:0x241230, score:400,
            melee:true, cd:1.5, wind:0.5, charge:true, name:'BRUTE'},
  boss:    {hp:2400,speed:2.9, dmg:48, range:34,  mrange:4.2, wind:0.45, scale:2.9, col:0xa02020, acc:0x300808, score:2500,
            ranged:true, melee:true, cd:1.1, burst:9, projSpeed:34, prefer:15, boss:true, name:'WARLORD'}
};

function makeLimb(w,h,d,mat){ 
  var g = new THREE.BoxGeometry(w,h,d);
  g.translate(0,-h/2,0);
  return new THREE.Mesh(g, mat);
}
function buildEnemyMesh(type){
  var def = EDEF[type];
  var g = new THREE.Group();
  var body = new THREE.MeshLambertMaterial({color:def.col});
  var dark = new THREE.MeshLambertMaterial({color:def.acc});
  var eye  = new THREE.MeshBasicMaterial({color: def.boss?0xffdd33:0xff3322});
  var s = def.scale;

  var root = new THREE.Group(); g.add(root);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62*s, 0.78*s, 0.36*s), body);
  torso.position.y = 1.14*s; root.add(torso);
  var chest = new THREE.Mesh(new THREE.BoxGeometry(0.66*s, 0.28*s, 0.4*s), dark);
  chest.position.y = 1.42*s; root.add(chest);
  var hips = new THREE.Mesh(new THREE.BoxGeometry(0.5*s,0.26*s,0.32*s), dark);
  hips.position.y = 0.78*s; root.add(hips);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.34*s,0.36*s,0.34*s), body);
  head.position.y = 1.74*s; root.add(head);
  var visor = new THREE.Mesh(new THREE.BoxGeometry(0.30*s,0.10*s,0.03*s), eye);
  visor.position.set(0,1.76*s,-0.18*s); root.add(visor);

  var armL = makeLimb(0.18*s,0.72*s,0.18*s, body); armL.position.set(-0.42*s,1.52*s,0); root.add(armL);
  var armR = makeLimb(0.18*s,0.72*s,0.18*s, body); armR.position.set( 0.42*s,1.52*s,0); root.add(armR);
  var legL = makeLimb(0.21*s,0.80*s,0.22*s, dark); legL.position.set(-0.16*s,0.80*s,0); root.add(legL);
  var legR = makeLimb(0.21*s,0.80*s,0.22*s, dark); legR.position.set( 0.16*s,0.80*s,0); root.add(legR);

  var weapon = null;
  if(def.ranged){
    weapon = new THREE.Group();
    var wb = new THREE.Mesh(new THREE.BoxGeometry(0.11*s,0.13*s,0.72*s), new THREE.MeshLambertMaterial({color:0x22262c}));
    wb.position.z = -0.24*s; weapon.add(wb);
    var wm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035*s,0.035*s,0.3*s,8), new THREE.MeshLambertMaterial({color:0x555b66}));
    wm2.rotation.x = Math.PI/2; wm2.position.z = -0.66*s; weapon.add(wm2);
    var glow = new THREE.Mesh(new THREE.BoxGeometry(0.05*s,0.05*s,0.16*s), new THREE.MeshBasicMaterial({color:0x66ddff}));
    glow.position.z = -0.44*s; weapon.add(glow);
    weapon.position.set(0.42*s, 1.26*s, -0.1*s);
    root.add(weapon);
  } else {
    var claw = new THREE.Mesh(new THREE.ConeGeometry(0.13*s, 0.42*s, 6), new THREE.MeshLambertMaterial({color:0xd8d0c0}));
    claw.rotation.x = Math.PI; claw.position.set(0.42*s, 0.78*s, 0); root.add(claw);
    var claw2 = claw.clone(); claw2.position.x = -0.42*s; root.add(claw2);
  }
  if(def.boss){
    var crown = new THREE.Mesh(new THREE.ConeGeometry(0.3*s,0.5*s,5), new THREE.MeshLambertMaterial({color:0xffcc44}));
    crown.position.y = 2.1*s; root.add(crown);
    var pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.28*s,8,6), dark);
    pauldronL.position.set(-0.5*s,1.62*s,0); root.add(pauldronL);
    var pauldronR = pauldronL.clone(); pauldronR.position.x = 0.5*s; root.add(pauldronR);
  }
  g.traverse(function(o){ if(o.isMesh){ o.castShadow = true; o.receiveShadow = false; } });

  /* health bar billboard */
  var bar = new THREE.Group();
  var bg = new THREE.Mesh(new THREE.PlaneGeometry(1.0*s, 0.11*s),
      new THREE.MeshBasicMaterial({color:0x101418, transparent:true, opacity:0.75, depthTest:false}));
  var fill = new THREE.Mesh(new THREE.PlaneGeometry(1.0*s, 0.11*s),
      new THREE.MeshBasicMaterial({color:0xff3b5c, depthTest:false}));
  fill.position.z = 0.001;
  bar.add(bg); bar.add(fill);
  bar.position.y = (def.boss?2.5:2.05)*s;
  bar.renderOrder = 999;
  bar.visible = false;
  g.add(bar);

  return {group:g, root:root, torso:torso, head:head, armL:armL, armR:armR, legL:legL, legR:legR,
          weapon:weapon, visor:visor, bar:bar, barFill:fill, barW:1.0*s, bodyMat:body, headMat:body};
}

function spawnEnemy(type, pos){
  var def = EDEF[type];
  var vis = buildEnemyMesh(type);
  var e = {
    type:type, def:def, mesh:vis.group, v:vis,
    pos: pos.clone(), vel:new THREE.Vector3(), yaw: rand(0,6.28),
    hp: def.hp * D().hp * (1 + G.wave*0.055), 
    maxHp: 0, dead:false, deadT:0, sinking:false,
    height: 1.9*def.scale, radius: 0.42*def.scale,
    state:'chase', attackCd: rand(0.3,1.2), windup:0, burstLeft:0, burstCd:0,
    stun:0, knock:new THREE.Vector3(), anim: rand(0,6), onGround:false,
    strafe: Math.random()<0.5?1:-1, strafeT: rand(1,3),
    hitHead:{minx:0,miny:0,minz:0,maxx:0,maxy:0,maxz:0},
    hitBody:{minx:0,miny:0,minz:0,maxx:0,maxy:0,maxz:0},
    ignoreRay:false, flash:0, growl: rand(2,7), lastLOS:0, seesPlayer:false, losT:0,
    chargeT:0, spawnFx:0.6
  };
  e.maxHp = e.hp;
  e.mesh.position.copy(e.pos);
  G.scene.add(e.mesh);
  ENEMIES.push(e);
  // spawn effect
  addFlash(pos.clone().setY(pos.y+1), 0xff4433, 3, 0.35);
  for(var i=0;i<18;i++){
    var a = Math.random()*6.28;
    FX.spark.emit(pos.x+Math.cos(a)*0.6, pos.y+rand(0,2), pos.z+Math.sin(a)*0.6,
      Math.cos(a)*2, rand(2,7), Math.sin(a)*2, 1,0.25,0.15, rand(.1,.2), rand(.3,.6), -6, 2, 0);
  }
  return e;
}

/* line of sight from enemy eyes to player eyes */
function hasLOS(from, to){
  var dx = to.x-from.x, dy = to.y-from.y, dz = to.z-from.z;
  var dist = Math.hypot(dx,dy,dz);
  if(dist < 0.001) return true;
  dx/=dist; dy/=dist; dz/=dist;
  for(var i=0;i<WORLD.colliders.length;i++){
    var c = WORLD.colliders[i];
    if(c.disabled) continue;
    var t = rayAABB(from.x,from.y,from.z, dx,dy,dz, c, dist);
    if(t >= 0 && t < dist-0.15) return false;
  }
  return true;
}

function enemyBlocked(e, x, z){
  var n = collectNear(x, z, e.radius+0.2, _nC);
  for(var i=0;i<n;i++){
    var c = _nC[i];
    if(x+e.radius > c.minx && x-e.radius < c.maxx &&
       e.pos.y+e.height > c.miny && e.pos.y+0.05 < c.maxy &&
       z+e.radius > c.minz && z-e.radius < c.maxz){
      if(c.maxy - e.pos.y <= 0.66) continue;   // can step over
      return c;
    }
  }
  return null;
}
function resolveEnemyAxis(e, axis){
  var n = collectNear(e.pos.x, e.pos.z, e.radius+0.7, _nA);
  var i, c;
  if(axis !== 'y'){
    var top = climbTarget(_nA, n, e.pos.x, e.pos.y, e.pos.z, e.radius, e.height, 0.66);
    if(top >= 0){
      e.pos.y = top + 0.02; e.onGround = true;
      if(e.vel.y < 0) e.vel.y = 0;
      return;
    }
  }
  for(i=0;i<n;i++){
    c = _nA[i];
    if(!(e.pos.x+e.radius > c.minx && e.pos.x-e.radius < c.maxx &&
         e.pos.y+e.height > c.miny && e.pos.y < c.maxy &&
         e.pos.z+e.radius > c.minz && e.pos.z-e.radius < c.maxz)) continue;
    if(axis === 'y'){
      var dn = (c.miny - e.height) - e.pos.y, up = c.maxy - e.pos.y;
      if(Math.abs(dn) < Math.abs(up)){ e.pos.y = c.miny - e.height - 0.01; if(e.vel.y>0) e.vel.y=0; }
      else { e.pos.y = c.maxy + 0.001; if(e.vel.y<0){ e.vel.y=0; e.onGround=true; } }
    } else if(axis === 'x'){
      var l = (c.minx - e.radius) - e.pos.x, r = (c.maxx + e.radius) - e.pos.x;
      e.pos.x += (Math.abs(l)<Math.abs(r)) ? l-0.001 : r+0.001;
    } else {
      var b = (c.minz - e.radius) - e.pos.z, f = (c.maxz + e.radius) - e.pos.z;
      e.pos.z += (Math.abs(b)<Math.abs(f)) ? b-0.001 : f+0.001;
    }
  }
}

function updateEnemies(dt){
  var playerEye = _pEye.set(PL.pos.x, PL.pos.y+PL.eye, PL.pos.z);
  for(var i=ENEMIES.length-1;i>=0;i--){
    var e = ENEMIES[i];
    if(e.dead){ updateDeadEnemy(e, dt, i); continue; }

    e.anim += dt;
    if(e.flash > 0){
      e.flash -= dt;
      var f = clamp(e.flash/0.1,0,1);
      e.v.bodyMat.emissive.setRGB(f*0.9, f*0.15, f*0.1);
    }
    if(e.spawnFx > 0) e.spawnFx -= dt;

    var toP = _eToP.set(PL.pos.x-e.pos.x, 0, PL.pos.z-e.pos.z);
    var dist = toP.length();
    e.losT -= dt;
    if(e.losT <= 0){
      e.losT = rand(0.09, 0.16);
      _eEye.set(e.pos.x, e.pos.y + e.height*0.85, e.pos.z);
      e.seesPlayer = (dist < 90) && hasLOS(_eEye, playerEye);
    }

    if(e.stun > 0) e.stun -= dt;
    if(e.growl > 0){ e.growl -= dt; if(e.growl<=0){ if(dist<38) AUD.enemyGrowl(e.pos); e.growl = rand(4,11); } }

    var def = e.def;
    var moveDir = _eMove.set(0,0,0);
    var speed = def.speed * D().speed * (1 + Math.min(G.wave,20)*0.008);
    var nx = toP.x/Math.max(dist,0.001), nz = toP.z/Math.max(dist,0.001);

    if(e.stun <= 0){
      var meleeRange = def.mrange || def.range;
      if(def.ranged && !(def.melee && dist < meleeRange)){
        /* ranged behaviour: maintain preferred distance, strafe, shoot */
        var pref = def.prefer;
        var radial = 0;
        if(dist > pref+2.5) radial = 1;
        else if(dist < pref-3) radial = -1;
        e.strafeT -= dt;
        if(e.strafeT <= 0){ e.strafe *= -1; e.strafeT = rand(1.3,3.2); }
        moveDir.set(nx*radial - nz*e.strafe*0.65, 0, nz*radial + nx*e.strafe*0.65);
        if(!e.seesPlayer) moveDir.set(nx, 0, nz);   // reposition to regain LOS
        if(e.seesPlayer && dist < def.range){
          e.attackCd -= dt;
          if(e.burstLeft > 0){
            e.burstCd -= dt;
            if(e.burstCd <= 0){
              enemyShoot(e, playerEye);
              e.burstLeft--;
              e.burstCd = def.boss?0.11:0.16;
            }
          } else if(e.attackCd <= 0){
            e.burstLeft = def.burst || 1;
            e.burstCd = 0;
            e.attackCd = def.cd * rand(0.85,1.35) + (def.burst||1)*0.16;
          }
        }
      } else {
        /* melee behaviour */
        moveDir.set(nx,0,nz);
        if(def.charge){
          e.chargeT -= dt;
          if(e.chargeT <= 0 && dist > 7 && dist < 26 && e.seesPlayer){
            e.chargeT = rand(4,8); e.chargeBoost = 1.4;
          }
          if(e.chargeBoost > 1){ e.chargeBoost = damp(e.chargeBoost, 1, 0.7, dt); speed *= e.chargeBoost; }
        }
        if(dist < meleeRange + e.radius){
          moveDir.multiplyScalar(0.12);
          if(e.windup > 0){
            e.windup -= dt;
            if(e.windup <= 0){
              if(dist < meleeRange + 1.1 && e.seesPlayer) {
                damagePlayer(def.dmg * D().dmg, e.pos, false, e);
                AUD.noise(0.16,.32,'lowpass',700,1);
              }
              e.attackCd = def.cd * rand(0.85,1.2);
            }
          } else if(e.attackCd <= 0){
            e.windup = def.wind;
            AUD.tone(220, 340, 0.14, .12*AUD.at(e.pos), 'sawtooth');
          }
        }
        if(e.attackCd > 0) e.attackCd -= dt;
      }

      /* obstacle avoidance: try direct, then fan out */
      if(moveDir.lengthSq() > 0.0001){
        moveDir.normalize();
        var probe = 1.15 + e.radius;
        if(enemyBlocked(e, e.pos.x + moveDir.x*probe, e.pos.z + moveDir.z*probe)){
          var found = false;
          var angles = [0.5,-0.5,1.0,-1.0,1.6,-1.6,2.3,-2.3];
          for(var a2=0;a2<angles.length;a2++){
            var ca = Math.cos(angles[a2]), sa = Math.sin(angles[a2]);
            var rx = moveDir.x*ca - moveDir.z*sa, rz = moveDir.x*sa + moveDir.z*ca;
            if(!enemyBlocked(e, e.pos.x + rx*probe, e.pos.z + rz*probe)){
              moveDir.set(rx,0,rz); found = true; break;
            }
          }
          if(!found) moveDir.multiplyScalar(0.15);
        }
      }
      /* separation from other enemies */
      for(var j=0;j<ENEMIES.length;j++){
        if(j===i) continue;
        var o = ENEMIES[j];
        if(o.dead) continue;
        var ox = e.pos.x-o.pos.x, oz = e.pos.z-o.pos.z;
        var d2 = ox*ox+oz*oz, minD = (e.radius+o.radius)*1.15;
        if(d2 < minD*minD && d2 > 0.0001){
          var dd = Math.sqrt(d2);
          moveDir.x += (ox/dd)*(1-dd/minD)*1.6;
          moveDir.z += (oz/dd)*(1-dd/minD)*1.6;
        }
      }
    }

    /* integrate */
    var tvx = moveDir.x*speed, tvz = moveDir.z*speed;
    if(e.stun > 0){ tvx = 0; tvz = 0; }
    e.vel.x = damp(e.vel.x, tvx, 9, dt) + e.knock.x;
    e.vel.z = damp(e.vel.z, tvz, 9, dt) + e.knock.z;
    e.vel.y += (e.knock.y||0) - 24*dt;
    e.knock.multiplyScalar(Math.exp(-9*dt));
    if(e.knock.lengthSq() < 0.01) e.knock.set(0,0,0);

    e.onGround = false;
    e.pos.x += e.vel.x*dt; resolveEnemyAxis(e,'x');
    e.pos.z += e.vel.z*dt; resolveEnemyAxis(e,'z');
    e.pos.y += e.vel.y*dt; resolveEnemyAxis(e,'y');
    if(e.pos.y <= 0){ e.pos.y = 0; if(e.vel.y<0) e.vel.y=0; e.onGround = true; }

    /* personal space: never let a body intersect the camera */
    var dxp = e.pos.x - PL.pos.x, dzp = e.pos.z - PL.pos.z;
    var dd = Math.hypot(dxp, dzp), minD = e.radius + PL.radius + 0.3;
    if(dd < minD && dd > 0.0001){
      var push = minD - dd;
      e.pos.x += (dxp/dd)*push;
      e.pos.z += (dzp/dd)*push;
    }

    var S = WORLD.size-2;
    e.pos.x = clamp(e.pos.x,-S,S); e.pos.z = clamp(e.pos.z,-S,S);

    /* facing */
    var targetYaw = Math.atan2(PL.pos.x-e.pos.x, PL.pos.z-e.pos.z);
    e.yaw = angLerp(e.yaw, targetYaw, 1-Math.exp(-7*dt));

    /* animation */
    var hspd = Math.hypot(e.vel.x, e.vel.z);
    var stride = e.anim * (3 + hspd*1.5);
    var amp = clamp(hspd/4,0,1);
    e.v.legL.rotation.x =  Math.sin(stride)*0.85*amp;
    e.v.legR.rotation.x = -Math.sin(stride)*0.85*amp;
    if(e.def.ranged){
      e.v.armR.rotation.x = -1.42 + Math.sin(e.anim*3)*0.03;
      e.v.armL.rotation.x = -1.25;
      e.v.armL.rotation.z = 0.4;
      if(e.v.weapon) e.v.weapon.rotation.x = clamp(-(PL.pos.y+1.4 - (e.pos.y+e.height*0.7))/Math.max(2,dist)*0.9, -0.8, 0.8);
    } else {
      var atk = e.windup>0 ? (1 - e.windup/Math.max(0.01,e.def.wind)) : 0;
      e.v.armL.rotation.x = -Math.sin(stride)*0.6*amp - atk*2.2;
      e.v.armR.rotation.x =  Math.sin(stride)*0.6*amp - atk*2.2;
    }
    e.v.root.position.y = Math.abs(Math.sin(stride))*0.055*amp;
    e.v.root.rotation.z = Math.sin(stride*0.5)*0.03*amp;
    if(e.windup > 0) e.v.root.position.z = -0.12;
    else e.v.root.position.z = damp(e.v.root.position.z, 0, 8, dt);

    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y = e.yaw;

    /* health bar */
    var showBar = (e.hp < e.maxHp*0.999) && dist < 60;
    e.v.bar.visible = showBar;
    if(showBar){
      var frac = clamp(e.hp/e.maxHp,0,1);
      e.v.barFill.scale.x = frac;
      e.v.barFill.position.x = -(e.v.barW*(1-frac))/2;
      e.v.barFill.material.color.setHex(frac>0.6?0x57ff9a:(frac>0.28?0xffc24b:0xff3b5c));
      e.v.bar.quaternion.copy(G.camera.quaternion);
      e.v.bar.rotation.z = 0;
    }

    /* hitboxes */
    var r = e.radius*0.98, hh = e.height;
    e.hitBody.minx = e.pos.x-r; e.hitBody.maxx = e.pos.x+r;
    e.hitBody.minz = e.pos.z-r; e.hitBody.maxz = e.pos.z+r;
    e.hitBody.miny = e.pos.y+0.05; e.hitBody.maxy = e.pos.y+hh*0.86;
    var hr = 0.22*e.def.scale;
    e.hitHead.minx = e.pos.x-hr; e.hitHead.maxx = e.pos.x+hr;
    e.hitHead.minz = e.pos.z-hr; e.hitHead.maxz = e.pos.z+hr;
    e.hitHead.miny = e.pos.y+hh*0.86; e.hitHead.maxy = e.pos.y+hh*1.03;
  }
}

function updateDeadEnemy(e, dt, idx){
  e.deadT += dt;
  var t = e.deadT;
  e.v.root.rotation.x = damp(e.v.root.rotation.x, e.fallDir||1.55, 5, dt);
  e.v.root.position.y = damp(e.v.root.position.y, -e.height*0.36, 4, dt);
  e.vel.y -= 24*dt;
  e.pos.y += e.vel.y*dt;
  e.pos.x += e.vel.x*dt; e.pos.z += e.vel.z*dt;
  e.vel.x = damp(e.vel.x,0,4,dt); e.vel.z = damp(e.vel.z,0,4,dt);
  if(e.pos.y <= 0){ e.pos.y = 0; e.vel.y = 0; }
  e.mesh.position.copy(e.pos);
  if(t > 4.5){
    e.mesh.position.y -= dt*0.9;
    if(t > 6.4){
      G.scene.remove(e.mesh);
      disposeMesh(e.mesh);
      ENEMIES.splice(idx,1);
    }
  }
}
function disposeMesh(m){
  m.traverse(function(o){
    if(o.geometry) o.geometry.dispose();
    if(o.material){ if(Array.isArray(o.material)) o.material.forEach(function(x){x.dispose();}); else o.material.dispose(); }
  });
}

function enemyShoot(e, targetPos){
  var muzzle = new THREE.Vector3(e.pos.x, e.pos.y+e.height*0.68, e.pos.z);
  var fwd = new THREE.Vector3(Math.sin(e.yaw),0,Math.cos(e.yaw));
  muzzle.addScaledVector(fwd, 0.7).add(new THREE.Vector3(Math.cos(e.yaw)*0.42,0,-Math.sin(e.yaw)*0.42));
  var dir = targetPos.clone().sub(muzzle).normalize();
  var acc = e.def.boss ? 0.045 : 0.055;
  acc *= (SET.diff>=2?0.7:1);
  dir.x += rand(-acc,acc); dir.y += rand(-acc,acc); dir.z += rand(-acc,acc);
  dir.normalize();
  spawnPlasma(muzzle, dir, e.def.projSpeed, e.def.dmg*D().dmg, e.def.boss, e.botName || e.def.name);
  AUD.enemyShoot(e.pos);
  fxMuzzle(muzzle, dir, 0.8);
  addFlash(muzzle, 0x66ddff, 1.4, 0.05);
}
