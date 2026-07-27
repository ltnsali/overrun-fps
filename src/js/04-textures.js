"use strict";
/* ---------------------------------------------------------------------------
   4. PROCEDURAL TEXTURES
--------------------------------------------------------------------------- */
function cnv(size){
  var c = document.createElement('canvas'); c.width = c.height = size;
  return c;
}
function texFloor(){
  var s=512, c=cnv(s), x=c.getContext('2d');
  x.fillStyle='#32363f'; x.fillRect(0,0,s,s);
  for(var i=0;i<9000;i++){
    var v = 30+Math.random()*30;
    x.fillStyle='rgba('+(v|0)+','+((v+2)|0)+','+((v+6)|0)+','+(Math.random()*0.5)+')';
    x.fillRect(Math.random()*s, Math.random()*s, 2+Math.random()*3, 2+Math.random()*3);
  }
  var t=4, cs=s/t;
  x.strokeStyle='rgba(0,0,0,.55)'; x.lineWidth=3;
  for(var a=0;a<=t;a++){
    x.beginPath(); x.moveTo(a*cs,0); x.lineTo(a*cs,s); x.stroke();
    x.beginPath(); x.moveTo(0,a*cs); x.lineTo(s,a*cs); x.stroke();
  }
  x.strokeStyle='rgba(255,255,255,.05)'; x.lineWidth=1;
  for(a=0;a<=t;a++){
    x.beginPath(); x.moveTo(a*cs+2,0); x.lineTo(a*cs+2,s); x.stroke();
    x.beginPath(); x.moveTo(0,a*cs+2); x.lineTo(s,a*cs+2); x.stroke();
  }
  // scuffs
  for(i=0;i<40;i++){
    x.strokeStyle='rgba(0,0,0,'+(0.05+Math.random()*0.12)+')';
    x.lineWidth=1+Math.random()*6;
    x.beginPath();
    var px=Math.random()*s, py=Math.random()*s;
    x.moveTo(px,py); x.lineTo(px+rand(-90,90), py+rand(-90,90)); x.stroke();
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function texWall(){
  var s=256, c=cnv(s), x=c.getContext('2d');
  x.fillStyle='#474e58'; x.fillRect(0,0,s,s);
  for(var i=0;i<3000;i++){
    var v=54+Math.random()*36;
    x.fillStyle='rgba('+(v|0)+','+((v+4)|0)+','+((v+10)|0)+','+(Math.random()*.6)+')';
    x.fillRect(Math.random()*s,Math.random()*s,2,2);
  }
  // panel lines
  x.strokeStyle='rgba(0,0,0,.5)'; x.lineWidth=3;
  x.strokeRect(4,4,s-8,s-8);
  x.strokeStyle='rgba(255,255,255,.06)'; x.lineWidth=1;
  x.strokeRect(7,7,s-14,s-14);
  // rivets
  x.fillStyle='rgba(0,0,0,.4)';
  for(i=0;i<8;i++){
    x.beginPath(); x.arc(18, 18+i*32, 3, 0, 6.3); x.fill();
    x.beginPath(); x.arc(s-18, 18+i*32, 3, 0, 6.3); x.fill();
  }
  // rust streaks
  for(i=0;i<12;i++){
    var g=x.createLinearGradient(0,0,0,s);
    g.addColorStop(0,'rgba(90,60,35,'+(0.02+Math.random()*0.08)+')');
    g.addColorStop(1,'rgba(60,40,25,0)');
    x.fillStyle=g;
    x.fillRect(Math.random()*s, 0, 3+Math.random()*16, s);
  }
  var tex=new THREE.CanvasTexture(c);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}
function texCrate(){
  var s=128,c=cnv(s),x=c.getContext('2d');
  x.fillStyle='#6b5230'; x.fillRect(0,0,s,s);
  for(var i=0;i<1400;i++){
    var v=80+Math.random()*50;
    x.fillStyle='rgba('+(v|0)+','+((v*0.78)|0)+','+((v*0.45)|0)+','+(Math.random()*.55)+')';
    x.fillRect(Math.random()*s,Math.random()*s,2,2);
  }
  x.strokeStyle='rgba(40,26,12,.85)'; x.lineWidth=8;
  x.strokeRect(4,4,s-8,s-8);
  x.lineWidth=6;
  x.beginPath(); x.moveTo(6,6); x.lineTo(s-6,s-6); x.stroke();
  x.beginPath(); x.moveTo(s-6,6); x.lineTo(6,s-6); x.stroke();
  var tex=new THREE.CanvasTexture(c);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}
function texMetal(tint){
  var s=128,c=cnv(s),x=c.getContext('2d');
  x.fillStyle=tint||'#4a5560'; x.fillRect(0,0,s,s);
  for(var i=0;i<1200;i++){
    x.fillStyle='rgba(255,255,255,'+(Math.random()*.06)+')';
    x.fillRect(Math.random()*s,Math.random()*s,1,Math.random()*12);
  }
  x.fillStyle='rgba(0,0,0,.25)';
  for(i=0;i<6;i++) x.fillRect(0, i*(s/6), s, 2);
  var tex=new THREE.CanvasTexture(c);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}
function texSky(){
  var s=512,c=cnv(s),x=c.getContext('2d');
  var g=x.createLinearGradient(0,0,0,s);
  g.addColorStop(0,'#0a1020'); g.addColorStop(0.45,'#132238');
  g.addColorStop(0.62,'#2b3350'); g.addColorStop(0.78,'#4a3a52');
  g.addColorStop(1,'#151a24');
  x.fillStyle=g; x.fillRect(0,0,s,s);
  for(var i=0;i<300;i++){
    var y=Math.random()*s*0.5;
    x.fillStyle='rgba(255,255,255,'+(Math.random()*0.6*(1-y/(s*0.5)))+')';
    x.fillRect(Math.random()*s, y, 1.4, 1.4);
  }
  for(i=0;i<28;i++){
    var cx=Math.random()*s, cy=s*0.35+Math.random()*s*0.35, r=30+Math.random()*90;
    var rg=x.createRadialGradient(cx,cy,0,cx,cy,r);
    rg.addColorStop(0,'rgba(120,110,150,0.10)'); rg.addColorStop(1,'rgba(120,110,150,0)');
    x.fillStyle=rg; x.beginPath(); x.arc(cx,cy,r,0,6.3); x.fill();
  }
  return new THREE.CanvasTexture(c);
}
