"use strict";
/* ---------------------------------------------------------------------------
   13. DAMAGE
--------------------------------------------------------------------------- */
function damageEnemy(e, dmg, isHead, point, source){
  if(e.dead) return;
  e.hp -= dmg;
  e.flash = 0.1;
  PL.dmgDealt += dmg;
  if(point) addDamageNumber(
      TMPV.set(point.x, point.y+0.35, point.z).clone(),
      dmg, e.hp<=0 ? 'kill' : (isHead?'head':(dmg>=80?'crit':'normal')));
  if(source !== 'explosion' && source !== 'melee'){
    hitmarker(isHead);
    if(isHead) G.headshots++;
  }
  if(e.hp <= 0) killEnemy(e, isHead, point, source);
}

function killEnemy(e, isHead, point, source){
  e.dead = true; e.deadT = 0;
  e.v.bar.visible = false;
  e.v.visor.material = new THREE.MeshBasicMaterial({color:0x331111});
  e.fallDir = Math.random()<0.5?1.5:-1.5;
  e.vel.set(e.vel.x*0.4 + rand(-2,2), 2, e.vel.z*0.4 + rand(-2,2));

  G.kills++;
  PL.killStreak++;
  G.comboTimer = 4.0;
  G.combo = Math.min(8, 1 + Math.floor(PL.killStreak/3));
  var pts = Math.round(e.def.score * G.combo * (isHead?1.5:1));
  G.score += pts;

  AUD.kill();
  if(e.def.boss){ AUD.levelup(); addShake(0.9,0.8); }
  var p = point ? point.clone() : e.pos.clone().setY(e.pos.y+e.height*0.6);
  fxGib(e.pos.clone().setY(e.pos.y+e.height*0.55), e.def.boss?46:(isHead?22:14));
  addFlash(p, 0xff2222, 1.5, 0.15);

  addKillFeed(e.isBot ? e.botName : e.def.name, isHead, pts, source);
  if(MATCH.on && e.isBot){
    MATCH.kills++;
    mpRefreshBoard();
    mpCheckEnd();
  }
  updateHUDScore();

  /* loot */
  var roll = Math.random();
  var dropPos = e.pos.clone(); dropPos.y += 0.5;
  if(e.def.boss){
    spawnPickup(dropPos.clone().add(new THREE.Vector3(1.5,0,0)), 'health', 75);
    spawnPickup(dropPos.clone().add(new THREE.Vector3(-1.5,0,0)), 'armor', 100);
    spawnPickup(dropPos.clone().add(new THREE.Vector3(0,0,1.5)), 'ammo', 1);
    spawnPickup(dropPos.clone().add(new THREE.Vector3(0,0,-1.5)), 'grenade', 2);
  } else if(roll < 0.15) spawnPickup(dropPos, 'health', 28);
  else if(roll < 0.24) spawnPickup(dropPos, 'armor', 32);
  else if(roll < 0.52) spawnPickup(dropPos, 'ammo', 1);
  else if(roll < 0.57) spawnPickup(dropPos, 'grenade', 1);
}

function damagePlayer(amount, fromPos, silent, attacker){
  if(!PL.alive || G.state !== 'playing') return;
  if(attacker){
    if(typeof attacker === 'string'){ PL.lastAttacker = ''; PL.lastAttackerName = attacker; }
    else { PL.lastAttacker = ''; PL.lastAttackerName = attacker.botName || attacker.def.name; }
  }
  amount = Math.max(0, amount);
  if(PL.armor > 0){
    var absorbed = Math.min(PL.armor, amount*0.62);
    PL.armor -= absorbed; amount -= absorbed;
  }
  PL.hp -= amount;
  PL.hurtCd = 4.2; PL.regenTimer = 0;
  if(!silent){
    AUD.hurt();
    addShake(clamp(amount/40,0.1,0.7), 0.28);
    showDamageFlash(clamp(amount/45,0.25,1));
    if(fromPos) showDirIndicator(fromPos);
  }
  PL.killStreak = 0;
  updateHUDVitals();
  if(PL.hp <= 0){ PL.hp = 0; playerDeath(); }
}
