(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var TrainingSession = window.UI.TrainingSession;

  var startLevelInput = document.getElementById("startLevelInput");
  var startLevelDownBtn = document.getElementById("startLevelDownBtn");
  var startLevelUpBtn = document.getElementById("startLevelUpBtn");
  var startBtn = document.getElementById("startBtn");
  var setupError = document.getElementById("setupError");
  var importBtn = document.getElementById("importBtn");
  var viewDataBtn = document.getElementById("viewDataBtn");

  function levelInputValue(){
    return parseInt(startLevelInput.value, 10);
  }

  // A level with no reachable table entry (below the lowest defined level,
  // once data already exists) would drop straight into the "no data" screen.
  function hasTableData(val){
    if (!LevelModel.getActiveRawData()) return true;
    return !!LevelModel.getConfig(val);
  }

  function updateControls(){
    var val = levelInputValue();
    var valid = LevelModel.isValidLevel(val);
    startLevelDownBtn.disabled = valid && !LevelModel.canStepLevel(val, -1);
    startLevelUpBtn.disabled = valid && !LevelModel.canStepLevel(val, 1);
    startBtn.disabled = !valid || !hasTableData(val);
  }

  function onShow(){
    var hasData = !!LevelModel.getActiveRawData();
    importBtn.hidden = false;
    viewDataBtn.hidden = !hasData;
    updateControls();
  }

  startBtn.addEventListener("click", function(){
    var val = levelInputValue();
    if (!LevelModel.isValidLevel(val)){
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

  startLevelInput.addEventListener("input", updateControls);

  function stepLevel(delta){
    startLevelInput.value = LevelModel.stepLevel(levelInputValue(), delta);
    updateControls();
  }
  startLevelDownBtn.addEventListener("click", function(){ stepLevel(-1); });
  startLevelUpBtn.addEventListener("click", function(){ stepLevel(1); });

  window.UI.SessionFinishConfirmation.init({
    onConfirm: function(){
      startLevelInput.value = LevelModel.readStoredWarmupLevel();
      TrainingSession.resetToSetup();
    }
  });

  // ---- warm-up level prefill ----
  var storedWarmupLevel = LevelModel.readStoredWarmupLevel();
  if (storedWarmupLevel !== null) startLevelInput.value = storedWarmupLevel;
  updateControls();

  window.UI.StartScreen = {
    warmupLevelInput: startLevelInput,
    onShow: onShow
  };
})(window);
