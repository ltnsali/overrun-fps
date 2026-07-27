"use strict";
/* ---------------------------------------------------------------------------
   17. GAME FLOW
--------------------------------------------------------------------------- */
function startGame(mode){
  G.mode = mode || 'survival';
  G.state = 'playing';
  G.score = 0; G.kills = 0; G.headshots = 0;
  G.shotsFired = 0; G.shotsHit = 0; G.elapsed = 0;
  G.combo = 1; G.comboTimer = 0; G.wave = 0;
  G.spawnQueue = []; G.waveActive = false; G.waveTimer = 2.2;
  G.shake = 0; G.shakeTime = 0;

  clearEntities();
  if((mode || 'survival') === 'dm') mpBuildSeededWorld(NET.room);
  else buildWorld();
  initPlayer();
  updateHUDVitals(); updateHUDWeapon(); updateHUDScore();
  UI.hud.classList.add('on');
  hideAllScreens();
  AUD.init(); AUD.resume(); AUD.setVol(SET.vol);
  applyShadowSetting();
  goFullscreen();
  setTouchUI(true);
  requestLock();

  if(G.mode === 'dm'){
    mpStartMatch(MPOPT);
    banner('DEATHMATCH', 'FIRST TO ' + MATCH.fragLimit + ' FRAGS', 1800);
  } else {
    MATCH.on = false;
    mpShowBoard(false); mpShowRespawn(false); mpStatus('', false);
    UI.waveTitle.textContent = 'WAVE';
    banner('OVERRUN', 'SURVIVE', 1800);
    startWave(1);
  }
  var sc = document.getElementById('tScore');
  if(sc) sc.style.display = (G.mode === 'dm') ? '' : 'none';
}
function clearEntities(){
  var i;
  for(i=0;i<ENEMIES.length;i++){ G.scene.remove(ENEMIES[i].mesh); disposeMesh(ENEMIES[i].mesh); }
  ENEMIES.length = 0;
  for(i=0;i<PROJ.length;i++){ G.scene.remove(PROJ[i].mesh); disposeMesh(PROJ[i].mesh); }
  PROJ.length = 0;
  for(i=0;i<PICKUPS.length;i++){ G.scene.remove(PICKUPS[i].mesh); disposeMesh(PICKUPS[i].mesh); }
  PICKUPS.length = 0;
  for(i=0;i<WORLD.lights.length;i++) G.scene.remove(WORLD.lights[i]);
  WORLD.lights.length = 0;
  UI.killfeed.innerHTML = '';
}
function playerDeath(){
  if(G.state === 'dead') return;
  /* Deathmatch never ends on a death - you respawn and keep fighting. */
  if(MATCH.on){ mpPlayerDied(); return; }
  G.state = 'dead';
  PL.alive = false;
  AUD.tone(220,60,1.4,.32,'sawtooth');
  AUD.noise(1.6,.3,'lowpass',400,1);
  addShake(1.2, 1.0);
  setTouchUI(false);
  document.exitPointerLock && document.exitPointerLock();
  setTimeout(function(){
    UI.hud.classList.remove('on');
    document.getElementById('ovWave').textContent = G.wave;
    document.getElementById('ovKills').textContent = G.kills;
    document.getElementById('ovScore').textContent = G.score.toLocaleString();
    document.getElementById('ovHead').textContent = G.headshots;
    document.getElementById('ovAcc').textContent =
      (G.shotsFired ? Math.round(G.shotsHit/G.shotsFired*100) : 0) + '%';
    document.getElementById('ovTime').textContent = fmtTime(G.elapsed);
    if(G.score > G.best){ G.best = G.score; try{ localStorage.setItem('overrun_best', G.best); }catch(e){} }
    document.getElementById('ovBest').textContent = 'BEST SCORE: ' + G.best.toLocaleString();
    showScreen('over');
  }, 1400);
}
function pauseGame(){
  if(G.state !== 'playing') return;
  G.state = 'paused';
  showScreen('pause');
  setTouchUI(false);
  document.exitPointerLock && document.exitPointerLock();
}
function resumeGame(){
  if(G.state !== 'paused') return;
  hideAllScreens();
  G.state = 'playing';
  goFullscreen();
  setTouchUI(true);
  requestLock();
}
function quitToMenu(){
  G.state = 'menu';
  G.mode = 'survival';
  MATCH.on = false; MATCH.ended = false;
  mpDisconnect();
  mpShowBoard(false); mpShowRespawn(false);
  UI.waveTitle.textContent = 'WAVE';
  UI.hud.classList.remove('on');
  clearEntities();
  showScreen('menu');
  setTouchUI(false);
  document.exitPointerLock && document.exitPointerLock();
}
function showScreen(id){
  hideAllScreens();
  document.getElementById(id).classList.add('on');
}
function hideAllScreens(){
  ['menu','help','opts','pause','over','mp','mover'].forEach(function(id){
    document.getElementById(id).classList.remove('on');
  });
}
