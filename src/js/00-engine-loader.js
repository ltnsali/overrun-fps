/* Three.js loader with CDN fallbacks */
(function(){
  var urls = [
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
      e.textContent = "Could not download the 3D engine (three.js) from any CDN. This page needs an internet connection the first time it runs. Check your connection or firewall and reload.";
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
