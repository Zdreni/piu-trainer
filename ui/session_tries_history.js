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

  // Points at the pending cell from its left. Lives either among the group's
  // cells (neighbor is the previous try) or in the top-level strip right
  // before the group (neighbor is the previous group), depending on whether
  // the pending cell opens its group or continues one. Detached entirely when
  // there's no neighbor to point from (the very first cell of the session).
  var pendingArrowEl = null;

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

  // Reuses containerEl's last box if its level number matches; opens a new one otherwise.
  function ensureGroup(containerEl, numLevel){
    var lastGroupEl = containerEl.lastElementChild;
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
    containerEl.appendChild(groupEl);

    return groupEl;
  }

  // Detaches the pending arrow from wherever it currently sits and reinserts
  // it right before pendingCellEl: alongside another cell in the same group,
  // or — if pendingCellEl opens its group (including the session's very
  // first group) — outside the group box entirely, leading the strip.
  function placeArrow(){
    if (!pendingArrowEl){
      pendingArrowEl = document.createElement("div");
      pendingArrowEl.className = "pending-arrow";
    } else if (pendingArrowEl.parentNode){
      pendingArrowEl.parentNode.removeChild(pendingArrowEl);
    }

    if (pendingCellEl.previousElementSibling){
      groupCells(pendingGroupEl).insertBefore(pendingArrowEl, pendingCellEl);
    } else {
      sessionScrollEl.insertBefore(pendingArrowEl, pendingGroupEl);
    }
  }

  function showPending(level, targetScore){
    var parts = levelParts(level);
    var isNewGroup = false;

    if (!pendingCellEl){
      pendingGroupEl = ensureGroup(sessionScrollEl, parts.num);
      isNewGroup = !groupCells(pendingGroupEl).children.length;

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
      placeArrow();
    } else {
      if (parts.num !== groupHead(pendingGroupEl)){
        // User browsed to a different level before resolving the pending try:
        // detach it (and the arrow pointing at it) and drop its box first if
        // that leaves it empty (which may reveal an earlier box for this
        // level as the strip's last one), then place it in (or open) the
        // right box for the new level.
        var oldGroupEl = pendingGroupEl;
        var oldCellsEl = groupCells(oldGroupEl);
        if (pendingArrowEl && pendingArrowEl.parentNode){
          pendingArrowEl.parentNode.removeChild(pendingArrowEl);
        }
        oldCellsEl.removeChild(pendingCellEl);
        if (!oldCellsEl.children.length && oldGroupEl.parentNode){
          oldGroupEl.parentNode.removeChild(oldGroupEl);
        }
        pendingGroupEl = ensureGroup(sessionScrollEl, parts.num);
        isNewGroup = !groupCells(pendingGroupEl).children.length;
        groupCells(pendingGroupEl).appendChild(pendingCellEl);
        placeArrow();
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

    scrollToEnd();
    if (isNewGroup) correctScrollAfterEntrance(pendingGroupEl);
  }

  // A freshly opened group plays a scale/translate entrance animation
  // (.tries-sequence's sessionCellIn), and a transformed box counts toward its
  // scroll container's scrollable overflow at its *current* (mid-animation)
  // size, not its settled one. scrollToEnd() called right after insertion
  // therefore measures the group while it's still scaled down, undershooting
  // the true end and cropping it once it reaches full size. Re-run the scroll
  // once the entrance animation finishes to land on the real edge.
  function correctScrollAfterEntrance(groupEl){
    function onEnd(e){
      if (e.target !== groupEl) return;
      groupEl.removeEventListener("animationend", onEnd);
      scrollToEnd();
    }
    groupEl.addEventListener("animationend", onEnd);
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

    if (pendingArrowEl && pendingArrowEl.parentNode){
      pendingArrowEl.parentNode.removeChild(pendingArrowEl);
    }
    pendingArrowEl = null;
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
    pendingArrowEl = null;
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

  // Scrolls to the true last pixel (scrollWidth - clientWidth) rather than
  // scrollWidth itself: on iOS Safari, assigning an out-of-range scrollLeft
  // while scroll-behavior:smooth is active can overshoot into the rubber-band
  // zone and settle short of the real edge, cropping the last cell.
  function scrollToEnd(){
    sessionScrollEl.scrollLeft = sessionScrollEl.scrollWidth - sessionScrollEl.clientWidth;
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

  // A single already-resolved cell (pass/fail, no pending state) — used to
  // build read-only strips for past sessions on the history screen.
  function buildResolvedCell(level, target, success){
    var parts = levelParts(level);
    var cellEl = document.createElement("div");
    cellEl.className = "try-cell " + (success ? "pass" : "fail");

    var scoreEl = document.createElement("div");
    scoreEl.className = "try-cell-score";
    scoreEl.innerHTML = UiTools.formatScoreHtml(target);

    var statusEl = document.createElement("div");
    statusEl.className = "try-cell-status";
    statusEl.textContent = success ? "Pass" : "Fail";

    cellEl.appendChild(UiTools.buildLevelBall(parts.typeWord, parts.num, parts.isDoubles, "level-ball--tiny"));
    cellEl.appendChild(scoreEl);
    cellEl.appendChild(statusEl);
    return cellEl;
  }

  // Builds a standalone, non-interactive .session-scroll strip (drag-to-scroll
  // only, no pending cell) from a past session's resolved tries — for the
  // history screen, which shows one of these per archived session. Carries
  // its own "history-strip" class so the dimming rule that normally fades
  // every non-current ball (there's no "current" try in a past session)
  // doesn't apply here.
  function buildStaticStrip(tries){
    var containerEl = document.createElement("div");
    containerEl.className = "session-scroll history-strip";
    tries.forEach(function(t){
      var groupEl = ensureGroup(containerEl, levelParts(t.level).num);
      groupCells(groupEl).appendChild(buildResolvedCell(t.level, t.target, t.success));
    });
    enableDragScroll(containerEl);
    return containerEl;
  }

  // Scrolls an arbitrary strip element to its true last pixel — same
  // rationale as scrollToEnd(), but usable on any strip (e.g. a history
  // strip), not just the live sessionScrollEl. Only meaningful once the
  // element is attached to the visible DOM, since it reads layout sizes.
  function scrollStripToEnd(el){
    el.scrollLeft = el.scrollWidth - el.clientWidth;
  }

  window.SessionTriesHistory = {
    showPending: showPending,
    resolveTry: resolveTry,
    reset: reset,
    getTries: getTries,
    getLastTry: getLastTry,
    restore: restore,
    scrollToEnd: scrollToEnd,
    buildStaticStrip: buildStaticStrip,
    scrollStripToEnd: scrollStripToEnd
  };
})(window);
