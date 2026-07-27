"use strict";
/* ---------------------------------------------------------------------------
   18. SETTINGS
--------------------------------------------------------------------------- */
function loadSettings(){
  var stored = null;
  try{ stored = localStorage.getItem('overrun_set'); }catch(e){}
  /* First launch on a phone/tablet: defaults a mobile GPU can actually sustain. */
  if(!stored && IS_TOUCH){ SET.shadows = false; SET.res = 0.72; SET.fov = 88; }
  try{
    var s = JSON.parse(stored||'{}');
    for(var k in s) if(SET.hasOwnProperty(k)) SET[k] = s[k];
    G.best = parseInt(localStorage.getItem('overrun_best')||'0',10)||0;
  }catch(e){}
}
function saveSettings(){
  try{ localStorage.setItem('overrun_set', JSON.stringify(SET)); }catch(e){}
}
function applyShadowSetting(){
  G.renderer.shadowMap.enabled = SET.shadows;
  if(WORLD.sun) WORLD.sun.castShadow = SET.shadows;
  G.scene.traverse(function(o){
    if(o.isMesh && o.material && !Array.isArray(o.material)) o.material.needsUpdate = true;
  });
}
function applyRes(){
  onResize();
}
function bindSettings(){
  function bind(id, key, fmt, after){
    var el = document.getElementById(id);
    var out = document.getElementById('out'+id.substring(3));
    if(el.type === 'checkbox'){
      el.checked = SET[key];
      el.addEventListener('change', function(){ SET[key] = el.checked; saveSettings(); if(after) after(); });
    } else {
      el.value = SET[key];
      if(out) out.textContent = fmt(SET[key]);
      el.addEventListener('input', function(){
        SET[key] = parseFloat(el.value);
        if(out) out.textContent = fmt(SET[key]);
        saveSettings(); if(after) after();
      });
    }
  }
  bind('optSens','sens', function(v){ return v.toFixed(2); });
  bind('optFov','fov', function(v){ return v|0; });
  bind('optVol','vol', function(v){ return Math.round(v*100)+'%'; }, function(){ AUD.setVol(SET.vol); });
  bind('optShadow','shadows', null, applyShadowSetting);
  bind('optShake','shake', null);
  bind('optBlood','blood', null);
  bind('optRes','res', function(v){ return Math.round(v*100)+'%'; }, applyRes);
  bind('optDiff','diff', function(v){ return DIFF_NAMES[v|0]; });
}
