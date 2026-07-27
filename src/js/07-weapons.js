"use strict";
/* ---------------------------------------------------------------------------
   8. WEAPON DEFINITIONS
--------------------------------------------------------------------------- */
var WDEF = [
{ id:'pistol', name:'M9 SIDEARM', mode:'SEMI · 9MM', auto:false, dmg:30, headMul:2.4,
  rpm:420, mag:15, reserve:130, reserveMax:200, reload:1.25, spread:0.006, moveSpread:0.028,
  adsSpread:0.0015, recoil:2.1, recoilH:0.55, pellets:1, range:110, sound:'pistol',
  zoom:0.86, kick:0.055, shellCol:[0.9,0.72,0.25], tracerCol:0xffe9a8, falloff:70, unlocked:true, icon:'1 PSTL' },

{ id:'smg', name:'VECTOR SMG', mode:'AUTO · 45ACP', auto:true, dmg:19, headMul:2.0,
  rpm:950, mag:32, reserve:280, reserveMax:420, reload:1.7, spread:0.011, moveSpread:0.034,
  adsSpread:0.005, recoil:1.25, recoilH:0.75, pellets:1, range:80, sound:'rifle',
  zoom:0.84, kick:0.038, shellCol:[0.85,0.7,0.3], tracerCol:0xfff0b0, falloff:45, unlocked:true, icon:'2 SMG' },

{ id:'shotgun', name:'SPAS-12', mode:'PUMP · 12GA', auto:false, dmg:15, headMul:1.6,
  rpm:78, mag:8, reserve:56, reserveMax:96, reload:2.3, spread:0.055, moveSpread:0.02,
  adsSpread:0.036, recoil:6.5, recoilH:1.4, pellets:11, range:44, sound:'shotgun',
  zoom:0.92, kick:0.16, shellCol:[0.85,0.2,0.15], tracerCol:0xffd9a0, falloff:16, unlocked:true, icon:'3 SHTG' },

{ id:'sniper', name:'M82 RAILBREAKER', mode:'BOLT · .50CAL', auto:false, dmg:185, headMul:2.6,
  rpm:48, mag:5, reserve:32, reserveMax:60, reload:2.6, spread:0.028, moveSpread:0.05,
  adsSpread:0.0, recoil:9, recoilH:1.0, pellets:1, range:260, sound:'sniper',
  zoom:0.30, kick:0.22, scope:true, pierce:3, shellCol:[0.9,0.75,0.3], tracerCol:0xbfe9ff, falloff:400, unlocked:true, icon:'4 SNPR' },

{ id:'launcher', name:'RPG-X SIEGE', mode:'ROCKET · HE', auto:false, dmg:0, headMul:1,
  rpm:40, mag:1, reserve:9, reserveMax:16, reload:2.9, spread:0.012, moveSpread:0.02,
  adsSpread:0.006, recoil:8, recoilH:0.6, pellets:1, range:200, sound:'rocket',
  zoom:0.9, kick:0.3, projectile:'rocket', shellCol:[0.5,0.5,0.5], tracerCol:0xffaa55, falloff:999, unlocked:true, icon:'5 RPG' }
];
