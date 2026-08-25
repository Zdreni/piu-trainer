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
  var pendingScoreEl = null;
  var pendingStatusEl = null;
  var pendingLevel = null;
  var pendingTarget = null;

  // Resolved tries for the current session, in order, so the strip can be
  // rebuilt after a page reload.
  var triesLog = [];

  function groupHead(groupEl){
    return groupEl.querySelector(".tries-sequence-head").textContent;
  }

  function groupCells(groupEl){
    return groupEl.querySelector(".tries-sequence-cells");
  }

  // Reuses the strip's last box if its level matches; opens a new one otherwise.
  function ensureGroup(level){
    var lastGroupEl = sessionScrollEl.lastElementChild;
    if (lastGroupEl && groupHead(lastGroupEl) === level) return lastGroupEl;

    var groupEl = document.createElement("div");
    groupEl.className = "tries-sequence";

    var headEl = document.createElement("div");
    headEl.className = "tries-sequence-head" + (level.charAt(0) === "D" ? " type-doubles" : "");
    headEl.textContent = level;

    var cellsEl = document.createElement("div");
    cellsEl.className = "tries-sequence-cells";

    groupEl.appendChild(headEl);
    groupEl.appendChild(cellsEl);
    sessionScrollEl.appendChild(groupEl);

    return groupEl;
  }

  function showPending(level, targetScore){
    if (!pendingCellEl){
      pendingGroupEl = ensureGroup(level);

      pendingCellEl = document.createElement("div");
      pendingCellEl.className = "try-cell pending";

      pendingScoreEl = document.createElement("div");
      pendingScoreEl.className = "try-cell-score";

      pendingStatusEl = document.createElement("div");
      pendingStatusEl.className = "try-cell-status";
      pendingStatusEl.textContent = "";

      pendingCellEl.appendChild(pendingScoreEl);
      pendingCellEl.appendChild(pendingStatusEl);
      groupCells(pendingGroupEl).appendChild(pendingCellEl);
    } else if (level !== groupHead(pendingGroupEl)){
      // User browsed to a different level before resolving the pending try:
      // detach it and drop its box first if that leaves it empty (which may
      // reveal an earlier box for `level` as the strip's last one), then place
      // it in (or open) the right box for `level`.
      var oldGroupEl = pendingGroupEl;
      var oldCellsEl = groupCells(oldGroupEl);
      oldCellsEl.removeChild(pendingCellEl);
      if (!oldCellsEl.children.length && oldGroupEl.parentNode){
        oldGroupEl.parentNode.removeChild(oldGroupEl);
      }
      pendingGroupEl = ensureGroup(level);
      groupCells(pendingGroupEl).appendChild(pendingCellEl);
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
    pendingGroupEl = null;
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
