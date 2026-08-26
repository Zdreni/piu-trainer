(function(window){
  "use strict";

  // Wires up the import/view-edit-data modal. `hooks` lets the host app react
  // to data changes without this module knowing about the app's own state:
  //   warmupLevelInput  - the setup screen's level input, kept in sync with the saved warmup level
  //   getCurrentLevel() - returns the level currently in play, or null
  //   render()          - re-renders the play screen for the current level
  //   resetToSetup()    - resets app state and shows the setup screen
  function init(hooks){
    var LevelModel = window.LevelModel;

    var importBtn = document.getElementById("importBtn");
    var viewDataBtn = document.getElementById("viewDataBtn");
    var dataModal = document.getElementById("dataModal");
    var dataModalTitle = document.getElementById("dataModalTitle");
    var dataTextarea = document.getElementById("dataTextarea");
    var dataModalError = document.getElementById("dataModalError");
    var copyDataBtn = document.getElementById("copyDataBtn");
    var cancelDataBtn = document.getElementById("cancelDataBtn");
    var saveDataBtn = document.getElementById("saveDataBtn");

    var dataModalMode = "import";

    // Everything the app keeps in localStorage, combined into one editable JSON blob.
    function buildFullSettings(){
      var settings = {};
      var warmup = LevelModel.readStoredWarmupLevel();
      if (warmup !== null) settings.warmupLevel = warmup;
      var activeRawData = LevelModel.getActiveRawData();
      if (activeRawData) settings.levels = activeRawData;
      return settings;
    }

    function openDataModal(mode){
      dataModalError.hidden = true;
      dataModalError.textContent = "";
      dataModalMode = mode;
      if (mode === "import"){
        dataModalTitle.textContent = "Import Level Data";
        dataTextarea.value = "";
        dataTextarea.placeholder = "Paste level data JSON here…";
      } else {
        dataModalTitle.textContent = "App Data (Local Storage)";
        var settings = buildFullSettings();
        dataTextarea.value = Object.keys(settings).length ? JSON.stringify(settings, null, 2) : "";
        dataTextarea.placeholder = "Paste app data JSON here…";
      }
      dataModal.hidden = false;
      dataTextarea.focus();
    }

    function closeDataModal(){
      dataModal.hidden = true;
    }

    // Clears every setting the app keeps in localStorage and returns to the pre-save state.
    function clearAllData(){
      LevelModel.clearLevelData();
      LevelModel.clearWarmupLevel();
      LevelModel.clearSessionState();
      hooks.warmupLevelInput.value = "";
      closeDataModal();
      hooks.resetToSetup();
    }

    importBtn.addEventListener("click", function(){ openDataModal("import"); });
    viewDataBtn.addEventListener("click", function(){ openDataModal("view"); });
    cancelDataBtn.addEventListener("click", closeDataModal);

    dataModal.addEventListener("click", function(e){
      if (e.target === dataModal) closeDataModal();
    });

    document.addEventListener("keydown", function(e){
      if (e.key === "Escape" && !dataModal.hidden) closeDataModal();
    });

    copyDataBtn.addEventListener("click", function(){
      var text = dataTextarea.value;
      function fallbackCopy(){
        dataTextarea.focus();
        dataTextarea.select();
        try { document.execCommand("copy"); } catch (e){}
      }
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      var original = copyDataBtn.textContent;
      copyDataBtn.textContent = "Copied!";
      setTimeout(function(){ copyDataBtn.textContent = original; }, 1200);
    });

    saveDataBtn.addEventListener("click", function(){
      var raw = dataTextarea.value.trim();

      if (dataModalMode === "import"){
        if (raw === ""){
          dataModalError.textContent = "Paste level data JSON to import.";
          dataModalError.hidden = false;
          return;
        }
        var importedLevels;
        try {
          importedLevels = JSON.parse(raw);
        } catch (e){
          dataModalError.textContent = "Invalid JSON: " + e.message;
          dataModalError.hidden = false;
          return;
        }
        var importCheck = LevelModel.validateLevelData(importedLevels);
        if (!importCheck.valid){
          dataModalError.textContent = importCheck.error;
          dataModalError.hidden = false;
          return;
        }
        LevelModel.saveLevelData(importedLevels);
        closeDataModal();
        if (hooks.getCurrentLevel() !== null) hooks.render();
        else window.showScreen("setup");
        return;
      }

      // "view" mode edits every localStorage-backed setting at once.
      if (raw === "" || raw === "{}"){
        clearAllData();
        return;
      }

      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e){
        dataModalError.textContent = "Invalid JSON: " + e.message;
        dataModalError.hidden = false;
        return;
      }

      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)){
        dataModalError.textContent = "Top-level JSON must be an object with \"warmupLevel\" and/or \"levels\".";
        dataModalError.hidden = false;
        return;
      }

      if (Object.keys(parsed).length === 0){
        clearAllData();
        return;
      }

      if (parsed.levels !== undefined){
        var levelsCheck = LevelModel.validateLevelData(parsed.levels);
        if (!levelsCheck.valid){
          dataModalError.textContent = "levels: " + levelsCheck.error;
          dataModalError.hidden = false;
          return;
        }
      }

      if (parsed.warmupLevel !== undefined && (typeof parsed.warmupLevel !== "number" || !Number.isFinite(parsed.warmupLevel) || parsed.warmupLevel < 1)){
        dataModalError.textContent = "\"warmupLevel\" must be a positive number.";
        dataModalError.hidden = false;
        return;
      }

      if (parsed.levels !== undefined){
        LevelModel.saveLevelData(parsed.levels);
      } else {
        LevelModel.clearLevelData();
      }

      if (parsed.warmupLevel !== undefined){
        LevelModel.saveWarmupLevel(parsed.warmupLevel);
        hooks.warmupLevelInput.value = parsed.warmupLevel;
      } else {
        LevelModel.clearWarmupLevel();
        hooks.warmupLevelInput.value = "";
      }

      closeDataModal();

      if (hooks.getCurrentLevel() !== null && LevelModel.getConfig(hooks.getCurrentLevel())){
        hooks.render();
      } else {
        hooks.resetToSetup();
      }
    });
  }

  window.DataModal = { init: init };
})(window);
