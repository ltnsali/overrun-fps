"use strict";
/* ---------------------------------------------------------------------------
   19. MENU WIRING
--------------------------------------------------------------------------- */
var optsReturn = 'menu';
function initMenus(){
  document.getElementById('btnMulti').onclick = function(){ AUD.init(); AUD.resume(); showScreen('mp'); };
  document.getElementById('btnHelp').onclick = function(){ showScreen('help'); };
  document.getElementById('btnHelpBack').onclick = function(){ showScreen('menu'); };
  document.getElementById('btnOpts').onclick = function(){ optsReturn='menu'; showScreen('opts'); };
  document.getElementById('btnPauseOpts').onclick = function(){ optsReturn='pause'; showScreen('opts'); };
  document.getElementById('btnOptsBack').onclick = function(){ showScreen(optsReturn); };
  document.getElementById('btnResume').onclick = function(){ resumeGame(); };
  document.getElementById('btnQuit').onclick = function(){ quitToMenu(); };
  document.getElementById('btnRetry').onclick = function(){ startGame(G.mode); };
  document.getElementById('btnMenu').onclick = function(){ quitToMenu(); };

  /* ---- deathmatch lobby ---- */
  mpBindOptions();
  document.getElementById('btnMpBack').onclick = function(){ mpDisconnect(); showScreen('menu'); };
  document.getElementById('btnMpStart').onclick = function(){ AUD.init(); AUD.resume(); mpEnterArena(false); };
  document.getElementById('btnMoverAgain').onclick = function(){ startGame('dm'); };
  document.getElementById('btnMoverMenu').onclick = function(){ quitToMenu(); };

  window.addEventListener('keydown', function(e){
    if(e.code === 'Tab' && G.state === 'playing' && MATCH.on){
      e.preventDefault();
      if(!MATCH.boardOpen) mpShowBoard(true);
      return;
    }
    if(e.code === 'Escape'){
      if(G.state === 'paused'){ resumeGame(); }
      else if(document.getElementById('mp').classList.contains('on')){ mpDisconnect(); showScreen('menu'); }
      else if(document.getElementById('help').classList.contains('on') ||
              document.getElementById('opts').classList.contains('on')){
        showScreen(G.state==='paused'?'pause':(G.state==='menu'?'menu':optsReturn));
      }
      /* Browsers that grant Pointer Lock swallow this key to exit the lock and the
         unlock handler pauses for us. Where the lock was refused there is nothing
         to exit, so this is the only way for the player to pause. */
      else if(G.state === 'playing'){ pauseGame(); }
    }
    if(e.code === 'Enter' && G.state === 'menu' &&
       !document.getElementById('mp').classList.contains('on') &&
       !document.getElementById('mover').classList.contains('on')) showScreen('mp');
  });
  window.addEventListener('keyup', function(e){
    if(e.code === 'Tab' && MATCH.boardOpen) mpShowBoard(false);
  });
  G.renderer.domElement.addEventListener('mousedown', function(){
    if(IS_TOUCH) return;
    if(G.state === 'playing' && !IN.locked) requestLock();
  });
}
