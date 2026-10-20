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
  const roomId = trimmedPassword;

  database.ref('rooms/' + roomId).once('value').then((snapshot) => {
    if (!window.isMatchingWaiting) return;

    const data = snapshot.val();

    if (!snapshot.exists() || !data || data.status === 'cancelled' || data.status === 'finished') {
      createAsHost(roomId, playerName, modeVal, modeName, 'rooms', "合言葉「" + roomId + "」で対戦相手を待機しています...");
    } else if (data.status === 'waiting') {
      joinAsGuest(roomId, data, playerName, modeVal, hostModeName => hostModeName || modeName, 'rooms');
    } else {
      if (statusMsg) statusMsg.textContent = "この合言葉の部屋はすでに対戦中か満室です。";
      window.updateMatchingButtonUI(false);
    }
  }).catch(err => {
    console.error(err);
    if (statusMsg) statusMsg.textContent = "通信エラーが発生しました: " + (err.message || "");
    window.updateMatchingButtonUI(false);
  });
};

// ホストとして部屋を作成（先手・後手はランダム決定）
function createAsHost(roomId, playerName, modeVal, modeName, roomType, waitingMsg) {
  const statusMsg = document.getElementById('online-status-msg');
  const hostColor = Math.random() < 0.5 ? 1 : 2;
  window.myOnlineColor = hostColor;

  getRoomRef(roomId, roomType).set({
    status: 'waiting',
    hostName: playerName,
    hostColor: hostColor,
    gameMode: modeVal,
    gameModeName: modeName,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).then(() => {
    if (!window.isMatchingWaiting) {
      if (roomType === 'random_rooms') {
        getRoomRef(roomId, roomType).remove();
      } else {
        getRoomRef(roomId, roomType).update({ status: 'cancelled' });
      }
      return;
    }

    currentRoomId = roomId;
    currentRoomType = roomType;
    isHost = true;
    window.isOnlineMode = true;
    setOnlineSeed(roomId);

    if (statusMsg) statusMsg.textContent = waitingMsg;
    window.updateMatchingButtonUI(true);

    getRoomRef(roomId, roomType).child('status').on('value', (snap) => {
      const st = snap.val();
      if (st === 'matched') {
        getRoomRef(roomId, roomType).once('value').then(rSnap => {
          const rData = rSnap.val();
          if (!rData) return;
          window.remotePlayerName = rData.guestName || "相手";
          const myCol = rData.hostColor;
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
        cancelMatch("対戦相手がマッチングをキャンセルしました。");
      } else if (st === 'started') {
        onMatchStarted(hostColor, modeVal);
      }
    });
  });
}

// ゲストとして部屋に参加
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
  window.remotePlayerName = data.hostName || "相手";

  const hostGameMode = data.gameMode || modeVal;
  const hostGameModeName = getModeName(data.gameModeName);

  getRoomRef(roomId, roomType).update({
    status: 'matched',
    guestName: playerName,
    guestColor: guestColor
  }).then(() => {
    if (statusMsg) statusMsg.textContent = "対戦相手が見つかりました！";

    showMatchConfirmModal({
      gameMode: hostGameMode,
      gameModeName: hostGameModeName,
      myColor: guestColor,
      opponentColor: hostColor,
      opponentName: window.remotePlayerName
    });

    getRoomRef(roomId, roomType).child('status').on('value', (snap) => {
      const st = snap.val();
      if (st === 'started') {
        onMatchStarted(guestColor, hostGameMode);
      } else if (st === 'cancelled') {
        cancelMatch("対戦相手がマッチングをキャンセルしました。");
      }
    });
  });
}

// マッチング確認モーダル表示
function showMatchConfirmModal(config) {
  currentMatchConfig = config;
  hasStartedMatch = false;
  myHasReady = false;
  opponentHasReady = false;
  window.updateMatchingButtonUI(false);

  const modal = document.getElementById('match-confirm-modal');
  const myColorStr = config.myColor === 1 ? "黒 (先手)" : "白 (後手)";
  const opColorStr = config.opponentColor === 1 ? "黒 (先手)" : "白 (後手)";

  const myFormatted = window.formatDisplayName(window.localPlayerName);
  const opFormatted = window.formatDisplayName(config.opponentName);

  document.getElementById('match-game-mode').textContent = config.gameModeName;
  document.getElementById('match-my-name').textContent = `${myFormatted} (${myColorStr})`;
  document.getElementById('match-opponent-name').textContent = `${opFormatted} (${opColorStr})`;

  const btnStart = document.getElementById('btn-start-match');
  if (btnStart) {
    btnStart.disabled = false;
    btnStart.textContent = "対戦開始";
    btnStart.style.background = "linear-gradient(135deg, #10b981, #059669)";
    btnStart.style.fontSize = "1rem";
  }

  // 相手のReady状態を監視
  if (readyListenerRef && currentRoomId) {
    readyListenerRef.off();
  }
  const readyKey = isHost ? 'guestReady' : 'hostReady';
  readyListenerRef = getRoomRef(currentRoomId, currentRoomType).child(readyKey);
  readyListenerRef.on('value', (snap) => {
    opponentHasReady = !!snap.val();
    // 相手がReadyになり、自分も既にReadyであれば started に更新
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
      // 10秒カウントダウン終了時はキャンセル
      timeoutMatch();
    }
  }, 1000);
}

// ユーザーが「対戦開始」ボタンを押した時（準備完了状態にする）
function triggerStartMatch() {
  if (myHasReady || hasStartedMatch) return;
  myHasReady = true;

  const btnStart = document.getElementById('btn-start-match');
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.textContent = "相手の準備完了を待っています…";
    btnStart.style.background = "linear-gradient(135deg, #475569, #334155)";
    btnStart.style.fontSize = "0.82rem";
  }

  if (currentRoomId) {
    const myKey = isHost ? 'hostReady' : 'guestReady';
    getRoomRef(currentRoomId, currentRoomType).update({ [myKey]: true }).then(() => {
      // 相手も既にReadyなら started に更新
      if (opponentHasReady && !hasStartedMatch) {
        getRoomRef(currentRoomId, currentRoomType).update({ status: 'started' });
      }
    }).catch(err => {
      console.error(err);
    });
  }
}

// 10秒カウントダウン終了時（タイムアウトキャンセル）
function timeoutMatch() {
  if (hasStartedMatch) return;
  if (matchCountdownTimer) clearInterval(matchCountdownTimer);

  if (currentRoomId) {
    if (currentRoomType === 'random_rooms' && isHost) {
      getRoomRef(currentRoomId, currentRoomType).remove();
    } else {
      getRoomRef(currentRoomId, currentRoomType).update({ status: 'cancelled' });
    }
    getRoomRef(currentRoomId, currentRoomType).child('status').off();
  }

  cancelMatch("確認時間が終了したため、マッチングをキャンセルしました。");
}

// 自身または相手のstarted受信によるゲーム開始
function onMatchStarted(myColor, gameMode) {
  if (hasStartedMatch) return;
  hasStartedMatch = true;

  if (matchCountdownTimer) clearInterval(matchCountdownTimer);
  if (readyListenerRef) {
    readyListenerRef.off();
    readyListenerRef = null;
  }

  const modal = document.getElementById('match-confirm-modal');
  if (modal) modal.style.display = 'none';

  // 二重起動防止（タイトルが既に非表示なら対局中）
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen && titleScreen.style.display === 'none') {
    return;
  }

  startGameOnline(myColor, gameMode);
}

// ユーザーが「マッチング停止」ボタンをクリックした時
window.netCancelMatching = function() {
  if (currentRoomId) {
    if (currentRoomType === 'random_rooms' && isHost) {
      getRoomRef(currentRoomId).remove();
    } else {
      getRoomRef(currentRoomId).update({ status: 'cancelled' });
    }
    getRoomRef(currentRoomId).child('status').off();
  }

  cancelMatch("マッチングを停止しました。");
};

// ユーザーが確認モーダルの「やめる」をクリック
function cancelMatchByUser() {
  if (matchCountdownTimer) clearInterval(matchCountdownTimer);
  if (readyListenerRef) {
    readyListenerRef.off();
    readyListenerRef = null;
  }

  const modal = document.getElementById('match-confirm-modal');
  if (modal) modal.style.display = 'none';

  if (currentRoomId) {
    if (currentRoomType === 'random_rooms' && isHost) {
      getRoomRef(currentRoomId).remove();
    } else {
      getRoomRef(currentRoomId).update({ status: 'cancelled' });
    }
    getRoomRef(currentRoomId, currentRoomType).child('status').off();
  }

  cancelMatch("マッチングをキャンセルしました。");
}

// キャンセル時のUI復元
function cancelMatch(msg) {
  if (matchCountdownTimer) clearInterval(matchCountdownTimer);
  if (readyListenerRef) {
    readyListenerRef.off();
    readyListenerRef = null;
  }
  myHasReady = false;
  opponentHasReady = false;

  const modal = document.getElementById('match-confirm-modal');
  if (modal) modal.style.display = 'none';

  const btnStart = document.getElementById('btn-start-match');
  if (btnStart) {
    btnStart.disabled = false;
    btnStart.textContent = "対戦開始";
    btnStart.style.background = "linear-gradient(135deg, #10b981, #059669)";
    btnStart.style.fontSize = "1rem";
  }

  if (currentRoomId) {
    getRoomRef(currentRoomId, currentRoomType).child('status').off();
  }

  const statusMsg = document.getElementById('online-status-msg');
  if (statusMsg) statusMsg.textContent = msg || "マッチング前の画面に戻りました。";

  window.updateMatchingButtonUI(false);

  document.getElementById('btn-play-black').disabled = false;
  document.getElementById('btn-play-white').disabled = false;
  window.isOnlineMode = false;
  window.isMatchingWaiting = false;
  currentRoomId = null;
  hasStartedMatch = false;
  currentMatchConfig = null;
}

// モーダルのボタンイベント登録
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
  document.getElementById('title-screen').style.display = 'none';
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
  window.initGame(myColor);

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
