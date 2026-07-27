"use strict";
/* ---------------------------------------------------------------------------
   6. PARTICLE SYSTEM (pooled, custom shader for per-particle size/alpha)
--------------------------------------------------------------------------- */
function ParticleSys(max, additive){
  this.max = max; this.head = 0;
  var pos   = new Float32Array(max*3);
  var col   = new Float32Array(max*3);
  var siz   = new Float32Array(max);
  var alp   = new Float32Array(max);
  for(var i=0;i<max;i++){ pos[i*3+1] = -9999; alp[i]=0; }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('pcolor',   new THREE.BufferAttribute(col,3));
  geo.setAttribute('psize',    new THREE.BufferAttribute(siz,1));
  geo.setAttribute('palpha',   new THREE.BufferAttribute(alp,1));
  var mat = new THREE.ShaderMaterial({
    uniforms:{},
    vertexShader:[
      'attribute vec3 pcolor;','attribute float psize;','attribute float palpha;',
      'varying vec3 vC; varying float vA;',
      'void main(){',
      '  vC = pcolor; vA = palpha;',
      '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
      '  gl_PointSize = min(psize * (340.0 / max(0.001,-mv.z)), 58.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader:[
      'varying vec3 vC; varying float vA;',
      'void main(){',
      '  vec2 c = gl_PointCoord - 0.5;',
      '  float d = dot(c,c);',
      '  if(d > 0.25) discard;',
      '  float a = smoothstep(0.25, 0.015, d) * vA;',
      '  if(a <= 0.005) discard;',
      '  gl_FragColor = vec4(vC, a);',
      '}'
    ].join('\n'),
    transparent:true, depthWrite:false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  this.points = new THREE.Points(geo, mat);
  this.points.frustumCulled = false;
  this.geo = geo;
  this.aPos = pos; this.aCol = col; this.aSiz = siz; this.aAlp = alp;
  this.vel  = new Float32Array(max*3);
  this.life = new Float32Array(max);
  this.maxLife = new Float32Array(max);
  this.grav = new Float32Array(max);
  this.drag = new Float32Array(max);
  this.size0= new Float32Array(max);
  this.fade = new Float32Array(max);
  this.bounce = new Float32Array(max);
  this.alive = 0;
}
ParticleSys.prototype.emit = function(x,y,z, vx,vy,vz, r,g,b, size, life, gravity, dragv, bouncy){
  var i = this.head; this.head = (this.head+1) % this.max;
  this.aPos[i*3]=x; this.aPos[i*3+1]=y; this.aPos[i*3+2]=z;
  this.vel[i*3]=vx; this.vel[i*3+1]=vy; this.vel[i*3+2]=vz;
  this.aCol[i*3]=r; this.aCol[i*3+1]=g; this.aCol[i*3+2]=b;
  this.aSiz[i]=size; this.size0[i]=size; this.aAlp[i]=1;
  this.life[i]=life; this.maxLife[i]=life;
  this.grav[i]= gravity===undefined?-18:gravity;
  this.drag[i]= dragv===undefined?1.4:dragv;
  this.bounce[i]= bouncy?1:0;
};
ParticleSys.prototype.update = function(dt){
  var p=this.aPos, v=this.vel, a=this.aAlp, s=this.aSiz, any=false;
  for(var i=0;i<this.max;i++){
    if(this.life[i] <= 0){ if(a[i]!==0){ a[i]=0; any=true; } continue; }
    any = true;
    this.life[i] -= dt;
    var k = i*3;
    var dr = Math.exp(-this.drag[i]*dt);
    v[k] *= dr; v[k+1] = (v[k+1] + this.grav[i]*dt) * dr; v[k+2] *= dr;
    p[k] += v[k]*dt; p[k+1] += v[k+1]*dt; p[k+2] += v[k+2]*dt;
    if(this.bounce[i] && p[k+1] < 0.03){ p[k+1] = 0.03; v[k+1] = -v[k+1]*0.34; v[k]*=0.7; v[k+2]*=0.7; }
    var t = clamp(this.life[i]/this.maxLife[i], 0, 1);
    a[i] = t*t;
    s[i] = this.size0[i]*(0.35+0.65*t);
    if(this.life[i] <= 0){ a[i] = 0; p[k+1] = -9999; }
  }
  if(any){
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.palpha.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
  }
};

var FX = {
  spark:null, smoke:null,
  tracers:[], tHead:0,
  decals:[], dHead:0,
  rings:[], dmgEls:[], dmgActive:[], dHeadEl:0,
  flashLights:[], flHead:0
};

function initFX(){
  FX.spark = new ParticleSys(2600, true);
  FX.smoke = new ParticleSys(1600, false);
  G.scene.add(FX.spark.points);
  G.scene.add(FX.smoke.points);

  /* tracer pool */
  var tgeo = new THREE.BoxGeometry(1,1,1);
  tgeo.translate(0,0,-0.5);
  for(var i=0;i<48;i++){
    var m = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({
      color:0xfff0b0, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
    m.visible = false; m.frustumCulled = false;
    G.scene.add(m);
    FX.tracers.push({mesh:m, life:0, max:0});
  }

  /* decal pool */
  var dtex = makeDecalTex();
  var dgeo = new THREE.PlaneGeometry(1,1);
  for(i=0;i<80;i++){
    var dm = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({
      map:dtex, transparent:true, opacity:0, depthWrite:false, polygonOffset:true,
      polygonOffsetFactor:-4, polygonOffsetUnits:-4}));
    dm.visible=false;
    G.scene.add(dm);
    FX.decals.push({mesh:dm, life:0});
  }

  /* shockwave rings */
  var rgeo = new THREE.RingGeometry(0.6, 1.0, 32);
  for(i=0;i<10;i++){
    var rm = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({
      color:0xffaa44, transparent:true, opacity:0, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, depthWrite:false}));
    rm.visible=false; rm.rotation.x = -Math.PI/2;
    G.scene.add(rm);
    FX.rings.push({mesh:rm, life:0, max:0, r0:1, r1:8});
  }

  /* dynamic flash lights */
  for(i=0;i<5;i++){
    var l = new THREE.PointLight(0xffbb55, 0, 30, 2);
    G.scene.add(l);
    FX.flashLights.push({light:l, life:0, max:0, power:0});
  }

  /* damage number DOM pool */
  var layer = document.getElementById('dmgLayer');
  for(i=0;i<26;i++){
    var el = document.createElement('div');
    el.className = 'dmg'; el.style.opacity = 0;
    layer.appendChild(el);
    FX.dmgEls.push({el:el, life:0, max:0, pos:new THREE.Vector3(), off:0, vy:0, vx:0});
  }
}

function makeDecalTex(){
  var s=64,c=cnv(s),x=c.getContext('2d');
  x.clearRect(0,0,s,s);
  var g=x.createRadialGradient(s/2,s/2,1,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(10,8,6,0.95)');
  g.addColorStop(0.42,'rgba(24,20,16,0.8)');
  g.addColorStop(0.7,'rgba(40,34,28,0.28)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.beginPath(); x.arc(s/2,s/2,s/2,0,6.3); x.fill();
  for(var i=0;i<12;i++){
    x.fillStyle='rgba(0,0,0,'+(0.2+Math.random()*0.5)+')';
    var a=Math.random()*6.3, r=6+Math.random()*16;
    x.beginPath(); x.arc(s/2+Math.cos(a)*r, s/2+Math.sin(a)*r, 1+Math.random()*3.5, 0,6.3); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

function addTracer(from, to, color, width, life){
  var t = FX.tracers[FX.tHead]; FX.tHead = (FX.tHead+1)%FX.tracers.length;
  var len = from.distanceTo(to);
  t.mesh.position.copy(from);
  t.mesh.lookAt(to);
  t.mesh.scale.set(width||0.045, width||0.045, len);
  t.mesh.material.color.setHex(color||0xfff0b0);
  t.mesh.material.opacity = 1;
  t.mesh.visible = true;
  t.life = t.max = life||0.06;
}
function addDecal(point, normal, size, colorHex){
  var d = FX.decals[FX.dHead]; FX.dHead = (FX.dHead+1)%FX.decals.length;
  d.mesh.position.copy(point).addScaledVector(normal, 0.022);
  var look = point.clone().add(normal);
  d.mesh.lookAt(look);
  d.mesh.rotation.z = Math.random()*6.3;
  var s = size || rand(0.22,0.34);
  d.mesh.scale.set(s,s,s);
  d.mesh.material.opacity = 0.95;
  d.mesh.material.color.setHex(colorHex===undefined?0xffffff:colorHex);
  d.mesh.visible = true;
  d.life = 22;
}
function addRing(pos, r0, r1, life, color){
  var r = null;
  for(var i=0;i<FX.rings.length;i++) if(FX.rings[i].life<=0){ r = FX.rings[i]; break; }
  if(!r) r = FX.rings[0];
  r.mesh.position.copy(pos); r.mesh.position.y = Math.max(0.08, pos.y*0.35);
  r.mesh.material.color.setHex(color||0xffaa44);
  r.mesh.material.opacity = 0.9;
  r.mesh.visible = true;
  r.life = r.max = life||0.5; r.r0=r0; r.r1=r1;
}
function addFlash(pos, color, power, life){
  var f = FX.flashLights[FX.flHead]; FX.flHead=(FX.flHead+1)%FX.flashLights.length;
  f.light.position.copy(pos);
  f.light.color.setHex(color);
  f.power = power; f.life = f.max = life;
  f.light.intensity = power;
}
function addDamageNumber(worldPos, amount, kind){
  var d = null;
  for(var i=0;i<FX.dmgEls.length;i++){
    var idx = (FX.dHeadEl+i)%FX.dmgEls.length;
    if(FX.dmgEls[idx].life<=0){ d = FX.dmgEls[idx]; FX.dHeadEl = (idx+1)%FX.dmgEls.length; break; }
  }
  if(!d){ d = FX.dmgEls[FX.dHeadEl]; FX.dHeadEl=(FX.dHeadEl+1)%FX.dmgEls.length; }
  d.pos.copy(worldPos);
  d.life = d.max = 0.95;
  d.vy = 46; d.vx = rand(-22,22); d.off = 0;
  var txt = Math.round(amount);
  if(kind==='head'){ d.el.style.color='#ffdd44'; d.el.style.fontSize='26px'; d.el.textContent = txt+'!'; }
  else if(kind==='crit'){ d.el.style.color='#ff8844'; d.el.style.fontSize='23px'; d.el.textContent = txt; }
  else if(kind==='kill'){ d.el.style.color='#ff3b5c'; d.el.style.fontSize='28px'; d.el.textContent = txt; }
  else { d.el.style.color='#eafcff'; d.el.style.fontSize='19px'; d.el.textContent = txt; }
  d.el.style.opacity = 1;
}

function updateFX(dt){
  FX.spark.update(dt);
  FX.smoke.update(dt);
  var i,t;
  for(i=0;i<FX.tracers.length;i++){
    t = FX.tracers[i];
    if(t.life>0){
      t.life -= dt;
      if(t.life<=0){ t.mesh.visible=false; t.life=0; }
      else t.mesh.material.opacity = (t.life/t.max);
    }
  }
  for(i=0;i<FX.decals.length;i++){
    var d = FX.decals[i];
    if(d.life>0){
      d.life -= dt;
      if(d.life<=0){ d.mesh.visible=false; d.life=0; }
      else if(d.life<2) d.mesh.material.opacity = 0.95*(d.life/2);
    }
  }
  for(i=0;i<FX.rings.length;i++){
    var r = FX.rings[i];
    if(r.life>0){
      r.life -= dt;
      var k = 1-(r.life/r.max);
      var sc = lerp(r.r0, r.r1, k);
      r.mesh.scale.set(sc,sc,sc);
      r.mesh.material.opacity = Math.max(0,(1-k)*0.9);
      if(r.life<=0){ r.mesh.visible=false; r.life=0; }
    }
  }
  for(i=0;i<FX.flashLights.length;i++){
    var f = FX.flashLights[i];
    if(f.life>0){
      f.life -= dt;
      f.light.intensity = f.power * Math.max(0, f.life/f.max);
      if(f.life<=0){ f.light.intensity=0; f.life=0; }
    }
  }
  // damage numbers -> project to screen
  var w2 = viewW()/2, h2 = viewH()/2;
  for(i=0;i<FX.dmgEls.length;i++){
    var dn = FX.dmgEls[i];
    if(dn.life<=0) continue;
    dn.life -= dt;
    if(dn.life<=0){ dn.el.style.opacity=0; dn.life=0; continue; }
    dn.off += dn.vy*dt; dn.vy = damp(dn.vy, 6, 3, dt);
    var p = TMPV.copy(dn.pos).project(G.camera);
    if(p.z > 1){ dn.el.style.opacity = 0; continue; }
    var sx = (p.x*w2)+w2 + dn.vx*(1-dn.life/dn.max);
    var sy = (-p.y*h2)+h2 - dn.off;
    dn.el.style.transform = 'translate('+(sx|0)+'px,'+(sy|0)+'px) scale('+(0.85+0.35*(dn.life/dn.max))+')';
    dn.el.style.opacity = clamp(dn.life/dn.max*1.7, 0, 1);
  }
}

/* ---- helper emitters ---- */
function fxImpact(point, normal, mat){
  var n = normal, r,g,b, cnt;
  if(mat==='flesh'){
    if(!SET.blood) return;
    r=0.75;g=0.05;b=0.08; cnt=13;
    for(var i=0;i<cnt;i++){
      var vx = n.x*rand(1,6)+rand(-3,3), vy = n.y*rand(1,5)+rand(1,6), vz = n.z*rand(1,6)+rand(-3,3);
      FX.smoke.emit(point.x,point.y,point.z, vx,vy,vz, r*rand(.6,1),g,b, rand(.07,.16), rand(.5,1.1), -22, 1.2, 1);
    }
    for(i=0;i<4;i++){
      FX.smoke.emit(point.x,point.y,point.z, rand(-1,1),rand(0,1.6),rand(-1,1), 0.35,0.03,0.05, rand(.3,.55), rand(.4,.7), -1.2, 3.2, 0);
    }
    return;
  }
  cnt = 11;
  for(i=0;i<cnt;i++){
    var s=rand(3,11);
    FX.spark.emit(point.x,point.y,point.z,
      n.x*s+rand(-3,3), n.y*s+rand(-1,5), n.z*s+rand(-3,3),
      1.0, rand(.6,.85), rand(.15,.35), rand(.035,.075), rand(.18,.42), -24, 2.2, 1);
  }
  for(i=0;i<4;i++){
    FX.smoke.emit(point.x+rand(-.1,.1),point.y+rand(-.1,.1),point.z+rand(-.1,.1),
      n.x*rand(.4,1.6)+rand(-.6,.6), rand(.4,1.8), n.z*rand(.4,1.6)+rand(-.6,.6),
      0.45,0.42,0.4, rand(.25,.5), rand(.35,.7), 0.6, 2.6, 0);
  }
}
function fxMuzzle(pos, dir, scale){
  scale = scale||1;
  for(var i=0;i<7;i++){
    var s = rand(4,16)*scale;
    FX.spark.emit(pos.x,pos.y,pos.z,
      dir.x*s+rand(-2.4,2.4), dir.y*s+rand(-2.4,2.4), dir.z*s+rand(-2.4,2.4),
      1.0, rand(.7,.95), rand(.25,.5), rand(.03,.07)*scale, rand(.05,.12), -6, 5, 0);
  }
  for(i=0;i<2;i++){
    FX.smoke.emit(pos.x,pos.y,pos.z, dir.x*rand(1,3)+rand(-.5,.5), dir.y*rand(1,3)+rand(0,.7), dir.z*rand(1,3)+rand(-.5,.5),
      0.5,0.5,0.5, rand(.12,.24)*scale, rand(.25,.5), 0.9, 2.4, 0);
  }
}
function fxBlood(pos, dirBack, amount){
  if(!SET.blood) return;
  for(var i=0;i<amount;i++){
    FX.smoke.emit(pos.x,pos.y,pos.z,
      dirBack.x*rand(2,9)+rand(-4,4), rand(1,7), dirBack.z*rand(2,9)+rand(-4,4),
      rand(.45,.85), 0.04, 0.06, rand(.08,.2), rand(.6,1.3), -22, 1.1, 1);
  }
}
function fxGib(pos, count){
  for(var i=0;i<count;i++){
    FX.smoke.emit(pos.x,pos.y+rand(-.4,.8),pos.z,
      rand(-8,8), rand(3,11), rand(-8,8),
      rand(.35,.7), 0.05, 0.07, rand(.14,.3), rand(1.1,2.0), -24, 0.6, 1);
  }
}

/* ---------------------------------------------------------------------------
   7. EXPLOSIONS
--------------------------------------------------------------------------- */
function doExplosion(pos, radius, damage, hurtsPlayer){
  AUD.explode(pos);
  addFlash(pos, 0xffa040, 9, 0.4);
  addRing(pos, 0.5, radius*1.15, 0.55, 0xffaa44);
  var i;
  for(i=0;i<64;i++){
    var a = Math.random()*Math.PI*2, e = rand(-0.3,1.3), sp = rand(6,30);
    var dx=Math.cos(a)*Math.cos(e), dy=Math.sin(e), dz=Math.sin(a)*Math.cos(e);
    FX.spark.emit(pos.x,pos.y,pos.z, dx*sp, dy*sp+4, dz*sp,
      1.0, rand(.45,.9), rand(.1,.3), rand(.14,.4), rand(.35,.95), -16, 1.5, 1);
  }
  for(i=0;i<34;i++){
    var a2=Math.random()*Math.PI*2, sp2=rand(2,12);
    FX.smoke.emit(pos.x,pos.y,pos.z, Math.cos(a2)*sp2, rand(1,9), Math.sin(a2)*sp2,
      0.22,0.2,0.19, rand(.7,1.8), rand(1.0,2.1), 1.1, 1.0, 0);
  }
  // damage entities
  for(i=0;i<ENEMIES.length;i++){
    var e2 = ENEMIES[i];
    if(e2.dead) continue;
    var d = e2.pos.distanceTo(pos);
    if(d < radius){
      var f = 1 - d/radius;
      damageEnemy(e2, damage*f*f, false, pos, 'explosion');
      e2.knock.set((e2.pos.x-pos.x)/Math.max(0.3,d)*14*f, 6*f, (e2.pos.z-pos.z)/Math.max(0.3,d)*14*f);
      e2.stun = Math.max(e2.stun, 0.35*f);
    }
  }
  for(i=0;i<WORLD.barrels.length;i++){
    var b = WORLD.barrels[i];
    if(b.dead) continue;
    var db = b.mesh.position.distanceTo(pos);
    if(db < radius*1.2 && db > 0.05){
      (function(bb){ setTimeout(function(){ if(!bb.dead && G.state!=='boot') explodeBarrel(bb); }, 90+Math.random()*160); })(b);
    }
  }
  if(hurtsPlayer){
    var pp = TMPV.copy(PL.pos); pp.y += 0.9;
    var dp = pp.distanceTo(pos);
    if(dp < radius*1.1){
      var fp = 1 - dp/(radius*1.1);
      damagePlayer(damage*fp*fp*0.55, pos);
      PL.vel.x += (pp.x-pos.x)/Math.max(0.4,dp)*12*fp;
      PL.vel.z += (pp.z-pos.z)/Math.max(0.4,dp)*12*fp;
      PL.vel.y += 5*fp;
    }
  }
  addShake(clamp(radius*0.12, 0.3, 1.6) * clamp(1 - pos.distanceTo(PL.pos)/45, 0.05, 1), 0.5);
}

function addShake(amount, dur){
  if(!SET.shake) return;
  G.shake = Math.max(G.shake, amount);
  G.shakeTime = Math.max(G.shakeTime, dur||0.35);
}
