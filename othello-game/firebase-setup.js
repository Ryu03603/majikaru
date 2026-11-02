// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCt2PA4Tq9u8RQxFRCs_0olJJj6dvIt0xk",
  authDomain: "majikaru-73859.firebaseapp.com",
  databaseURL: "https://majikaru-73859-default-rtdb.firebaseio.com",
  projectId: "majikaru-73859",
  storageBucket: "majikaru-73859.firebasestorage.app",
  messagingSenderId: "946814197843",
  appId: "1:946814197843:web:d4097ca2bb4bfdca32e6a6"
};

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const database = typeof firebase !== 'undefined' ? firebase.database() : null;

let currentRoomId = null;
let currentRoomType = 'rooms'; // 'rooms' (フレンド) または 'random_rooms' (ランダム)
let isHost = false; 
window.isOnlineMode = false;
window.isMatchingWaiting = false;
let onlineTurnListener = null;
let matchCountdownTimer = null;
let hasStartedMatch = false;
let currentMatchConfig = null;
let myHasReady = false;
let opponentHasReady = false;
let readyListenerRef = null;
let statusListenerRef = null;

// リスナーおよびタイマーの完全クリーンアップ関数
function cleanupOnlineSession(clearRoomId = true) {
  if (matchCountdownTimer) {
    clearInterval(matchCountdownTimer);
    matchCountdownTimer = null;
  }
  if (onlineTurnListener && currentRoomId && database) {
    try {
      getRoomRef(currentRoomId, currentRoomType).child('moves').off();
    } catch (e) { console.warn(e); }
    onlineTurnListener = null;
  }
  if (statusListenerRef) {
    try {
      statusListenerRef.off();
    } catch (e) { console.warn(e); }
    statusListenerRef = null;
  }
  if (readyListenerRef) {
    try {
      readyListenerRef.off();
    } catch (e) { console.warn(e); }
    readyListenerRef = null;
  }

  hasStartedMatch = false;
  myHasReady = false;
  opponentHasReady = false;
  currentMatchConfig = null;

  if (clearRoomId) {
    currentRoomId = null;
    isHost = false;
  }
}
window.netCleanup = cleanupOnlineSession;

window.localPlayerName = "あなた";
window.remotePlayerName = "相手";
window.myOnlineColor = 1; // BLACK = 1, WHITE = 2

// 名前の省略表示関数（長すぎる名前は「…」にする）
window.formatDisplayName = function(name, maxChars = 7) {
  if (!name) return "あなた";
  if (name.length > maxChars) {
    return name.substring(0, maxChars) + "…";
  }
  return name;
};

function getRoomRef(roomId, roomType = currentRoomType) {
  return database.ref(roomType + '/' + roomId);
}

// ボタン表示の切り替え（開始 ⇔ 停止）および設定欄のロック制御
window.updateMatchingButtonUI = function(isWaiting) {
  window.isMatchingWaiting = isWaiting;
  const btn = document.getElementById('btn-start-matching');
  if (btn) {
    if (isWaiting) {
      btn.textContent = "マッチング停止";
      btn.style.background = "linear-gradient(135deg, #ef4444, #dc2626)";
      btn.style.boxShadow = "0 4px 6px rgba(239, 68, 68, 0.3)";
      btn.disabled = false;
    } else {
      btn.textContent = "マッチング開始";
      btn.style.background = "linear-gradient(135deg, #3b82f6, #1d4ed8)";
      btn.style.boxShadow = "0 4px 6px rgba(59, 130, 246, 0.3)";
      btn.disabled = false;
    }
  }

  // マッチング待機中のロック／解除（ゲームモード、対戦形式、名前、合言葉）
  const modeRadios = document.querySelectorAll('input[name="game-mode"]');
  modeRadios.forEach(radio => {
    radio.disabled = isWaiting;
    const parentLabel = radio.closest('.radio-btn');
    if (parentLabel) {
      parentLabel.style.opacity = isWaiting ? '0.45' : '1';
      parentLabel.style.pointerEvents = isWaiting ? 'none' : 'auto';
    }
  });

  const opRadios = document.querySelectorAll('input[name="opponent-type"]');
  opRadios.forEach(radio => {
    radio.disabled = isWaiting;
    const parentLabel = radio.closest('.radio-btn');
    if (parentLabel) {
      parentLabel.style.opacity = isWaiting ? '0.45' : '1';
      parentLabel.style.pointerEvents = isWaiting ? 'none' : 'auto';
    }
  });

  const nameInput = document.getElementById('online-player-name');
  if (nameInput) {
    nameInput.disabled = isWaiting;
    nameInput.style.opacity = isWaiting ? '0.5' : '1';
  }

  const passInput = document.getElementById('online-password');
  if (passInput) {
    passInput.disabled = isWaiting;
    passInput.style.opacity = isWaiting ? '0.5' : '1';
  }
};

// PRNG for deterministic randomness in online matches
let onlineRandomSeed = 1;
function setOnlineSeed(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  onlineRandomSeed = Math.abs(hash) + 1;
}

const originalMathRandom = Math.random;
function seededRandom() {
  if (!window.isOnlineMode) return originalMathRandom();
  onlineRandomSeed = (onlineRandomSeed * 9301 + 49297) % 233280;
  return onlineRandomSeed / 233280;
}
Math.random = seededRandom;

// マッチング処理
window.netMatchmake = function(password, playerName) {
  if (!database) {
    alert("Firebaseが読み込まれていません。通信環境をご確認ください。");
    window.updateMatchingButtonUI(false);
    return;
  }

  window.localPlayerName = playerName;
  hasStartedMatch = false;

  const modeRadio = document.querySelector('input[name="game-mode"]:checked');
  const modeVal = modeRadio ? modeRadio.value : 'normal';
  const modeName = modeVal === 'manosaba' ? 'まじかるモード' : (modeVal === 'special' ? '特殊モード' : '通常モード');

  const statusMsg = document.getElementById('online-status-msg');
  if (statusMsg) statusMsg.textContent = "接続中...";

  const trimmedPassword = password ? password.trim() : "";

  // 1. 合言葉なし：ランダムマッチング
  if (!trimmedPassword) {
    currentRoomType = 'random_rooms';
    if (statusMsg) statusMsg.textContent = "対戦相手を探しています (ランダムマッチ)...";

    database.ref('random_rooms').once('value').then((snapshot) => {
      if (!window.isMatchingWaiting) return;

      let matchedRoomId = null;
      let matchedRoomData = null;

      if (snapshot.exists()) {
        const rooms = snapshot.val();
        for (const rId in rooms) {
          const r = rooms[rId];
          if (r.status === 'waiting' && r.gameMode === modeVal) {
            matchedRoomId = rId;
            matchedRoomData = r;
            break;
          }
        }
      }

      if (matchedRoomId && matchedRoomData) {
        joinAsGuest(matchedRoomId, matchedRoomData, playerName, modeVal, hostModeName => hostModeName || modeName, 'random_rooms');
      } else {
        const newRoomId = 'rand_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        createAsHost(newRoomId, playerName, modeVal, modeName, 'random_rooms', "対戦相手を探しています (ランダムマッチ)...");
      }
    }).catch(err => {
      console.error(err);
      if (statusMsg) statusMsg.textContent = "通信エラーが発生しました: " + (err.message || "");
      window.updateMatchingButtonUI(false);
    });

    return;
  }

  // 2. 合言葉あり：フレンド対戦
  currentRoomType = 'rooms';
  const roomId = modeVal + '_' + trimmedPassword;
  cleanupOnlineSession(true);

  currentRoomId = roomId;
  window.isMatchingWaiting = true;
  window.updateMatchingButtonUI(true);

  const roomRef = database.ref('rooms/' + roomId);

  // Use transaction with numeric timestamp (ServerValue.TIMESTAMP is illegal inside transaction)
  roomRef.transaction((currentData) => {
    const now = Date.now();
    const isOldRoom = currentData && currentData.timestamp && (now - currentData.timestamp > 20 * 60 * 1000);
    const isFinished = currentData && (currentData.status === 'finished' || currentData.status === 'cancelled');
    const canCreateHost = !currentData || isFinished || isOldRoom;

    if (canCreateHost) {
      const hostColor = Math.random() < 0.5 ? 1 : 2;
      return {
        status: 'waiting',
        hostName: playerName,
        hostColor: hostColor,
        gameMode: modeVal,
        gameModeName: modeName,
        timestamp: now,
        hostReady: false,
        guestReady: false,
        moves: null
      };
    } else if (currentData.status === 'waiting') {
      if (currentData.gameMode && currentData.gameMode !== modeVal) {
        return;
      }
      const guestColor = currentData.hostColor === 1 ? 2 : 1;
      return {
        ...currentData,
        status: 'matched',
        guestName: playerName,
        guestColor: guestColor,
        guestReady: false
      };
    } else {
      return; // abort
    }
  }, (error, committed, snapshot) => {
    if (error) {
      console.error("Matchmake transaction error:", error);
      if (statusMsg) statusMsg.textContent = "\u901A\u4FE1\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: " + (error.message || "");
      cleanupOnlineSession(true);
      window.updateMatchingButtonUI(false);
      return;
    }

    if (!committed || !snapshot || !snapshot.exists()) {
      if (statusMsg) statusMsg.textContent = "\u3053\u306E\u5408\u8A00\u8449\u306E\u90E8\u5C4B\u306F\u3059\u3067\u306B\u5BFE\u6226\u4E2D\u304B\u6E80\u5BA4\u3067\u3059\u3002";
      cleanupOnlineSession(true);
      window.updateMatchingButtonUI(false);
      return;
    }

    if (!window.isMatchingWaiting) {
      cleanupOnlineSession(true);
      return;
    }

    const roomData = snapshot.val();
    if (roomData.guestName === playerName && roomData.status === 'matched') {
      joinAsGuest(roomId, roomData, playerName, modeVal, hostModeName => hostModeName || modeName, 'rooms');
    } else {
      createAsHost(roomId, playerName, modeVal, modeName, 'rooms', "合言葉「" + trimmedPassword + "」で対戦相手を待機しています…", roomData.hostColor || 1);
    }
  });
};

function createAsHost(roomId, playerName, modeVal, modeName, roomType, waitingMsg, explicitHostColor = null) {
  const statusMsg = document.getElementById('online-status-msg');
  const hostColor = explicitHostColor !== null ? explicitHostColor : (Math.random() < 0.5 ? 1 : 2);
  window.myOnlineColor = hostColor;

  currentRoomId = roomId;
  currentRoomType = roomType;
  isHost = true;
  window.isOnlineMode = true;
  setOnlineSeed(roomId);

  if (statusMsg) statusMsg.textContent = waitingMsg;
  window.updateMatchingButtonUI(true);

  if (statusListenerRef) {
    statusListenerRef.off();
    statusListenerRef = null;
  }
  if (roomType === 'rooms') {
    getRoomRef(roomId, roomType).child('moves').remove().catch(e => console.warn(e));
  }
  statusListenerRef = getRoomRef(roomId, roomType).child('status');
  statusListenerRef.on('value', (snap) => {
    const st = snap.val();
    if (st === 'matched') {
      getRoomRef(roomId, roomType).once('value').then(rSnap => {
        const rData = rSnap.val();
        if (!rData) return;
        window.remotePlayerName = rData.guestName || "\u76F8\u624B";
        const myCol = rData.hostColor || hostColor;
        const opCol = myCol === 1 ? 2 : 1;
        showMatchConfirmModal({
          gameMode: rData.gameMode || modeVal,
          gameModeName: rData.gameModeName || modeName,
          myColor: myCol,
          opponentColor: opCol,
          opponentName: window.remotePlayerName
        });
      });
    } else if (st === 'cancelled') {
      cancelMatch("\u5BFE\u6226\u76F8\u624B\u304C\u30DE\u30C3\u30C1\u30F3\u30B0\u3092\u30AD\u30E3\u30F3\u305B\u30EB\u3057\u307E\u3057\u305F\u3002");
    } else if (st === 'started') {
      onMatchStarted(hostColor, modeVal);
    }
  });

  if (roomType === 'random_rooms') {
    getRoomRef(roomId, roomType).set({
      status: 'waiting',
      hostName: playerName,
      hostColor: hostColor,
      gameMode: modeVal,
      gameModeName: modeName,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => {
      console.error(err);
      cancelMatch("\u90E8\u5C4B\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
    });
  }
}

function joinAsGuest(roomId, data, playerName, modeVal, getModeName, roomType) {
  const statusMsg = document.getElementById('online-status-msg');
  const hostColor = data.hostColor || 1;
  const guestColor = hostColor === 1 ? 2 : 1;
  window.myOnlineColor = guestColor;

  currentRoomId = roomId;
  currentRoomType = roomType;
  isHost = false;
  window.isOnlineMode = true;
  setOnlineSeed(roomId);
  window.remotePlayerName = data.hostName || "\u76F8\u624B";

  const hostGameMode = data.gameMode || modeVal;
  const hostGameModeName = getModeName(data.gameModeName);

  if (statusMsg) statusMsg.textContent = "\u5BFE\u6226\u76F8\u624B\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F\uFF01";

  showMatchConfirmModal({
    gameMode: hostGameMode,
    gameModeName: hostGameModeName,
    myColor: guestColor,
    opponentColor: hostColor,
    opponentName: window.remotePlayerName
  });

  if (statusListenerRef) {
    statusListenerRef.off();
    statusListenerRef = null;
  }
  if (roomType === 'rooms') {
    getRoomRef(roomId, roomType).child('moves').remove().catch(e => console.warn(e));
  }
  statusListenerRef = getRoomRef(roomId, roomType).child('status');
  statusListenerRef.on('value', (snap) => {
    const st = snap.val();
    if (st === 'started') {
      onMatchStarted(guestColor, hostGameMode);
    } else if (st === 'cancelled') {
      cancelMatch("\u5BFE\u6226\u76F8\u624B\u304C\u30DE\u30C3\u30C1\u30F3\u30B0\u3092\u30AD\u30E3\u30F3\u305B\u30EB\u3057\u307E\u3057\u305F\u3002");
    }
  });

  if (roomType === 'random_rooms') {
    getRoomRef(roomId, roomType).update({
      status: 'matched',
      guestName: playerName,
      guestColor: guestColor
    });
  }
}

function showMatchConfirmModal(config) {
  currentMatchConfig = config;
  hasStartedMatch = false;
  myHasReady = false;
  opponentHasReady = false;
  window.updateMatchingButtonUI(false);

  const modal = document.getElementById('match-confirm-modal');
  const myColorStr = config.myColor === 1 ? "\u9ED2 (\u5148\u624B)" : "\u767D (\u5F8C\u624B)";
  const opColorStr = config.opponentColor === 1 ? "\u9ED2 (\u5148\u624B)" : "\u767D (\u5F8C\u624B)";

  const myFormatted = window.formatDisplayName(window.localPlayerName);
  const opFormatted = window.formatDisplayName(config.opponentName);

  document.getElementById('match-game-mode').textContent = config.gameModeName;
  document.getElementById('match-my-name').textContent = `${myFormatted} (${myColorStr})`;
  document.getElementById('match-opponent-name').textContent = `${opFormatted} (${opColorStr})`;

  const btnStart = document.getElementById('btn-start-match');
  if (btnStart) {
    btnStart.disabled = false;
    btnStart.textContent = "\u5BFE\u6226\u958B\u59CB";
    btnStart.style.background = "linear-gradient(135deg, #10b981, #059669)";
    btnStart.style.fontSize = "1rem";
    btnStart.onclick = () => {
      triggerStartMatch();
    };
  }

  const btnCancel = document.getElementById('btn-cancel-match');
  if (btnCancel) {
    btnCancel.onclick = () => {
      cancelMatchByUser();
    };
  }

  /* Monitor opponent ready status */
  if (readyListenerRef && currentRoomId) {
    readyListenerRef.off();
  }
  const readyKey = isHost ? 'guestReady' : 'hostReady';
  readyListenerRef = getRoomRef(currentRoomId, currentRoomType).child(readyKey);
  readyListenerRef.on('value', (snap) => {
    opponentHasReady = !!snap.val();
    if (opponentHasReady && myHasReady && !hasStartedMatch) {
      getRoomRef(currentRoomId, currentRoomType).update({ status: 'started' });
    }
  });

  let timeLeft = 10;
  const countdownEl = document.getElementById('match-countdown');
  if (countdownEl) countdownEl.textContent = timeLeft;
  modal.style.display = 'flex';

  if (matchCountdownTimer) clearInterval(matchCountdownTimer);

  matchCountdownTimer = setInterval(() => {
    timeLeft--;
    if (countdownEl) countdownEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(matchCountdownTimer);
      timeoutMatch();
    }
  }, 1000);
}

function triggerStartMatch() {
  if (myHasReady || hasStartedMatch) return;
  myHasReady = true;

  const btnStart = document.getElementById('btn-start-match');
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.textContent = "\u76F8\u624B\u306E\u6E96\u5099\u5B8C\u4E86\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\u2026";
    btnStart.style.background = "linear-gradient(135deg, #475569, #334155)";
    btnStart.style.fontSize = "0.82rem";
  }

  if (currentRoomId) {
    const myKey = isHost ? 'hostReady' : 'guestReady';
    getRoomRef(currentRoomId, currentRoomType).update({ [myKey]: true }).then(() => {
      if (opponentHasReady && !hasStartedMatch) {
        getRoomRef(currentRoomId, currentRoomType).update({ status: 'started' });
      }
    }).catch(err => {
      console.error(err);
    });
  }
}

function timeoutMatch() {
  if (hasStartedMatch) return;
  if (currentRoomId) {
    if (currentRoomType === 'random_rooms' && isHost) {
      getRoomRef(currentRoomId, currentRoomType).remove();
    } else {
      getRoomRef(currentRoomId, currentRoomType).update({ status: 'cancelled' });
    }
  }
  cancelMatch("\u78BA\u8A8D\u6642\u9593\u304C\u7D42\u4E86\u3057\u305F\u305F\u3081\u3001\u30DE\u30C3\u30C1\u30F3\u30B0\u3092\u30AD\u30E3\u30F3\u305B\u30EB\u3057\u307E\u3057\u305F\u3002");
}

function onMatchStarted(myColor, gameMode) {
  try {
    if (hasStartedMatch) return;
    hasStartedMatch = true;

    if (matchCountdownTimer) {
      clearInterval(matchCountdownTimer);
      matchCountdownTimer = null;
    }
    if (readyListenerRef) {
      try { readyListenerRef.off(); } catch (e) { console.warn(e); }
      readyListenerRef = null;
    }

    const modal = document.getElementById('match-confirm-modal');
    if (modal) modal.style.display = 'none';

    const effectiveColor = (currentMatchConfig && currentMatchConfig.myColor) ? currentMatchConfig.myColor : myColor;
    startGameOnline(effectiveColor, gameMode);
  } catch (err) {
    console.error("onMatchStarted error:", err);
    alert("対戦開始処理でエラーが発生しました: " + (err.message || err));
  }
}

window.netCancelMatching = function() {
  if (currentRoomId) {
    if (currentRoomType === 'random_rooms' && isHost) {
      getRoomRef(currentRoomId, currentRoomType).remove();
    } else {
      getRoomRef(currentRoomId, currentRoomType).update({ status: 'cancelled' });
    }
  }
  cancelMatch("\u30DE\u30C3\u30C1\u30F3\u30B0\u3092\u505C\u6B62\u3057\u307E\u3057\u305F\u3002");
};

function cancelMatchByUser() {
  if (currentRoomId) {
    if (currentRoomType === 'random_rooms' && isHost) {
      getRoomRef(currentRoomId, currentRoomType).remove();
    } else {
      getRoomRef(currentRoomId, currentRoomType).update({ status: 'cancelled' });
    }
  }
  cancelMatch("\u30DE\u30C3\u30C1\u30F3\u30B0\u3092\u30AD\u30E3\u30F3\u305B\u30EB\u3057\u307E\u3057\u305F\u3002");
}

function cancelMatch(msg) {
  cleanupOnlineSession(true);

  const modal = document.getElementById('match-confirm-modal');
  if (modal) modal.style.display = 'none';

  const btnStart = document.getElementById('btn-start-match');
  if (btnStart) {
    btnStart.disabled = false;
    btnStart.textContent = "\u5BFE\u6226\u958B\u59CB";
    btnStart.style.background = "linear-gradient(135deg, #10b981, #059669)";
    btnStart.style.fontSize = "1rem";
  }

  const statusMsg = document.getElementById('online-status-msg');
  if (statusMsg) statusMsg.textContent = msg || "\u30DE\u30C3\u30C1\u30F3\u30B0\u524D\u306E\u753B\u9762\u306B\u623B\u308A\u307E\u3057\u305F\u3002";

  window.updateMatchingButtonUI(false);

  document.getElementById('btn-play-black').disabled = false;
  document.getElementById('btn-play-white').disabled = false;
  window.isOnlineMode = false;
  window.isMatchingWaiting = false;
}
function attachModalListeners() {
  document.getElementById('btn-start-match')?.addEventListener('click', () => {
    triggerStartMatch();
  });

  document.getElementById('btn-cancel-match')?.addEventListener('click', () => {
    cancelMatchByUser();
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachModalListeners);
} else {
  attachModalListeners();
}

// オンライン対戦開始
function startGameOnline(myColor, gameMode) {
  window.isOnlineMode = true;
  window.myOnlineColor = myColor;
  window.opponentType = 'pvp';
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen) titleScreen.style.display = 'none';
  const modal = document.getElementById('match-confirm-modal');
  if (modal) modal.style.display = 'none';

  window.opponentType = 'pvp';
  if (gameMode === 'manosaba') {
    window.isManosabaMode = true;
    window.isSpecialMode = false;
  } else {
    window.isManosabaMode = false;
    window.isSpecialMode = false;
  }

  // script.js の initGame を実行
  if (typeof window.initGame === 'function') {
    window.initGame(myColor);
  } else if (typeof initGame === 'function') {
    initGame(myColor);
  }

  // プレイヤー名と色の表示を更新（正しいID: player-label, cpu-label）
  const myColorStr = myColor === 1 ? "黒" : "白";
  const opColorStr = myColor === 1 ? "白" : "黒";
  const playerLabel = document.getElementById('player-label');
  const cpuLabel = document.getElementById('cpu-label');
  const myFormatted = window.formatDisplayName(window.localPlayerName);
  const opFormatted = window.formatDisplayName(window.remotePlayerName);

  if (playerLabel) playerLabel.textContent = `${myFormatted} (${myColorStr})`;
  if (cpuLabel) cpuLabel.textContent = `${opFormatted} (${opColorStr})`;

  // 手の同期リスナーを登録
  if (onlineTurnListener && currentRoomId) {
    getRoomRef(currentRoomId).child('moves').off();
  }

  onlineTurnListener = getRoomRef(currentRoomId).child('moves').on('child_added', (snapshot) => {
    const action = snapshot.val();
    if (!action) return;
    if (action.sender === (isHost ? 'host' : 'guest')) return;

    if (action.type === 'place') {
      if (window.processRemoteMove) {
        window.processRemoteMove(action.r, action.c, action.timeLeft);
      }
    } else if (action.type === 'pass') {
      if (window.passTurn) {
        window.passTurn();
      }
    } else if (action.type === 'surrender') {
      // 相手が投了した
      if (window.handleRemoteSurrender) {
        window.handleRemoteSurrender();
      }
    } else if (action.type === 'timeout') {
      // 相手が時間切れになった
      if (window.handleRemoteTimeout) {
        window.handleRemoteTimeout();
      }
    } else if (action.type === 'magic') {
      // 相手が魔法を使った
      if (window.handleRemoteMagic) {
        window.handleRemoteMagic(action);
      }
    } else if (action.type === 'magic_margo_copy') {
      // 相手がマーゴでカードをコピーした
      if (window.handleRemoteMargoCopy) {
        window.handleRemoteMargoCopy(action);
      }
    }
  });
}

// 自身のアクションを送信
window.netSendAction = function(action) {
  if (!window.isOnlineMode || !currentRoomId) return;
  action.sender = isHost ? 'host' : 'guest';
  getRoomRef(currentRoomId).child('moves').push(action);
};


/* Finish game cleanup: update room status to finished for instant rematches */
window.netFinishGame = function() {
  if (!currentRoomId) return;

  const roomId = currentRoomId;
  const roomType = currentRoomType;

  /* 1. Update Firebase status to 'finished' to allow rematches */
  if (roomType === 'random_rooms') {
    getRoomRef(roomId, roomType).remove().catch(e => console.warn(e));
  } else {
    getRoomRef(roomId, roomType).update({
      status: 'finished',
      moves: null,
      finishedAt: firebase.database.ServerValue.TIMESTAMP
    }).catch(e => console.warn(e));
  }

  /* 2. Remove all online listeners */
  cleanupOnlineSession(false);
};
