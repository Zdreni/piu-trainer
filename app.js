(function(){
  "use strict";

  var DataModal = window.DataModal;
  var TrainingSession = window.TrainingSession;
  var StartScreen = window.StartScreen;
  var HistoryScreen = window.HistoryScreen;
  var LevelModel = window.LevelModel;

  var setupEl = document.getElementById("setup");
  var playEl = document.getElementById("play");
  var noDataEl = document.getElementById("noData");
  var historyEl = document.getElementById("history");
  var restartBtn = document.getElementById("restartBtn");
  var fullscreenBtn = document.getElementById("fullscreenBtn");
  var importBtn = document.getElementById("importBtn");
  var viewDataBtn = document.getElementById("viewDataBtn");
  var historyBtn = document.getElementById("historyBtn");

  function showScreen(name){
    setupEl.hidden = name !== "setup";
    playEl.hidden = name !== "play";
    noDataEl.hidden = name !== "noData";
    historyEl.hidden = name !== "history";
    restartBtn.classList.toggle("is-hidden", name === "setup");
    var restartLabel = name === "history" ? "Back" : "Finish session";
    restartBtn.title = restartLabel;
    restartBtn.setAttribute("aria-label", restartLabel);
    if (name === "setup"){
      var hasData = !!LevelModel.getActiveRawData();
      importBtn.hidden = false;
      viewDataBtn.hidden = !hasData;
      StartScreen.refreshControls();
    }
    if (name === "history"){
      HistoryScreen.render();
    }
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
