"use strict";
/* ============================================================================
   OVERRUN — advanced WebGL FPS

   Plain classic scripts, no bundler and no modules: every file below shares one
   global scope and index.html loads them in numbered order. Load order only
   matters for 00-engine-loader.js (first) and 20-boot.js (last).
   ========================================================================== */
/* ---------------------------------------------------------------------------
   0. GLOBAL STATE / SETTINGS
--------------------------------------------------------------------------- */
var G = {
  state: 'boot',            // boot | menu | playing | paused | dead
  mode: 'survival',         // survival | dm
  renderer:null, scene:null, camera:null, viewScene:null, viewCam:null,
  time:0, dt:0, frame:0, elapsed:0,
  score:0, kills:0, headshots:0, shotsFired:0, shotsHit:0,
  combo:1, comboTimer:0, wave:0, waveActive:false, waveTimer:3,
  spawnQueue:[], spawnTimer:0, best: 0,
  shake:0, shakeTime:0,
  paused:false
};

var SET = {
  sens: 1.0, fov: 82, vol: 0.6, shadows:true, shake:true, blood:true, res:1, diff:1
};

/* Touch device? Coarse pointer + touch events. ?touch=1 forces it on for testing. */
var IS_TOUCH = (function(){
  try{
    if(location.search.indexOf('touch=1') >= 0) return true;
    if(location.search.indexOf('touch=0') >= 0) return false;
    /* A packaged app is a phone, full stop. Capacitor installs its bridge before
       our scripts run, so this is safe to ask here. */
    if(window.Capacitor && window.Capacitor.isNativePlatform &&
       window.Capacitor.isNativePlatform()) return true;
    var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var mm = window.matchMedia ? function(q){ return window.matchMedia(q).matches; } : null;
    var coarse = mm && mm('(pointer:coarse)');
    /* A WebView reports the pointer that is currently driving it, not what the
       device can do, so a coarse pointer alone is too strict - it hides the
       on-screen controls on emulators and mouse-attached phones. The absence of
       hover is the second, independent way of saying "there is no mouse here",
       and it keeps touchscreen laptops on the desktop scheme. */
    var noHover = mm && !mm('(hover:hover)');
    return !!(hasTouch && (coarse || noHover));
  }catch(e){ return false; }
})();
/* Mobile GPUs choke above ~1.5x device pixel ratio. */
function pixelCap(){ return IS_TOUCH ? 1.5 : 2; }

/* ---- Viewport size -------------------------------------------------------
   #app is position:fixed;inset:0 so its border box IS the drawable area, which
   already accounts for mobile browser chrome and the notch (viewport-fit=cover).
   window.innerWidth/Height disagree with it on iOS Safari while the URL bar is
   collapsing, so every consumer (canvas, camera aspect, touch zones, HUD
   projection) must read the size from the same place. */
var _appEl = null;
function _app(){ return (_appEl = _appEl || document.getElementById('app')); }
function viewW(){
  var el = _app();
  return Math.max(1, (el && el.clientWidth) || window.innerWidth ||
                     document.documentElement.clientWidth || 1);
}
function viewH(){
  var el = _app();
  return Math.max(1, (el && el.clientHeight) || window.innerHeight ||
                     document.documentElement.clientHeight || 1);
}
/* Screen-pixels -> look-delta multiplier so a swipe turns a sensible amount. */
var TOUCH_LOOK = 1.15;
/* Sliding a thumb on FIRE / AIM steers slower - it is for fine aim correction. */
var TOUCH_FINE = 0.55;

var DIFF_NAMES = ['RECRUIT','NORMAL','VETERAN','NIGHTMARE'];
var DIFF = [
  {hp:0.70, dmg:0.50, speed:0.90, count:0.75, ammo:1.35},
  {hp:1.00, dmg:1.00, speed:1.00, count:1.00, ammo:1.00},
  {hp:1.35, dmg:1.35, speed:1.10, count:1.25, ammo:0.85},
  {hp:1.90, dmg:1.80, speed:1.25, count:1.55, ammo:0.70}
];
function D(){ return DIFF[SET.diff]; }

/* ---------------------------------------------------------------------------
   1. MATH / UTIL
--------------------------------------------------------------------------- */
var TMPV = null, TMPV2 = null, TMPV3 = null;
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function rand(a,b){ return a+Math.random()*(b-a); }
function randInt(a,b){ return Math.floor(rand(a,b+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function damp(a,b,l,dt){ return lerp(a,b,1-Math.exp(-l*dt)); }
function sign(v){ return v<0?-1:1; }
function angLerp(a,b,t){
  var d = ((b-a+Math.PI)%(Math.PI*2))-Math.PI;
  if(d < -Math.PI) d += Math.PI*2;
  return a + d*t;
}
function fmtTime(s){
  var m = Math.floor(s/60), ss = Math.floor(s%60);
  return m + ':' + (ss<10?'0':'') + ss;
}

/* Ray vs AABB (slab). Returns t of entry or -1. */
function rayAABB(ox,oy,oz, dx,dy,dz, b, maxT){
  var t1,t2,tmin=-1e9,tmax=1e9,inv;
  inv = 1/(dx||1e-9); t1=(b.minx-ox)*inv; t2=(b.maxx-ox)*inv;
  if(t1>t2){var s=t1;t1=t2;t2=s;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2;
  inv = 1/(dy||1e-9); t1=(b.miny-oy)*inv; t2=(b.maxy-oy)*inv;
  if(t1>t2){var s2=t1;t1=t2;t2=s2;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2;
  inv = 1/(dz||1e-9); t1=(b.minz-oz)*inv; t2=(b.maxz-oz)*inv;
  if(t1>t2){var s3=t1;t1=t2;t2=s3;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2;
  if(tmax < 0 || tmin > tmax || tmin > maxT) return -1;
  return tmin < 0 ? 0 : tmin;
}
/* Normal of an AABB at a hit point */
function aabbNormal(b, px,py,pz, out){
  var e = 0.02;
  if(Math.abs(px-b.minx)<e) out.set(-1,0,0);
  else if(Math.abs(px-b.maxx)<e) out.set(1,0,0);
  else if(Math.abs(py-b.miny)<e) out.set(0,-1,0);
  else if(Math.abs(py-b.maxy)<e) out.set(0,1,0);
  else if(Math.abs(pz-b.minz)<e) out.set(0,0,-1);
  else out.set(0,0,1);
  return out;
}
