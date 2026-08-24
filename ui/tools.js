(function(window){
  "use strict";

  var countTokens = new WeakMap();

  function formatScore(n){
    return Number(n).toLocaleString("en-US");
  }

  function burstGlow(burstEl){
    burstEl.classList.remove("active");
    void burstEl.offsetWidth; // reflow to restart animation
    burstEl.classList.add("active");
  }

  function splash(numberEl, burstEl){
    numberEl.classList.remove("splash-pop");
    void numberEl.offsetWidth; // reflow to restart animation
    numberEl.classList.add("splash-pop");
    burstGlow(burstEl);
  }

  // Slides the old value out and the new value in, like a wheel/odometer digit.
  // direction 1 (default): old exits downward, new enters from above (value went up).
  // direction -1: old exits upward, new enters from below (value went down).
  function wheelText(el, text, baseClass, direction){
    if (el.classList.contains("wheel-active")){
      window.clearTimeout(el._wheelTimer);
      el.textContent = el.dataset.wheelValue || text;
      el.className = baseClass;
      el.style.width = "";
      el.style.height = "";
    }

    var currentText = el.textContent;
    if (currentText === text) return;

    var oldWidth = el.offsetWidth;
    el.textContent = text;
    var newWidth = el.offsetWidth;
    el.textContent = currentText;
    var width = Math.max(oldWidth, newWidth);
    var height = el.offsetHeight;

    var oldSpan = document.createElement("span");
    oldSpan.className = baseClass + " wheel-num";
    oldSpan.textContent = currentText;

    var newSpan = document.createElement("span");
    newSpan.className = baseClass + " wheel-num";
    newSpan.textContent = text;

    el.textContent = "";
    el.appendChild(oldSpan);
    el.appendChild(newSpan);
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.className = "wheel-active";
    el.dataset.wheelValue = text;

    var enterFrom = direction === -1 ? "100%" : "-100%";
    var exitTo = direction === -1 ? "-100%" : "100%";

    oldSpan.style.transform = "translateY(0%)";
    newSpan.style.transform = "translateY(" + enterFrom + ")";

    void el.offsetWidth; // reflow before animating to final positions

    requestAnimationFrame(function(){
      oldSpan.style.transform = "translateY(" + exitTo + ")";
      newSpan.style.transform = "translateY(0%)";
    });

    el._wheelTimer = window.setTimeout(function(){
      el.textContent = text;
      el.className = baseClass;
      el.style.width = "";
      el.style.height = "";
    }, 480);
  }

  function animateCount(el, from, to, duration){
    var myId = (countTokens.get(el) || 0) + 1;
    countTokens.set(el, myId);
    from = Number(from);
    to = Number(to);

    if (!Number.isFinite(from) || from === to){
      el.textContent = formatScore(to);
      return;
    }

    var startTime = null;
    function step(timestamp){
      if (countTokens.get(el) !== myId) return;
      if (startTime === null) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(from + (to - from) * eased);
      el.textContent = formatScore(current);
      if (progress < 1){
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  window.UiTools = {
    formatScore: formatScore,
    burstGlow: burstGlow,
    splash: splash,
    wheelText: wheelText,
    animateCount: animateCount
  };
})(window);
