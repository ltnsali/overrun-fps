"use strict";
/* ---------------------------------------------------------------------------
   16. WAVE DIRECTOR
--------------------------------------------------------------------------- */
function buildWave(n){
  var q = [];
  var budget = Math.round((6 + n*2.7) * D().count);
  var pool = [{t:'grunt',c:1}];
  if(n>=2) pool.push({t:'runner',c:1});
  if(n>=3){ pool.push({t:'soldier',c:2}); pool.push({t:'soldier',c:2}); }
  if(n>=5) pool.push({t:'heavy',c:3});
  if(n>=7) pool.push({t:'brute',c:5});
  var guard = 0;
  while(budget > 0 && guard++ < 400){
    var p = pick(pool);
    if(p.c > budget){ q.push('grunt'); budget -= 1; continue; }
    q.push(p.t); budget -= p.c;
  }
  if(n % 5 === 0){
    var bosses = 1 + Math.floor(n/20);
    for(var i=0;i<bosses;i++) q.push('boss');
  }
  // shuffle
  for(i=q.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t2=q[i]; q[i]=q[j]; q[j]=t2; }
  return q;
}
function startWave(n){
  G.wave = n;
  G.spawnQueue = buildWave(n);
  G.waveActive = true;
  G.spawnTimer = 0.4;
  UI.waveNum.textContent = n;
  UI.waveTitle.textContent = (n%5===0) ? 'BOSS WAVE' : 'WAVE';
  UI.waveTitle.style.color = (n%5===0) ? '#ff3b5c' : '';
  if(n % 5 === 0){ banner('WAVE ' + n, 'WARLORD DETECTED', 2600); AUD.boss(); }
  else { banner('WAVE ' + n, 'HOSTILES INBOUND', 2000); AUD.wave(); }
  // between-wave resupply
  if(n > 1){
    for(var i=0;i<PL.weapons.length;i++){
      var w = PL.weapons[i], d = w.def;
      w.reserve = Math.min(d.reserveMax, w.reserve + Math.round(d.mag*1.15));
    }
    PL.grenades = Math.min(PL.maxGren, PL.grenades+1);
    PL.armor = Math.min(PL.maxArmor, PL.armor + 12);
    updateHUDWeapon(); updateHUDVitals();
  }
}
function pickSpawn(){
  var best = null, bestScore = -1;
  for(var i=0;i<12;i++){
    var sp = pick(WORLD.spawnPoints);
    var d = Math.hypot(sp.x-PL.pos.x, sp.z-PL.pos.z);
    if(d < 16) continue;
    var toE = TMPV.set(sp.x-PL.pos.x,0,sp.z-PL.pos.z).normalize();
    var fwd = TMPV2.set(-Math.sin(PL.yaw),0,-Math.cos(PL.yaw));
    var facing = toE.dot(fwd);
    var score = (1-facing)*20 + Math.min(d,60)*0.25 + rand(0,9);
    if(blockedAt(sp.x, 0, sp.z, 0.6, 1.9)) score -= 60;
    if(score > bestScore){ bestScore = score; best = sp; }
  }
  if(!best) best = pick(WORLD.spawnPoints);
  return new THREE.Vector3(best.x + rand(-2.5,2.5), 0, best.z + rand(-2.5,2.5));
}
function updateWaves(dt){
  var aliveCount = 0;
  for(var i=0;i<ENEMIES.length;i++) if(!ENEMIES[i].dead) aliveCount++;
  UI.enemiesLeft.textContent = (aliveCount + G.spawnQueue.length) + ' HOSTILES';

  if(G.waveActive){
    if(G.spawnQueue.length > 0){
      G.spawnTimer -= dt;
      if(G.spawnTimer <= 0 && aliveCount < 24){
        var type = G.spawnQueue.shift();
        spawnEnemy(type, pickSpawn());
        G.spawnTimer = rand(0.28, 0.75) * (type==='boss'?2:1);
      }
    } else if(aliveCount === 0){
      G.waveActive = false;
      G.waveTimer = 5.0;
      var bonus = 250 + G.wave*120;
      G.score += bonus;
      updateHUDScore();
      banner('WAVE ' + G.wave + ' CLEARED', '+' + bonus + ' BONUS · REARMING', 3000);
      AUD.levelup();
      PL.hp = Math.min(PL.maxHp, PL.hp + 18);
      updateHUDVitals();
      // scatter some supplies
      for(var k=0;k<3;k++){
        var sp = pick(WORLD.spawnPoints);
        var pp = new THREE.Vector3(clamp(PL.pos.x+rand(-14,14),-70,70), 1.2, clamp(PL.pos.z+rand(-14,14),-70,70));
        spawnPickup(pp, k===0?'health':(k===1?'ammo':'armor'), k===0?40:(k===1?1:40));
      }
    }
  } else {
    G.waveTimer -= dt;
    if(G.waveTimer <= 0) startWave(G.wave+1);
  }

  // combo decay
  if(G.comboTimer > 0){
    G.comboTimer -= dt;
    if(G.comboTimer <= 0){ PL.killStreak = 0; G.combo = 1; updateHUDScore(); }
  }
}
