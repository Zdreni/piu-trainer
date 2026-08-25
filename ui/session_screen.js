(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var SessionModel = window.SessionModel;
  var UiTools = window.UiTools;
  var SessionTriesHistory = window.SessionTriesHistory;

  // Cached last-rendered display values, used only to decide which pieces
  // need a change animation on the next render.
  var lastLevelText = null;
  var lastLevelValue = null;
  var lastTargetText = null;
  var lastTargetValue = null;
  var lastAvText = null;
  var lastAvValue = null;

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
    levelDownBtn.classList.toggle("is-disabled", !LevelModel.canDecreaseLevel(SessionModel.currentLevel()));
  }

  function updateModeButtons(){
    var mode = SessionModel.getMode();
    modeSinglesBtn.classList.toggle("is-active", mode === "singles");
    modeDoublesBtn.classList.toggle("is-active", mode === "doubles");
    modeRandomBtn.classList.toggle("is-active", mode === "random");
  }

  function persistSession(){
    if (SessionModel.getMode() === null){
      LevelModel.clearSessionState();
      return;
    }
    var payload = SessionModel.getSnapshot();
    payload.tries = SessionTriesHistory.getTries();
    LevelModel.saveSessionState(payload);
  }

  // forceAnim: plays every value's reveal animation even when its text isn't
  // changing — used for a manual mode switch or random reroll (so the level
  // still rolls even if it lands on the same type/level) and for a brand-new
  // session's first render (where there's no previous value to diff against,
  // but everything should still animate in rather than just appear).
  function render(forceAnim){
    var level = SessionModel.currentLevel();
    var config = LevelModel.getConfig(level);

    var newLevelText = SessionModel.currentLabel();
    var levelChanged = lastLevelText !== null && newLevelText !== lastLevelText;
    var levelBaseClass = "level-number" + (SessionModel.currentTypeLetter() === "D" ? " type-doubles" : "");
    levelBurstEl.classList.toggle("type-doubles", SessionModel.currentTypeLetter() === "D");

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
    SessionModel.clampAttemptIndex(rawScores);
    var attemptIndex = SessionModel.getAttemptIndex();
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;

    var scores = LevelModel.resolveScores(rawScores, Math.max(rawScores.length, attemptIndex + (extendable ? 2 : 1)));
    var target = scores[attemptIndex];
    var newTargetText = UiTools.formatScore(target);
    var targetChanged = lastTargetText !== null && newTargetText !== lastTargetText;

    var avValue = SessionModel.currentAv(config);
    var newAvText = avValue === undefined ? "N/A" : UiTools.formatAv(avValue);
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
        UiTools.animateCount(recAvEl, avFrom, avValue, 600, UiTools.formatAv);
      } else {
        recAvEl.innerHTML = UiTools.formatAv(avValue);
      }
      // Until a chart's actually been tried there's no baseline to compare
      // against yet, so stay highlighted rather than defaulting to dimmed.
      var avBaseline = SessionModel.getAvBaseline();
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
  // pass) and re-renders.
  function startAt(level){
    SessionModel.startAt(level);
    render();
  }

  // Switches which track (singles/doubles/random) is being played and re-renders.
  function switchMode(mode){
    SessionModel.switchMode(mode);
    render(true);
  }

  // Rerolls the type within random mode and re-renders.
  function rerollRandom(){
    SessionModel.rerollRandom();
    render(true);
  }

  // Begins a brand-new session at `level` for all three tracks (singles,
  // doubles, random), defaulting to random mode.
  function startSession(level){
    SessionModel.startSession(level);
    render(true);
  }

  function resetToSetup(){
    SessionModel.resetSession();
    lastLevelText = null;
    lastLevelValue = null;
    lastTargetText = null;
    lastTargetValue = null;
    lastAvText = null;
    lastAvValue = null;
    SessionTriesHistory.reset();
    LevelModel.clearSessionState();
    window.showScreen("setup");
  }

  // Resumes a session saved before the last page reload: restores the tries
  // strip, then renders as usual (no animation, since there's no previous
  // on-screen value to animate from).
  function resume(savedState){
    SessionModel.resumeSession(savedState);
    SessionTriesHistory.restore(savedState.tries);
    render();
    SessionTriesHistory.scrollToEnd();
  }

  // ---- events ----
  passBtn.addEventListener("click", function(){
    var level = SessionModel.currentLevel();
    SessionModel.setAvBaseline(SessionModel.currentAv(LevelModel.getConfig(level)));
    SessionTriesHistory.resolveTry(SessionModel.currentLabel(), true);
    SessionModel.recordPass();
    render();
  });

  failBtn.addEventListener("click", function(){
    var config = LevelModel.getConfig(SessionModel.currentLevel());
    if (!config) return;
    SessionModel.setAvBaseline(SessionModel.currentAv(config));
    SessionTriesHistory.resolveTry(SessionModel.currentLabel(), false);
    SessionModel.recordFail(config);
    render();
  });

  levelDownBtn.addEventListener("click", function(){
    if (!LevelModel.canDecreaseLevel(SessionModel.currentLevel())) return;
    startAt(SessionModel.currentLevel() - 1);
  });

  levelUpBtn.addEventListener("click", function(){
    if (SessionModel.currentLevel() === null) return;
    startAt(SessionModel.currentLevel() + 1);
  });

  modeSinglesBtn.addEventListener("click", function(){
    if (SessionModel.getMode() === "singles") return;
    switchMode("singles");
  });

  modeDoublesBtn.addEventListener("click", function(){
    if (SessionModel.getMode() === "doubles") return;
    switchMode("doubles");
  });

  modeRandomBtn.addEventListener("click", function(){
    if (SessionModel.getMode() !== "random"){
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
    getCurrentLevel: SessionModel.currentLevel,
    resetSessionHistory: SessionTriesHistory.reset,
    resetToSetup: resetToSetup
  };
})(window);
