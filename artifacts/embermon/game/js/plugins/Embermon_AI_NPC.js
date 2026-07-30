/*:
 * @plugindesc Embermon AI NPC — plugin command: AINPC <npcName> <mood>
 * @author Embermon
 */

(function() {
  'use strict';

  var QUOTA_KEY   = 'embermon_ai_quota';
  var MAX_QUOTA   = 5;

  // Detect API base (same logic as rest of the app)
  function apiBase() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return '';
    return '';  // relative — Replit proxy handles routing
  }

  function getQuota() {
    return parseInt(localStorage.getItem(QUOTA_KEY) || '0', 10);
  }
  function incrementQuota() {
    localStorage.setItem(QUOTA_KEY, String(getQuota() + 1));
  }

  // ── Canned fallback responses ─────────────────────────────────────────────────
  var CANNED = {
    Professor: [
      "The Wasteland holds countless Embermon. Some have never been catalogued.",
      "Study each Embermon's behaviour — their elemental affinities follow no human logic.",
      "In the old world, they called them monsters. We call them companions.",
    ],
    Survivor: [
      "I used to travel with a team of Embrats. Lost them in a sandstorm.",
      "Don't wander north after dark — the Shadowmoths come out.",
      "If your Emberball fails, aim for a weakened creature. Works every time.",
    ],
    Trainer: [
      "You call yourself a trainer? Prove it.",
      "My Blazeclaw has never lost a battle. Until now, maybe.",
      "Interesting technique. I'll remember that.",
    ],
    _default: [
      "...",
      "I've nothing left to say.",
      "Ask me something else.",
    ],
  };

  function getCanned(npcName) {
    var lines = CANNED[npcName] || CANNED._default;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // ── Main dialogue function ───────────────────────────────────────────────────
  function fetchAIDialogue(interp, npcName, mood) {
    var quota = getQuota();
    var char = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : {};

    if (quota >= MAX_QUOTA) {
      // Quota exceeded — use canned
      showDialogue(interp, npcName, getCanned(npcName) + '  [AI quota reached for this session]');
      return;
    }

    var mapName = $gameMap ? $dataMapInfos[$gameMap.mapId()].name : 'The Wasteland';

    fetch(apiBase() + '/api/mmo/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npcName:    npcName,
        mood:       mood || 'neutral',
        playerName: char.name || 'Traveler',
        location:   mapName,
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      incrementQuota();
      showDialogue(interp, npcName, data.reply || getCanned(npcName));
    })
    .catch(function() {
      showDialogue(interp, npcName, getCanned(npcName));
    });
  }

  function showDialogue(interp, npcName, text) {
    // Inject show-text command into interpreter command list
    var cmds = [
      { code: 101, indent: 0, parameters: ['', 0, 0, 2, npcName] },
      { code: 401, indent: 0, parameters: [text.slice(0, 250)] },
      { code: 0,   indent: 0, parameters: [] },
    ];
    // Re-inject at head of remaining commands
    interp._list = cmds.concat(interp._list.slice(interp._index));
    interp._index = 0;
    // Resume interpreter
    interp._waitMode = '';
  }

  // ── Plugin command ───────────────────────────────────────────────────────────
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command === 'AINPC') {
      var npcName = args[0] || 'NPC';
      var mood    = args[1] || 'neutral';
      this.setWaitMode('ainpc');
      fetchAIDialogue(this, npcName, mood);
    }
    if (command === 'RESET_AI_QUOTA') {
      localStorage.removeItem(QUOTA_KEY);
    }
  };

  // Override updateWait to handle 'ainpc' wait mode
  var _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
  Game_Interpreter.prototype.updateWaitMode = function() {
    if (this._waitMode === 'ainpc') {
      // Wait until dialogue is injected (showDialogue sets _waitMode to '')
      return true;
    }
    return _Game_Interpreter_updateWaitMode.call(this);
  };

})();
