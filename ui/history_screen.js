(function(window){
  "use strict";

  var LevelModel = window.LevelModel;
  var SessionTriesHistory = window.SessionTriesHistory;
  var UiTools = window.UiTools;

  var historyListEl = document.getElementById("historyList");

  var deleteSessionModal = document.getElementById("deleteSessionModal");
  var deleteSessionModalTitle = document.getElementById("deleteSessionModalTitle");
  var cancelDeleteSessionBtn = document.getElementById("cancelDeleteSessionBtn");
  var confirmDeleteSessionBtn = document.getElementById("confirmDeleteSessionBtn");

  // startedAt of the session a pending delete confirmation would remove.
  var pendingDeleteStartedAt = null;

  function closeDeleteModal(){
    deleteSessionModal.hidden = true;
    pendingDeleteStartedAt = null;
  }

  function requestDelete(startedAt, dateText){
    pendingDeleteStartedAt = startedAt;
    deleteSessionModalTitle.textContent = "Delete session of " + dateText + "?";
    deleteSessionModal.hidden = false;
  }

  confirmDeleteSessionBtn.addEventListener("click", function(){
    var startedAt = pendingDeleteStartedAt;
    closeDeleteModal();
    LevelModel.deleteSession(startedAt);
    render();
  });
  cancelDeleteSessionBtn.addEventListener("click", closeDeleteModal);
  deleteSessionModal.addEventListener("click", function(e){
    if (e.target === deleteSessionModal) closeDeleteModal();
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && !deleteSessionModal.hidden) closeDeleteModal();
  });

  // Rebuilds the list from scratch each time it's shown, so it always
  // reflects whatever finished (or was deleted) since the last visit.
  function render(){
    historyListEl.innerHTML = "";
    var sessions = LevelModel.readPreviousSessions();

    if (!sessions.length){
      var emptyEl = document.createElement("p");
      emptyEl.className = "history-empty";
      emptyEl.textContent = "No previous sessions yet.";
      historyListEl.appendChild(emptyEl);
      return;
    }

    var stripEls = sessions.map(function(session){
      var cardEl = document.createElement("div");
      cardEl.className = "history-session";

      var headEl = document.createElement("div");
      headEl.className = "history-session-head";

      var dateText = LevelModel.formatSessionDate(session.startedAt);

      var dateEl = document.createElement("div");
      dateEl.className = "history-session-date";
      dateEl.textContent = dateText;

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "history-delete-btn";
      deleteBtn.title = "Delete session";
      deleteBtn.setAttribute("aria-label", "Delete session");
      deleteBtn.appendChild(UiTools.buildDeleteIcon());
      deleteBtn.addEventListener("click", function(){
        requestDelete(session.startedAt, dateText);
      });

      headEl.appendChild(dateEl);
      headEl.appendChild(deleteBtn);

      var stripEl = SessionTriesHistory.buildStaticStrip(session.tries);

      cardEl.appendChild(headEl);
      cardEl.appendChild(stripEl);
      historyListEl.appendChild(cardEl);
      return stripEl;
    });

    // Only meaningful once each strip is laid out in the visible DOM, so
    // this runs after every card above has already been appended.
    stripEls.forEach(SessionTriesHistory.scrollStripToEnd);
  }

  window.HistoryScreen = { onShow: render };
})(window);
