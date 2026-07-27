"use strict";
/* ---------------------------------------------------------------------------
   12. PROJECTILES
--------------------------------------------------------------------------- */
var _plasmaGeo=null, _plasmaMat=null, _rocketGeo=null, _grenGeo=null;
function spawnPlasma(pos, dir, speed, dmg, big, srcName){
  if(!_plasmaGeo){
    _plasmaGeo = new THREE.SphereGeometry(0.11, 12, 8);
    _plasmaMat = new THREE.MeshBasicMaterial({color:0x7fe8ff, transparent:true, opacity:0.8,
                   blending:THREE.AdditiveBlending, depthWrite:false});
  }
  var m = new THREE.Mesh(_plasmaGeo, _plasmaMat);
  if(big) m.scale.setScalar(1.55);
  m.position.copy(pos);
  G.scene.add(m);
  PROJ.push({mesh:m, pos:m.position, vel:dir.clone().multiplyScalar(speed),
    life:5, type:'plasma', dmg:dmg, r:big?0.28:0.16, grav:-1.2, owner:'enemy', src:srcName});
}
function spawnRocket(pos, dir){
  if(!_rocketGeo) _rocketGeo = new THREE.CylinderGeometry(0.09,0.12,0.55,8);
  var g = new THREE.Group();
  var m = new THREE.Mesh(_rocketGeo, new THREE.MeshLambertMaterial({color:0x9aa0a8}));
  m.rotation.x = Math.PI/2; g.add(m);
  var tip = new THREE.Mesh(new THREE.ConeGeometry(0.12,0.24,8), new THREE.MeshLambertMaterial({color:0xaa3322}));
  tip.rotation.x = -Math.PI/2; tip.position.z = -0.38; g.add(tip);
  var fl = new THREE.Mesh(new THREE.SphereGeometry(0.16,7,5), new THREE.MeshBasicMaterial({color:0xffaa44}));
  fl.position.z = 0.34; g.add(fl);
  g.position.copy(pos);
  G.scene.add(g);
  PROJ.push({mesh:g, pos:g.position, vel:dir.clone().multiplyScalar(38),
    life:6, type:'rocket', dmg:210, radius:9.5, r:0.24, grav:-2.6, owner:'player', flame:fl, accel:26, dir:dir.clone()});
}
function spawnGrenade(pos, dir, power){
  if(!_grenGeo) _grenGeo = new THREE.SphereGeometry(0.13,8,6);
  var g = new THREE.Group();
  var m = new THREE.Mesh(_grenGeo, new THREE.MeshLambertMaterial({color:0x3a4a30}));
  g.add(m);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.09,0.02,5,8), new THREE.MeshBasicMaterial({color:0xff4422}));
  ring.rotation.x = Math.PI/2; ring.position.y = 0.11; g.add(ring);
  g.position.copy(pos);
  G.scene.add(g);
  PROJ.push({mesh:g, pos:g.position, vel:dir.clone().multiplyScalar(power).add(new THREE.Vector3(PL.vel.x*0.5,3,PL.vel.z*0.5)),
    life:1.9, type:'grenade', dmg:190, radius:8.6, r:0.14, grav:-24, owner:'player', bounce:0.42, blink:0});
}

function updateProjectiles(dt){
  for(var i=PROJ.length-1;i>=0;i--){
    var p = PROJ[i];
    p.life -= dt;
    if(p.type==='rocket'){
      p.vel.addScaledVector(p.dir, p.accel*dt);
      if(p.flame) p.flame.scale.setScalar(rand(0.7,1.3));
      FX.smoke.emit(p.pos.x,p.pos.y,p.pos.z, rand(-.5,.5),rand(-.2,.8),rand(-.5,.5),
        0.42,0.4,0.38, rand(.3,.55), rand(.5,1.0), 0.7, 2.0, 0);
      FX.spark.emit(p.pos.x,p.pos.y,p.pos.z, rand(-1,1),rand(-1,1),rand(-1,1),
        1,0.55,0.2, rand(.12,.25), 0.18, 0, 3, 0);
    } else if(p.type==='grenade'){
      p.blink += dt;
      p.mesh.children[1].visible = (Math.floor(p.blink*12)%2)===0;
    } else if(p.type==='plasma'){
      FX.spark.emit(p.pos.x,p.pos.y,p.pos.z, rand(-.4,.4),rand(-.4,.4),rand(-.4,.4),
        0.35,0.85,1.0, rand(.09,.18), 0.2, 0, 3, 0);
    }

    p.vel.y += p.grav*dt;
    var step = TMPV.copy(p.vel).multiplyScalar(dt);
    var stepLen = step.length();
    var nx = p.pos.x+step.x, ny = p.pos.y+step.y, nz = p.pos.z+step.z;
    var exploded = false;

    // world collision (ray from current pos)
    if(stepLen > 0.0001){
      var dirn = TMPV2.copy(step).multiplyScalar(1/stepLen);
      var hitT = stepLen + p.r, hitBox = null;
      for(var c=0;c<WORLD.colliders.length;c++){
        if(WORLD.colliders[c].disabled) continue;
        var t = rayAABB(p.pos.x,p.pos.y,p.pos.z, dirn.x,dirn.y,dirn.z, WORLD.colliders[c], hitT);
        if(t>=0 && t<hitT){ hitT=t; hitBox=WORLD.colliders[c]; }
      }
      if(hitBox && hitT <= stepLen + p.r){
        var hp2 = new THREE.Vector3(p.pos.x+dirn.x*hitT, p.pos.y+dirn.y*hitT, p.pos.z+dirn.z*hitT);
        var n = aabbNormal(hitBox, hp2.x,hp2.y,hp2.z, new THREE.Vector3(0,1,0));
        if(p.type==='grenade'){
          p.pos.copy(hp2).addScaledVector(n, p.r+0.01);
          var vn = p.vel.dot(n);
          p.vel.addScaledVector(n, -vn*(1+p.bounce));
          p.vel.multiplyScalar(0.72);
          AUD.noise(0.06,.12,'bandpass',1200,3);
          nx=p.pos.x; ny=p.pos.y; nz=p.pos.z;
        } else {
          if(hitBox.barrel) damageBarrel(hitBox.barrel, 200);
          projectileHit(p, hp2, n);
          PROJ.splice(i,1); exploded = true;
        }
      }
    }
    if(exploded) continue;

    p.pos.set(nx,ny,nz);
    // ground
    if(p.pos.y <= p.r){
      if(p.type==='grenade'){
        p.pos.y = p.r;
        if(Math.abs(p.vel.y) > 1){ p.vel.y = -p.vel.y*p.bounce; AUD.noise(0.06,.1,'bandpass',900,3); }
        else p.vel.y = 0;
        p.vel.x *= 0.78; p.vel.z *= 0.78;
      } else {
        projectileHit(p, p.pos.clone(), new THREE.Vector3(0,1,0));
        PROJ.splice(i,1); continue;
      }
    }

    // entity collision
    if(p.owner === 'enemy'){
      var pc = TMPV.set(PL.pos.x, PL.pos.y+PL.h*0.5, PL.pos.z);
      var dx = p.pos.x-pc.x, dy=(p.pos.y-pc.y)/(PL.h*0.62), dz=p.pos.z-pc.z;
      if(dx*dx+dz*dz < (PL.radius+p.r)*(PL.radius+p.r) && Math.abs(dy) < 1){
        damagePlayer(p.dmg, p.pos.clone(), false, p.src);
        projectileHit(p, p.pos.clone(), new THREE.Vector3(0,1,0));
        PROJ.splice(i,1); continue;
      }
    } else {
      var hitE = null;
      for(var k=0;k<ENEMIES.length;k++){
        var e = ENEMIES[k]; if(e.dead) continue;
        if(p.pos.x > e.hitBody.minx-p.r && p.pos.x < e.hitBody.maxx+p.r &&
           p.pos.z > e.hitBody.minz-p.r && p.pos.z < e.hitBody.maxz+p.r &&
           p.pos.y > e.hitBody.miny-p.r && p.pos.y < e.hitHead.maxy+p.r){ hitE = e; break; }
      }
      if(hitE && p.type!=='grenade'){
        projectileHit(p, p.pos.clone(), TMPV2.copy(p.vel).normalize().negate().clone());
        PROJ.splice(i,1); continue;
      }
    }

    p.mesh.position.copy(p.pos);
    if(p.type==='rocket'){
      p.mesh.lookAt(TMPV.copy(p.pos).add(p.vel));
    }
    if(p.life <= 0){
      projectileHit(p, p.pos.clone(), new THREE.Vector3(0,1,0));
      PROJ.splice(i,1);
    }
  }
}
function projectileHit(p, point, normal){
  G.scene.remove(p.mesh);
  disposeMesh(p.mesh);
  if(p.type === 'plasma'){
    addFlash(point, 0x55ccff, 1.6, 0.12);
    for(var i=0;i<12;i++){
      FX.spark.emit(point.x,point.y,point.z,
        normal.x*rand(1,6)+rand(-3,3), normal.y*rand(1,5)+rand(0,4), normal.z*rand(1,6)+rand(-3,3),
        0.35,0.85,1.0, rand(.08,.18), rand(.2,.45), -8, 2.5, 0);
    }
    AUD.tone(600,180,0.1,.16*AUD.at(point),'square');
    if(normal.y > 0.5 || Math.abs(normal.y) < 0.5) addDecal(point, normal, rand(0.2,0.3), 0x66ccff);
  } else {
    doExplosion(point, p.radius, p.dmg, true);
    if(SET.blood===false){} 
    addDecal(point, normal, rand(1.4,2.0), 0x221a14);
  }
}

/* ---- grenade input ---- */
function updateGrenadeInput(dt){
  if(PL.grenadeCd > 0) PL.grenadeCd -= dt;
  if(IN.hit('KeyG') && PL.grenades > 0 && PL.grenadeCd <= 0){
    PL.grenades--; PL.grenadeCd = 0.75;
    var cam = G.camera;
    var dir = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
    var org = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld).addScaledVector(dir, 0.6);
    spawnGrenade(org, dir, 20);
    AUD.noise(0.12,.2,'bandpass',700,2);
    PL.viewKick += 0.09;
    updateHUDWeapon();
  }
}
