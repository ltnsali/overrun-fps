"use strict";
/* ---------------------------------------------------------------------------
   2. AUDIO (fully synthesised — no external assets)
--------------------------------------------------------------------------- */
var AUD = {
  ctx:null, master:null, comp:null, noiseBuf:null, ready:false, music:null,
  init:function(){
    if(this.ready) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 9; this.comp.attack.value=0.003;
    this.master = this.ctx.createGain();
    this.master.gain.value = SET.vol;
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    // noise buffer
    var len = this.ctx.sampleRate * 2;
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i] = Math.random()*2-1;
    this.noiseBuf = buf;
    this.ready = true;
  },
  resume:function(){ if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVol:function(v){ if(this.master) this.master.gain.value = v; },
  noise:function(dur, gain, type, freq, q, when){
    if(!this.ready) return null;
    var t = when || this.ctx.currentTime;
    var src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    var f = this.ctx.createBiquadFilter(); f.type = type||'lowpass';
    f.frequency.value = freq||1000; f.Q.value = q||1;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t+dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t+dur+0.02);
    return {src:src,f:f,g:g,t:t};
  },
  tone:function(f0,f1,dur,gain,type,when){
    if(!this.ready) return;
    var t = when || this.ctx.currentTime;
    var o = this.ctx.createOscillator(); o.type = type||'sine';
    o.frequency.setValueAtTime(f0,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,f1), t+dur);
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(gain, t+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t+dur+0.02);
  },
  /* positional-ish attenuation helper */
  at:function(pos){
    if(!pos) return 1;
    var d = pos.distanceTo(PL.pos);
    return clamp(1 - d/60, 0.06, 1);
  },
  shot:function(kind, pos){
    if(!this.ready) return;
    var a = this.at(pos), t = this.ctx.currentTime;
    if(kind==='pistol'){
      this.noise(0.13, .55*a, 'bandpass', 1500, 1.1, t);
      this.tone(320, 60, 0.11, .35*a, 'square', t);
      this.noise(0.30, .12*a, 'highpass', 2500, .7, t+0.02);
    } else if(kind==='rifle'){
      this.noise(0.11, .5*a, 'bandpass', 1900, 1.4, t);
      this.tone(260, 55, 0.09, .32*a, 'sawtooth', t);
      this.noise(0.26, .1*a, 'highpass', 3200, .8, t+0.02);
    } else if(kind==='shotgun'){
      this.noise(0.26, .75*a, 'lowpass', 1100, .9, t);
      this.tone(150, 35, 0.22, .45*a, 'square', t);
      this.noise(0.45, .16*a, 'highpass', 1800, .6, t+0.03);
    } else if(kind==='sniper'){
      this.noise(0.35, .8*a, 'bandpass', 800, .9, t);
      this.tone(180, 30, 0.3, .5*a, 'sawtooth', t);
      this.noise(0.8, .16*a, 'highpass', 900, .5, t+0.05);
    } else if(kind==='rocket'){
      this.noise(0.6, .6*a, 'lowpass', 700, .8, t);
      this.tone(220, 40, 0.5, .35*a, 'sawtooth', t);
    } else if(kind==='plasma'){
      this.tone(900, 180, 0.16, .3*a, 'sawtooth', t);
      this.tone(1400, 400, 0.1, .2*a, 'sine', t);
    }
  },
  dry:function(){ this.tone(1200, 700, 0.05, .18, 'square'); this.noise(0.05,.12,'highpass',3000,1); },
  reload:function(stage){
    if(!this.ready) return;
    var t = this.ctx.currentTime;
    if(stage===0){ this.noise(0.07,.28,'bandpass',900,3,t); this.tone(420,220,0.06,.14,'square',t); }
    else if(stage===1){ this.noise(0.09,.3,'bandpass',600,2.5,t); this.tone(240,140,0.08,.16,'square',t); }
    else { this.noise(0.06,.34,'bandpass',1500,4,t); this.tone(900,500,0.05,.16,'square',t); }
  },
  impact:function(pos, mat){
    var a = this.at(pos);
    if(mat==='flesh'){ this.noise(0.11,.35*a,'lowpass',600,1); this.tone(160,70,0.09,.16*a,'sine'); }
    else { this.noise(0.07,.22*a,'highpass',2600,1.2); this.tone(2400,900,0.04,.07*a,'square'); }
  },
  hitmark:function(head){ this.tone(head?2100:1500, head?1500:1100, 0.05, .2, 'square'); },
  kill:function(){ this.tone(700,180,0.2,.22,'sawtooth'); this.noise(0.28,.22,'lowpass',900,1); },
  hurt:function(){ this.noise(0.2,.4,'lowpass',500,1); this.tone(200,80,0.22,.25,'sawtooth'); },
  pickup:function(kind){
    if(kind==='health'){ this.tone(520,880,0.13,.2,'sine'); this.tone(880,1320,0.1,.12,'sine'); }
    else if(kind==='armor'){ this.tone(300,600,0.14,.2,'triangle'); }
    else { this.tone(700,1200,0.09,.16,'square'); }
  },
  explode:function(pos){
    if(!this.ready) return;
    var a = this.at(pos), t=this.ctx.currentTime;
    this.noise(0.9, .85*a, 'lowpass', 500, .8, t);
    this.tone(120, 26, 0.8, .5*a, 'sawtooth', t);
    this.noise(1.3, .2*a, 'highpass', 700, .5, t+0.06);
  },
  step:function(run){ this.noise(0.07, run?.14:.08, 'lowpass', run?900:600, 1); },
  jump:function(){ this.noise(0.08,.1,'lowpass',700,1); },
  land:function(f){ this.noise(0.13,.1+.2*f,'lowpass',400,1); this.tone(140,60,0.1,.12,'sine'); },
  wave:function(){
    if(!this.ready) return;
    var t=this.ctx.currentTime;
    this.tone(180,180,0.5,.2,'sawtooth',t);
    this.tone(240,240,0.5,.16,'sawtooth',t+0.28);
    this.tone(360,360,0.9,.2,'sawtooth',t+0.56);
  },
  boss:function(){
    if(!this.ready) return;
    var t=this.ctx.currentTime;
    for(var i=0;i<4;i++) this.tone(70,50,0.7,.34,'sawtooth',t+i*0.36);
  },
  enemyShoot:function(pos){ var a=this.at(pos); this.tone(700,200,0.11,.22*a,'square'); this.noise(0.1,.14*a,'bandpass',1400,2); },
  enemyGrowl:function(pos){ var a=this.at(pos); this.tone(rand(90,150), rand(50,80), rand(.3,.5), .22*a, 'sawtooth'); },
  levelup:function(){
    if(!this.ready) return;
    var t=this.ctx.currentTime, n=[523,659,784,1046];
    for(var i=0;i<4;i++) this.tone(n[i],n[i],0.24,.16,'triangle',t+i*0.09);
  }
};
