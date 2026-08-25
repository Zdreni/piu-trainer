(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var TrainingSession = window.TrainingSession;

  var startLevelInput = document.getElementById("startLevelInput");
  var startBtn = document.getElementById("startBtn");
  var setupError = document.getElementById("setupError");
  var restartBtn = document.getElementById("restartBtn");

  startBtn.addEventListener("click", function(){
    var val = parseInt(startLevelInput.value, 10);
    if (!Number.isFinite(val) || val < 1){
      setupError.hidden = false;
      return;
    }
    setupError.hidden = true;
    TrainingSession.resetSessionHistory();
    LevelModel.saveWarmupLevel(val);
    if (!LevelModel.getActiveRawData()){
      LevelModel.saveLevelData(LevelModel.createDefaultLevelData(val));
    }
    TrainingSession.start(val);
  });

  startLevelInput.addEventListener("keydown", function(e){
    if (e.key === "Enter") startBtn.click();
  });

  startLevelInput.addEventListener("input", function(){
    var val = parseInt(startLevelInput.value, 10);
    if (Number.isFinite(val) && val >= 1) LevelModel.saveWarmupLevel(val);
  });

  function backToSetup(){
    var storedWarmup = LevelModel.readStoredWarmupLevel();
    startLevelInput.value = storedWarmup !== null ? storedWarmup : 14;
    TrainingSession.resetToSetup();
  }
  restartBtn.addEventListener("click", backToSetup);

  // ---- warm-up level prefill ----
  var storedWarmupLevel = LevelModel.readStoredWarmupLevel();
  if (storedWarmupLevel !== null) startLevelInput.value = storedWarmupLevel;

  window.StartScreen = {
    warmupLevelInput: startLevelInput
  };
})(window);
