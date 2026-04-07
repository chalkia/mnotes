/* =========================================
   mnr-loader.js
   Utilities for parsing and validating .mnr assets
   ========================================= */

(function (global) {
  "use strict";

  function parseMnrJson(jsonString) {
    return JSON.parse(jsonString);
  }

  async function readMnrFile(file) {
    const text = await file.text();
    return JSON.parse(text);
  }

  global.MnrLoader = {
    parseMnrJson,
    readMnrFile
  };
})(window);
