(function(){
  "use strict";

  // Merges each explicitly-listed level's config forward onto the next
  // (so a level entry only needs to specify what changed since the one below it).
  function fillGaps(raw){
    var result = {};
    var prev = null;
    Object.keys(raw).sort(function(a, b){ return Number(a) - Number(b); }).forEach(function(key){
      var merged = Object.assign({}, prev, raw[key]);
      result[key] = merged;
      prev = merged;
    });
    return result;
  }

  var STORAGE_KEY = "piuTrainerLevelData";

  function validateLevelData(data){
    if (data === null || typeof data !== "object" || Array.isArray(data)){
      return { valid: false, error: "Top-level JSON must be an object mapping level numbers to level configs." };
    }
    var keys = Object.keys(data);
    if (keys.length === 0){
      return { valid: false, error: "Data is empty — add at least one level." };
    }
    var minKey = null;
    for (var i = 0; i < keys.length; i++){
      var key = keys[i];
      if (!/^\d+$/.test(key)){
        return { valid: false, error: "Level key \"" + key + "\" must be a whole number." };
      }
      if (minKey === null || Number(key) < Number(minKey)) minKey = key;

      var entry = data[key];
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)){
        return { valid: false, error: "Level " + key + " must map to an object (use {} for an empty entry)." };
      }
      if ("scores" in entry){
        var scores = entry.scores;
        var scoresOk = Array.isArray(scores) && scores.length > 0 && scores.every(function(n){
          return typeof n === "number" && Number.isFinite(n);
        });
        if (!scoresOk){
          return { valid: false, error: "Level " + key + ": \"scores\" must be a non-empty array of numbers." };
        }
      }
      if ("avSingles" in entry && entry.avSingles !== undefined && (typeof entry.avSingles !== "number" || !Number.isFinite(entry.avSingles))){
        return { valid: false, error: "Level " + key + ": \"avSingles\" must be a number." };
      }
      if ("avDoubles" in entry && entry.avDoubles !== undefined && (typeof entry.avDoubles !== "number" || !Number.isFinite(entry.avDoubles))){
        return { valid: false, error: "Level " + key + ": \"avDoubles\" must be a number." };
      }
    }

    // The lowest level has nothing below it to inherit from, so it must be fully specified.
    var lowest = data[minKey];
    if (!Array.isArray(lowest.scores) || lowest.scores.length === 0){
      return { valid: false, error: "Level " + minKey + " is the lowest level in the table and must specify \"scores\" — there's nothing below it to inherit from." };
    }
    if (typeof lowest.avSingles !== "number" || !Number.isFinite(lowest.avSingles)){
      return { valid: false, error: "Level " + minKey + " is the lowest level in the table and must specify \"avSingles\" — there's nothing below it to inherit from." };
    }
    if (typeof lowest.avDoubles !== "number" || !Number.isFinite(lowest.avDoubles)){
      return { valid: false, error: "Level " + minKey + " is the lowest level in the table and must specify \"avDoubles\" — there's nothing below it to inherit from." };
    }

    return { valid: true };
  }

  function readStoredRawData(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return validateLevelData(parsed).valid ? parsed : null;
    } catch (e){
      return null;
    }
  }

  var activeRawData = null;
  var levelData = null;
  var levelKeys = null; // ascending numeric level keys present in levelData

  function setActiveData(raw){
    activeRawData = raw;
    levelData = fillGaps(raw);
    levelKeys = Object.keys(levelData).map(Number).sort(function(a, b){ return a - b; });
  }

  var initialStoredRawData = readStoredRawData();
  setActiveData(initialStoredRawData || LEVEL_DATA);

  var state = { level: null, attemptIndex: 0, avSinglesChanged: true, avDoublesChanged: true };
  var lastLevelText = null;
  var lastTargetText = null;
  var lastTargetValue = null;
  var lastAvSinglesValue = null;
  var lastAvDoublesValue = null;
  var countTokens = new WeakMap();

  // ---- DOM refs ----
  var setupEl = document.getElementById("setup");
  var playEl = document.getElementById("play");
  var noDataEl = document.getElementById("noData");

  var startLevelInput = document.getElementById("startLevelInput");
  var startBtn = document.getElementById("startBtn");
  var setupError = document.getElementById("setupError");

  var levelNumberEl = document.getElementById("levelNumber");
  var levelBurstEl = document.getElementById("levelBurst");
  var avSinglesEl = document.getElementById("avSingles");
  var avDoublesEl = document.getElementById("avDoubles");
  var ladderEl = document.getElementById("ladder");
  var attemptTagEl = document.getElementById("attemptTag");
  var targetNumberEl = document.getElementById("targetNumber");
  var targetBurstEl = document.getElementById("targetBurst");

  var failBtn = document.getElementById("failBtn");
  var passBtn = document.getElementById("passBtn");
  var restartBtn = document.getElementById("restartBtn");
  var restartBtnNoData = document.getElementById("restartBtnNoData");

  var noDataLevelEl = document.getElementById("noDataLevel");
  var jumpInput = document.getElementById("jumpInput");
  var jumpBtn = document.getElementById("jumpBtn");

  var fullscreenBtn = document.getElementById("fullscreenBtn");

  var onboardModal = document.getElementById("onboardModal");
  var onboardLevelInput = document.getElementById("onboardLevelInput");
  var onboardAvSinglesInput = document.getElementById("onboardAvSinglesInput");
  var onboardAvDoublesInput = document.getElementById("onboardAvDoublesInput");
  var onboardError = document.getElementById("onboardError");
  var onboardSaveBtn = document.getElementById("onboardSaveBtn");

  var importBtn = document.getElementById("importBtn");
  var viewDataBtn = document.getElementById("viewDataBtn");
  var dataModal = document.getElementById("dataModal");
  var dataModalTitle = document.getElementById("dataModalTitle");
  var dataTextarea = document.getElementById("dataTextarea");
  var dataModalError = document.getElementById("dataModalError");
  var copyDataBtn = document.getElementById("copyDataBtn");
  var cancelDataBtn = document.getElementById("cancelDataBtn");
  var saveDataBtn = document.getElementById("saveDataBtn");

  // ---- helpers ----
  // A level with no explicit table entry inherits from the nearest lower level that has one.
  function getConfig(level){
    var target = Number(level);
    var resolvedKey = null;
    for (var i = 0; i < levelKeys.length; i++){
      if (levelKeys[i] > target) break;
      resolvedKey = levelKeys[i];
    }
    return resolvedKey === null ? undefined : levelData[String(resolvedKey)];
  }

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

  // Slides the old value out downward and the new value in from above, like a wheel/odometer digit.
  function wheelText(el, text, baseClass){
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

    oldSpan.style.transform = "translateY(0%)";
    newSpan.style.transform = "translateY(-100%)";

    void el.offsetWidth; // reflow before animating to final positions

    requestAnimationFrame(function(){
      oldSpan.style.transform = "translateY(100%)";
      newSpan.style.transform = "translateY(0%)";
    });

    el._wheelTimer = window.setTimeout(function(){
      el.textContent = text;
      el.className = baseClass;
      el.style.width = "";
      el.style.height = "";
    }, 480);
  }

  function updateAvValue(el, value, changed, previousValue){
    if (value === undefined){
      el.textContent = "—";
      return null;
    }
    if (changed && previousValue !== null){
      animateCount(el, previousValue, value, 600);
    } else {
      el.textContent = formatScore(value);
    }
    return value;
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

  function pulse(el){
    el.classList.remove("av-pulse");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("av-pulse");
    el.addEventListener("animationend", function handler(){
      el.classList.remove("av-pulse");
      el.removeEventListener("animationend", handler);
    });
  }

  function showScreen(name){
    setupEl.hidden = name !== "setup";
    playEl.hidden = name !== "play";
    noDataEl.hidden = name !== "noData";
  }

  function buildLadder(scores, attemptIndex){
    ladderEl.innerHTML = "";
    scores.forEach(function(score, i){
      var step = document.createElement("div");
      var cls = "ladder-step ";
      if (i < attemptIndex) cls += "past-fail";
      else if (i === attemptIndex) cls += "current";
      else cls += "future";
      step.className = cls;

      var scoreSpan = document.createElement("span");
      scoreSpan.className = "score-value";
      scoreSpan.textContent = formatScore(score);
      step.appendChild(scoreSpan);

      if (i < attemptIndex){
        var tag = document.createElement("span");
        tag.className = "fail-tag";
        tag.textContent = "FAIL";
        step.appendChild(tag);
      }
      ladderEl.appendChild(step);
    });
    attemptTagEl.textContent = (attemptIndex + 1) + "/" + scores.length;
  }

  function render(){
    var config = getConfig(state.level);

    var newLevelText = String(state.level);
    var levelChanged = lastLevelText !== null && newLevelText !== lastLevelText;

    if (!config){
      levelNumberEl.textContent = newLevelText;
      noDataLevelEl.textContent = newLevelText;
      jumpInput.value = state.level;
      showScreen("noData");
      lastLevelText = newLevelText;
      lastTargetText = null;
      lastTargetValue = null;
      return;
    }

    var scores = config.scores || [];
    if (state.attemptIndex > scores.length - 1) state.attemptIndex = scores.length - 1;
    if (state.attemptIndex < 0) state.attemptIndex = 0;

    var target = scores[state.attemptIndex];
    var newTargetText = formatScore(target);
    var targetChanged = lastTargetText !== null && newTargetText !== lastTargetText;

    lastAvSinglesValue = updateAvValue(avSinglesEl, config.avSingles, state.avSinglesChanged, lastAvSinglesValue);
    lastAvDoublesValue = updateAvValue(avDoublesEl, config.avDoubles, state.avDoublesChanged, lastAvDoublesValue);
    avSinglesEl.classList.toggle("is-unchanged", !state.avSinglesChanged);
    avDoublesEl.classList.toggle("is-unchanged", !state.avDoublesChanged);
    buildLadder(scores, state.attemptIndex);

    if (targetChanged || levelChanged){
      animateCount(targetNumberEl, lastTargetValue !== null ? lastTargetValue : target, target, 600);
    } else {
      targetNumberEl.textContent = newTargetText;
    }

    showScreen("play");

    if (levelChanged){
      wheelText(levelNumberEl, newLevelText, "level-number");
      burstGlow(levelBurstEl);
    } else {
      levelNumberEl.textContent = newLevelText;
    }
    if (targetChanged || levelChanged) splash(targetNumberEl, targetBurstEl);

    lastLevelText = newLevelText;
    lastTargetText = newTargetText;
    lastTargetValue = target;
  }

  function startAt(level){
    var prevConfig = state.level !== null ? getConfig(state.level) : null;
    var nextConfig = getConfig(level);

    state.avSinglesChanged = !nextConfig || !prevConfig || prevConfig.avSingles !== nextConfig.avSingles;
    state.avDoublesChanged = !nextConfig || !prevConfig || prevConfig.avDoubles !== nextConfig.avDoubles;

    state.level = level;
    state.attemptIndex = 0;
    render();

    if (nextConfig && state.avSinglesChanged) pulse(avSinglesEl);
    if (nextConfig && state.avDoublesChanged) pulse(avDoublesEl);
  }

  // ---- events ----
  startBtn.addEventListener("click", function(){
    var val = parseInt(startLevelInput.value, 10);
    if (!Number.isFinite(val) || val < 1){
      setupError.hidden = false;
      return;
    }
    setupError.hidden = true;
    startAt(val);
  });

  startLevelInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") startBtn.click();
  });

  passBtn.addEventListener("click", function(){
    startAt(state.level + 1);
  });

  failBtn.addEventListener("click", function(){
    var config = getConfig(state.level);
    if (!config) return;
    var scores = config.scores || [];
    if (state.attemptIndex < scores.length - 1) state.attemptIndex += 1;
    render();
  });

  function backToSetup(){
    startLevelInput.value = state.level !== null ? state.level : 14;
    showScreen("setup");
  }
  restartBtn.addEventListener("click", backToSetup);
  restartBtnNoData.addEventListener("click", backToSetup);

  jumpBtn.addEventListener("click", function(){
    var val = parseInt(jumpInput.value, 10);
    if (!Number.isFinite(val) || val < 1) return;
    startAt(val);
  });
  jumpInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") jumpBtn.click();
  });

  // ---- data import / view-edit modal ----
  function openDataModal(mode){
    dataModalError.hidden = true;
    dataModalError.textContent = "";
    if (mode === "import"){
      dataModalTitle.textContent = "Import Level Data";
      dataTextarea.value = "";
      dataTextarea.placeholder = "Paste level data JSON here…";
    } else {
      dataModalTitle.textContent = "Level Data (Local Storage)";
      dataTextarea.value = JSON.stringify(activeRawData, null, 2);
    }
    dataModal.hidden = false;
    dataTextarea.focus();
  }

  function closeDataModal(){
    dataModal.hidden = true;
  }

  importBtn.addEventListener("click", function(){ openDataModal("import"); });
  viewDataBtn.addEventListener("click", function(){ openDataModal("view"); });
  cancelDataBtn.addEventListener("click", closeDataModal);

  dataModal.addEventListener("click", function(e){
    if (e.target === dataModal) closeDataModal();
  });

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && !dataModal.hidden) closeDataModal();
  });

  copyDataBtn.addEventListener("click", function(){
    var text = dataTextarea.value;
    function fallbackCopy(){
      dataTextarea.focus();
      dataTextarea.select();
      try { document.execCommand("copy"); } catch (e){}
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    var original = copyDataBtn.textContent;
    copyDataBtn.textContent = "Copied!";
    setTimeout(function(){ copyDataBtn.textContent = original; }, 1200);
  });

  saveDataBtn.addEventListener("click", function(){
    var parsed;
    try {
      parsed = JSON.parse(dataTextarea.value);
    } catch (e){
      dataModalError.textContent = "Invalid JSON: " + e.message;
      dataModalError.hidden = false;
      return;
    }
    var check = validateLevelData(parsed);
    if (!check.valid){
      dataModalError.textContent = check.error;
      dataModalError.hidden = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    setActiveData(parsed);
    closeDataModal();
    if (state.level !== null) render();
  });

  function isFullscreen(){
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenBtn(){
    fullscreenBtn.classList.toggle("is-active", isFullscreen());
  }

  fullscreenBtn.addEventListener("click", function(){
    if (!isFullscreen()){
      var el = document.documentElement;
      var request = el.requestFullscreen || el.webkitRequestFullscreen;
      if (request) request.call(el);
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  });
  document.addEventListener("fullscreenchange", updateFullscreenBtn);
  document.addEventListener("webkitfullscreenchange", updateFullscreenBtn);

  // ---- first-run onboarding ----
  function onboardFail(msg){
    onboardError.textContent = msg;
    onboardError.hidden = false;
  }

  onboardSaveBtn.addEventListener("click", function(){
    var level = parseInt(onboardLevelInput.value, 10);
    var avSingles = parseInt(onboardAvSinglesInput.value, 10);
    var avDoubles = parseInt(onboardAvDoublesInput.value, 10);

    if (!Number.isFinite(level) || level < 1){
      onboardFail("Enter a valid warm-up level.");
      return;
    }
    if (!Number.isFinite(avSingles) || avSingles < 300 || avSingles > 999){
      onboardFail("AV Singles must be between 300 and 999.");
      return;
    }
    if (!Number.isFinite(avDoubles) || avDoubles < 300 || avDoubles > 999){
      onboardFail("AV Doubles must be between 300 and 999.");
      return;
    }
    onboardError.hidden = true;

    var raw = {};
    raw[String(level)] = { scores: [995, 990, 985, 980, 975, 970, 965], avSingles: avSingles, avDoubles: avDoubles };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    setActiveData(raw);
    startLevelInput.value = level;
    onboardModal.hidden = true;
  });

  showScreen("setup");
  if (!initialStoredRawData) onboardModal.hidden = false;
})();
