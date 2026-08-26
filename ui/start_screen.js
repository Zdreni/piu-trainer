(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var TrainingSession = window.TrainingSession;

  var startLevelInput = document.getElementById("startLevelInput");
  var startLevelDownBtn = document.getElementById("startLevelDownBtn");
  var startLevelUpBtn = document.getElementById("startLevelUpBtn");
  var startBtn = document.getElementById("startBtn");
  var setupError = document.getElementById("setupError");
  var restartBtn = document.getElementById("restartBtn");

  var MIN_LEVEL = LevelModel.MIN_LEVEL;
  var MAX_LEVEL = LevelModel.MAX_LEVEL;

  function inputValue(){
    return parseInt(startLevelInput.value, 10);
  }

  function isValid(val){
    return Number.isFinite(val) && val >= MIN_LEVEL;
  }

  // A level with no reachable table entry (below the lowest defined level,
  // once data already exists) would drop straight into the "no data" screen.
  function hasTableData(val){
    if (!LevelModel.getActiveRawData()) return true;
    return !!LevelModel.getConfig(val);
  }

  function updateControls(){
    var val = inputValue();
    var valid = isValid(val);
    startLevelDownBtn.disabled = valid && !LevelModel.canDecreaseLevel(val);
    startLevelUpBtn.disabled = valid && val >= MAX_LEVEL;
    startBtn.disabled = !valid || !hasTableData(val);
  }

  startBtn.addEventListener("click", function(){
    var val = inputValue();
    if (!isValid(val)){
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
    var current = inputValue();
    var base = isValid(current) ? current : LevelModel.DEFAULT_WARMUP_LEVEL;
    var next = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, base + delta));
    startLevelInput.value = next;
    updateControls();
  }
  startLevelDownBtn.addEventListener("click", function(){ stepLevel(-1); });
  startLevelUpBtn.addEventListener("click", function(){ stepLevel(1); });

  function backToSetup(){
    if (TrainingSession.hasTries() && !window.confirm("Finish this practice session?")) return;
    startLevelInput.value = LevelModel.readStoredWarmupLevel();
    TrainingSession.resetToSetup();
  }
  restartBtn.addEventListener("click", backToSetup);

  // ---- warm-up level prefill ----
  var storedWarmupLevel = LevelModel.readStoredWarmupLevel();
  if (storedWarmupLevel !== null) startLevelInput.value = storedWarmupLevel;
  updateControls();

  window.StartScreen = {
    warmupLevelInput: startLevelInput,
    refreshControls: updateControls
  };
})(window);
