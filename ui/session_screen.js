(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var SessionModel = window.SessionModel;
  var SessionTriesHistory = window.SessionTriesHistory;
  var SessionChartLevel = window.SessionChartLevel;
  var SessionTryScoreTarget = window.SessionTryScoreTarget;

  // ---- DOM refs ----
  var flowGapEl = document.getElementById("flowGap");

  function makeFlowChevron(){
    var el = document.createElement("div");
    el.className = "flow-chevron";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  // ---- helpers ----
  // Shows only as many route chevrons as fit in the gap between the AV badge
  // and the target score, hiding the ones closest to the score first — so
  // they never overlap each other or bleed into the score below on short
  // viewports. Sizes are read from the live layout rather than assumed, so
  // this stays correct if the CSS is ever tuned.
  function layoutFlowChevrons(){
    if (!flowGapEl) return;

    // Needs at least one chevron in the DOM to measure its rendered size against.
    if (!flowGapEl.firstElementChild) flowGapEl.appendChild(makeFlowChevron());

    var first = flowGapEl.firstElementChild;
    var unitHeight = first.getBoundingClientRect().height;
    var topMargin = parseFloat(getComputedStyle(first).marginTop) || 0;
    var gap = parseFloat(getComputedStyle(flowGapEl).rowGap) || 0;

    var available = flowGapEl.getBoundingClientRect().height;
    var remaining = available - topMargin;
    var count = remaining < unitHeight ? 0 : Math.floor((remaining + gap) / (unitHeight + gap));
    count = Math.max(0, count);

    var current = flowGapEl.children.length;
    for (var i = current; i < count; i++) flowGapEl.appendChild(makeFlowChevron());
    for (var j = current; j > count; j--) flowGapEl.removeChild(flowGapEl.lastElementChild);
  }

  // These three only make sense while the session screen is actually showing
  // (they measure/position elements inside it), so the resize listener is
  // only attached while it's the visible screen, rather than always-on with
  // an internal "am I even visible" guard. Exposed as TrainingSession's
  // onShow/onHide, which window.showScreen invokes on screen transitions.
  function enableSessionResizeHandlers(){
    window.addEventListener("resize", SessionChartLevel.positionNavButtons);
    window.addEventListener("resize", SessionChartLevel.positionRecAv);
    window.addEventListener("resize", layoutFlowChevrons);
  }

  function disableSessionResizeHandlers(){
    window.removeEventListener("resize", SessionChartLevel.positionNavButtons);
    window.removeEventListener("resize", SessionChartLevel.positionRecAv);
    window.removeEventListener("resize", layoutFlowChevrons);
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
    var config = LevelModel.getConfig(SessionModel.currentLevel());

    // The level data table shouldn't have gaps the session can actually land
    // on (nav/mode controls are gated against that), but if one somehow shows
    // up, there's nothing sensible to render — bail out to setup instead.
    if (!config){
      resetToSetup();
      return;
    }

    SessionChartLevel.renderAv(forceAnim);

    SessionTriesHistory.showPending(SessionModel.currentLabel(), SessionTryScoreTarget.getCurrentTarget());

    window.showScreen("session");

    SessionChartLevel.render(forceAnim);
    SessionTryScoreTarget.render(forceAnim);

    SessionChartLevel.positionNavButtons();
    SessionChartLevel.positionRecAv();
    layoutFlowChevrons();
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
    SessionChartLevel.reset();
    SessionTryScoreTarget.reset();
    SessionTriesHistory.reset();
    LevelModel.finishSessionState();
    window.showScreen("setup");
  }

  // Resumes a session saved before the last page reload: restores the tries
  // strip, then renders as usual (no animation, since there's no previous
  // on-screen value to animate from).
  function resume(savedState){
    SessionModel.resumeSession(savedState);
    // The only place attemptIndex is set from an unvalidated source (storage,
    // possibly stale against the currently-loaded level data) rather than
    // already being kept in range by SessionModel's own mutators.
    var config = LevelModel.getConfig(SessionModel.currentLevel());
    if (config) SessionModel.clampAttemptIndex(config.scores || []);
    SessionTriesHistory.restore(savedState.tries);
    render();
    SessionTriesHistory.scrollToEnd();
  }

  // ---- events ----
  SessionTryScoreTarget.init({
    onPass: function(){
      SessionTriesHistory.resolveTry(SessionModel.currentLabel(), true);
      SessionModel.recordPass();
      render();
    },
    onFail: function(){
      var config = LevelModel.getConfig(SessionModel.currentLevel());
      if (!config){
        resetToSetup();
        return;
      }
      SessionTriesHistory.resolveTry(SessionModel.currentLabel(), false);
      SessionModel.recordFail(config);
      render();
    }
  });

  SessionChartLevel.init({
    onStepLevel: function(delta){ startAt(SessionModel.currentLevel() + delta); },
    onSwitchMode: switchMode,
    onRerollRandom: rerollRandom
  });

  window.TrainingSession = {
    start: startSession,
    resume: resume,
    render: render,
    getCurrentLevel: SessionModel.currentLevel,
    resetSessionHistory: SessionTriesHistory.reset,
    resetToSetup: resetToSetup,
    hasTries: function(){ return SessionTriesHistory.getTries().length > 0; },
    onShow: enableSessionResizeHandlers,
    onHide: disableSessionResizeHandlers
  };
})(window);
