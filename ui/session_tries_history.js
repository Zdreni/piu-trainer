(function(window){
  "use strict";

  var UiTools = window.UiTools;

  var sessionScrollEl = document.getElementById("sessionScroll");

  // Tries are grouped into one box per level: a header naming the level, and a
  // row of small cells (one per try) underneath. The box for the level currently
  // being played is reused across renders — only a level change opens a new one.
  var currentGroupEl = null;
  var currentGroupLevel = null;
  var currentGroupCellsEl = null;

  // The session-progress strip always ends in one "pending" cell: the target the
  // user is about to try right now, inverted yellow with an empty footer (so it
  // still matches the height of resolved cells). It's created once and then just
  // updated in place as the user browses levels — only an actual Pass/Fail "resolves"
  // it into a permanent, footer-tagged cell and opens a fresh pending cell for the
  // next attempt.
  var pendingCellEl = null;
  var pendingScoreEl = null;
  var pendingStatusEl = null;
  var pendingLevel = null;
  var pendingTarget = null;

  // Resolved tries for the current session, in order, so the strip can be
  // rebuilt after a page reload.
  var triesLog = [];

  function ensureGroup(level){
    if (currentGroupCellsEl && currentGroupLevel === level) return currentGroupCellsEl;

    var groupEl = document.createElement("div");
    groupEl.className = "tries-sequence";

    var headEl = document.createElement("div");
    headEl.className = "tries-sequence-head";
    headEl.textContent = level;

    var cellsEl = document.createElement("div");
    cellsEl.className = "tries-sequence-cells";

    groupEl.appendChild(headEl);
    groupEl.appendChild(cellsEl);
    sessionScrollEl.appendChild(groupEl);

    currentGroupEl = groupEl;
    currentGroupLevel = level;
    currentGroupCellsEl = cellsEl;
    return cellsEl;
  }

  function showPending(level, targetScore){
    if (!pendingCellEl){
      var cellsEl = ensureGroup(level);

      pendingCellEl = document.createElement("div");
      pendingCellEl.className = "try-cell pending";

      pendingScoreEl = document.createElement("div");
      pendingScoreEl.className = "try-cell-score";

      pendingStatusEl = document.createElement("div");
      pendingStatusEl.className = "try-cell-status";
      pendingStatusEl.textContent = "";

      pendingCellEl.appendChild(pendingScoreEl);
      pendingCellEl.appendChild(pendingStatusEl);
      cellsEl.appendChild(pendingCellEl);
    } else if (level !== currentGroupLevel){
      // User browsed to a different level before resolving the pending try:
      // relocate it into that level's box, opening one if needed, and drop
      // the old box if it's left empty behind it.
      var oldGroupEl = currentGroupEl;
      var oldCellsEl = currentGroupCellsEl;
      var newCellsEl = ensureGroup(level);
      newCellsEl.appendChild(pendingCellEl);
      if (oldCellsEl && !oldCellsEl.children.length && oldGroupEl && oldGroupEl.parentNode){
        oldGroupEl.parentNode.removeChild(oldGroupEl);
      }
    }

    pendingScoreEl.textContent = UiTools.formatScore(targetScore);
    pendingLevel = level;
    pendingTarget = targetScore;

    sessionScrollEl.scrollLeft = sessionScrollEl.scrollWidth;
  }

  // Turns the pending cell into a permanent record of the try that just happened.
  function resolveTry(level, success){
    if (!pendingCellEl) return;

    pendingCellEl.classList.remove("pending");
    pendingCellEl.classList.add(success ? "pass" : "fail");

    pendingStatusEl.textContent = success ? "Done" : "Fail";
    pendingStatusEl.classList.remove("try-cell-status");
    void pendingStatusEl.offsetWidth; // reflow to restart the entrance animation
    pendingStatusEl.classList.add("try-cell-status");

    triesLog.push({ level: pendingLevel, target: pendingTarget, success: success });

    pendingCellEl = null;
    pendingScoreEl = null;
    pendingStatusEl = null;
    pendingLevel = null;
    pendingTarget = null;
  }

  function reset(){
    sessionScrollEl.innerHTML = "";
    currentGroupEl = null;
    currentGroupLevel = null;
    currentGroupCellsEl = null;
    pendingCellEl = null;
    pendingScoreEl = null;
    pendingStatusEl = null;
    pendingLevel = null;
    pendingTarget = null;
    triesLog = [];
  }

  function getTries(){
    return triesLog.slice();
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
    restore: restore,
    scrollToEnd: scrollToEnd
  };
})(window);
