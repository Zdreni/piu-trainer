(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var UiTools = window.UiTools;
  var SessionTriesHistory = window.SessionTriesHistory;

  // levels tracks singles/doubles/random progress independently. mode is which
  // one is currently being played; currentType is the S/D letter shown before
  // the level number (fixed for singles/doubles, rolled for random).
  var state = {
    mode: null,
    currentType: null,
    levels: { singles: null, doubles: null, random: null },
    attemptIndex: 0
  };
  var lastLevelText = null;
  var lastLevelValue = null;
  var lastTargetText = null;
  var lastTargetValue = null;
  var lastAvText = null;
  var lastAvValue = null;
  // The AV of the last chart actually tried (pass or fail). Navigating around
  // (level up/down, mode switch, reroll) compares against this without moving
  // it, so browsing back to a level you haven't re-tried doesn't re-highlight.
  var avBaseline;

  // ---- DOM refs ----
  var playEl = document.getElementById("play");

  var modeSinglesBtn = document.getElementById("modeSinglesBtn");
  var modeDoublesBtn = document.getElementById("modeDoublesBtn");
  var modeRandomBtn = document.getElementById("modeRandomBtn");

  var levelNumberEl = document.getElementById("levelNumber");
  var levelBurstEl = document.getElementById("levelBurst");
  var recAvBoxEl = document.querySelector(".rec-av");
  var recAvEl = document.getElementById("recAv");
  var targetNumberEl = document.getElementById("targetNumber");
  var targetBurstEl = document.getElementById("targetBurst");

  var failBtn = document.getElementById("failBtn");
  var passBtn = document.getElementById("passBtn");
  var failBtnScoreEl = document.getElementById("failBtnScore");
  var passBtnScoreEl = document.getElementById("passBtnScore");
  var levelDownBtn = document.getElementById("levelDownBtn");
  var levelUpBtn = document.getElementById("levelUpBtn");

  var noDataLevelEl = document.getElementById("noDataLevel");
  var jumpInput = document.getElementById("jumpInput");
  var jumpBtn = document.getElementById("jumpBtn");

  // ---- helpers ----
  function currentLevel(){
    return state.mode === null ? null : state.levels[state.mode];
  }

  function currentTypeLetter(){
    if (state.mode === "singles") return "S";
    if (state.mode === "doubles") return "D";
    return state.currentType;
  }

  function currentLabel(){
    var level = currentLevel();
    return level === null ? "--" : currentTypeLetter() + level;
  }

  // The recommended AV is whichever of the level's avSingles/avDoubles matches
  // the type currently being played.
  function currentAv(config){
    if (!config) return undefined;
    return currentTypeLetter() === "S" ? config.avSingles : config.avDoubles;
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

  // Matches the recommended-AV badge's width to the level number above it
  // (so it tracks the number's digit count).
  function positionRecAv(){
    if (playEl.hidden) return;
    recAvBoxEl.style.width = levelNumberEl.parentElement.getBoundingClientRect().width + "px";
  }

  function updateLevelNavButtons(){
    levelDownBtn.classList.toggle("is-disabled", !LevelModel.canDecreaseLevel(currentLevel()));
  }

  function updateModeButtons(){
    modeSinglesBtn.classList.toggle("is-active", state.mode === "singles");
    modeDoublesBtn.classList.toggle("is-active", state.mode === "doubles");
    modeRandomBtn.classList.toggle("is-active", state.mode === "random");
  }

  function persistSession(){
    if (state.mode === null){
      LevelModel.clearSessionState();
      return;
    }
    LevelModel.saveSessionState({
      mode: state.mode,
      currentType: state.currentType,
      levels: state.levels,
      attemptIndex: state.attemptIndex,
      tries: SessionTriesHistory.getTries()
    });
  }

  // forceAnim: plays every value's reveal animation even when its text isn't
  // changing — used for a manual mode switch or random reroll (so the level
  // still rolls even if it lands on the same type/level) and for a brand-new
  // session's first render (where there's no previous value to diff against,
  // but everything should still animate in rather than just appear).
  function render(forceAnim){
    var level = currentLevel();
    var config = LevelModel.getConfig(level);

    var newLevelText = currentLabel();
    var levelChanged = lastLevelText !== null && newLevelText !== lastLevelText;
    var levelBaseClass = "level-number" + (currentTypeLetter() === "D" ? " type-doubles" : "");
    levelBurstEl.classList.toggle("type-doubles", currentTypeLetter() === "D");

    if (!config){
      levelNumberEl.className = levelBaseClass;
      levelNumberEl.textContent = newLevelText;
      noDataLevelEl.textContent = newLevelText;
      jumpInput.value = level;
      window.showScreen("noData");
      lastLevelText = newLevelText;
      lastLevelValue = level;
      lastTargetText = null;
      lastTargetValue = null;
      updateLevelNavButtons();
      updateModeButtons();
      persistSession();
      return;
    }

    var rawScores = config.scores || [];
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;
    if (!extendable && state.attemptIndex > rawScores.length - 1) state.attemptIndex = rawScores.length - 1;
    if (state.attemptIndex < 0) state.attemptIndex = 0;

    var scores = LevelModel.resolveScores(rawScores, Math.max(rawScores.length, state.attemptIndex + (extendable ? 2 : 1)));
    var target = scores[state.attemptIndex];
    var newTargetText = UiTools.formatScore(target);
    var targetChanged = lastTargetText !== null && newTargetText !== lastTargetText;

    var avValue = currentAv(config);
    var newAvText = avValue === undefined ? "N/A" : UiTools.formatScore(avValue);
    var avTextChanged = lastAvText !== null && newAvText !== lastAvText;
    recAvBoxEl.hidden = avValue === undefined;
    if (avValue === undefined){
      recAvEl.textContent = "N/A";
      recAvEl.classList.add("is-na");
      recAvEl.classList.remove("is-unchanged");
    } else {
      recAvEl.classList.remove("is-na");
      if (avTextChanged || forceAnim){
        var avFrom = (lastAvValue !== null && lastAvValue !== undefined) ? lastAvValue : 0;
        UiTools.animateCount(recAvEl, avFrom, avValue, 600);
      } else {
        recAvEl.innerHTML = UiTools.formatScoreHtml(avValue);
      }
      // Until a chart's actually been tried there's no baseline to compare
      // against yet, so stay highlighted rather than defaulting to dimmed.
      var avHighlighted = avBaseline === undefined || avValue !== avBaseline;
      recAvEl.classList.toggle("is-unchanged", !avHighlighted);
      if (avTextChanged && avHighlighted) pulse(recAvEl);
    }
    lastAvText = newAvText;
    lastAvValue = avValue;

    SessionTriesHistory.showPending(newLevelText, target);

    if (targetChanged || levelChanged || forceAnim){
      UiTools.animateCount(targetNumberEl, lastTargetValue !== null ? lastTargetValue : 0, target, 600);
    } else {
      targetNumberEl.innerHTML = UiTools.formatScoreHtml(target);
    }
    failBtnScoreEl.innerHTML = "&lt; " + UiTools.formatScoreHtml(target);
    passBtnScoreEl.innerHTML = "&ge; " + UiTools.formatScoreHtml(target);

    window.showScreen("play");

    var animateLevel = levelChanged || forceAnim;
    if (animateLevel){
      var levelDirection = (lastLevelValue !== null && level < lastLevelValue) ? -1 : 1;
      var oldLevelBaseClass = "level-number" + (lastLevelText !== null && lastLevelText.charAt(0) === "D" ? " type-doubles" : "");
      UiTools.wheelText(levelNumberEl, newLevelText, levelBaseClass, levelDirection, forceAnim && !levelChanged, oldLevelBaseClass);
      UiTools.burstGlow(levelBurstEl);
    } else {
      levelNumberEl.className = levelBaseClass;
      levelNumberEl.textContent = newLevelText;
    }
    if (targetChanged || levelChanged || forceAnim) UiTools.splash(targetNumberEl, targetBurstEl);

    lastLevelText = newLevelText;
    lastLevelValue = level;
    lastTargetText = newTargetText;
    lastTargetValue = target;

    updateLevelNavButtons();
    updateModeButtons();
    positionLevelNavButtons();
    positionRecAv();
    persistSession();
  }

  // Moves the current mode's level track to a new level (level up/down, jump,
  // pass). Does not touch the other tracks. In random mode, moving to a
  // different level rerolls the type too.
  function startAt(level){
    state.levels[state.mode] = level;
    state.attemptIndex = 0;
    if (state.mode === "random") state.currentType = Math.random() < 0.5 ? "S" : "D";
    render();
  }

  // Switches which track (singles/doubles/random) is being played. Picks a
  // fresh random type when entering random mode.
  function switchMode(mode){
    var prevMode = state.mode;

    // Entering random mode from a specific type continues at that type's level,
    // rather than snapping to the random track's own (possibly stale) level.
    if (mode === "random" && (prevMode === "singles" || prevMode === "doubles")){
      state.levels.random = state.levels[prevMode];
    }

    state.mode = mode;
    state.currentType = mode === "singles" ? "S" : mode === "doubles" ? "D" : (Math.random() < 0.5 ? "S" : "D");
    state.attemptIndex = 0;

    render(true);
  }

  // Rerolls the type within random mode, keeping the random track's level as-is.
  function rerollRandom(){
    state.currentType = Math.random() < 0.5 ? "S" : "D";
    state.attemptIndex = 0;
    render(true);
  }

  // Begins a brand-new session at `level` for all three tracks (singles,
  // doubles, random), defaulting to random mode.
  function startSession(level){
    state.levels = { singles: level, doubles: level, random: level };
    state.mode = "random";
    state.currentType = Math.random() < 0.5 ? "S" : "D";
    state.attemptIndex = 0;
    avBaseline = undefined;
    render(true);
  }

  function resetToSetup(){
    state.mode = null;
    state.currentType = null;
    state.levels = { singles: null, doubles: null, random: null };
    state.attemptIndex = 0;
    lastLevelText = null;
    lastLevelValue = null;
    lastTargetText = null;
    lastTargetValue = null;
    lastAvText = null;
    lastAvValue = null;
    avBaseline = undefined;
    SessionTriesHistory.reset();
    LevelModel.clearSessionState();
    window.showScreen("setup");
  }

  // Resumes a session saved before the last page reload: restores the tries
  // strip, then renders as usual (no animation, since there's no previous
  // on-screen value to animate from).
  function resume(savedState){
    state.mode = savedState.mode;
    state.currentType = savedState.currentType;
    state.levels = savedState.levels;
    state.attemptIndex = savedState.attemptIndex;
    SessionTriesHistory.restore(savedState.tries);
    render();
    SessionTriesHistory.scrollToEnd();
  }

  // ---- events ----
  passBtn.addEventListener("click", function(){
    var level = currentLevel();
    avBaseline = currentAv(LevelModel.getConfig(level));
    SessionTriesHistory.resolveTry(currentLabel(), true);

    if (state.mode === "random"){
      var oldRandomLevel = state.levels.random;
      if (state.levels.singles <= oldRandomLevel) state.levels.singles += 1;
      if (state.levels.doubles <= oldRandomLevel) state.levels.doubles += 1;
    }

    startAt(level + 1);
  });

  failBtn.addEventListener("click", function(){
    var config = LevelModel.getConfig(currentLevel());
    if (!config) return;
    avBaseline = currentAv(config);
    var rawScores = config.scores || [];
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;
    SessionTriesHistory.resolveTry(currentLabel(), false);
    if (extendable || state.attemptIndex < rawScores.length - 1) state.attemptIndex += 1;
    if (state.mode === "random") state.currentType = Math.random() < 0.5 ? "S" : "D";
    render();
  });

  levelDownBtn.addEventListener("click", function(){
    if (!LevelModel.canDecreaseLevel(currentLevel())) return;
    startAt(currentLevel() - 1);
  });

  levelUpBtn.addEventListener("click", function(){
    if (currentLevel() === null) return;
    startAt(currentLevel() + 1);
  });

  modeSinglesBtn.addEventListener("click", function(){
    if (state.mode === "singles") return;
    switchMode("singles");
  });

  modeDoublesBtn.addEventListener("click", function(){
    if (state.mode === "doubles") return;
    switchMode("doubles");
  });

  modeRandomBtn.addEventListener("click", function(){
    if (state.mode !== "random"){
      switchMode("random");
    } else {
      rerollRandom();
    }
  });

  window.addEventListener("resize", positionLevelNavButtons);
  window.addEventListener("resize", positionRecAv);

  jumpBtn.addEventListener("click", function(){
    var val = parseInt(jumpInput.value, 10);
    if (!Number.isFinite(val) || val < 1) return;
    startAt(val);
  });
  jumpInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") jumpBtn.click();
  });

  window.TrainingSession = {
    start: startSession,
    resume: resume,
    render: render,
    getCurrentLevel: function(){ return currentLevel(); },
    resetSessionHistory: SessionTriesHistory.reset,
    resetToSetup: resetToSetup
  };
})(window);
