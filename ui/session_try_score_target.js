(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var SessionModel = window.SessionModel;
  var UiTools = window.UiTools;

  var targetNumberEl = document.getElementById("targetNumber");
  var targetBurstEl = document.getElementById("targetBurst");
  var failBtn = document.getElementById("failBtn");
  var passBtn = document.getElementById("passBtn");

  // Cached last-rendered values, used only to decide whether render needs a
  // change animation on the next call.
  var lastLevelText = null;
  var lastTargetText = null;
  var lastTargetValue = null;

  // The current level's target score for the in-progress attempt. Assumes the
  // caller has already confirmed the current level resolves to a config, and
  // that attemptIndex is already in range for it (SessionModel's mutators
  // keep it there, except right after a resume — see session_screen.js).
  function currentTarget(){
    var config = LevelModel.getConfig(SessionModel.currentLevel());
    var rawScores = config.scores || [];
    var attemptIndex = SessionModel.getAttemptIndex();
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;
    var scores = LevelModel.resolveScores(rawScores, Math.max(rawScores.length, attemptIndex + (extendable ? 2 : 1)));
    return scores[attemptIndex];
  }

  // forceAnim: plays the reveal animation even when neither the level nor the
  // target text is changing on its own — the caller passes this in for
  // reasons outside either of those (e.g. a manual mode switch/reroll, or a
  // brand-new session's first render).
  function render(forceAnim){
    var levelText = SessionModel.currentLabel();
    var target = currentTarget();
    var newTargetText = UiTools.formatScore(target);
    // A level move always reveals a "new" target even when its value happens
    // to coincide with the previous one, so it needs to animate too.
    var levelChanged = lastLevelText !== null && levelText !== lastLevelText;
    var changed = forceAnim || levelChanged || (lastTargetText !== null && newTargetText !== lastTargetText);

    if (changed){
      UiTools.animateCount(targetNumberEl, lastTargetValue !== null ? lastTargetValue : 0, target, 600);
      UiTools.splash(targetNumberEl, targetBurstEl);
    } else {
      targetNumberEl.innerHTML = UiTools.formatScoreHtml(target);
    }

    lastLevelText = levelText;
    lastTargetText = newTargetText;
    lastTargetValue = target;
  }

  function reset(){
    lastLevelText = null;
    lastTargetText = null;
    lastTargetValue = null;
  }

  // hooks.onPass(), hooks.onFail()
  function init(hooks){
    passBtn.addEventListener("click", function(){
      hooks.onPass();
    });
    failBtn.addEventListener("click", function(){
      hooks.onFail();
    });
  }

  window.SessionTryScoreTarget = {
    init: init,
    render: render,
    getCurrentTarget: currentTarget,
    reset: reset
  };
})(window);
