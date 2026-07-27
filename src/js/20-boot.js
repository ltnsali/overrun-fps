"use strict";
/* ---------------------------------------------------------------------------
   20. BOOT / LOOP
--------------------------------------------------------------------------- */
var _rsW = 0, _rsH = 0, _rsPR = 0;
function onResize(force){
  if(!G.renderer) return;
  var w = viewW(), h = viewH();
  var pr = Math.min(window.devicePixelRatio||1, pixelCap()) * SET.res;
  /* Re-assigning canvas.width reallocates the drawing buffer, so only do real work
     when something actually changed (visualViewport fires on every scroll tick). */
  if(!force && w === _rsW && h === _rsH && pr === _rsPR) return;
  _rsW = w; _rsH = h; _rsPR = pr;

  G.renderer.setPixelRatio(pr);
  /* updateStyle=false: the stylesheet keeps the canvas at 100% of #app, so the
     element can never desync from the viewport even if an event is missed. */
  G.renderer.setSize(w, h, false);
  G.camera.aspect = w/h; G.camera.updateProjectionMatrix();
  G.viewCam.aspect = w/h; G.viewCam.updateProjectionMatrix();
  touchHome();
  updateOrientation();
}

var _resizeRaf = 0;
function requestResize(){
  if(_resizeRaf) return;
  _resizeRaf = requestAnimationFrame(function(){ _resizeRaf = 0; onResize(); });
}

function bindResize(){
  window.addEventListener('resize', requestResize);
  /* Mobile browsers report the post-rotation size over several frames, and some
     never fire a plain 'resize' for a rotation at all - so poll for a moment. */
  window.addEventListener('orientationchange', function(){
    requestResize();
    [50, 150, 300, 600].forEach(function(ms){ setTimeout(requestResize, ms); });
  });
  /* iOS Safari resizes the visual viewport when the URL bar hides/shows. */
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', requestResize);
    window.visualViewport.addEventListener('scroll', requestResize);
  }
  document.addEventListener('fullscreenchange', requestResize);
  document.addEventListener('webkitfullscreenchange', requestResize);
  /* Last line of defence: observe the container itself. Catches every layout
     change, including ones that fire no window event. */
  if(window.ResizeObserver){
    try{ new ResizeObserver(requestResize).observe(_app()); }catch(e){}
  }
  if(screen.orientation && screen.orientation.addEventListener){
    try{ screen.orientation.addEventListener('change', requestResize); }catch(e){}
  }
}

function initEngine(){
  TMPV = new THREE.Vector3(); TMPV2 = new THREE.Vector3(); TMPV3 = new THREE.Vector3();
  _pEye = new THREE.Vector3(); _eToP = new THREE.Vector3();
  _eEye = new THREE.Vector3(); _eMove = new THREE.Vector3();

  G.renderer = new THREE.WebGLRenderer({antialias:!IS_TOUCH, powerPreference:'high-performance'});
  G.renderer.shadowMap.enabled = SET.shadows;
  G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer.autoClear = false;
  document.getElementById('app').appendChild(G.renderer.domElement);

  G.scene = new THREE.Scene();
  G.scene.fog = new THREE.Fog(0x141c28, 55, 210);
  G.scene.background = new THREE.Color(0x0d131d);

  G.camera = new THREE.PerspectiveCamera(SET.fov, viewW()/viewH(), 0.05, 900);
  G.camera.rotation.order = 'YXZ';

  G.viewScene = new THREE.Scene();
  G.viewCam = new THREE.PerspectiveCamera(66, viewW()/viewH(), 0.005, 12);

  onResize(true);
  bindResize();
}

var _lastT = 0;
function loop(now){
  requestAnimationFrame(loop);
  var t = now * 0.001;
  var dt = Math.min(0.05, t - _lastT || 0.016);
  _lastT = t;
  G.dt = dt; G.time = t; G.frame++;

  if(G.state === 'playing'){
    G.elapsed += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    if(G.mode === 'dm'){ mpUpdateRemotes(dt); mpUpdate(dt); }
    else updateWaves(dt);
    updateFX(dt);
    updateDirIndicators(dt);
    updateHUDVitals();
    updateCrosshair();
    if(G.frame % 2 === 0) drawMinimap();
    // low health overlay
    var lf = PL.hp < 35 ? (1 - PL.hp/35) : 0;
    UI.lowhp.style.opacity = lf * (0.55 + 0.45*Math.sin(t*6));
    // barrel flash
    for(var i=0;i<WORLD.barrels.length;i++){
      var b = WORLD.barrels[i];
      if(b.flash>0){ b.flash -= dt; b.mesh.children[0].material.emissive = b.mesh.children[0].material.emissive||new THREE.Color(); b.mesh.children[0].material.emissive.setRGB(b.flash*4,0,0); }
    }
    // sun follows player for tight shadows
    if(WORLD.sun){
      WORLD.sun.position.set(PL.pos.x+48, 78, PL.pos.z+34);
      WORLD.sun.target.position.set(PL.pos.x, 0, PL.pos.z);
      WORLD.sun.target.updateMatrixWorld();
    }
  } else if(G.state === 'dead'){
    updateEnemies(dt);
    updateProjectiles(dt);
    updateFX(dt);
    updateCamera(dt);
  } else if(G.state === 'menu'){
    // slow orbit of the menu camera
    G.camera.position.set(Math.cos(t*0.09)*34, 12+Math.sin(t*0.14)*3, Math.sin(t*0.09)*34);
    G.camera.lookAt(0, 5, 0);
    updateFX(dt);
  }
  IN.clearFrame();

  G.renderer.clear();
  G.renderer.render(G.scene, G.camera);
  if(G.state === 'playing' || G.state === 'paused'){
    G.renderer.clearDepth();
    G.renderer.render(G.viewScene, G.viewCam);
  }
}

window.__bootGame = function(){
  if(G.state !== 'boot') return;
  try{
    loadSettings();
    initEngine();
    initFX();
    cacheUI();
    initInput();
    initMenus();
    bindSettings();
    initTouch();
    buildViewModels();
    initPlayer();
    buildWorld();
    G.state = 'menu';
    document.getElementById('loading').style.display = 'none';
    showScreen('menu');
    requestAnimationFrame(loop);
  }catch(err){
    document.getElementById('loadTxt').textContent = 'INITIALISATION ERROR';
    var e = document.getElementById('loadErr');
    e.style.display='block';
    e.textContent = (err && err.message ? err.message : String(err));
    throw err;
  }
};
if(window.__threeReady) window.__bootGame();
