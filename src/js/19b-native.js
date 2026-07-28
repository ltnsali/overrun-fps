"use strict";
/* ---------------------------------------------------------------------------
   19b. NATIVE SHELL — Android (Capacitor)

   Everything here is a no-op in a browser. Capacitor registers its plugins on
   window.Capacitor before our scripts run, so this needs no import and no
   bundler: if the bridge is absent we simply are not inside the app.

   The one thing the shell must not do is let a stray gesture throw the player
   out of a match. Android's back button ends the activity by default, which in
   an app with no history means the game closes mid-firefight.
--------------------------------------------------------------------------- */

function isNativeApp(){
  return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform());
}

function initNativeShell(){
  if(!isNativeApp()) return;
  var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if(!App || !App.addListener) return;

  App.addListener('backButton', function(){
    /* Back means "up one level", never "quit", except at the very top where
       leaving is the only thing left to mean. */
    if(G.state === 'playing'){ pauseGame(); return; }
    if(G.state === 'paused'){ resumeGame(); return; }
    if(document.getElementById('mp').classList.contains('on')){
      mpDisconnect(); showScreen('menu'); return;
    }
    if(document.getElementById('help').classList.contains('on') ||
       document.getElementById('opts').classList.contains('on')){
      showScreen('menu'); return;
    }
    if(document.getElementById('mover').classList.contains('on')){
      quitToMenu(); return;
    }
    App.exitApp();
  });

  /* A match keeps running while the player takes a call, and they come back to
     a corpse. Pausing on the way out is the only sane thing to do.

     Android does not guarantee we get told on the way out, though: Capacitor
     fires this without retaining it, and from Android 16 the WebView's
     JavaScript is frozen before the callback gets a turn, so the "leaving"
     event is simply dropped. The state is therefore checked on every
     transition, including the one on the way back in - whichever of the two
     reaches us, the player lands on the pause screen rather than in a
     firefight they cannot see. */
  App.addListener('appStateChange', function(){
    if(G.state === 'playing') pauseGame();
  });
}
