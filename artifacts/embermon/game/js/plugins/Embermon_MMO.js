/*:
 * @plugindesc Embermon MMO — real-time multiplayer via WebSocket.
 * @author Embermon
 */

(function() {
  'use strict';

  // ── WebSocket connection ─────────────────────────────────────────────────────
  var ws = null;
  var reconnectTimer = null;
  var players = {};   // playerId -> { x, y, dir, mapId, name, charFile, charIndex }
  var myId = localStorage.getItem('embermon_pid') || ('p' + Math.random().toString(36).slice(2, 9));
  localStorage.setItem('embermon_pid', myId);

  function wsUrl() {
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    var host = location.host;
    // If served under a base path, compute api-server path
    return proto + '://' + host + '/api/mmo/ws';
  }

  function connect() {
    if (ws && ws.readyState <= 1) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch(e) { scheduleReconnect(); return; }

    ws.onopen = function() {
      console.log('[MMO] Connected');
      broadcastSelf();
    };

    ws.onmessage = function(evt) {
      try {
        var msg = JSON.parse(evt.data);
        if (msg.type === 'state' && msg.id !== myId) {
          players[msg.id] = msg;
          refreshOtherPlayers();
        } else if (msg.type === 'leave') {
          delete players[msg.id];
          refreshOtherPlayers();
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type:'pong', id: myId }));
        }
      } catch(e) {}
    };

    ws.onerror = function() {};
    ws.onclose = function() { scheduleReconnect(); };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  }

  // ── Broadcast self ───────────────────────────────────────────────────────────
  var lastBroadcast = { x:-1, y:-1, mapId:-1 };
  function broadcastSelf() {
    if (!ws || ws.readyState !== 1) return;
    if (!$gamePlayer || !$gameMap) return;
    var char = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : {};
    var payload = {
      type:      'state',
      id:        myId,
      name:      (char && char.name) || 'Traveler',
      x:         $gamePlayer.x,
      y:         $gamePlayer.y,
      dir:       $gamePlayer.direction(),
      mapId:     $gameMap.mapId(),
      charFile:  (char && char.charFile) || 'Actor1',
      charIndex: (char && char.charIndex) || 0,
      hairColor: (char && char.hairColor) || '#1a1a1a',
      shirtColor:(char && char.shirtColor) || '#c0392b',
    };
    ws.send(JSON.stringify(payload));
    lastBroadcast = payload;
  }

  // ── Render other players ─────────────────────────────────────────────────────
  // We layer small labels over the canvas rather than injecting game events
  var labelContainer = null;

  function getOrCreateLabelContainer() {
    if (labelContainer && document.body.contains(labelContainer)) return labelContainer;
    labelContainer = document.createElement('div');
    labelContainer.id = 'mmo-labels';
    labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100;overflow:hidden;';
    document.body.appendChild(labelContainer);
    return labelContainer;
  }

  function refreshOtherPlayers() {
    var container = getOrCreateLabelContainer();
    container.innerHTML = '';
    if (!$gamePlayer || !$gameMap || !SceneManager._scene || !(SceneManager._scene instanceof Scene_Map)) return;

    var currentMapId = $gameMap.mapId();
    Object.keys(players).forEach(function(id) {
      var p = players[id];
      if (p.mapId !== currentMapId) return;

      // Convert tile coords to screen coords
      var screenX = ($gamePlayer.screenX() + (p.x - $gamePlayer.x) * $gameMap.tileWidth());
      var screenY = ($gamePlayer.screenY() + (p.y - $gamePlayer.y) * $gameMap.tileHeight());

      var label = document.createElement('div');
      label.style.cssText = [
        'position:absolute;',
        'left:' + (screenX - 24) + 'px;',
        'top:' + (screenY - 48) + 'px;',
        'width:48px;text-align:center;',
        'pointer-events:none;'
      ].join('');

      // Colored avatar dot
      var dot = document.createElement('div');
      dot.style.cssText = [
        'width:12px;height:12px;border-radius:50%;margin:0 auto 2px;',
        'background:',p.shirtColor||'#c0392b',';',
        'border:2px solid ',p.hairColor||'#fff',';',
        'box-shadow:0 0 4px rgba(0,0,0,0.8);'
      ].join('');

      var name = document.createElement('div');
      name.textContent = p.name;
      name.style.cssText = [
        'font-size:9px;font-family:"Courier New",monospace;color:#fff;',
        'text-shadow:1px 1px 2px #000,-1px -1px 2px #000;',
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64px;'
      ].join('');

      label.appendChild(dot);
      label.appendChild(name);
      container.appendChild(label);
    });
  }

  // ── Periodic broadcast ───────────────────────────────────────────────────────
  var broadcastInterval = null;

  function startBroadcast() {
    if (broadcastInterval) return;
    broadcastInterval = setInterval(function() {
      if (!ws || ws.readyState !== 1) return;
      if (!$gamePlayer || !$gameMap) return;
      var x = $gamePlayer.x, y = $gamePlayer.y, mapId = $gameMap.mapId();
      if (x !== lastBroadcast.x || y !== lastBroadcast.y || mapId !== lastBroadcast.mapId) {
        broadcastSelf();
      }
      refreshOtherPlayers();
    }, 800);
  }

  // ── Hook into Scene_Map ──────────────────────────────────────────────────────
  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    if (!ws || ws.readyState > 1) connect();
    startBroadcast();
  };

  var _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function() {
    _Scene_Map_terminate.call(this);
    if (labelContainer) labelContainer.innerHTML = '';
    // Notify server we changed map (handled by next broadcast with new mapId)
  };

  // Send leave on page unload
  window.addEventListener('beforeunload', function() {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type:'leave', id: myId }));
    }
  });

  // Connect on load
  connect();

})();
