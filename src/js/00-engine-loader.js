/* Three.js loader. The copy we ship is tried first: a packaged Android build has
   no CDN to fall back on, must start without a network, and may not fetch code
   at runtime. The CDNs stay as a safety net for the web build. */
(function(){
  var urls = [
    "vendor/three.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js",
    "https://unpkg.com/three@0.128.0/build/three.min.js"
  ];
  var i = 0;
  function next(){
    if(i >= urls.length){
      document.getElementById('loadTxt').textContent = "ENGINE LOAD FAILED";
      var e = document.getElementById('loadErr');
      e.style.display = 'block';
      e.textContent = "Could not load the 3D engine (three.js). The copy that ships with the game did not load and no CDN answered either. Reload, and check your connection or firewall if it happens again.";
      return;
    }
    var s = document.createElement('script');
    s.src = urls[i++];
    s.onload = function(){ window.__threeReady = true; window.__bootGame && window.__bootGame(); };
    s.onerror = next;
    document.head.appendChild(s);
  }
  next();
})();
