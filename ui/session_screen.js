(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var UiTools = window.UiTools;
  var SessionTriesHistory = window.SessionTriesHistory;

  var state = { level: null, attemptIndex: 0, avSinglesChanged: true, avDoublesChanged: true };
  var lastLevelText = null;
  var lastTargetText = null;
  var lastTargetValue = null;
  var lastAvSinglesValue = null;
  var lastAvDoublesValue = null;

  // ---- DOM refs ----
  var playEl = document.getElementById("play");

  var levelNumberEl = document.getElementById("levelNumber");
  var levelBurstEl = document.getElementById("levelBurst");
  var avSinglesEl = document.getElementById("avSingles");
  var avDoublesEl = document.getElementById("avDoubles");
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
  function updateAvValue(el, value, changed, previousValue){
    if (value === undefined){
      el.textContent = "N/A";
      el.classList.add("is-na");
      return null;
    }
    el.classList.remove("is-na");
    if (changed && previousValue !== null){
      UiTools.animateCount(el, previousValue, value, 600);
    } else {
      el.textContent = UiTools.formatScore(value);
    }
    return value;
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

  function updateLevelNavButtons(){
    levelDownBtn.classList.toggle("is-disabled", !LevelModel.canDecreaseLevel(state.level));
  }

  function persistSession(){
    if (state.level === null){
      LevelModel.clearSessionState();
      return;
    }
    LevelModel.saveSessionState({
      level: state.level,
      attemptIndex: state.attemptIndex,
      tries: SessionTriesHistory.getTries()
    });
  }

  function render(){
    var config = LevelModel.getConfig(state.level);

    var newLevelText = String(state.level);
    var levelChanged = lastLevelText !== null && newLevelText !== lastLevelText;

    if (!config){
      levelNumberEl.textContent = newLevelText;
      noDataLevelEl.textContent = newLevelText;
      jumpInput.value = state.level;
      window.showScreen("noData");
      lastLevelText = newLevelText;
      lastTargetText = null;
      lastTargetValue = null;
      updateLevelNavButtons();
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

    lastAvSinglesValue = updateAvValue(avSinglesEl, config.avSingles, state.avSinglesChanged, lastAvSinglesValue);
    lastAvDoublesValue = updateAvValue(avDoublesEl, config.avDoubles, state.avDoublesChanged, lastAvDoublesValue);
    avSinglesEl.classList.toggle("is-unchanged", !state.avSinglesChanged);
    avDoublesEl.classList.toggle("is-unchanged", !state.avDoublesChanged);
    SessionTriesHistory.showPending(state.level, target);

    if (targetChanged || levelChanged){
      UiTools.animateCount(targetNumberEl, lastTargetValue !== null ? lastTargetValue : target, target, 600);
    } else {
      targetNumberEl.textContent = newTargetText;
    }
    failBtnScoreEl.textContent = "< " + newTargetText;
    passBtnScoreEl.textContent = "≥ " + newTargetText;

    window.showScreen("play");

    if (levelChanged){
      var levelDirection = Number(newLevelText) < Number(lastLevelText) ? -1 : 1;
      UiTools.wheelText(levelNumberEl, newLevelText, "level-number", levelDirection);
      UiTools.burstGlow(levelBurstEl);
    } else {
      levelNumberEl.textContent = newLevelText;
    }
    if (targetChanged || levelChanged) UiTools.splash(targetNumberEl, targetBurstEl);

    lastLevelText = newLevelText;
    lastTargetText = newTargetText;
    lastTargetValue = target;

    updateLevelNavButtons();
    positionLevelNavButtons();
    persistSession();
  }

  function startAt(level){
    var prevConfig = state.level !== null ? LevelModel.getConfig(state.level) : null;
    var nextConfig = LevelModel.getConfig(level);

    state.avSinglesChanged = !nextConfig || !prevConfig || prevConfig.avSingles !== nextConfig.avSingles;
    state.avDoublesChanged = !nextConfig || !prevConfig || prevConfig.avDoubles !== nextConfig.avDoubles;

    state.level = level;
    state.attemptIndex = 0;
    render();

    if (nextConfig && state.avSinglesChanged) pulse(avSinglesEl);
    if (nextConfig && state.avDoublesChanged) pulse(avDoublesEl);
  }

  function resetToSetup(){
    state.level = null;
    state.attemptIndex = 0;
    lastLevelText = null;
    lastTargetText = null;
    lastTargetValue = null;
    lastAvSinglesValue = null;
    lastAvDoublesValue = null;
    SessionTriesHistory.reset();
    LevelModel.clearSessionState();
    window.showScreen("setup");
  }

  // Resumes a session saved before the last page reload: restores the tries
  // strip, then renders as usual (no animation, since there's no previous
  // on-screen value to animate from).
  function resume(savedState){
    state.level = savedState.level;
    state.attemptIndex = savedState.attemptIndex;
    state.avSinglesChanged = false;
    state.avDoublesChanged = false;
    SessionTriesHistory.restore(savedState.tries);
    render();
    SessionTriesHistory.scrollToEnd();
  }

  // ---- events ----
  passBtn.addEventListener("click", function(){
    SessionTriesHistory.resolveTry(state.level, true);
    startAt(state.level + 1);
  });

  failBtn.addEventListener("click", function(){
    var config = LevelModel.getConfig(state.level);
    if (!config) return;
    var rawScores = config.scores || [];
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;
    SessionTriesHistory.resolveTry(state.level, false);
    if (extendable || state.attemptIndex < rawScores.length - 1) state.attemptIndex += 1;
    render();
  });

  levelDownBtn.addEventListener("click", function(){
    if (!LevelModel.canDecreaseLevel(state.level)) return;
    startAt(state.level - 1);
  });

  levelUpBtn.addEventListener("click", function(){
    if (state.level === null) return;
    startAt(state.level + 1);
  });

  window.addEventListener("resize", positionLevelNavButtons);

  jumpBtn.addEventListener("click", function(){
    var val = parseInt(jumpInput.value, 10);
    if (!Number.isFinite(val) || val < 1) return;
    startAt(val);
  });
  jumpInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") jumpBtn.click();
  });

  window.TrainingSession = {
    start: startAt,
    resume: resume,
    render: render,
    getCurrentLevel: function(){ return state.level; },
    resetSessionHistory: SessionTriesHistory.reset,
    resetToSetup: resetToSetup,
    showSetup: function(){ window.showScreen("setup"); }
  };
})(window);
