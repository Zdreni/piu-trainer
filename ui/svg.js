(function(window){
  "use strict";

  var deleteIcon = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';

  // A bold V-shaped caret pointing down. Two overlaid strokes of the same
  // path: a wider one in the subtle line color peeking out as a border, and
  // the black fill stroke on top - mirrors the rounded-pill-bar look this
  // replaced without needing separate bar elements.
  var flowChevron = '<svg viewBox="0 0 52 28" width="100%" height="100%" fill="none" aria-hidden="true">' +
    '<path d="M5 5 L26 22 L47 5" stroke="var(--line)" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M5 5 L26 22 L47 5" stroke="#000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

  window.UI = window.UI || {};
  window.UI.Svg = {
    deleteIcon: deleteIcon,
    flowChevron: flowChevron
  };
})(window);
