(function(window){
  "use strict";

  var STORAGE_KEY = "piuTrainerLevelData";
  var WARMUP_LEVEL_KEY = "piuTrainerWarmupLevel";

  // Merges each explicitly-listed level's config forward onto the next
  // (so a level entry only needs to specify what changed since the one below it).
  function fillGaps(raw){
    var result = {};
    var prev = null;
    Object.keys(raw).sort(function(a, b){ return Number(a) - Number(b); }).forEach(function(key){
      var merged = Object.assign({}, prev, raw[key]);
      result[key] = merged;
      prev = merged;
    });
    return result;
  }

  function validateLevelData(data){
    if (data === null || typeof data !== "object" || Array.isArray(data)){
      return { valid: false, error: "Top-level JSON must be an object mapping level numbers to level configs." };
    }
    var keys = Object.keys(data);
    if (keys.length === 0){
      return { valid: false, error: "Data is empty — add at least one level." };
    }
    var minKey = null;
    for (var i = 0; i < keys.length; i++){
      var key = keys[i];
      if (!/^\d+$/.test(key)){
        return { valid: false, error: "Level key \"" + key + "\" must be a whole number." };
      }
      if (minKey === null || Number(key) < Number(minKey)) minKey = key;

      var entry = data[key];
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)){
        return { valid: false, error: "Level " + key + " must map to an object (use {} for an empty entry)." };
      }
      if ("scores" in entry){
        var scores = entry.scores;
        var scoresOk = Array.isArray(scores) && scores.length > 0 && scores.every(function(n){
          return typeof n === "number" && Number.isFinite(n);
        });
        if (!scoresOk){
          return { valid: false, error: "Level " + key + ": \"scores\" must be a non-empty array of numbers." };
        }
      }
      if ("avSingles" in entry && entry.avSingles !== undefined && (typeof entry.avSingles !== "number" || !Number.isFinite(entry.avSingles))){
        return { valid: false, error: "Level " + key + ": \"avSingles\" must be a number." };
      }
      if ("avDoubles" in entry && entry.avDoubles !== undefined && (typeof entry.avDoubles !== "number" || !Number.isFinite(entry.avDoubles))){
        return { valid: false, error: "Level " + key + ": \"avDoubles\" must be a number." };
      }
    }

    // The lowest level has nothing below it to inherit from, so it must specify scores.
    // AV (singles/doubles) is optional at any level — if absent, it's shown as N/A.
    var lowest = data[minKey];
    if (!Array.isArray(lowest.scores) || lowest.scores.length === 0){
      return { valid: false, error: "Level " + minKey + " is the lowest level in the table and must specify \"scores\" — there's nothing below it to inherit from." };
    }

    return { valid: true };
  }

  function readStoredRawData(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return validateLevelData(parsed).valid ? parsed : null;
    } catch (e){
      return null;
    }
  }

  function readStoredWarmupLevel(){
    try {
      var raw = localStorage.getItem(WARMUP_LEVEL_KEY);
      var val = parseInt(raw, 10);
      return Number.isFinite(val) && val >= 1 ? val : null;
    } catch (e){
      return null;
    }
  }

  function saveWarmupLevel(level){
    try { localStorage.setItem(WARMUP_LEVEL_KEY, String(level)); } catch (e){}
  }

  function clearWarmupLevel(){
    try { localStorage.removeItem(WARMUP_LEVEL_KEY); } catch (e){}
  }

  var activeRawData = null;
  var levelData = null;
  var levelKeys = null; // ascending numeric level keys present in levelData

  function setActiveData(raw){
    activeRawData = raw;
    levelData = fillGaps(raw);
    levelKeys = Object.keys(levelData).map(Number).sort(function(a, b){ return a - b; });
  }

  function clearActiveData(){
    activeRawData = null;
    levelData = null;
    levelKeys = null;
  }

  // Persists level data to storage and makes it the active data set.
  function saveLevelData(raw){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(raw)); } catch (e){}
    setActiveData(raw);
  }

  // Clears level data from storage and from the active data set.
  function clearLevelData(){
    try { localStorage.removeItem(STORAGE_KEY); } catch (e){}
    clearActiveData();
  }

  function getActiveRawData(){
    return activeRawData;
  }

  function getLevelKeys(){
    return levelKeys;
  }

  function canDecreaseLevel(level){
    if (level === null || level <= 1) return false;
    var lowestLevel = levelKeys && levelKeys.length ? levelKeys[0] : null;
    if (lowestLevel !== null && level <= lowestLevel) return false;
    return true;
  }

  // A level with no explicit table entry inherits from the nearest lower level that has one.
  function getConfig(level){
    if (!levelKeys) return undefined;
    var target = Number(level);
    var resolvedKey = null;
    for (var i = 0; i < levelKeys.length; i++){
      if (levelKeys[i] > target) break;
      resolvedKey = levelKeys[i];
    }
    return resolvedKey === null ? undefined : levelData[String(resolvedKey)];
  }

  // Resolves a level's raw "scores" config into absolute target values. A negative
  // entry means "subtract this much from the previous target" rather than being an
  // absolute score. If the raw array's last entry is negative, that same gap keeps
  // getting subtracted for every attempt beyond the array (unlimited fails).
  function resolveScores(rawScores, count){
    var resolved = [];
    var prev = null;
    for (var i = 0; i < rawScores.length; i++){
      var v = rawScores[i];
      var value = (v < 0 && prev !== null) ? prev + v : v;
      resolved.push(value);
      prev = value;
    }
    var lastRaw = rawScores[rawScores.length - 1];
    if (lastRaw < 0){
      while (resolved.length < count){
        prev = prev + lastRaw;
        resolved.push(prev);
      }
    }
    return resolved;
  }

  // Default table for a fresh level with no data yet: 990 first try, then -5 per
  // subsequent try forever (resolveScores keeps subtracting the trailing -5).
  function createDefaultLevelData(level){
    var raw = {};
    raw[String(level)] = { scores: [990, -5] };
    return raw;
  }

  var initialStoredRawData = readStoredRawData();
  if (initialStoredRawData) setActiveData(initialStoredRawData);

  window.LevelModel = {
    validateLevelData: validateLevelData,
    readStoredWarmupLevel: readStoredWarmupLevel,
    saveWarmupLevel: saveWarmupLevel,
    clearWarmupLevel: clearWarmupLevel,
    saveLevelData: saveLevelData,
    clearLevelData: clearLevelData,
    getActiveRawData: getActiveRawData,
    getLevelKeys: getLevelKeys,
    canDecreaseLevel: canDecreaseLevel,
    getConfig: getConfig,
    resolveScores: resolveScores,
    createDefaultLevelData: createDefaultLevelData
  };
})(window);
