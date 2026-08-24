(function(window){
  "use strict";

  var UiTools = window.UiTools;

  var sessionScrollEl = document.getElementById("sessionScroll");

  var lastSessionLevel = null;

  // The session-progress strip always ends in one "pending" cell: the level/target
  // the user is about to try right now, inverted yellow with an empty footer (so it
  // still matches the height of resolved cells). It's created once and then just
  // updated in place as the user browses levels — only an actual Pass/Fail "resolves"
  // it into a permanent, footer-tagged cell and opens a fresh pending cell for the
  // next attempt.
  var pendingCellEl = null;
  var pendingHeadEl = null;
  var pendingScoreEl = null;
  var pendingStatusEl = null;

  function showPending(level, targetScore){
    if (!pendingCellEl){
      pendingCellEl = document.createElement("div");
      pendingCellEl.className = "session-cell pending";

      pendingHeadEl = document.createElement("div");
      pendingHeadEl.className = "session-cell-head";

      pendingScoreEl = document.createElement("div");
      pendingScoreEl.className = "session-cell-score";

      pendingStatusEl = document.createElement("div");
      pendingStatusEl.className = "session-cell-status";
      pendingStatusEl.textContent = "";

      pendingCellEl.appendChild(pendingHeadEl);
      pendingCellEl.appendChild(pendingScoreEl);
      pendingCellEl.appendChild(pendingStatusEl);
      sessionScrollEl.appendChild(pendingCellEl);
    }

    pendingHeadEl.classList.toggle("level-changed", level !== lastSessionLevel);
    pendingHeadEl.textContent = level;
    pendingScoreEl.textContent = UiTools.formatScore(targetScore);

    sessionScrollEl.scrollLeft = sessionScrollEl.scrollWidth;
  }

  // Turns the pending cell into a permanent record of the try that just happened.
  function resolveTry(level, success){
    if (!pendingCellEl) return;

    lastSessionLevel = level;
    pendingCellEl.classList.remove("pending");
    pendingCellEl.classList.add(success ? "pass" : "fail");

    pendingStatusEl.textContent = success ? "Done" : "Fail";
    pendingStatusEl.classList.remove("session-cell-status");
    void pendingStatusEl.offsetWidth; // reflow to restart the entrance animation
    pendingStatusEl.classList.add("session-cell-status");

    pendingCellEl = null;
    pendingHeadEl = null;
    pendingScoreEl = null;
    pendingStatusEl = null;
  }

  function reset(){
    sessionScrollEl.innerHTML = "";
    lastSessionLevel = null;
    pendingCellEl = null;
    pendingHeadEl = null;
    pendingScoreEl = null;
    pendingStatusEl = null;
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
    reset: reset
  };
})(window);
