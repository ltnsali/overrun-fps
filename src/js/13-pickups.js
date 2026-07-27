"use strict";
/* ---------------------------------------------------------------------------
   14. PICKUPS
--------------------------------------------------------------------------- */
function spawnPickup(pos, kind, amount){
  var g = new THREE.Group();
  var col = kind==='health'?0xff3b5c : kind==='armor'?0x39d7ff : kind==='grenade'?0x8aff5a : 0xffc24b;
  var core = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.34,0.34),
      new THREE.MeshLambertMaterial({color:col, emissive:new THREE.Color(col).multiplyScalar(0.35)}));
  g.add(core);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.32,0.035,6,16),
      new THREE.MeshBasicMaterial({color:col}));
  ring.rotation.x = Math.PI/2;
  g.add(ring);
  // cross / icon bars
  var bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.06,0.36), new THREE.MeshBasicMaterial({color:0xffffff}));
  var bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.22,0.36), new THREE.MeshBasicMaterial({color:0xffffff}));
  if(kind==='health'){ g.add(bar1); g.add(bar2); }
  else if(kind==='ammo'){ bar1.scale.set(1,0.6,1); g.add(bar1); }
  else if(kind==='armor'){ bar2.scale.set(1,1.2,1); g.add(bar2); }
  g.position.copy(pos);
  G.scene.add(g);
  PICKUPS.push({mesh:g, pos:g.position, kind:kind, amount:amount, life:34, t:rand(0,6), vy:2.5, col:col});
}
function updatePickups(dt){
  for(var i=PICKUPS.length-1;i>=0;i--){
    var p = PICKUPS[i];
    p.life -= dt; p.t += dt;
    p.vy -= 22*dt;
    p.pos.y += p.vy*dt;
    if(p.pos.y < 0.42){ p.pos.y = 0.42; p.vy = 0; }
    p.mesh.rotation.y += dt*1.9;
    p.mesh.position.y = p.pos.y + Math.sin(p.t*2.4)*0.09;
    if(p.life < 4) p.mesh.visible = (Math.floor(p.life*7)%2)===0;

    var dx = p.pos.x-PL.pos.x, dz = p.pos.z-PL.pos.z, dy = p.pos.y-(PL.pos.y+0.9);
    var d = Math.hypot(dx,dy,dz);
    if(d < 3.2 && d > 1.0){
      p.pos.x -= dx/d*dt*5.5; p.pos.z -= dz/d*dt*5.5;
    }
    if(d < 1.35){
      if(applyPickup(p)){
        G.scene.remove(p.mesh); disposeMesh(p.mesh); PICKUPS.splice(i,1); continue;
      }
    }
    if(p.life <= 0){ G.scene.remove(p.mesh); disposeMesh(p.mesh); PICKUPS.splice(i,1); }
  }
}
function applyPickup(p){
  if(p.kind === 'health'){
    if(PL.hp >= PL.maxHp) return false;
    PL.hp = Math.min(PL.maxHp, PL.hp + p.amount);
    notice('+'+p.amount+' HEALTH');
  } else if(p.kind === 'armor'){
    if(PL.armor >= PL.maxArmor) return false;
    PL.armor = Math.min(PL.maxArmor, PL.armor + p.amount);
    notice('+'+p.amount+' ARMOR');
  } else if(p.kind === 'grenade'){
    if(PL.grenades >= PL.maxGren) return false;
    PL.grenades = Math.min(PL.maxGren, PL.grenades + p.amount);
    notice('+'+p.amount+' GRENADE');
  } else {
    var got = false, names=[];
    for(var i=0;i<PL.weapons.length;i++){
      var w = PL.weapons[i], d = w.def;
      var add = Math.round(d.mag * (d.id==='launcher'?1.2:1.7) * p.amount);
      if(w.reserve < d.reserveMax){
        w.reserve = Math.min(d.reserveMax, w.reserve + add);
        got = true;
      }
    }
    if(!got) return false;
    notice('AMMO RESUPPLY');
  }
  AUD.pickup(p.kind);
  addFlash(p.pos.clone(), p.col, 1.6, 0.2);
  for(var k=0;k<12;k++){
    var c = new THREE.Color(p.col);
    FX.spark.emit(p.pos.x,p.pos.y,p.pos.z, rand(-3,3),rand(0,4),rand(-3,3),
      c.r,c.g,c.b, rand(.08,.16), rand(.25,.5), -6, 2.5, 0);
  }
  updateHUDVitals(); updateHUDWeapon();
  return true;
}
