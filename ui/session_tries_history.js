(function(window){
  "use strict";

  var UiTools = window.UiTools;

  var sessionScrollEl = document.getElementById("sessionScroll");

  // Tries are grouped into one box per level: a header naming the level, and a
  // row of small cells (one per try) underneath. A new try merges into the
  // strip's last box if its level matches; otherwise it opens a new one. "Last"
  // is read straight from the DOM (not a cached pointer) so that dropping an
  // empty box (one that only ever held the not-yet-resolved pending cell)
  // correctly reveals an earlier box for the same level as last again.
  var pendingGroupEl = null; // the .tries-sequence the pending cell currently lives in

  // The session-progress strip always ends in one "pending" cell: the target the
  // user is about to try right now, inverted yellow with an empty footer (so it
  // still matches the height of resolved cells). It's created once and then just
  // updated in place as the user browses levels — only an actual Pass/Fail "resolves"
  // it into a permanent, footer-tagged cell and opens a fresh pending cell for the
  // next attempt.
  var pendingCellEl = null;
  var pendingBallEl = null;
  var pendingScoreEl = null;
  var pendingStatusEl = null;
  var pendingLevel = null;
  var pendingTarget = null;

  // Resolved tries for the current session, in order, so the strip can be
  // rebuilt after a page reload.
  var triesLog = [];

  // level looks like "S15"/"D15" — split into the pieces buildLevelBall wants.
  function levelParts(level){
    var isDoubles = level.charAt(0) === "D";
    return { isDoubles: isDoubles, typeWord: isDoubles ? "Double" : "Single", num: level.slice(1) };
  }

  // Groups are keyed by level number alone, so S23 and D23 share one group —
  // each cell still shows its own type/level via its own ball.
  function groupHead(groupEl){
    return groupEl.querySelector(".tries-sequence-head").dataset.levelNum;
  }

  function groupCells(groupEl){
    return groupEl.querySelector(".tries-sequence-cells");
  }

  // Reuses the strip's last box if its level number matches; opens a new one otherwise.
  function ensureGroup(numLevel){
    var lastGroupEl = sessionScrollEl.lastElementChild;
    if (lastGroupEl && groupHead(lastGroupEl) === numLevel) return lastGroupEl;

    var groupEl = document.createElement("div");
    groupEl.className = "tries-sequence";

    var headEl = document.createElement("div");
    headEl.className = "tries-sequence-head";
    headEl.dataset.levelNum = numLevel;
    headEl.textContent = numLevel;

    var cellsEl = document.createElement("div");
    cellsEl.className = "tries-sequence-cells";

    groupEl.appendChild(headEl);
    groupEl.appendChild(cellsEl);
    sessionScrollEl.appendChild(groupEl);

    return groupEl;
  }

  function showPending(level, targetScore){
    var parts = levelParts(level);

    if (!pendingCellEl){
      pendingGroupEl = ensureGroup(parts.num);

      pendingCellEl = document.createElement("div");
      pendingCellEl.className = "try-cell pending";

      pendingScoreEl = document.createElement("div");
      pendingScoreEl.className = "try-cell-score";

      pendingStatusEl = document.createElement("div");
      pendingStatusEl.className = "try-cell-status";
      pendingStatusEl.textContent = "";

      pendingBallEl = UiTools.buildLevelBall(parts.typeWord, parts.num, parts.isDoubles, "level-ball--tiny");
      pendingCellEl.appendChild(pendingBallEl);
      pendingCellEl.appendChild(pendingScoreEl);
      pendingCellEl.appendChild(pendingStatusEl);
      groupCells(pendingGroupEl).appendChild(pendingCellEl);
    } else {
      if (parts.num !== groupHead(pendingGroupEl)){
        // User browsed to a different level before resolving the pending try:
        // detach it and drop its box first if that leaves it empty (which may
        // reveal an earlier box for this level as the strip's last one), then
        // place it in (or open) the right box for the new level.
        var oldGroupEl = pendingGroupEl;
        var oldCellsEl = groupCells(oldGroupEl);
        oldCellsEl.removeChild(pendingCellEl);
        if (!oldCellsEl.children.length && oldGroupEl.parentNode){
          oldGroupEl.parentNode.removeChild(oldGroupEl);
        }
        pendingGroupEl = ensureGroup(parts.num);
        groupCells(pendingGroupEl).appendChild(pendingCellEl);
      }

      if (level !== pendingLevel){
        // Type and/or level changed since the pending cell was last shown
        // (a level move, or a same-level type switch that stays in the same
        // group) — rebuild its ball so it reflects the new type/level.
        var newBallEl = UiTools.buildLevelBall(parts.typeWord, parts.num, parts.isDoubles, "level-ball--tiny");
        pendingCellEl.replaceChild(newBallEl, pendingBallEl);
        pendingBallEl = newBallEl;
      }
    }

    pendingScoreEl.innerHTML = UiTools.formatScoreHtml(targetScore);
    pendingLevel = level;
    pendingTarget = targetScore;

    sessionScrollEl.scrollLeft = sessionScrollEl.scrollWidth;
  }

  // Turns the pending cell into a permanent record of the try that just happened.
  function resolveTry(level, success){
    if (!pendingCellEl) return;

    pendingCellEl.classList.remove("pending");
    pendingCellEl.classList.add(success ? "pass" : "fail");

    pendingStatusEl.textContent = success ? "Pass" : "Fail";
    pendingStatusEl.classList.remove("try-cell-status");
    void pendingStatusEl.offsetWidth; // reflow to restart the entrance animation
    pendingStatusEl.classList.add("try-cell-status");

    triesLog.push({ level: pendingLevel, target: pendingTarget, success: success });

    pendingCellEl = null;
    pendingBallEl = null;
    pendingScoreEl = null;
    pendingStatusEl = null;
    pendingLevel = null;
    pendingTarget = null;
  }

  function reset(){
    sessionScrollEl.innerHTML = "";
    pendingGroupEl = null;
    pendingCellEl = null;
    pendingBallEl = null;
    pendingScoreEl = null;
    pendingStatusEl = null;
    pendingLevel = null;
    pendingTarget = null;
    triesLog = [];
  }

  function getTries(){
    return triesLog.slice();
  }

  // The most recent resolved try (pass or fail), if any — used as the AV
  // highlight baseline, since it's already the source of truth for "the last
  // chart actually played" and is already persisted/restored with the strip.
  function getLastTry(){
    return triesLog.length ? triesLog[triesLog.length - 1] : undefined;
  }

  function scrollToEnd(){
    sessionScrollEl.scrollLeft = sessionScrollEl.scrollWidth;
  }

  // Rebuilds the strip from a saved list of resolved tries (e.g. after a page reload).
  function restore(tries){
    reset();
    tries.forEach(function(t){
      showPending(t.level, t.target);
      resolveTry(t.level, t.success);
    });
  }

  // Touch already scrolls this natively; mouse/pen don't support click-drag on an
  // overflow element by default, so we translate pointer movement into scrollLeft.
  function enableDragScroll(el){
    var dragging = false;
    var startX = 0;
    var startScrollLeft = 0;

    el.addEventListener("pointerdown", function(e){
      if (e.pointerType === "touch") return;
      dragging = true;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
      el.classList.add("is-dragging");
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", function(e){
      if (!dragging) return;
      el.scrollLeft = startScrollLeft - (e.clientX - startX);
    });

    function endDrag(e){
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-dragging");
    }
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }
  enableDragScroll(sessionScrollEl);

  window.SessionTriesHistory = {
    showPending: showPending,
    resolveTry: resolveTry,
    reset: reset,
    getTries: getTries,
    getLastTry: getLastTry,
    restore: restore,
    scrollToEnd: scrollToEnd
  };
})(window);
