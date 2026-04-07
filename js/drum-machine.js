/* =========================================
   drum-machine.js
   Thin compatibility wrapper for mNotes integration
   Exposes DrumMachine as alias of UniversalPercussionEngine
   ========================================= */

(function (global) {
  "use strict";

  if (global.DrumMachine) return;

  if (!global.UniversalPercussionEngine) {
    throw new Error("UniversalPercussionEngine is not loaded. Load universal-percussion-engine.js first.");
  }

  global.DrumMachine = global.UniversalPercussionEngine;
})(window);
