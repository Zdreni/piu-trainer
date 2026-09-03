(function(window){
  "use strict";

  var STORAGE_KEY = "piuTrainerData";

  // Legacy pre-migration keys, each holding one piece of what now lives
  // together under STORAGE_KEY. Only read once, to migrate existing users.
  var LEGACY_LEVEL_DATA_KEY = "piuTrainerLevelData";
  var LEGACY_WARMUP_LEVEL_KEY = "piuTrainerWarmupLevel";
  var LEGACY_SESSION_KEY = "piuTrainerSessionState";

  var MIN_LEVEL = 1;
  var MAX_LEVEL = 28;
  var DEFAULT_WARMUP_LEVEL = 10;

  var PROFILE_CURRENT_VERSION = 1;

  // Level data's root may carry a numeric "version" alongside the level entries,
  // for future migrations of the level data format. Absent means version 0.
  function getProfileVersion(raw){
    return raw && typeof raw.version === "number" && Number.isFinite(raw.version) ? raw.version : 0;
  }

  // v0 keyed each level directly to its config: { "10": { scores, avSingles, avDoubles }, ... }.
  // v1 instead keys each field to a level->value dict: { scores: { "10": [...] }, avSingles: { "10": ... }, ... },
  // so a level that only overrides one field doesn't need to repeat the others.
  function convertProfileV0ToV1(raw){
    var converted = { version: 1, scores: {}, avSingles: {}, avDoubles: {} };
    Object.keys(raw).forEach(function(level){
      if (level === "version") return;
      var entry = raw[level];
      if (!entry || typeof entry !== "object") return;
      if ("scores" in entry) converted.scores[level] = entry.scores;
      if ("avSingles" in entry && entry.avSingles !== undefined) converted.avSingles[level] = entry.avSingles;
      if ("avDoubles" in entry && entry.avDoubles !== undefined) converted.avDoubles[level] = entry.avDoubles;
    });
    return converted;
  }

  function validateProfileV0(data){
    if (data === null || typeof data !== "object" || Array.isArray(data)){
      return { valid: false, error: "Top-level JSON must be an object mapping level numbers to level configs." };
    }
    if ("version" in data && (typeof data.version !== "number" || !Number.isFinite(data.version))){
      return { valid: false, error: "\"version\" must be a number." };
    }
    var keys = Object.keys(data).filter(function(key){ return key !== "version"; });
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

  // Validates a level->value dict (the shape each of v1's "scores"/"avSingles"/"avDoubles"
  // fields uses). checkValue validates one entry's value and returns an error string, or
  // null if it's fine.
  function validateLevelKeyedDict(dict, fieldName, checkValue){
    if (dict === null || typeof dict !== "object" || Array.isArray(dict)){
      return { valid: false, error: "\"" + fieldName + "\" must be an object mapping level numbers to values." };
    }
    var keys = Object.keys(dict);
    for (var i = 0; i < keys.length; i++){
      var key = keys[i];
      if (!/^\d+$/.test(key)){
        return { valid: false, error: "\"" + fieldName + "\": level key \"" + key + "\" must be a whole number." };
      }
      var error = checkValue(dict[key]);
      if (error) return { valid: false, error: "\"" + fieldName + "\", level " + key + ": " + error };
    }
    return { valid: true, keys: keys };
  }

  // v1 shape: { version: 1, scores: {level: [numbers]}, avSingles: {level: number}, avDoubles: {level: number} }.
  // avSingles/avDoubles are optional dicts; scores is required and must cover the lowest
  // level (nothing below it to inherit from), same as v0's rule for its lowest level.
  function validateProfileV1(data){
    if (data === null || typeof data !== "object" || Array.isArray(data)){
      return { valid: false, error: "Top-level JSON must be an object." };
    }
    var scoresCheck = validateLevelKeyedDict(data.scores, "scores", function(v){
      var ok = Array.isArray(v) && v.length > 0 && v.every(function(n){
        return typeof n === "number" && Number.isFinite(n);
      });
      return ok ? null : "must be a non-empty array of numbers.";
    });
    if (!scoresCheck.valid) return scoresCheck;
    if (scoresCheck.keys.length === 0){
      return { valid: false, error: "Data is empty — add at least one level under \"scores\"." };
    }
    var minScoreLevel = Math.min.apply(null, scoresCheck.keys.map(Number));

    for (var f = 0; f < 2; f++){
      var fieldName = f === 0 ? "avSingles" : "avDoubles";
      if (data[fieldName] === undefined) continue;
      var fieldCheck = validateLevelKeyedDict(data[fieldName], fieldName, function(v){
        return (typeof v === "number" && Number.isFinite(v)) ? null : "must be a number.";
      });
      if (!fieldCheck.valid) return fieldCheck;
      var belowLowest = fieldCheck.keys.some(function(key){ return Number(key) < minScoreLevel; });
      if (belowLowest){
        return { valid: false, error: "\"" + fieldName + "\" has a level below " + minScoreLevel + ", the lowest level defined in \"scores\"." };
      }
    }

    return { valid: true };
  }

  // Parses+validates level data of either version and always returns it as current-version
  // (v1) data — v0 input is validated against the v0 schema, then converted. `migrated` says
  // whether the caller should persist the (converted) result back over the original.
  function normalizeProfile(data){
    var version = getProfileVersion(data);
    if (version === 0){
      var v0Check = validateProfileV0(data);
      if (!v0Check.valid) return { valid: false, error: v0Check.error };
      return { valid: true, data: convertProfileV0ToV1(data), migrated: true };
    }
    if (version === PROFILE_CURRENT_VERSION){
      var v1Check = validateProfileV1(data);
      if (!v1Check.valid) return { valid: false, error: v1Check.error };
      return { valid: true, data: data, migrated: false };
    }
    return { valid: false, error: "Unsupported profile version: " + version + "." };
  }

  // All app data lives under one localStorage key, shaped as:
  //   { profile: { levelData }, warmupLevel, currentSession, previousSessions }
  // Read-modify-write helpers below load/save the whole blob so each piece
  // of state can still be read, saved, and cleared independently.

  function migrateLegacyData(){
    var migrated = { profile: {}, previousSessions: [] };
    var found = false;
    try {
      var rawLevelData = localStorage.getItem(LEGACY_LEVEL_DATA_KEY);
      if (rawLevelData){
        var parsedLevelData = JSON.parse(rawLevelData);
        if (validateProfileV0(parsedLevelData).valid){
          migrated.profile.levelData = convertProfileV0ToV1(parsedLevelData);
          found = true;
        }
      }
      var rawWarmup = localStorage.getItem(LEGACY_WARMUP_LEVEL_KEY);
      var warmupVal = parseInt(rawWarmup, 10);
      if (Number.isFinite(warmupVal) && warmupVal >= MIN_LEVEL){
        migrated.warmupLevel = warmupVal;
        found = true;
      }
      var rawSession = localStorage.getItem(LEGACY_SESSION_KEY);
      if (rawSession){
        migrated.currentSession = JSON.parse(rawSession);
        found = true;
      }
    } catch (e){
      return null;
    }
    if (!found) return null;
    try {
      localStorage.removeItem(LEGACY_LEVEL_DATA_KEY);
      localStorage.removeItem(LEGACY_WARMUP_LEVEL_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch (e){}
    return migrated;
  }

  function readStoredBlob(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)){
        parsed = migrateLegacyData() || { profile: {}, previousSessions: [] };
        writeStoredBlob(parsed);
      }
      // Pre-"profile" blobs kept this same data under "settings" — migrate it
      // over (once) rather than losing it, but only if "profile" isn't already there.
      var needsRewrite = false;
      if ((!parsed.profile || typeof parsed.profile !== "object") && parsed.settings && typeof parsed.settings === "object"){
        parsed.profile = parsed.settings;
        needsRewrite = true;
      }
      delete parsed.settings;
      if (!parsed.profile || typeof parsed.profile !== "object") parsed.profile = {};
      // warmupLevel used to live inside profile/settings — pull it out to the root.
      if (parsed.warmupLevel === undefined && parsed.profile.warmupLevel !== undefined){
        parsed.warmupLevel = parsed.profile.warmupLevel;
        needsRewrite = true;
      }
      delete parsed.profile.warmupLevel;
      if (!Array.isArray(parsed.previousSessions)) parsed.previousSessions = [];
      if (needsRewrite) writeStoredBlob(parsed);
      return parsed;
    } catch (e){
      return { profile: {}, previousSessions: [] };
    }
  }

  function writeStoredBlob(blob){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(blob)); } catch (e){}
  }

  // Reads level data from storage, upgrading it to the current version in place
  // (persisted immediately) if it was still stored under an older version.
  function readStoredRawData(){
    var blob = readStoredBlob();
    var levelData = blob.profile.levelData;
    if (!levelData) return null;
    var normalized = normalizeProfile(levelData);
    if (!normalized.valid) return null;
    if (normalized.migrated){
      blob.profile.levelData = normalized.data;
      writeStoredBlob(blob);
    }
    return normalized.data;
  }

  function readStoredWarmupLevel(){
    var val = readStoredBlob().warmupLevel;
    return typeof val === "number" && Number.isFinite(val) && val >= MIN_LEVEL ? val : null;
  }

  function saveWarmupLevel(level){
    var blob = readStoredBlob();
    blob.warmupLevel = level;
    writeStoredBlob(blob);
  }

  function clearWarmupLevel(){
    var blob = readStoredBlob();
    delete blob.warmupLevel;
    writeStoredBlob(blob);
  }

  function validTriesArray(tries){
    return Array.isArray(tries) && tries.every(function(t){
      return t && typeof t.level === "string" && typeof t.target === "number" && typeof t.success === "boolean";
    });
  }

  // The in-progress training session (current level, attempt, and resolved tries)
  // so a page reload can resume exactly where the user left off.
  function readSessionState(){
    var parsed = readStoredBlob().currentSession;
    try {
      if (!parsed || typeof parsed !== "object") return null;
      if (parsed.mode !== "singles" && parsed.mode !== "doubles" && parsed.mode !== "random") return null;
      if (parsed.currentType !== "S" && parsed.currentType !== "D") return null;
      var levels = parsed.levels;
      if (!levels || typeof levels !== "object") return null;
      var levelsOk = ["singles", "doubles", "random"].every(function(key){
        var v = levels[key];
        return typeof v === "number" && Number.isFinite(v) && v >= 1;
      });
      if (!levelsOk) return null;
      if (typeof parsed.attemptIndex !== "number" || !Number.isFinite(parsed.attemptIndex) || parsed.attemptIndex < 0) return null;
      if (!validTriesArray(parsed.tries)) return null;
      if ("startedAt" in parsed && parsed.startedAt !== null && typeof parsed.startedAt !== "string") return null;
      return parsed;
    } catch (e){
      return null;
    }
  }

  // Archived sessions (finished, with at least one recorded try), most
  // recently started first. Entries that don't even have a usable tries
  // array are dropped rather than shown broken.
  function readPreviousSessions(){
    try {
      var sessions = readStoredBlob().previousSessions.filter(function(session){
        return session && typeof session === "object" && validTriesArray(session.tries) && session.tries.length > 0;
      });
      sessions.sort(function(a, b){
        return (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0);
      });
      return sessions;
    } catch (e){
      return [];
    }
  }

  // No explicit locale here on purpose: navigator.language is only the
  // browser's UI language, which can differ from the OS's regional format
  // settings (e.g. English UI with non-US date/time conventions). Passing
  // undefined lets the engine fall back to its default locale, which tracks
  // those OS-level regional settings instead. hour12 is forced off regardless
  // of locale, since en-US's AM/PM clock is undesired even when everything
  // else about the US locale (if that's what resolves) is kept.
  function formatSessionDate(iso){
    var ms = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms)) return "Unknown date";
    return new Date(ms).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: false
    });
  }

  function saveSessionState(state){
    var blob = readStoredBlob();
    blob.currentSession = state;
    writeStoredBlob(blob);
  }

  function clearSessionState(){
    var blob = readStoredBlob();
    delete blob.currentSession;
    writeStoredBlob(blob);
  }

  var PREVIOUS_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  // Drops archived sessions older than 30 days. A session whose startedAt
  // can't be parsed is kept rather than guessed at and discarded.
  function pruneOldSessions(previousSessions){
    var cutoff = Date.now() - PREVIOUS_SESSION_MAX_AGE_MS;
    return previousSessions.filter(function(session){
      var startedAt = session && Date.parse(session.startedAt);
      return !Number.isFinite(startedAt) || startedAt >= cutoff;
    });
  }

  // Ends the current session: archives it into previousSessions (unless it
  // never had any tries recorded, e.g. abandoned right at the setup screen)
  // instead of just discarding it, then clears currentSession. Also prunes
  // any archived sessions that are now more than 30 days old.
  function finishSessionState(){
    var blob = readStoredBlob();
    var session = blob.currentSession;
    if (session && Array.isArray(session.tries) && session.tries.length > 0){
      blob.previousSessions.push(session);
    }
    blob.previousSessions = pruneOldSessions(blob.previousSessions);
    delete blob.currentSession;
    writeStoredBlob(blob);
  }

  // Removes one archived session, identified by its startedAt timestamp
  // (unique in practice — two sessions can't start in the same millisecond).
  function deleteSession(startedAt){
    var blob = readStoredBlob();
    blob.previousSessions = blob.previousSessions.filter(function(session){
      return !session || session.startedAt !== startedAt;
    });
    writeStoredBlob(blob);
  }

  var activeRawData = null;
  var levelKeys = null; // ascending numeric level keys present in activeRawData.scores

  function setActiveData(raw){
    activeRawData = raw;
    levelKeys = Object.keys(raw.scores || {}).map(Number).sort(function(a, b){ return a - b; });
  }

  function clearActiveData(){
    activeRawData = null;
    levelKeys = null;
  }

  // Persists level data to storage and makes it the active data set.
  function saveProfile(raw){
    var blob = readStoredBlob();
    blob.profile.levelData = raw;
    writeStoredBlob(blob);
    setActiveData(raw);
  }

  // Clears level data from storage and from the active data set.
  function clearProfile(){
    var blob = readStoredBlob();
    delete blob.profile.levelData;
    writeStoredBlob(blob);
    clearActiveData();
  }

  function getActiveRawData(){
    return activeRawData;
  }

  function getLevelKeys(){
    return levelKeys;
  }

  // delta's sign picks the direction to check (magnitude is ignored): negative
  // for "can this go one lower", positive/zero for "can this go one higher".
  function canStepLevel(level, delta){
    if (level === null) return false;
    if (delta < 0){
      if (level <= 1) return false;
      var lowestLevel = levelKeys && levelKeys.length ? levelKeys[0] : null;
      if (lowestLevel !== null && level <= lowestLevel) return false;
      return true;
    }
    return level < MAX_LEVEL;
  }

  function isValidLevel(val){
    return Number.isFinite(val) && val >= MIN_LEVEL && val <= MAX_LEVEL;
  }

  // Clamped +/- step from `current` (falling back to the default warm-up
  // level when current isn't a valid level, e.g. the input is empty/NaN).
  function stepLevel(current, delta){
    var base = isValidLevel(current) ? current : DEFAULT_WARMUP_LEVEL;
    return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, base + delta));
  }

  // Looks up the value for the nearest level <= target within a level->value dict
  // (v1's "scores"/"avSingles"/"avDoubles" shape), or undefined if none qualifies.
  function nearestFieldValue(dict, target){
    var resolvedKey = null;
    Object.keys(dict || {}).forEach(function(key){
      var num = Number(key);
      if (num <= target && (resolvedKey === null || num > resolvedKey)) resolvedKey = num;
    });
    return resolvedKey === null ? undefined : dict[String(resolvedKey)];
  }

  // A level with no explicit "scores" entry inherits from the nearest lower level that has
  // one; same independently for avSingles/avDoubles. Levels below the lowest scores entry
  // have no config at all (nothing to inherit from — validateProfileV1 guarantees the
  // lowest scores level is also the lowest level defined anywhere in the table).
  function getConfig(level){
    if (!activeRawData || !levelKeys || !levelKeys.length) return undefined;
    var target = Number(level);
    if (target < levelKeys[0]) return undefined;
    var config = { scores: nearestFieldValue(activeRawData.scores, target) };
    var avSingles = nearestFieldValue(activeRawData.avSingles, target);
    var avDoubles = nearestFieldValue(activeRawData.avDoubles, target);
    if (avSingles !== undefined) config.avSingles = avSingles;
    if (avDoubles !== undefined) config.avDoubles = avDoubles;
    return config;
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

  // Default table for a fresh level with no data yet: 990 first try, then -10 per try
  function createDefaultProfile(level){
    var raw = { version: PROFILE_CURRENT_VERSION, scores: {}, avSingles: {}, avDoubles: {} };
    raw.scores[String(level)] = [990, -10];
    return raw;
  }

  var initialStoredRawData = readStoredRawData();
  if (initialStoredRawData) setActiveData(initialStoredRawData);

  window.LevelModel = {
    MIN_LEVEL: MIN_LEVEL,
    MAX_LEVEL: MAX_LEVEL,
    DEFAULT_WARMUP_LEVEL: DEFAULT_WARMUP_LEVEL,
    normalizeProfile: normalizeProfile,
    getProfileVersion: getProfileVersion,
    convertProfileV0ToV1: convertProfileV0ToV1,
    readStoredWarmupLevel: readStoredWarmupLevel,
    saveWarmupLevel: saveWarmupLevel,
    clearWarmupLevel: clearWarmupLevel,
    readSessionState: readSessionState,
    saveSessionState: saveSessionState,
    clearSessionState: clearSessionState,
    finishSessionState: finishSessionState,
    readPreviousSessions: readPreviousSessions,
    deleteSession: deleteSession,
    formatSessionDate: formatSessionDate,
    saveProfile: saveProfile,
    clearProfile: clearProfile,
    getActiveRawData: getActiveRawData,
    getLevelKeys: getLevelKeys,
    canStepLevel: canStepLevel,
    isValidLevel: isValidLevel,
    stepLevel: stepLevel,
    getConfig: getConfig,
    resolveScores: resolveScores,
    createDefaultProfile: createDefaultProfile
  };

  // ---- Training session state ----
  // levels tracks singles/doubles/random progress independently. mode is which
  // one is currently being played; currentType is the S/D letter shown before
  // the level number (fixed for singles/doubles, rolled for random).
  var sessionState = {
    mode: null,
    currentType: null,
    levels: { singles: null, doubles: null, random: null },
    attemptIndex: 0,
    startedAt: null
  };

  function currentLevel(){
    return sessionState.mode === null ? null : sessionState.levels[sessionState.mode];
  }

  function currentChartTypeLetter(){
    if (sessionState.mode === "singles") return "S";
    if (sessionState.mode === "doubles") return "D";
    return sessionState.currentType;
  }

  function currentChartTypeWord(){
    return currentChartTypeLetter() === "D" ? "Double" : "Single";
  }

  function currentLabel(){
    var level = currentLevel();
    return level === null ? "--" : currentChartTypeLetter() + level;
  }

  // The recommended AV is whichever of the level's avSingles/avDoubles matches
  // the type currently being played.
  function currentAv(config){
    if (!config) return undefined;
    return currentChartTypeLetter() === "S" ? config.avSingles : config.avDoubles;
  }

  // The AV for an arbitrary "S15"/"D15"-style label, regardless of what's
  // currently being played — used to look up the AV of the last chart actually
  // tried (see SessionTriesHistory.getLastTry), which doubles as the highlight
  // baseline without needing separate state of our own to track and persist.
  function avForLabel(label){
    if (!label) return undefined;
    var config = getConfig(label.slice(1));
    if (!config) return undefined;
    return label.charAt(0) === "S" ? config.avSingles : config.avDoubles;
  }

  function getMode(){
    return sessionState.mode;
  }

  function getAttemptIndex(){
    return sessionState.attemptIndex;
  }

  // Clamps attemptIndex into the valid range for a level's raw scores table
  // (called before resolving scores for render, since data edits or track
  // switches can leave it pointing past a shorter, non-extendable table).
  function clampAttemptIndex(rawScores){
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;
    if (!extendable && sessionState.attemptIndex > rawScores.length - 1) sessionState.attemptIndex = rawScores.length - 1;
    if (sessionState.attemptIndex < 0) sessionState.attemptIndex = 0;
  }

  // Moves the current mode's level track to a new level (level up/down, jump,
  // pass). Does not touch the other tracks. In random mode, moving to a
  // different level rerolls the type too.
  function startAt(level){
    sessionState.levels[sessionState.mode] = level;
    sessionState.attemptIndex = 0;
    if (sessionState.mode === "random") sessionState.currentType = Math.random() < 0.5 ? "S" : "D";
  }

  // Switches which track (singles/doubles/random) is being played. Picks a
  // fresh random type when entering random mode.
  function switchMode(mode){
    var prevMode = sessionState.mode;

    // Entering random mode from a specific type continues at that type's level,
    // rather than snapping to the random track's own (possibly stale) level.
    if (mode === "random" && (prevMode === "singles" || prevMode === "doubles")){
      sessionState.levels.random = sessionState.levels[prevMode];
    }

    sessionState.mode = mode;
    sessionState.currentType = mode === "singles" ? "S" : mode === "doubles" ? "D" : (Math.random() < 0.5 ? "S" : "D");
    sessionState.attemptIndex = 0;
  }

  // Rerolls the type within random mode, keeping the random track's level as-is.
  function rerollRandom(){
    sessionState.currentType = Math.random() < 0.5 ? "S" : "D";
    sessionState.attemptIndex = 0;
  }

  // Begins a brand-new session at `level` for all three tracks (singles,
  // doubles, random), defaulting to random mode.
  function startSession(level){
    sessionState.levels = { singles: level, doubles: level, random: level };
    sessionState.mode = "random";
    sessionState.currentType = Math.random() < 0.5 ? "S" : "D";
    sessionState.attemptIndex = 0;
    sessionState.startedAt = new Date().toISOString();
  }

  // Clears all session state back to the setup screen's starting point.
  function resetSession(){
    sessionState.mode = null;
    sessionState.currentType = null;
    sessionState.levels = { singles: null, doubles: null, random: null };
    sessionState.attemptIndex = 0;
    sessionState.startedAt = null;
  }

  // Restores session state saved before the last page reload.
  function resumeSession(savedState){
    sessionState.mode = savedState.mode;
    sessionState.currentType = savedState.currentType;
    sessionState.levels = savedState.levels;
    sessionState.attemptIndex = savedState.attemptIndex;
    sessionState.startedAt = savedState.startedAt;
  }

  // Records a pass on the current level: in random mode, bumps the other
  // tracks forward if they haven't already passed this level, then advances
  // the current track to the next level.
  function recordPass(){
    var level = currentLevel();
    if (sessionState.mode === "random"){
      var oldRandomLevel = sessionState.levels.random;
      if (sessionState.levels.singles <= oldRandomLevel) sessionState.levels.singles += 1;
      if (sessionState.levels.doubles <= oldRandomLevel) sessionState.levels.doubles += 1;
    }
    startAt(level + 1);
  }

  // Records a fail on the current level: advances the attempt index (if the
  // level's score table has more entries or is open-ended), and rerolls the
  // type in random mode.
  function recordFail(config){
    var rawScores = config.scores || [];
    var extendable = rawScores.length > 0 && rawScores[rawScores.length - 1] < 0;
    if (extendable || sessionState.attemptIndex < rawScores.length - 1) sessionState.attemptIndex += 1;
    if (sessionState.mode === "random") sessionState.currentType = Math.random() < 0.5 ? "S" : "D";
  }

  // Snapshot used to persist session state to storage (paired with the tries
  // history, which is tracked separately by SessionTriesHistory).
  function getSnapshot(){
    return {
      mode: sessionState.mode,
      currentType: sessionState.currentType,
      levels: sessionState.levels,
      attemptIndex: sessionState.attemptIndex,
      startedAt: sessionState.startedAt
    };
  }

  window.SessionModel = {
    currentLevel: currentLevel,
    currentChartTypeLetter: currentChartTypeLetter,
    currentChartTypeWord: currentChartTypeWord,
    currentLabel: currentLabel,
    currentAv: currentAv,
    avForLabel: avForLabel,
    getMode: getMode,
    getAttemptIndex: getAttemptIndex,
    clampAttemptIndex: clampAttemptIndex,
    startAt: startAt,
    switchMode: switchMode,
    rerollRandom: rerollRandom,
    startSession: startSession,
    resetSession: resetSession,
    resumeSession: resumeSession,
    recordPass: recordPass,
    recordFail: recordFail,
    getSnapshot: getSnapshot
  };
})(window);
