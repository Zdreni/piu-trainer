(function(){
  "use strict";

  var DataModal = window.DataModal;
  var TrainingSession = window.TrainingSession;
  var StartScreen = window.StartScreen;
  var HistoryScreen = window.HistoryScreen;
  var LevelModel = window.LevelModel;

  var restartBtn = document.getElementById("restartBtn");
  var fullscreenBtn = document.getElementById("fullscreenBtn");
  var historyBtn = document.getElementById("historyBtn");

  // Each screen's own onShow/onHide (when it defines them) is invoked as
  // window.showScreen transitions into or out of it, so this module only
  // needs to know which element and screen object go with which name.
  var screens = {
    setup: { el: document.getElementById("setup"), screen: StartScreen },
    session: { el: document.getElementById("session"), screen: TrainingSession },
    history: { el: document.getElementById("history"), screen: HistoryScreen }
  };

  var currentScreenName = null;

  function showScreen(name){
    var current = currentScreenName && screens[currentScreenName];
    if (current && current.screen && current.screen.onHide) current.screen.onHide();

    Object.keys(screens).forEach(function(key){
      screens[key].el.hidden = key !== name;
    });
    restartBtn.classList.toggle("is-hidden", name === "setup");
    var restartLabel = name === "history" ? "Back" : "Finish session";
    restartBtn.title = restartLabel;
    restartBtn.setAttribute("aria-label", restartLabel);

    var next = screens[name];
    if (next && next.screen && next.screen.onShow) next.screen.onShow();

    currentScreenName = name;
  }
  window.showScreen = showScreen;

  historyBtn.addEventListener("click", function(){
    showScreen("history");
  });

  // ---- data import / view-edit modal ----
  DataModal.init({
    warmupLevelInput: StartScreen.warmupLevelInput,
    getCurrentLevel: TrainingSession.getCurrentLevel,
    render: TrainingSession.render,
    resetToSetup: TrainingSession.resetToSetup
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

  // ---- initial screen ----
  // Resume an in-progress session across page reloads, if one was saved and
  // its level data is still around.
  var savedSession = LevelModel.readSessionState();
  if (savedSession && LevelModel.getActiveRawData()){
    TrainingSession.resume(savedSession);
  } else {
    showScreen("setup");
  }
})();
