"use strict";
/* ---------------------------------------------------------------------------
   15. HUD
--------------------------------------------------------------------------- */
var UI = {};
function cacheUI(){
  ['hud','hpFill','arFill','stFill','hpNum','arNum','stNum','wName','wAmmo','wMode','wheel',
   'score','combo','waveNum','enemiesLeft','killfeed','banner','notice','damageFlash','lowhp',
   'crosshair','hitmarker','ch-t','ch-b','ch-l','ch-r','minimap','dirLayer','waveTitle'].forEach(function(id){
    UI[id] = document.getElementById(id);
  });
  UI.mapCtx = UI.minimap.getContext('2d');
  // weapon wheel slots
  UI.wheel.innerHTML = '';
  UI.slots = [];
  for(var i=0;i<WDEF.length;i++){
    var d = document.createElement('div');
    d.className = 'wslot';
    d.textContent = WDEF[i].icon;
    UI.wheel.appendChild(d);
    UI.slots.push(d);
  }
  // damage direction indicators
  UI.dirs = [];
  for(i=0;i<6;i++){
    var el = document.createElement('div');
    el.className = 'dind';
    UI.dirLayer.appendChild(el);
    UI.dirs.push({el:el, life:0, ang:0});
  }
}
function updateHUDVitals(){
  var hf = clamp(PL.hp/PL.maxHp,0,1);
  UI.hpFill.style.transform = 'scaleX('+hf+')';
  UI.hpNum.textContent = Math.ceil(PL.hp);
  UI.hpNum.style.color = hf<0.3?'#ff3b5c':(hf<0.6?'#ffc24b':'#dff3ff');
  var af = clamp(PL.armor/PL.maxArmor,0,1);
  UI.arFill.style.transform = 'scaleX('+af+')';
  UI.arNum.textContent = Math.ceil(PL.armor);
  var sf = clamp(PL.stam/PL.maxStam,0,1);
  UI.stFill.style.transform = 'scaleX('+sf+')';
  UI.stNum.textContent = Math.ceil(PL.stam);
}
function updateHUDWeapon(){
  var W = curW(), d = W.def;
  UI.wName.textContent = d.name;
  UI.wAmmo.innerHTML = W.ammo + '<small> / ' + W.reserve + '</small>';
  UI.wAmmo.style.color = (W.ammo===0) ? '#ff3b5c' : (W.ammo <= d.mag*0.25 ? '#ffc24b' : '#dff3ff');
  UI.wMode.textContent = d.mode + '  ·  ' + PL.grenades + ' NADES';
  for(var i=0;i<UI.slots.length;i++){
    var cls = 'wslot' + (i===PL.wi?' sel':'') + (PL.weapons[i].ammo===0&&PL.weapons[i].reserve===0?' empty':'');
    if(UI.slots[i].className !== cls) UI.slots[i].className = cls;
  }
}
function updateHUDScore(){
  UI.score.textContent = G.score.toLocaleString();
  UI.combo.textContent = 'x' + G.combo;
  UI.combo.style.opacity = G.combo>1 ? 1 : 0.5;
}
function hitmarker(head){
  var hm = UI.hitmarker;
  hm.className = head?'kill':'';
  hm.style.opacity = 1;
  hm.style.transform = 'translate(-50%,-50%) rotate(45deg) scale('+(head?1.35:1)+')';
  clearTimeout(hm._t);
  hm._t = setTimeout(function(){ hm.style.opacity = 0; }, head?140:100);
  AUD.hitmark(head);
}
function addKillFeed(name, head, pts, source){
  var el = document.createElement('div');
  el.className = 'kf';
  var tag = head ? ' <b>HEADSHOT</b>' : (source==='explosion' ? ' <b>BLAST</b>' : (source==='melee'?' <b>MELEE</b>':''));
  el.innerHTML = name + tag + ' &nbsp;+' + pts;
  UI.killfeed.appendChild(el);
  setTimeout(function(){
    el.style.transition='opacity .4s, transform .4s';
    el.style.opacity=0; el.style.transform='translateX(20px)';
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 420);
  }, 3200);
  while(UI.killfeed.children.length > 6) UI.killfeed.removeChild(UI.killfeed.firstChild);
}
function notice(txt){
  UI.notice.textContent = txt;
  UI.notice.style.opacity = 1;
  clearTimeout(UI.notice._t);
  UI.notice._t = setTimeout(function(){ UI.notice.style.opacity = 0; }, 1300);
}
function banner(a, b, dur){
  UI.banner.firstElementChild.textContent = a;
  UI.banner.lastElementChild.textContent = b;
  UI.banner.style.transition = 'none';
  UI.banner.style.opacity = 1;
  UI.banner.style.transform = 'translate(-50%,-50%) scale(1.08)';
  setTimeout(function(){
    UI.banner.style.transition = 'opacity .6s, transform .6s';
    UI.banner.style.transform = 'translate(-50%,-50%) scale(1)';
  }, 30);
  clearTimeout(UI.banner._t);
  UI.banner._t = setTimeout(function(){ UI.banner.style.opacity = 0; }, dur||2200);
}
function showDamageFlash(intensity){
  var el = UI.damageFlash;
  el.style.transition='none'; el.style.opacity = intensity;
  setTimeout(function(){ el.style.transition='opacity .45s'; el.style.opacity=0; }, 30);
}
function showDirIndicator(fromPos){
  var d = null;
  for(var i=0;i<UI.dirs.length;i++) if(UI.dirs[i].life<=0){ d = UI.dirs[i]; break; }
  if(!d) d = UI.dirs[0];
  var dx = fromPos.x - PL.pos.x, dz = fromPos.z - PL.pos.z;
  var ang = Math.atan2(dx, -dz) - PL.yaw;
  d.ang = ang; d.life = 1.4;
  d.el.style.transform = 'rotate('+(-ang)+'rad)';
  d.el.style.opacity = 1;
}
function updateDirIndicators(dt){
  for(var i=0;i<UI.dirs.length;i++){
    var d = UI.dirs[i];
    if(d.life <= 0) continue;
    d.life -= dt;
    d.el.style.opacity = Math.max(0, d.life/1.4);
    if(d.life<=0) d.el.style.opacity = 0;
  }
}
function updateCrosshair(){
  var sp = currentSpread();
  var px = clamp(6 + sp*1400, 4, 46);
  UI['ch-t'].style.top    = (29-6-px)+'px';
  UI['ch-b'].style.bottom = (29-6-px)+'px';
  UI['ch-l'].style.left   = (29-6-px)+'px';
  UI['ch-r'].style.right  = (29-6-px)+'px';
  // hostile highlight
  var aim = getAimEnemy();
  var col = aim ? '#ff5566' : '#eafcff';
  UI['ch-t'].style.background = col; UI['ch-b'].style.background = col;
  UI['ch-l'].style.background = col; UI['ch-r'].style.background = col;
}
function getAimEnemy(){
  var cam = G.camera;
  var dir = TMPV.set(0,0,-1).applyQuaternion(cam.quaternion);
  var o = TMPV2.setFromMatrixPosition(cam.matrixWorld);
  var bestT = 200, best = null;
  for(var i=0;i<ENEMIES.length;i++){
    var e = ENEMIES[i]; if(e.dead) continue;
    var t = rayAABB(o.x,o.y,o.z, dir.x,dir.y,dir.z, e.hitBody, bestT);
    if(t>=0 && t<bestT){ bestT=t; best=e; }
  }
  if(best){
    for(i=0;i<WORLD.colliders.length;i++){
      if(WORLD.colliders[i].disabled) continue;
      var tw = rayAABB(o.x,o.y,o.z, dir.x,dir.y,dir.z, WORLD.colliders[i], bestT);
      if(tw>=0 && tw<bestT) return null;
    }
  }
  return best;
}

/* ---- minimap ---- */
var MAP_SCALE = 3.1;
function drawMinimap(){
  var c = UI.mapCtx, S = 360, cx = S/2, cy = S/2;
  c.clearRect(0,0,S,S);
  c.fillStyle = 'rgba(6,12,20,0.55)';
  c.fillRect(0,0,S,S);
  c.save();
  c.beginPath(); c.arc(cx,cy,S/2-3,0,6.3); c.clip();
  c.translate(cx,cy);
  c.rotate(PL.yaw);
  var s = MAP_SCALE;
  // world blocks
  c.fillStyle = 'rgba(120,150,175,0.30)';
  c.strokeStyle = 'rgba(160,200,230,0.30)';
  c.lineWidth = 1;
  for(var i=0;i<WORLD.mapRects.length;i++){
    var r = WORLD.mapRects[i];
    var x = (r.x - PL.pos.x)*s, z = (r.z - PL.pos.z)*s;
    if(x > 210 || x < -210-r.w*s || z > 210 || z < -210-r.d*s) continue;
    c.fillRect(x, z, r.w*s, r.d*s);
    if(r.h > 4) c.strokeRect(x, z, r.w*s, r.d*s);
  }
  // pickups
  for(i=0;i<PICKUPS.length;i++){
    var p = PICKUPS[i];
    var px = (p.pos.x - PL.pos.x)*s, pz = (p.pos.z - PL.pos.z)*s;
    c.fillStyle = '#'+p.col.toString(16).padStart(6,'0');
    c.beginPath(); c.arc(px,pz,3.2,0,6.3); c.fill();
  }
  // enemies
  for(i=0;i<ENEMIES.length;i++){
    var e = ENEMIES[i]; if(e.dead) continue;
    var ex = (e.pos.x - PL.pos.x)*s, ez = (e.pos.z - PL.pos.z)*s;
    if(Math.hypot(ex,ez) > 176) {
      var a = Math.atan2(ez,ex);
      ex = Math.cos(a)*172; ez = Math.sin(a)*172;
      c.fillStyle = 'rgba(255,59,92,0.45)';
      c.beginPath(); c.arc(ex,ez,3,0,6.3); c.fill();
      continue;
    }
    c.fillStyle = e.def.boss ? '#ffcc33' : (e.def.ranged ? '#ff8844' : '#ff3b5c');
    var sz = e.def.boss ? 7 : (e.def.scale>1.3?5.5:4.2);
    c.beginPath(); c.arc(ex,ez,sz,0,6.3); c.fill();
    if(e.seesPlayer){
      c.strokeStyle='rgba(255,255,255,0.5)'; c.lineWidth=1;
      c.beginPath(); c.arc(ex,ez,sz+2.5,0,6.3); c.stroke();
    }
  }
  c.restore();
  // player arrow
  c.save(); c.translate(cx,cy);
  c.fillStyle = '#39d7ff';
  c.beginPath(); c.moveTo(0,-9); c.lineTo(6.5,7); c.lineTo(0,3.5); c.lineTo(-6.5,7); c.closePath(); c.fill();
  c.restore();
  // frame
  c.strokeStyle='rgba(57,215,255,0.35)'; c.lineWidth=2;
  c.beginPath(); c.arc(cx,cy,S/2-3,0,6.3); c.stroke();
  c.strokeStyle='rgba(57,215,255,0.15)'; c.lineWidth=1;
  c.beginPath(); c.moveTo(cx,6); c.lineTo(cx,20); c.stroke();
}
