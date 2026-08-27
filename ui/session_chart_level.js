(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var SessionModel = window.SessionModel;
  var UiTools = window.UI.Tools;
  var SessionTriesHistory = window.UI.SessionTriesHistory;

  var sessionEl = document.getElementById("session");
  var modeSinglesBtn = document.getElementById("modeSinglesBtn");
  var modeDoublesBtn = document.getElementById("modeDoublesBtn");
  var modeRandomBtn = document.getElementById("modeRandomBtn");
  var levelNumberEl = document.getElementById("levelNumber");
  var levelBurstEl = document.getElementById("levelBurst");
  var levelDownBtn = document.getElementById("levelDownBtn");
  var levelUpBtn = document.getElementById("levelUpBtn");
  var recAvBoxEl = document.querySelector(".rec-av");
  var recAvEl = document.getElementById("recAv");

  // Cached last-rendered values, used only to decide whether render/renderAv
  // need a change animation on the next call. lastLevelText (the "S15"/"D15"
  // label) drives change detection, since a random-mode type reroll changes
  // it without changing lastLevelValue (the bare number, used only for slide
  // direction) — that reroll still needs to animate.
  var lastLevelText = null;
  var lastLevelValue = null;
  var lastAvText = null;
  var lastAvValue = null;

  function pulse(el){
    el.classList.remove("av-pulse");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("av-pulse");
    el.addEventListener("animationend", function handler(){
      el.classList.remove("av-pulse");
      el.removeEventListener("animationend", handler);
    });
  }

  // Beyond the numeric MIN/MAX_LEVEL and lowest-table-key bounds LevelModel.canStepLevel
  // already checks, this also requires the resulting level to actually resolve to a
  // config — the level data table is the real source of truth for what's steppable.
  function canStep(delta){
    var current = SessionModel.currentLevel();
    if (!LevelModel.canStepLevel(current, delta)) return false;
    return LevelModel.getConfig(current + delta) !== undefined;
  }

  function updateNavButtons(){
    levelDownBtn.classList.toggle("is-disabled", !canStep(-1));
    levelUpBtn.classList.toggle("is-disabled", !canStep(1));
  }

  function updateModeButtons(){
    var mode = SessionModel.getMode();
    modeSinglesBtn.classList.toggle("is-active", mode === "singles");
    modeDoublesBtn.classList.toggle("is-active", mode === "doubles");
    modeRandomBtn.classList.toggle("is-active", mode === "random");
  }

  // Vertically centers the level +/- buttons on the level indicator (horizontal position
  // is fixed via CSS at the column's side borders). Uses getBoundingClientRect (not
  // offsetTop) because .number-wrap is itself position:relative, which would otherwise
  // skew levelNumberEl's offset to be relative to that narrow wrapper instead of .session.
  function positionNavButtons(){
    var sessionRect = sessionEl.getBoundingClientRect();
    var numRect = levelNumberEl.getBoundingClientRect();
    var centerY = numRect.top - sessionRect.top + numRect.height / 2;

    levelDownBtn.style.top = centerY + "px";
    levelUpBtn.style.top = centerY + "px";
  }

  // Matches the recommended-AV badge's width to the level number above it
  // (so it tracks the number's digit count).
  function positionRecAv(){
    recAvBoxEl.style.width = levelNumberEl.parentElement.getBoundingClientRect().width + "px";
  }

  // Renders the recommended-AV badge for the current level. avValue is
  // undefined when the level has no recorded AV.
  function renderAv(forceAnim){
    var config = LevelModel.getConfig(SessionModel.currentLevel());
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
      var lastTry = SessionTriesHistory.getLastTry();
      var avBaseline = lastTry ? SessionModel.avForLabel(lastTry.level) : undefined;
      var avHighlighted = avBaseline === undefined || avValue !== avBaseline;
      recAvEl.classList.toggle("is-unchanged", !avHighlighted);
      if (avTextChanged && avHighlighted) pulse(recAvEl);
    }
    lastAvText = newAvText;
    lastAvValue = avValue;
  }

  function reset(){
    lastLevelText = null;
    lastLevelValue = null;
    lastAvText = null;
    lastAvValue = null;
  }

  // Renders the level ball for the current level, sliding it in when it differs
  // from the last-rendered level (or forceAnim is set for a reason outside the
  // level's own value, e.g. a manual mode switch/reroll or a brand-new session's
  // first render) — direction follows whether the level went up or down. Also
  // refreshes the nav/mode buttons to match current session state.
  function render(forceAnim){
    var level = SessionModel.currentLevel();
    var levelText = SessionModel.currentLabel();
    var isDoubles = SessionModel.currentChartTypeLetter() === "D";
    var typeWord = SessionModel.currentChartTypeWord();

    var changed = lastLevelText !== null && levelText !== lastLevelText;
    var direction = (lastLevelValue !== null && level < lastLevelValue) ? -1 : 1;
    var animate = changed || forceAnim;

    levelBurstEl.classList.toggle("type-doubles", isDoubles);

    if (animate){
      // No padding: the ball sits close enough to the mode buttons and AV badge
      // above/below that any padded glow bleed during the slide overlaps them.
      // Clipping flush to the ball's own edge hides the glow while it's moving
      // and lets it reappear cleanly once the new ball settles.
      UiTools.wheelNode(levelNumberEl, levelText, function(){
        return UiTools.buildLevelBall(typeWord, String(level), isDoubles);
      }, direction, forceAnim && !changed, 0);
      UiTools.burstGlow(levelBurstEl);
    } else {
      UiTools.settleWheel(levelNumberEl);
      levelNumberEl.innerHTML = "";
      levelNumberEl.appendChild(UiTools.buildLevelBall(typeWord, String(level), isDoubles));
      levelNumberEl.dataset.wheelKey = levelText;
    }

    updateNavButtons();
    updateModeButtons();
    lastLevelText = levelText;
    lastLevelValue = level;
  }

  // hooks.onStepLevel(delta), hooks.onSwitchMode(mode), hooks.onRerollRandom()
  function init(hooks){
    levelDownBtn.addEventListener("click", function(){
      if (!canStep(-1)) return;
      hooks.onStepLevel(-1);
    });

    levelUpBtn.addEventListener("click", function(){
      if (!canStep(1)) return;
      hooks.onStepLevel(1);
    });

    modeSinglesBtn.addEventListener("click", function(){
      if (SessionModel.getMode() === "singles") return;
      hooks.onSwitchMode("singles");
    });

    modeDoublesBtn.addEventListener("click", function(){
      if (SessionModel.getMode() === "doubles") return;
      hooks.onSwitchMode("doubles");
    });

    modeRandomBtn.addEventListener("click", function(){
      if (SessionModel.getMode() !== "random"){
        hooks.onSwitchMode("random");
      } else {
        hooks.onRerollRandom();
      }
    });
  }

  window.UI.SessionChartLevel = {
    init: init,
    render: render,
    renderAv: renderAv,
    positionNavButtons: positionNavButtons,
    positionRecAv: positionRecAv,
    reset: reset
  };
})(window);
