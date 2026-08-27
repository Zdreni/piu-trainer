(function(window){
  "use strict";

  // Wires up the "Finish this practice session?" confirm modal, shown from
  // the header's restart button when the session has logged tries worth
  // losing. `hooks.onConfirm()` runs once the user actually confirms (or
  // immediately, with no modal, when there's nothing to lose).
  function init(hooks){
    var TrainingSession = window.TrainingSession;

    var restartBtn = document.getElementById("restartBtn");
    var finishModal = document.getElementById("finishModal");
    var cancelFinishBtn = document.getElementById("cancelFinishBtn");
    var confirmFinishBtn = document.getElementById("confirmFinishBtn");

    function closeFinishModal(){
      finishModal.hidden = true;
    }

    function requestFinish(){
      if (!TrainingSession.hasTries()){
        hooks.onConfirm();
        return;
      }
      finishModal.hidden = false;
      cancelFinishBtn.focus();
    }

    restartBtn.addEventListener("click", requestFinish);

    confirmFinishBtn.addEventListener("click", function(){
      closeFinishModal();
      hooks.onConfirm();
    });
    cancelFinishBtn.addEventListener("click", closeFinishModal);
    finishModal.addEventListener("click", function(e){
      if (e.target === finishModal) closeFinishModal();
    });
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape" && !finishModal.hidden) closeFinishModal();
    });
  }

  window.SessionFinishConfirmation = { init: init };
})(window);
