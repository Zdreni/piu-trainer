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

    // The lowest level has nothing below it to inherit from, so it must specify scores.
    // AV (singles/doubles) is optional at any level — if absent, it's shown as N/A.
    var lowest = data[minKey];
    if (!Array.isArray(lowest.scores) || lowest.scores.length === 0){
      return { valid: false, error: "Level " + minKey + " is the lowest level in the table and must specify \"scores\" — there's nothing below it to inherit from." };
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

  var WARMUP_LEVEL_KEY = "piuTrainerWarmupLevel";

  function readStoredWarmupLevel(){
    try {
      var raw = localStorage.getItem(WARMUP_LEVEL_KEY);
      var val = parseInt(raw, 10);
      return Number.isFinite(val) && val >= 1 ? val : null;
    } catch (e){
      return null;
    }
  }

  function saveWarmupLevel(level){
    try { localStorage.setItem(WARMUP_LEVEL_KEY, String(level)); } catch (e){}
  }

  function clearWarmupLevel(){
    try { localStorage.removeItem(WARMUP_LEVEL_KEY); } catch (e){}
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
  if (initialStoredRawData) setActiveData(initialStoredRawData);

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
  var levelDownBtn = document.getElementById("levelDownBtn");
  var levelUpBtn = document.getElementById("levelUpBtn");

  var noDataLevelEl = document.getElementById("noDataLevel");
  var jumpInput = document.getElementById("jumpInput");
  var jumpBtn = document.getElementById("jumpBtn");

  var fullscreenBtn = document.getElementById("fullscreenBtn");

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
    if (!levelKeys) return undefined;
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

  function updateAvValue(el, value, changed, previousValue){
    if (value === undefined){
      el.textContent = "N/A";
      el.classList.add("is-na");
      return null;
    }
    el.classList.remove("is-na");
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
    var currentStepEl = null;
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
      if (i === attemptIndex) currentStepEl = step;
      ladderEl.appendChild(step);
    });
    attemptTagEl.textContent = (attemptIndex + 1) + "/" + scores.length;
    if (currentStepEl) currentStepEl.scrollIntoView({ block: "nearest", inline: "center" });
  }

  // Vertically centers the level +/- buttons on the level indicator (horizontal position
  // is fixed via CSS at the column's side borders). Uses getBoundingClientRect (not
  // offsetTop) because .number-wrap is itself position:relative, which would otherwise
  // skew levelNumberEl's offset to be relative to that narrow wrapper instead of .play.
  function positionLevelNavButtons(){
    if (playEl.hidden) return;
    var playRect = playEl.getBoundingClientRect();
    var numRect = levelNumberEl.getBoundingClientRect();
    var centerY = numRect.top - playRect.top + numRect.height / 2;

    levelDownBtn.style.top = centerY + "px";
    levelUpBtn.style.top = centerY + "px";
  }

  function canDecreaseLevel(){
    if (state.level === null || state.level <= 1) return false;
    var lowestLevel = levelKeys && levelKeys.length ? levelKeys[0] : null;
    if (lowestLevel !== null && state.level <= lowestLevel) return false;
    return true;
  }

  function updateLevelNavButtons(){
    levelDownBtn.classList.toggle("is-disabled", !canDecreaseLevel());
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
      updateLevelNavButtons();
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
      var levelDirection = Number(newLevelText) < Number(lastLevelText) ? -1 : 1;
      wheelText(levelNumberEl, newLevelText, "level-number", levelDirection);
      burstGlow(levelBurstEl);
    } else {
      levelNumberEl.textContent = newLevelText;
    }
    if (targetChanged || levelChanged) splash(targetNumberEl, targetBurstEl);

    lastLevelText = newLevelText;
    lastTargetText = newTargetText;
    lastTargetValue = target;

    updateLevelNavButtons();
    positionLevelNavButtons();
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
    saveWarmupLevel(val);
    if (!activeRawData){
      var raw = {};
      raw[String(val)] = { scores: [995, 990, 985, 980, 975, 970, 965] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(raw)); } catch (e){}
      setActiveData(raw);
    }
    startAt(val);
  });

  startLevelInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") startBtn.click();
  });

  startLevelInput.addEventListener("input", function(){
    var val = parseInt(startLevelInput.value, 10);
    if (Number.isFinite(val) && val >= 1) saveWarmupLevel(val);
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

  levelDownBtn.addEventListener("click", function(){
    if (!canDecreaseLevel()) return;
    startAt(state.level - 1);
  });

  levelUpBtn.addEventListener("click", function(){
    if (state.level === null) return;
    startAt(state.level + 1);
  });

  window.addEventListener("resize", positionLevelNavButtons);

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
  var dataModalMode = "import";

  // Everything the app keeps in localStorage, combined into one editable JSON blob.
  function buildFullSettings(){
    var settings = {};
    var warmup = readStoredWarmupLevel();
    if (warmup !== null) settings.warmupLevel = warmup;
    if (activeRawData) settings.levels = activeRawData;
    return settings;
  }

  function openDataModal(mode){
    dataModalError.hidden = true;
    dataModalError.textContent = "";
    dataModalMode = mode;
    if (mode === "import"){
      dataModalTitle.textContent = "Import Level Data";
      dataTextarea.value = "";
      dataTextarea.placeholder = "Paste level data JSON here…";
    } else {
      dataModalTitle.textContent = "App Data (Local Storage)";
      var settings = buildFullSettings();
      dataTextarea.value = Object.keys(settings).length ? JSON.stringify(settings, null, 2) : "";
      dataTextarea.placeholder = "Paste app data JSON here…";
    }
    dataModal.hidden = false;
    dataTextarea.focus();
  }

  function closeDataModal(){
    dataModal.hidden = true;
  }

  // Clears every setting the app keeps in localStorage and returns to the pre-save state.
  function clearAllData(){
    try { localStorage.removeItem(STORAGE_KEY); } catch (e){}
    clearWarmupLevel();
    activeRawData = null;
    levelData = null;
    levelKeys = null;
    state.level = null;
    state.attemptIndex = 0;
    lastLevelText = null;
    lastTargetText = null;
    lastTargetValue = null;
    lastAvSinglesValue = null;
    lastAvDoublesValue = null;
    startLevelInput.value = "";
    closeDataModal();
    showScreen("setup");
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
    var raw = dataTextarea.value.trim();

    if (dataModalMode === "import"){
      if (raw === ""){
        dataModalError.textContent = "Paste level data JSON to import.";
        dataModalError.hidden = false;
        return;
      }
      var importedLevels;
      try {
        importedLevels = JSON.parse(raw);
      } catch (e){
        dataModalError.textContent = "Invalid JSON: " + e.message;
        dataModalError.hidden = false;
        return;
      }
      var importCheck = validateLevelData(importedLevels);
      if (!importCheck.valid){
        dataModalError.textContent = importCheck.error;
        dataModalError.hidden = false;
        return;
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(importedLevels)); } catch (e){}
      setActiveData(importedLevels);
      closeDataModal();
      if (state.level !== null) render();
      return;
    }

    // "view" mode edits every localStorage-backed setting at once.
    if (raw === "" || raw === "{}"){
      clearAllData();
      return;
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e){
      dataModalError.textContent = "Invalid JSON: " + e.message;
      dataModalError.hidden = false;
      return;
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)){
      dataModalError.textContent = "Top-level JSON must be an object with \"warmupLevel\" and/or \"levels\".";
      dataModalError.hidden = false;
      return;
    }

    if (Object.keys(parsed).length === 0){
      clearAllData();
      return;
    }

    if (parsed.levels !== undefined){
      var levelsCheck = validateLevelData(parsed.levels);
      if (!levelsCheck.valid){
        dataModalError.textContent = "levels: " + levelsCheck.error;
        dataModalError.hidden = false;
        return;
      }
    }

    if (parsed.warmupLevel !== undefined && (typeof parsed.warmupLevel !== "number" || !Number.isFinite(parsed.warmupLevel) || parsed.warmupLevel < 1)){
      dataModalError.textContent = "\"warmupLevel\" must be a positive number.";
      dataModalError.hidden = false;
      return;
    }

    if (parsed.levels !== undefined){
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.levels)); } catch (e){}
      setActiveData(parsed.levels);
    } else {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e){}
      activeRawData = null;
      levelData = null;
      levelKeys = null;
    }

    if (parsed.warmupLevel !== undefined){
      saveWarmupLevel(parsed.warmupLevel);
      startLevelInput.value = parsed.warmupLevel;
    } else {
      clearWarmupLevel();
      startLevelInput.value = "";
    }

    closeDataModal();

    if (state.level !== null && getConfig(state.level)){
      render();
    } else {
      state.level = null;
      state.attemptIndex = 0;
      lastLevelText = null;
      lastTargetText = null;
      lastTargetValue = null;
      lastAvSinglesValue = null;
      lastAvDoublesValue = null;
      showScreen("setup");
    }
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

  // ---- warm-up level prefill ----
  var storedWarmupLevel = readStoredWarmupLevel();
  if (storedWarmupLevel !== null) startLevelInput.value = storedWarmupLevel;

  showScreen("setup");
})();
