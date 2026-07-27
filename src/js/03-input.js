"use strict";
/* ---------------------------------------------------------------------------
   3. INPUT
--------------------------------------------------------------------------- */
var IN = {
  keys:{}, mouse:{x:0,y:0}, down:{}, locked:false, wheel:0,
  pressed:{},
  axis:{x:0,y:0},          // analog move from the virtual stick (-1..1)
  sprint:false,            // analog sprint request from the virtual stick
  isDown:function(c){ return !!this.keys[c]; },
  hit:function(c){ if(this.pressed[c]){ this.pressed[c]=false; return true; } return false; },
  clearFrame:function(){ this.mouse.x=0; this.mouse.y=0; this.wheel=0; this.pressed={}; }
};
function initInput(){
  window.addEventListener('keydown', function(e){
    if(!IN.keys[e.code]) IN.pressed[e.code] = true;
    IN.keys[e.code] = true;
    if(['Space','ArrowUp','ArrowDown','Tab','KeyE'].indexOf(e.code)>=0) e.preventDefault();
    if(e.code === 'Escape'){ /* handled by pointerlockchange */ }
  });
  window.addEventListener('keyup', function(e){ IN.keys[e.code] = false; });
  window.addEventListener('blur', function(){
    IN.keys = {}; IN.down = {}; IN.axis.x = 0; IN.axis.y = 0; IN.sprint = false;
  });
  /* Touch devices fire synthetic mouse events; the touch layer owns input there. */
  document.addEventListener('mousemove', function(e){
    if(!IN.locked || IS_TOUCH) return;
    IN.mouse.x += e.movementX || 0;
    IN.mouse.y += e.movementY || 0;
  });
  document.addEventListener('mousedown', function(e){ if(IN.locked && !IS_TOUCH){ IN.down[e.button]=true; e.preventDefault(); } });
  document.addEventListener('mouseup', function(e){ if(!IS_TOUCH) IN.down[e.button]=false; });
  document.addEventListener('contextmenu', function(e){ if(IN.locked) e.preventDefault(); });
  document.addEventListener('wheel', function(e){ if(IN.locked){ IN.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, {passive:false});
  document.addEventListener('pointerlockchange', function(){
    if(IS_TOUCH) return;
    IN.locked = (document.pointerLockElement === G.renderer.domElement);
    if(!IN.locked && G.state==='playing') pauseGame();
  });
}
function requestLock(){
  /* No Pointer Lock API on mobile: treat the game as "locked" so combat input flows. */
  if(IS_TOUCH){ IN.locked = true; return; }
  var el = G.renderer.domElement;
  if(!el.requestPointerLock){ lockFallback(); return; }
  try{
    var p = el.requestPointerLock();
    if(p && p.catch) p.catch(lockFallback);
  }catch(e){ lockFallback(); }
}
/* Iframes and embedded browsers refuse Pointer Lock. Rather than leave the player
   unable to look or shoot, fall back to uncaptured mouse look - movementX/Y are
   still delivered, the cursor just is not hidden. */
function lockFallback(){
  if(IN.locked || document.pointerLockElement) return;
  IN.locked = true;
  if(G.state === 'playing') notice('POINTER LOCK BLOCKED \u00B7 MOUSE LOOK STILL ACTIVE');
}

/* ---------------------------------------------------------------------------
   3b. TOUCH CONTROLS (virtual stick + look drag + on-screen buttons)
--------------------------------------------------------------------------- */
var STICK_R = 58, STICK_DZ = 9;
var TOUCH = { moveId:null, lookId:null, ox:0, oy:0, lx:0, ly:0, homeX:0, homeY:0, stick:null, knob:null };

function placeStick(ox, oy, kx, ky){
  if(!TOUCH.stick) return;
  TOUCH.stick.style.left = ox + 'px';
  TOUCH.stick.style.top  = oy + 'px';
  TOUCH.knob.style.transform = 'translate(' + kx + 'px,' + ky + 'px)';
}
function touchHome(){
  var h = viewH();
  TOUCH.homeX = Math.round(viewW() * 0.15);
  TOUCH.homeY = Math.round(h - Math.min(150, h * 0.36));
  if(TOUCH.moveId === null) placeStick(TOUCH.homeX, TOUCH.homeY, 0, 0);
}
function releaseStick(){
  TOUCH.moveId = null;
  IN.axis.x = 0; IN.axis.y = 0; IN.sprint = false;
  if(TOUCH.stick) TOUCH.stick.classList.remove('on','sprint');
  placeStick(TOUCH.homeX, TOUCH.homeY, 0, 0);
}
function driveStick(t){
  var dx = t.clientX - TOUCH.ox, dy = t.clientY - TOUCH.oy;
  var d = Math.hypot(dx, dy);
  var kx = dx, ky = dy;
  if(d > STICK_R){ kx = dx * STICK_R/d; ky = dy * STICK_R/d; }
  placeStick(TOUCH.ox, TOUCH.oy, kx, ky);
  if(d <= STICK_DZ){
    IN.axis.x = 0; IN.axis.y = 0; IN.sprint = false;
    TOUCH.stick.classList.remove('sprint');
    return;
  }
  var m = clamp((d - STICK_DZ) / (STICK_R - STICK_DZ), 0, 1);
  IN.axis.x = (dx/d) * m;
  IN.axis.y = -(dy/d) * m;                 // screen-up = forward
  IN.sprint = IN.axis.y > 0.82;            // shove the stick forward to sprint
  TOUCH.stick.classList.toggle('sprint', IN.sprint);
}

function onTouchStart(e){
  if(G.state !== 'playing') return;
  var w = viewW();
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i];
    if(t.clientX < w*0.45 && TOUCH.moveId === null){
      TOUCH.moveId = t.identifier;
      TOUCH.ox = t.clientX; TOUCH.oy = t.clientY;
      TOUCH.stick.classList.add('on');
      placeStick(TOUCH.ox, TOUCH.oy, 0, 0);
    } else if(TOUCH.lookId === null){
      TOUCH.lookId = t.identifier;
      TOUCH.lx = t.clientX; TOUCH.ly = t.clientY;
    }
  }
  e.preventDefault();
}
function onTouchMove(e){
  if(G.state !== 'playing') return;
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i];
    if(t.identifier === TOUCH.moveId){
      driveStick(t);
    } else if(t.identifier === TOUCH.lookId){
      IN.mouse.x += (t.clientX - TOUCH.lx) * TOUCH_LOOK;
      IN.mouse.y += (t.clientY - TOUCH.ly) * TOUCH_LOOK;
      TOUCH.lx = t.clientX; TOUCH.ly = t.clientY;
    }
  }
  e.preventDefault();
}
function onTouchEnd(e){
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i];
    if(t.identifier === TOUCH.moveId) releaseStick();
    else if(t.identifier === TOUCH.lookId) TOUCH.lookId = null;
  }
}

function bindHold(id, onDown, onUp){
  var el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    el.classList.add('act'); if(onDown) onDown();
  }, {passive:false});
  function up(e){
    e.preventDefault(); e.stopPropagation();
    el.classList.remove('act'); if(onUp) onUp();
  }
  el.addEventListener('touchend', up, {passive:false});
  el.addEventListener('touchcancel', up, {passive:false});
}
function bindToggle(id, fn){
  var el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    var on = !el.classList.contains('act');
    el.classList.toggle('act', on);
    fn(on);
  }, {passive:false});
  el.addEventListener('touchend', function(e){ e.preventDefault(); e.stopPropagation(); }, {passive:false});
}

/* Buttons you can also slide your thumb on to steer the camera (PUBG-style), so
   you can correct your aim without lifting the finger that is firing/aiming.
   Touch events have implicit capture, so the drag keeps working after the
   finger leaves the button. */
var DRAGBTNS = [];
function bindDragButton(id, onDown, onUp, onDrag){
  var el = document.getElementById(id);
  if(!el) return;
  el._dragId = null;
  DRAGBTNS.push(el);

  el.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    if(el._dragId !== null) return;
    /* Never latch a trigger while paused, dead or in a menu. */
    if(G.state !== 'playing') return;
    var t = e.changedTouches[0];
    el._dragId = t.identifier;
    el._dragX = t.clientX; el._dragY = t.clientY;
    el._dragDist = 0;
    if(onDown) onDown(el);
  }, {passive:false});

  el.addEventListener('touchmove', function(e){
    e.preventDefault(); e.stopPropagation();
    if(el._dragId === null || G.state !== 'playing') return;
    for(var i=0;i<e.changedTouches.length;i++){
      var t = e.changedTouches[i];
      if(t.identifier !== el._dragId) continue;
      var dx = t.clientX - el._dragX, dy = t.clientY - el._dragY;
      IN.mouse.x += dx * TOUCH_LOOK * TOUCH_FINE;
      IN.mouse.y += dy * TOUCH_LOOK * TOUCH_FINE;
      el._dragX = t.clientX; el._dragY = t.clientY;
      el._dragDist += Math.abs(dx) + Math.abs(dy);
      if(onDrag) onDrag(el, el._dragDist);
    }
  }, {passive:false});

  function end(e){
    e.preventDefault(); e.stopPropagation();
    if(el._dragId === null) return;
    for(var i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier !== el._dragId) continue;
      el._dragId = null;
      if(onUp) onUp(el);
    }
  }
  el.addEventListener('touchend', end, {passive:false});
  el.addEventListener('touchcancel', end, {passive:false});
}
var DRAG_TAP = 14;   /* px of travel before a press counts as a drag, not a tap */

function resetTouchState(){
  IN.down[0] = false; IN.down[2] = false;
  IN.keys = {}; IN.pressed = {};
  releaseStick();
  TOUCH.lookId = null;
  for(var i=0;i<DRAGBTNS.length;i++) DRAGBTNS[i]._dragId = null;
  ['tFire','tAds','tCrouch','tJump','tReload','tMelee','tNade','tSwap','tScore'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.classList.remove('act');
  });
}
function setTouchUI(on){
  if(!IS_TOUCH) return;
  var el = document.getElementById('touchUI');
  if(el) el.classList.toggle('on', !!on);
  resetTouchState();
}
function updateOrientation(){
  if(!IS_TOUCH) return;
  var portrait = viewH() > viewW();
  document.body.classList.toggle('portrait', portrait);
  if(portrait && G.state === 'playing') pauseGame();
}
function goFullscreen(){
  if(!IS_TOUCH) return;
  var el = document.documentElement;
  try{
    if(!document.fullscreenElement && !document.webkitFullscreenElement){
      var p = el.requestFullscreen ? el.requestFullscreen({navigationUI:'hide'})
            : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
      if(p && p.catch) p.catch(function(){});
    }
  }catch(e){}
  try{
    if(screen.orientation && screen.orientation.lock){
      var q = screen.orientation.lock('landscape');
      if(q && q.catch) q.catch(function(){});
    }
  }catch(e){}
}

function initTouch(){
  if(!IS_TOUCH) return;
  document.body.classList.add('touch');
  TOUCH.stick = document.getElementById('tStick');
  TOUCH.knob  = document.getElementById('tKnob');
  touchHome();

  bindHold('tJump',   function(){ IN.keys['Space'] = true; IN.pressed['Space'] = true; },
                      function(){ IN.keys['Space'] = false; });
  bindHold('tReload', function(){ IN.pressed['KeyR'] = true; });
  bindHold('tMelee',  function(){ IN.pressed['KeyF'] = true; });
  bindHold('tNade',   function(){ IN.pressed['KeyG'] = true; });
  bindHold('tSwap',   function(){ switchWeapon((PL.wi + 1) % PL.weapons.length); });
  bindHold('tPause',  function(){ pauseGame(); });
  bindHold('tScore',  function(){ if(MATCH.on) mpShowBoard(true); },
                      function(){ mpShowBoard(false); });

  /* FIRE: hold to shoot, slide the same thumb to correct your aim. */
  bindDragButton('tFire',
    function(el){ el.classList.add('act');    IN.down[0] = true;  },
    function(el){ el.classList.remove('act'); IN.down[0] = false; });
  /* AIM: latches on/off like PUBG's scope button, and is drag-to-aim while held.
     A drag is an aim correction, not a toggle, so travel past DRAG_TAP puts the
     latch back where it was - otherwise resting a thumb here cancels your ADS. */
  bindDragButton('tAds', function(el){
    el._adsWas = el.classList.contains('act');
    var on = !el._adsWas;
    el.classList.toggle('act', on);
    IN.down[2] = on;
  }, null, function(el, dist){
    if(dist > DRAG_TAP && el.classList.contains('act') !== el._adsWas){
      el.classList.toggle('act', el._adsWas);
      IN.down[2] = el._adsWas;
    }
  });
  bindToggle('tCrouch', function(on){ IN.keys['KeyC'] = on; });

  document.addEventListener('touchstart',  onTouchStart, {passive:false});
  document.addEventListener('touchmove',   onTouchMove,  {passive:false});
  document.addEventListener('touchend',    onTouchEnd,   {passive:false});
  document.addEventListener('touchcancel', onTouchEnd,   {passive:false});
  document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive:false});

  /* iOS requires a user gesture before WebAudio will produce sound */
  document.addEventListener('touchend', function unlock(){
    AUD.init(); AUD.resume();
    document.removeEventListener('touchend', unlock);
  }, {passive:true});

  document.getElementById('keysDesktop').style.display = 'none';
  document.getElementById('keysTouch').style.display = '';
  var hint = document.getElementById('menuHint');
  if(hint) hint.textContent = 'TAP DEPLOY \u00B7 PLAY IN LANDSCAPE';
  updateOrientation();
}
