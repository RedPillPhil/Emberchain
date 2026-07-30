/*:
 * @plugindesc Embermon Pokemon System — wild encounters, battles, starter selection, catch mechanic.
 * @author Embermon
 */

(function() {
  'use strict';

  // ── Species database ──────────────────────────────────────────────────────────
  window.EMBERMON_SPECIES = {
    // Original species
    1: { id:1,  name:'Embrat',      type:'Fire',    emoji:'🔥', hp:30, atk:10, def:6,  xp:20, desc:'A mischievous fire bat that singes its prey.' },
    2: { id:2,  name:'Ashbark',     type:'Rock',    emoji:'🪨', hp:45, atk:8,  def:14, xp:30, desc:'Armoured in volcanic rock, slow but nearly unbreakable.' },
    3: { id:3,  name:'Blazeclaw',   type:'Fire',    emoji:'🔥', hp:40, atk:14, def:8,  xp:40, desc:'A fierce fire drake. Rare in the wastes.' },
    4: { id:4,  name:'Frostwhip',   type:'Ice',     emoji:'*',  hp:35, atk:11, def:7,  xp:28, desc:'Tail cold enough to freeze exposed skin on contact.' },
    5: { id:5,  name:'Thunderfang', type:'Electric',emoji:'⚡', hp:38, atk:13, def:6,  xp:35, desc:'Three-headed beast crackling with static charge.' },
    6: { id:6,  name:'Mudrake',     type:'Earth',   emoji:'🌍', hp:42, atk:9,  def:12, xp:25, desc:'Tunnels through irradiated soil to ambush targets.' },
    7: { id:7,  name:'Shadowmoth',  type:'Dark',    emoji:'🌑', hp:32, atk:12, def:5,  xp:32, desc:'Wing-dust causes vivid hallucinations.' },
    8: { id:8,  name:'Voidmaw',     type:'Psychic', emoji:'🔮', hp:28, atk:15, def:4,  xp:45, desc:'Legendary. Its gaze paralyses all who meet it.' },
    // Starters — Mongratis collection (pokengine.org/collections/107s7x9x/Mongratis)
    9:  { id:9,  name:'Volcub',    type:'Fire',  emoji:'🐻', hp:35, atk:12, def:7,  xp:30, desc:'A fluffy fire bear cub. Ember flames flicker on its ears.',   sprite:'Volcub' },
    10: { id:10, name:'Wavelet',   type:'Water', emoji:'💧', hp:33, atk:10, def:9,  xp:30, desc:'A sleek aquatic lizard. Its fins shimmer like ocean waves.', sprite:'Wavelet' },
    11: { id:11, name:'Sproutail', type:'Grass', emoji:'🌿', hp:32, atk:9,  def:10, xp:30, desc:'A gentle seed creature. Its leafy tail brushes luck into things.', sprite:'Sproutail' },
  };

  var TYPE_COLORS = {
    Fire:'#e74c3c', Rock:'#95a5a6', Ice:'#74b9ff', Electric:'#fdcb6e',
    Earth:'#8b6914', Dark:'#6c5ce7', Psychic:'#e91e8c', Water:'#0984e3',
    Grass:'#00b894',
  };

  // ── Party storage ──────────────────────────────────────────────────────────────
  var PARTY_KEY = 'embermon_party';

  function getParty() {
    try { return JSON.parse(localStorage.getItem(PARTY_KEY) || '[]'); } catch(e){ return []; }
  }

  function addToParty(mon) {
    var party = getParty();
    if (party.length >= 6) { showToast('Party full!'); return false; }
    party.push({ speciesId:mon.id, name:mon.name, hp:mon.hp, maxHp:mon.hp, level: mon.level || 1 });
    localStorage.setItem(PARTY_KEY, JSON.stringify(party));
    return true;
  }

  window.EmbermonGetParty = getParty;

  // ── CSS animations ─────────────────────────────────────────────────────────────
  (function() {
    var s = document.createElement('style');
    s.textContent = [
      '@keyframes emFadeIn{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}',
      '@keyframes emPop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}',
    ].join('');
    document.head.appendChild(s);
  })();

  // ── Toast ──────────────────────────────────────────────────────────────────────
  function showToast(msg, color) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = [
      'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);',
      'background:'+(color||'#2c3e50')+';color:#fff;padding:10px 22px;',
      'border-radius:4px;font-family:"Courier New",monospace;font-size:13px;',
      'z-index:10100;pointer-events:none;box-shadow:0 2px 12px #0005;',
      'animation:emFadeIn 0.25s ease;'
    ].join('');
    document.body.appendChild(t);
    setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 2800);
  }

  // ── DOM helper ─────────────────────────────────────────────────────────────────
  function div(css) { var e = document.createElement('div'); if (css) e.style.cssText = css; return e; }
  function el(tag, css) { var e = document.createElement(tag); if (css) e.style.cssText = css; return e; }

  // ── Starter chooser overlay ────────────────────────────────────────────────────
  var starterOverlay = null;
  var starterResolve = null;

  function showStarterOverlay(speciesId, onChosen, onDeclined) {
    if (starterOverlay) starterOverlay.remove();

    var mon = window.EMBERMON_SPECIES[speciesId];
    if (!mon) { if (onDeclined) onDeclined(); return; }

    var tc = TYPE_COLORS[mon.type] || '#888';
    starterOverlay = div([
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9995;',
      'display:flex;align-items:center;justify-content:center;',
      'font-family:"Courier New",monospace;animation:emFadeIn 0.3s ease;'
    ].join(''));

    var box = div([
      'background:#0e1a08;border:2px solid '+tc+';border-radius:6px;',
      'padding:28px 32px;max-width:400px;width:90%;text-align:center;',
      'box-shadow:0 0 40px '+tc+'44;animation:emPop 0.3s ease;'
    ].join(''));

    // Icon
    var icon = div([
      'width:88px;height:88px;border-radius:50%;margin:0 auto 16px;',
      'background:'+tc+'22;border:3px solid '+tc+';',
      'display:flex;align-items:center;justify-content:center;font-size:48px;'
    ].join(''));

    // Try to show the sprite image if available
    if (mon.sprite) {
      var img = document.createElement('img');
      img.src = 'img/sv_enemies/' + mon.sprite + '.png';
      img.style.cssText = 'max-width:72px;max-height:72px;image-rendering:pixelated;';
      img.onerror = function() { icon.textContent = mon.emoji || '✨'; };
      icon.appendChild(img);
    } else {
      icon.textContent = mon.emoji || '✨';
    }
    box.appendChild(icon);

    var nameEl = el('h3', 'margin:0 0 4px;font-size:22px;color:'+tc+';letter-spacing:2px;');
    nameEl.textContent = mon.name;
    box.appendChild(nameEl);

    var typeEl = el('div', 'font-size:10px;letter-spacing:3px;color:'+tc+'aa;margin-bottom:10px;');
    typeEl.textContent = mon.type.toUpperCase() + ' TYPE';
    box.appendChild(typeEl);

    var descEl = el('div', 'font-size:12px;color:#c8d8b0;line-height:1.5;margin-bottom:20px;padding:0 8px;');
    descEl.textContent = mon.desc;
    box.appendChild(descEl);

    // Stats row
    var stats = div('display:flex;justify-content:center;gap:16px;margin-bottom:22px;');
    [['HP', mon.hp], ['ATK', mon.atk], ['DEF', mon.def]].forEach(function(s) {
      var stat = div('text-align:center;');
      var sv = el('div', 'font-size:18px;font-weight:bold;color:'+tc+';');
      sv.textContent = s[1];
      var sl = el('div', 'font-size:9px;color:#6aad3c;letter-spacing:2px;');
      sl.textContent = s[0];
      stat.appendChild(sv);
      stat.appendChild(sl);
      stats.appendChild(stat);
    });
    box.appendChild(stats);

    var question = el('div', 'font-size:13px;color:#e8e0c8;margin-bottom:16px;');
    question.textContent = 'Take ' + mon.name + ' as your partner?';
    box.appendChild(question);

    // Buttons
    var btnRow = div('display:flex;gap:10px;');
    function makeBtn(label, bg, fg, action) {
      var b = el('button', [
        'flex:1;padding:11px 0;background:'+bg+';color:'+fg+';',
        'border:1px solid '+fg+'55;border-radius:3px;font-family:inherit;',
        'font-size:13px;cursor:pointer;letter-spacing:1px;font-weight:bold;'
      ].join(''));
      b.textContent = label;
      b.addEventListener('click', function() {
        starterOverlay.remove();
        starterOverlay = null;
        action();
      });
      return b;
    }
    btnRow.appendChild(makeBtn('YES! Choose ' + mon.name, '#1a4a0a', '#6aad3c', function() {
      addToParty(Object.assign({}, mon, { maxHp:mon.hp, currentHp:mon.hp, level:5 }));
      showToast(mon.name + ' is now your partner!', '#27ae60');
      if (onChosen) onChosen(mon);
    }));
    btnRow.appendChild(makeBtn('Not this one', '#2a2a1a', '#888', function() {
      if (onDeclined) onDeclined();
    }));
    box.appendChild(btnRow);

    starterOverlay.appendChild(box);
    document.body.appendChild(starterOverlay);
  }

  // ── Battle overlay (same as before but with sprite support) ───────────────────
  var battleOverlay = null;
  var battleState = null;

  function showBattleOverlay(mon, isTrainer, trainerName) {
    if (battleOverlay) battleOverlay.remove();
    battleState = {
      mon: mon, playerHp:50, playerMaxHp:50,
      isTrainer:!!isTrainer, trainerName:trainerName||'Trainer',
    };
    battleOverlay = buildBattleDOM();
    document.body.appendChild(battleOverlay);
  }

  function buildBattleDOM() {
    var mon = battleState.mon;
    var tc = TYPE_COLORS[mon.type] || '#888';

    var overlay = div([
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9990;',
      'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;',
      'font-family:"Courier New",monospace;'
    ].join(''));
    overlay.id = 'em-battle';

    // Arena
    var arena = div('flex:1;width:100%;max-width:600px;position:relative;display:flex;align-items:center;justify-content:center;');

    // Enemy card
    var enemyBox = div([
      'position:absolute;top:20px;right:20px;background:#0e1a08;',
      'border:2px solid '+tc+';padding:10px 14px;min-width:180px;border-radius:4px;'
    ].join(''));
    var eTitle = el('div', 'color:#e8e0c8;font-size:13px;font-weight:bold;');
    eTitle.textContent = mon.name + ' Lv.' + (mon.level||1);
    var eType = el('div', 'font-size:9px;letter-spacing:2px;margin:2px 0 6px;color:'+tc+';');
    eType.textContent = mon.type.toUpperCase();
    var eHpBar = div('background:#1a2a0a;border:1px solid '+tc+'55;height:8px;border-radius:4px;overflow:hidden;');
    var eHpFill = div('height:100%;width:100%;background:#27ae60;transition:width 0.3s;');
    eHpFill.id = 'em-enemy-hp-fill';
    eHpBar.appendChild(eHpFill);
    var eHpText = el('div', 'font-size:10px;color:#c8d8b0;margin-top:4px;');
    eHpText.id = 'em-enemy-hp-text';
    eHpText.textContent = mon.currentHp+'/'+mon.maxHp+' HP';
    enemyBox.appendChild(eTitle); enemyBox.appendChild(eType);
    enemyBox.appendChild(eHpBar); enemyBox.appendChild(eHpText);

    // Player card
    var playerBox = div([
      'position:absolute;bottom:20px;left:20px;background:#0e1a08;',
      'border:2px solid #6aad3c;padding:10px 14px;min-width:180px;border-radius:4px;'
    ].join(''));
    var char = window.EmbermonGetCharacter ? window.EmbermonGetCharacter() : {};
    var pTitle = el('div', 'color:#e8e0c8;font-size:13px;font-weight:bold;');
    pTitle.textContent = (char&&char.name?char.name:'Trainer') + ' Lv.5';
    var pHpBar = div('background:#1a2a0a;border:1px solid #6aad3c55;height:8px;border-radius:4px;overflow:hidden;margin-top:6px;');
    var pHpFill = div('height:100%;width:100%;background:#27ae60;transition:width 0.3s;');
    pHpFill.id = 'em-player-hp-fill';
    pHpBar.appendChild(pHpFill);
    var pHpText = el('div', 'font-size:10px;color:#c8d8b0;margin-top:4px;');
    pHpText.id = 'em-player-hp-text';
    pHpText.textContent = battleState.playerHp+'/'+battleState.playerMaxHp+' HP';
    playerBox.appendChild(pTitle); playerBox.appendChild(pHpBar); playerBox.appendChild(pHpText);

    // Mon display
    var monIcon = div([
      'width:96px;height:96px;border-radius:50%;',
      'background:'+tc+'22;border:3px solid '+tc+';',
      'display:flex;align-items:center;justify-content:center;font-size:48px;'
    ].join(''));
    if (mon.sprite) {
      var sImg = document.createElement('img');
      sImg.src = 'img/sv_enemies/' + mon.sprite + '.png';
      sImg.style.cssText = 'max-width:80px;max-height:80px;image-rendering:pixelated;';
      sImg.onerror = function() { monIcon.textContent = mon.emoji||'✨'; };
      monIcon.appendChild(sImg);
    } else {
      monIcon.textContent = mon.emoji||'✨';
    }

    arena.appendChild(enemyBox); arena.appendChild(playerBox); arena.appendChild(monIcon);
    overlay.appendChild(arena);

    // Bottom UI
    var bottom = div([
      'width:100%;max-width:600px;background:#0e1a08;border-top:2px solid #3a5a1a;',
      'padding:14px 20px;'
    ].join(''));

    var logBox = div([
      'font-size:13px;color:#e8e0c8;margin-bottom:12px;min-height:36px;',
      'border:1px solid #2a3a1a;background:#060e04;padding:8px 10px;border-radius:3px;'
    ].join(''));
    logBox.id = 'em-battle-log';
    logBox.textContent = (battleState.isTrainer
      ? battleState.trainerName + ' sent out ' + mon.name + '!'
      : 'A wild ' + mon.name + ' appeared!');

    var btnRow = div('display:flex;gap:8px;');
    function makeBtn(label, color, action) {
      var b = el('button', [
        'flex:1;padding:10px 0;background:'+color+'22;color:'+color+';',
        'border:1px solid '+color+'55;border-radius:3px;font-family:inherit;',
        'font-size:12px;cursor:pointer;letter-spacing:1px;font-weight:bold;'
      ].join(''));
      b.textContent = label;
      b.addEventListener('mouseenter', function(){ b.style.background=color+'44'; });
      b.addEventListener('mouseleave', function(){ b.style.background=color+'22'; });
      b.addEventListener('click', function(){ doAction(action); });
      return b;
    }
    btnRow.appendChild(makeBtn('FIGHT', '#e74c3c', 'fight'));
    if (!battleState.isTrainer) btnRow.appendChild(makeBtn('CATCH', '#f39c12', 'catch'));
    btnRow.appendChild(makeBtn('FLEE', '#7f8c8d', 'flee'));

    var desc = el('div', 'font-size:9px;color:#3a5a1a;margin-top:8px;text-align:center;');
    desc.textContent = mon.desc;

    bottom.appendChild(logBox); bottom.appendChild(btnRow); bottom.appendChild(desc);
    overlay.appendChild(bottom);
    return overlay;
  }

  function updateHpBars() {
    var mon = battleState.mon;
    var ep = Math.max(0, (mon.currentHp/mon.maxHp)*100);
    var pp = Math.max(0, (battleState.playerHp/battleState.playerMaxHp)*100);
    var col = ep>50?'#27ae60':ep>20?'#f39c12':'#e74c3c';
    var ef = document.getElementById('em-enemy-hp-fill');
    var et = document.getElementById('em-enemy-hp-text');
    var pf = document.getElementById('em-player-hp-fill');
    var pt = document.getElementById('em-player-hp-text');
    if (ef) { ef.style.width=ep+'%'; ef.style.background=col; }
    if (et) et.textContent=mon.currentHp+'/'+mon.maxHp+' HP';
    if (pf) pf.style.width=pp+'%';
    if (pt) pt.textContent=battleState.playerHp+'/'+battleState.playerMaxHp+' HP';
  }

  function setLog(text) {
    var el2 = document.getElementById('em-battle-log');
    if (el2) el2.textContent = text;
  }

  function disableButtons() {
    if (!battleOverlay) return;
    battleOverlay.querySelectorAll('button').forEach(function(b){
      b.disabled=true; b.style.opacity='0.4';
    });
  }

  function enableButtons() {
    if (!battleOverlay) return;
    battleOverlay.querySelectorAll('button').forEach(function(b){
      b.disabled=false; b.style.opacity='1';
    });
  }

  function endBattle(won) {
    disableButtons();
    setTimeout(function(){
      if (battleOverlay) { battleOverlay.remove(); battleOverlay=null; }
      if (won && $gameVariables) $gameVariables.setValue(10, ($gameVariables.value(10)||0)+1);
    }, 1500);
  }

  function doAction(action) {
    var mon = battleState.mon;
    disableButtons();

    if (action === 'flee') {
      setLog('Got away safely!');
      setTimeout(function(){ endBattle(false); }, 1200);
      return;
    }

    if (action === 'fight') {
      var dmg = Math.max(1, 8+Math.floor(Math.random()*6)-Math.floor(mon.def/3));
      mon.currentHp = Math.max(0, mon.currentHp-dmg);
      setLog('You strike for '+dmg+' damage!');
      updateHpBars();
      setTimeout(function(){
        if (mon.currentHp <= 0) { setLog(mon.name+' fainted! You won!'); endBattle(true); return; }
        var ed = Math.max(1, Math.floor(mon.atk*0.5+Math.random()*4));
        battleState.playerHp = Math.max(0, battleState.playerHp-ed);
        setLog(mon.name+' strikes back for '+ed+' damage!');
        updateHpBars();
        if (battleState.playerHp <= 0) { setTimeout(function(){ setLog('You blacked out!'); endBattle(false); }, 900); }
        else { enableButtons(); }
      }, 800);
      return;
    }

    if (action === 'catch') {
      var hp = mon.currentHp/mon.maxHp;
      var caught = Math.random() > (0.3+hp*0.5);
      setLog('You throw an Emberball...');
      setTimeout(function(){
        if (caught) {
          setLog('Gotcha! '+mon.name+' was caught!');
          addToParty(mon);
          endBattle(true);
        } else {
          setLog(mon.name+' broke free!');
          setTimeout(function(){
            var ed = Math.max(1, Math.floor(mon.atk*0.4+Math.random()*3));
            battleState.playerHp = Math.max(0, battleState.playerHp-ed);
            setLog(mon.name+' is angry! Deals '+ed+' dmg!');
            updateHpBars();
            enableButtons();
          }, 800);
        }
      }, 900);
      return;
    }
  }

  // ── Wild encounter system ──────────────────────────────────────────────────────
  var ENCOUNTER_MAP = {
    9: [[1,40],[4,30],[6,20],[7,10]],
    7: [[2,35],[3,25],[5,25],[8,15]],
  };

  var _updateEncounterCount = Game_Player.prototype.updateEncounterCount;
  Game_Player.prototype.updateEncounterCount = function() {
    _updateEncounterCount.call(this);
    if (this._encounterCount <= 0) {
      var mapId = $gameMap.mapId();
      if (ENCOUNTER_MAP[mapId] && Math.random() < 0.4) {
        this._encounterCount = 30+Math.floor(Math.random()*20);
        var table = ENCOUNTER_MAP[mapId];
        var total = table.reduce(function(s,r){ return s+r[1]; },0);
        var roll = Math.random()*total;
        for (var i=0;i<table.length;i++) { roll-=table[i][1]; if(roll<=0) { triggerWild(table[i][0]); return; } }
        triggerWild(table[0][0]);
      }
    }
  };

  function triggerWild(speciesId) {
    var spec = window.EMBERMON_SPECIES[speciesId];
    if (!spec) return;
    var lvl = 1+Math.floor(Math.random()*5);
    var mon = Object.assign({}, spec, {
      level:lvl,
      maxHp:Math.floor(spec.hp*(0.8+lvl*0.1)),
      atk:Math.floor(spec.atk*(0.8+lvl*0.1)),
    });
    mon.currentHp = mon.maxHp;
    showBattleOverlay(mon, false, null);
  }

  // ── Plugin commands ────────────────────────────────────────────────────────────
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);

    if (command === 'WILD_BATTLE') {
      var sid = parseInt(args[0],10)||1;
      var spec = window.EMBERMON_SPECIES[sid];
      if (spec) { var m=Object.assign({},spec,{currentHp:spec.hp,maxHp:spec.hp,level:1}); showBattleOverlay(m,false,null); }
    }

    if (command === 'TRAINER_BATTLE') {
      var tName = args[0]||'Trainer';
      var sid2 = parseInt(args[1],10)||3;
      var spec2 = window.EMBERMON_SPECIES[sid2];
      if (spec2) {
        var lvl = 3;
        var m2 = Object.assign({},spec2,{ maxHp:Math.floor(spec2.hp*1.3), currentHp:Math.floor(spec2.hp*1.3), atk:Math.floor(spec2.atk*1.3), level:lvl });
        showBattleOverlay(m2, true, tName);
      }
    }

    if (command === 'CHOOSE_STARTER') {
      var sid3 = parseInt(args[0],10)||9;
      // Just show the starter info — the map event already handled YES/NO
      // This triggers after the YES choice so we just confirm addition
      var spec3 = window.EMBERMON_SPECIES[sid3];
      if (spec3) {
        var party = getParty();
        if (party.length === 0) {
          addToParty(Object.assign({},spec3,{maxHp:spec3.hp,currentHp:spec3.hp,level:5}));
          showToast(spec3.name + ' joined your party! ★', '#27ae60');
        }
      }
    }

    if (command === 'STARTER_BATTLE') {
      // Legacy: treat as wild encounter with the pokemon
      var sid4 = parseInt(args[0],10)||9;
      var spec4 = window.EMBERMON_SPECIES[sid4];
      if (spec4) { var m4=Object.assign({},spec4,{currentHp:Math.floor(spec4.hp*0.5),maxHp:spec4.hp,atk:Math.floor(spec4.atk*0.5),level:1}); showBattleOverlay(m4,false,null); }
    }

    if (command === 'SHOW_PARTY') {
      showPartyOverlay();
    }
  };

  // ── Party overlay ──────────────────────────────────────────────────────────────
  function showPartyOverlay() {
    var party = getParty();
    var overlay = div([
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9990;',
      'display:flex;align-items:center;justify-content:center;',
      'font-family:"Courier New",monospace;'
    ].join(''));
    var box = div('background:#0e1a08;border:2px solid #6aad3c;padding:24px;max-width:480px;width:90%;border-radius:6px;');
    var title2 = el('h3','color:#a3e635;margin:0 0 16px;font-size:15px;');
    title2.textContent = 'Your Embermon ('+party.length+'/6)';
    box.appendChild(title2);
    if (party.length===0) {
      var empty = el('p','color:#6aad3c;font-size:12px;');
      empty.textContent = 'No Embermon yet — explore Ember Town!';
      box.appendChild(empty);
    } else {
      party.forEach(function(mon) {
        var sp = window.EMBERMON_SPECIES[mon.speciesId]||{};
        var tc = TYPE_COLORS[sp.type]||'#888';
        var row = div('display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 10px;background:#060e04;border:1px solid #2a3a1a;border-radius:3px;');
        var icon2 = el('span','font-size:24px;');
        icon2.textContent = sp.emoji||'✨';
        var info = div('');
        var n2 = el('div','color:#e8e0c8;font-size:13px;font-weight:bold;'); n2.textContent=mon.name;
        var t2 = el('div','font-size:10px;color:'+tc+';'); t2.textContent=(sp.type||'')+' Lv.'+(mon.level||1);
        info.appendChild(n2); info.appendChild(t2);
        var hp2 = el('div','margin-left:auto;font-size:10px;color:#6aad3c;'); hp2.textContent='HP '+mon.hp+'/'+mon.maxHp;
        row.appendChild(icon2); row.appendChild(info); row.appendChild(hp2);
        box.appendChild(row);
      });
    }
    var note = el('p','font-size:10px;color:#3a5a1a;margin:14px 0 0;line-height:1.5;');
    note.textContent = 'Caught Embermon will be minted as NFTs on EmberChain when the network goes live.';
    box.appendChild(note);
    var closeBtn = el('button','margin-top:14px;padding:8px 20px;background:#1a4a0a;color:#a3e635;border:1px solid #6aad3c;font-family:inherit;cursor:pointer;border-radius:3px;');
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function(){ overlay.remove(); });
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

})();
