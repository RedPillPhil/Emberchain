/*:
 * @plugindesc Embermon Character Creator — appearance picker that ACTUALLY changes the on-map sprite.
 * @author Embermon
 */

(function() {
  'use strict';

  var STORAGE_KEY = 'embermon_character';

  // ── Appearance presets using standard RPG Maker character sheets ──────────────
  var HAIR_COLORS = [
    { name:'Black',  hex:'#1a1a1a' },
    { name:'Brown',  hex:'#5c3d1e' },
    { name:'Blonde', hex:'#e8c96b' },
    { name:'Red',    hex:'#c0392b' },
    { name:'White',  hex:'#e8e8e8' },
    { name:'Blue',   hex:'#2980b9' },
    { name:'Green',  hex:'#27ae60' },
    { name:'Purple', hex:'#8e44ad' },
  ];

  var SHIRT_COLORS = [
    { name:'Crimson', hex:'#c0392b' },
    { name:'Navy',    hex:'#2c3e50' },
    { name:'Forest',  hex:'#27ae60' },
    { name:'Gold',    hex:'#f39c12' },
    { name:'Violet',  hex:'#8e44ad' },
    { name:'Teal',    hex:'#16a085' },
    { name:'Orange',  hex:'#e67e22' },
    { name:'Ash',     hex:'#7f8c8d' },
  ];

  // People1-4 character sheets: 8 chars per sheet (4 columns × 2 rows)
  // Index 0 = row0 col0 … 3 = row0 col3 … 4 = row1 col0 …
  var AVATAR_PRESETS = [
    { label:'Adventurer', charFile:'People1', charIndex:0 },
    { label:'Scholar',    charFile:'People1', charIndex:3 },
    { label:'Athlete',    charFile:'People2', charIndex:0 },
    { label:'Mystic',     charFile:'People2', charIndex:4 },
    { label:'Ranger',     charFile:'People3', charIndex:1 },
    { label:'Artisan',    charFile:'People3', charIndex:6 },
  ];

  // ── Core: apply saved character to all RPG Maker objects ────────────────────
  function applyCharacterToGame(charData) {
    if (!charData) return;

    // Apply to Actor 1 (party leader)
    if (typeof $gameActors !== 'undefined' && $gameActors) {
      var actor = $gameActors.actor(1);
      if (actor) {
        if (charData.name) actor.setName(charData.name);
        actor.setCharacterImage(charData.charFile, charData.charIndex);
      }
    }

    // Apply directly to player sprite
    if (typeof $gamePlayer !== 'undefined' && $gamePlayer && $gamePlayer.setImage) {
      $gamePlayer.setImage(charData.charFile, charData.charIndex);
      $gamePlayer.refresh();
      // Force sprite refresh if sprite is already created
      if (SceneManager._scene && SceneManager._scene._spriteset) {
        var spriteset = SceneManager._scene._spriteset;
        if (spriteset._characterSprites) {
          spriteset._characterSprites.forEach(function(s) {
            if (s._character === $gamePlayer) s.updateBitmap();
          });
        }
      }
    }

    window.embermonCharData = charData;
  }

  // ── Overlay builder ──────────────────────────────────────────────────────────
  function openCreator(onClose) {
    // Remove any existing overlay
    var existing = document.getElementById('embermon-char-creator');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'embermon-char-creator';
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);',
      'display:flex;align-items:center;justify-content:center;z-index:9999;',
      'font-family:"Courier New",monospace;color:#e8e0c8;'
    ].join('');

    var saved = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : null;
    var state = {
      name:     (saved && saved.name)     || 'Ember',
      avatarIdx: (saved && saved.avatarIdx != null) ? saved.avatarIdx : 0,
      hairIdx:   (saved && saved.hairIdx  != null) ? saved.hairIdx  : 0,
      shirtIdx:  (saved && saved.shirtIdx != null) ? saved.shirtIdx : 0,
    };

    function render() {
      overlay.innerHTML = '';
      var box = document.createElement('div');
      box.style.cssText = [
        'background:#1a200e;border:2px solid #6aad3c;border-radius:6px;',
        'padding:24px 32px;max-width:500px;width:92%;box-shadow:0 0 32px #0008;'
      ].join('');

      // ── Title ────────────────────────────────────────────────────────────────
      var title = document.createElement('h2');
      title.textContent = '✨ Who Are You?';
      title.style.cssText = 'margin:0 0 18px;font-size:18px;color:#a3e635;text-align:center;letter-spacing:2px;';
      box.appendChild(title);

      // ── Name ────────────────────────────────────────────────────────────────
      var nameLabel = document.createElement('div');
      nameLabel.textContent = 'Your Name';
      nameLabel.style.cssText = 'font-size:10px;color:#6aad3c;margin-bottom:4px;letter-spacing:2px;text-transform:uppercase;';
      box.appendChild(nameLabel);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 12;
      nameInput.value = state.name;
      nameInput.style.cssText = [
        'width:100%;padding:8px 10px;background:#0e1a08;border:1px solid #3a5a1a;',
        'border-radius:3px;color:#e8e0c8;font-family:inherit;font-size:14px;',
        'box-sizing:border-box;margin-bottom:18px;outline:none;'
      ].join('');
      nameInput.addEventListener('input', function() { state.name = this.value.trim() || 'Ember'; });
      box.appendChild(nameInput);

      // ── Appearance ──────────────────────────────────────────────────────────
      var appLabel = document.createElement('div');
      appLabel.textContent = 'Appearance';
      appLabel.style.cssText = 'font-size:10px;color:#6aad3c;margin-bottom:8px;letter-spacing:2px;text-transform:uppercase;';
      box.appendChild(appLabel);

      var avatarGrid = document.createElement('div');
      avatarGrid.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;';
      AVATAR_PRESETS.forEach(function(preset, idx) {
        var btn = document.createElement('button');
        var isActive = idx === state.avatarIdx;
        btn.textContent = preset.label;
        btn.style.cssText = [
          'padding:6px 12px;font-family:inherit;font-size:11px;cursor:pointer;letter-spacing:0.5px;',
          'border-radius:3px;transition:all 0.12s;border:1px solid;',
          isActive
            ? 'background:#3a6a0a;color:#a3e635;border-color:#6aad3c;'
            : 'background:#0e1a08;color:#7a9a6a;border-color:#3a5a1a;'
        ].join('');
        btn.addEventListener('click', function() { state.avatarIdx = idx; render(); });
        avatarGrid.appendChild(btn);
      });
      box.appendChild(avatarGrid);

      // ── Hair Color ──────────────────────────────────────────────────────────
      function colorRow(label, colors, stateKey) {
        var lbl = document.createElement('div');
        lbl.textContent = label;
        lbl.style.cssText = 'font-size:10px;color:#6aad3c;margin-bottom:6px;letter-spacing:2px;text-transform:uppercase;';
        box.appendChild(lbl);

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;';
        colors.forEach(function(c, idx) {
          var swatch = document.createElement('button');
          var isActive = idx === state[stateKey];
          swatch.title = c.name;
          swatch.style.cssText = [
            'width:28px;height:28px;border-radius:50%;cursor:pointer;',
            'background:', c.hex, ';',
            'border:', isActive ? '3px solid #a3e635' : '2px solid #3a5a1a', ';',
            'transition:transform 0.1s;box-sizing:border-box;'
          ].join('');
          swatch.addEventListener('click', function() { state[stateKey] = idx; render(); });
          row.appendChild(swatch);
        });
        box.appendChild(row);
      }

      colorRow('Hair Color', HAIR_COLORS, 'hairIdx');
      colorRow('Shirt Color', SHIRT_COLORS, 'shirtIdx');

      // ── Preview ──────────────────────────────────────────────────────────────
      var preview = document.createElement('div');
      var preset = AVATAR_PRESETS[state.avatarIdx];
      preview.style.cssText = [
        'background:#0e1a08;border:1px solid #3a5a1a;border-radius:3px;',
        'padding:10px 14px;margin-bottom:18px;font-size:12px;color:#c8d8b0;',
        'display:flex;align-items:center;gap:10px;'
      ].join('');
      var previewIcon = document.createElement('div');
      previewIcon.textContent = '🧑';
      previewIcon.style.fontSize = '24px';
      preview.appendChild(previewIcon);
      var previewText = document.createElement('div');
      previewText.innerHTML = '<strong style="color:#a3e635">' + (state.name || 'Ember') + '</strong> &nbsp;·&nbsp; ' + preset.label + '<br>' +
        '<span style="font-size:10px;opacity:0.7;">' +
        HAIR_COLORS[state.hairIdx].name + ' hair &nbsp;·&nbsp; ' +
        SHIRT_COLORS[state.shirtIdx].name + ' shirt</span>';
      preview.appendChild(previewText);
      box.appendChild(preview);

      // ── Confirm ──────────────────────────────────────────────────────────────
      var confirmBtn = document.createElement('button');
      confirmBtn.textContent = '▶ START YOUR JOURNEY';
      confirmBtn.style.cssText = [
        'width:100%;padding:12px;background:#3a6a0a;color:#a3e635;',
        'border:1px solid #6aad3c;border-radius:3px;font-family:inherit;',
        'font-size:13px;cursor:pointer;letter-spacing:2px;font-weight:bold;',
        'transition:background 0.12s;'
      ].join('');
      confirmBtn.addEventListener('mouseenter', function() { this.style.background = '#4a8a12'; });
      confirmBtn.addEventListener('mouseleave', function() { this.style.background = '#3a6a0a'; });
      confirmBtn.addEventListener('click', function() {
        var charData = {
          name:       state.name || 'Ember',
          avatarIdx:  state.avatarIdx,
          hairIdx:    state.hairIdx,
          shirtIdx:   state.shirtIdx,
          charFile:   AVATAR_PRESETS[state.avatarIdx].charFile,
          charIndex:  AVATAR_PRESETS[state.avatarIdx].charIndex,
          hairColor:  HAIR_COLORS[state.hairIdx].hex,
          shirtColor: SHIRT_COLORS[state.shirtIdx].hex,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(charData));
        overlay.remove();
        applyCharacterToGame(charData);
        if (typeof onClose === 'function') onClose(charData);
      });
      box.appendChild(confirmBtn);

      overlay.appendChild(box);
    }

    render();
    document.body.appendChild(overlay);
  }

  // ── On Scene_Boot: show creator if no saved character ───────────────────────
  var _Scene_Boot_start = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function() {
    _Scene_Boot_start.call(this);
    // Don't show here anymore — show it in Scene_Map on first play
  };

  // ── On Scene_Map: always re-apply saved character (ensures sprite is set) ───
  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    var charData = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : null;
    if (charData) {
      // Small delay to ensure $gamePlayer is fully ready
      setTimeout(function() { applyCharacterToGame(charData); }, 50);
    }
  };

  // ── On Scene_Map onload: show creator if first time ─────────────────────────
  var _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function() {
    _Scene_Map_onMapLoaded.call(this);
    // If first play AND on map 1 AND no character saved yet
    var charData = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : null;
    if (!charData && $gameMap && $gameMap.mapId() === 1) {
      var self = this;
      setTimeout(function() {
        openCreator(function(cd) { applyCharacterToGame(cd); });
      }, 300);
    }
  };

  // ── On new game: apply character ────────────────────────────────────────────
  var _Scene_Title_commandNewGame = Scene_Title.prototype.commandNewGame;
  Scene_Title.prototype.commandNewGame = function() {
    _Scene_Title_commandNewGame.call(this);
    var charData = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : null;
    if (charData) setTimeout(function() { applyCharacterToGame(charData); }, 200);
  };

  // ── Plugin commands ──────────────────────────────────────────────────────────
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);

    if (command === 'OPEN_CHARACTER_CREATOR') {
      var interp = this;
      interp.setWaitMode('charCreator');
      openCreator(function(cd) {
        applyCharacterToGame(cd);
        interp.setWaitMode('');
      });
    }

    if (command === 'RESET_CHARACTER') {
      localStorage.removeItem(STORAGE_KEY);
      var interp2 = this;
      interp2.setWaitMode('charCreator');
      openCreator(function(cd) {
        applyCharacterToGame(cd);
        interp2.setWaitMode('');
      });
    }
  };

  // Register wait mode so interpreter pauses during creator
  var _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
  Game_Interpreter.prototype.updateWaitMode = function() {
    if (this._waitMode === 'charCreator') {
      return !!document.getElementById('embermon-char-creator');
    }
    return _Game_Interpreter_updateWaitMode.call(this);
  };

  // ── Public API ───────────────────────────────────────────────────────────────
  window.EmbermonGetCharacter = function() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) { return null; }
  };

})();
