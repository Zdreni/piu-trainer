(function(window){
  "use strict";

  var countTokens = new WeakMap();

  function formatScoreValue(n){
    return Number(n).toLocaleString("en-US");
  }

  function formatScore(n){
    return formatScoreValue(n) + "k";
  }

  // Same value, but with the "k" suffix wrapped in its own span so it can be
  // styled as a dimmed version of the surrounding value's color.
  function formatScoreHtml(n){
    return formatScoreValue(n) + '<span class="score-suffix">k</span>';
  }

  // AV (attack value) isn't a score, so no "k" suffix.
  function formatAv(n){
    return formatScoreValue(n);
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
  // force: replays the wheel animation even when text hasn't changed (e.g. a
  // random reroll landing on the same value) so the user still sees it happen.
  // oldBaseClass: the outgoing span's class, if it differs from the incoming
  // value's (e.g. a singles->doubles mode switch changes the number's color) —
  // keeps the old digit its own color instead of jumping to the new one mid-slide.
  function wheelText(el, text, baseClass, direction, force, oldBaseClass){
    if (oldBaseClass === undefined) oldBaseClass = baseClass;

    if (el.classList.contains("wheel-active")){
      window.clearTimeout(el._wheelTimer);
      el.textContent = el.dataset.wheelValue || text;
      el.className = baseClass;
      el.style.width = "";
      el.style.height = "";
    }

    var currentText = el.textContent;
    if (currentText === text && !force) return;

    var oldWidth = el.offsetWidth;
    el.textContent = text;
    var newWidth = el.offsetWidth;
    el.textContent = currentText;
    var width = Math.max(oldWidth, newWidth);
    var height = el.offsetHeight;

    var oldSpan = document.createElement("span");
    oldSpan.className = oldBaseClass + " wheel-num";
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

  // Cancels any in-flight wheelNode animation on `el` and collapses it back
  // down to a single resting child (keeping whichever node was mid-transition
  // in), so `el` is left in a consistent, non-animating state. Must be called
  // before anything bypasses wheelNode to touch el's content directly (e.g.
  // an innerHTML wipe) — otherwise wheelNode's pending completion timer fires
  // later and re-appends its stale node into el, stacking two balls.
  function settleWheel(el){
    window.clearTimeout(el._wheelTimer);
    var clipEl = el.querySelector(".wheel-clip");
    if (!clipEl) return;
    var kids = clipEl.children;
    var keep = kids[kids.length - 1];
    if (keep){
      keep.style.position = "";
      keep.style.top = "";
      keep.style.left = "";
      keep.style.transform = "";
      keep.style.transition = "";
      el.appendChild(keep);
    }
    clipEl.remove();
    el.style.width = "";
    el.style.height = "";
    el.style.position = "";
  }

  // Like wheelText, but slides a whole freshly-built element in/out instead of
  // plain text — used where the sliding "digit" is itself an entire styled node
  // (e.g. the level ball, shape/shadow/gradient and all) rather than a text run.
  // `el` is a plain mask that always stays sized to the node's own natural
  // dimensions (never padded), so it never pushes surrounding layout around —
  // the padded clip region used for the slide lives in a separate absolutely
  // positioned overlay that sits outside the document flow entirely.
  // key: identifies the content for change-detection (compared like wheelText's
  // `text` param). buildNode: called to construct the new node fresh each time.
  // padding: extra pixels around the sliding nodes inside that clip overlay, so
  // a node's own glow (box-shadow/filter bleeding past its box) can fade out
  // before it reaches the clip edge instead of being cut off square.
  function wheelNode(el, key, buildNode, direction, force, padding){
    padding = padding || 0;

    settleWheel(el);

    if (el.dataset.wheelKey === key && !force) return;

    var oldNode = el.firstElementChild;
    var newNode = buildNode();
    el.dataset.wheelKey = key;

    if (!oldNode){
      el.appendChild(newNode);
      return;
    }

    var width = oldNode.offsetWidth;
    var height = oldNode.offsetHeight;

    // Freeze el's own box to the resting node's size before pulling that node
    // out of normal flow, so el doesn't collapse while the swap is in flight.
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.style.position = "relative";

    var clipEl = document.createElement("div");
    clipEl.className = "wheel-clip";
    clipEl.style.position = "absolute";
    clipEl.style.top = (-padding) + "px";
    clipEl.style.left = (-padding) + "px";
    clipEl.style.width = (width + padding * 2) + "px";
    clipEl.style.height = (height + padding * 2) + "px";
    clipEl.style.overflow = "hidden";

    [oldNode, newNode].forEach(function(node){
      node.style.position = "absolute";
      node.style.top = padding + "px";
      node.style.left = padding + "px";
      node.style.transition = "transform 480ms cubic-bezier(0.22,0.61,0.36,1)";
    });
    clipEl.appendChild(oldNode);
    clipEl.appendChild(newNode);
    el.appendChild(clipEl);

    var enterFrom = direction === -1 ? "100%" : "-100%";
    var exitTo = direction === -1 ? "-100%" : "100%";
    oldNode.style.transform = "translateY(0%)";
    newNode.style.transform = "translateY(" + enterFrom + ")";

    void el.offsetWidth; // reflow before animating to final positions

    requestAnimationFrame(function(){
      oldNode.style.transform = "translateY(" + exitTo + ")";
      newNode.style.transform = "translateY(0%)";
    });

    el._wheelTimer = window.setTimeout(function(){
      if (oldNode.parentNode === clipEl) clipEl.removeChild(oldNode);
      newNode.style.position = "";
      newNode.style.top = "";
      newNode.style.left = "";
      newNode.style.transform = "";
      newNode.style.transition = "";
      clipEl.remove();
      el.appendChild(newNode);
      el.style.width = "";
      el.style.height = "";
      el.style.position = "";
    }, 480);
  }

  function animateCount(el, from, to, duration, formatHtml){
    formatHtml = formatHtml || formatScoreHtml;
    var myId = (countTokens.get(el) || 0) + 1;
    countTokens.set(el, myId);
    from = Number(from);
    to = Number(to);

    if (!Number.isFinite(from) || from === to){
      el.innerHTML = formatHtml(to);
      return;
    }

    var startTime = null;
    function step(timestamp){
      if (countTokens.get(el) !== myId) return;
      if (startTime === null) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(from + (to - from) * eased);
      el.innerHTML = formatHtml(current);
      if (progress < 1){
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // Builds the chart-type/level "ball" badge: shape, color fill and its type/level
  // text. extraClass (e.g. "level-ball--mini") lets callers get a smaller variant
  // via CSS without duplicating this markup.
  function buildLevelBall(typeWord, levelText, isDoubles, extraClass){
    var ball = document.createElement("div");
    ball.className = "level-ball" + (isDoubles ? " type-doubles" : "") + (extraClass ? " " + extraClass : "");

    var typeEl = document.createElement("span");
    typeEl.className = "level-ball-type";
    typeEl.textContent = typeWord;

    var valueEl = document.createElement("span");
    valueEl.className = "level-ball-value";
    valueEl.textContent = levelText;

    ball.appendChild(typeEl);
    ball.appendChild(valueEl);
    return ball;
  }

  window.UI = window.UI || {};
  window.UI.Tools = {
    formatScore: formatScore,
    formatScoreHtml: formatScoreHtml,
    formatAv: formatAv,
    burstGlow: burstGlow,
    splash: splash,
    wheelText: wheelText,
    wheelNode: wheelNode,
    settleWheel: settleWheel,
    buildLevelBall: buildLevelBall,
    animateCount: animateCount
  };
})(window);
