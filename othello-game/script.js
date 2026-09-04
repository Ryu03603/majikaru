/**
 * Othello +「まじかるモード」 総合コントローラー
 * 通常のオセロ処理に加え、13種類の固有魔法の挙動、CPUの思考・魔法発動ロジック、
 * およびDOM（HTML要素）の更新と各種エフェクトのアニメーション制御を行います。
 */

// ==========================================
// 1. 基本定数の定義
// ==========================================
const EMPTY = 0; // マスに石がない状態
const BLACK = 1; // 黒石
const WHITE = 2; // 白石
const ROWS = 8;  // 盤面の行数 (8x8のオセロ盤)
const COLS = 8;  // 盤面の列数 (8x8のオセロ盤)

// 石をひっくり返すための8方向の探索用座標配列 (縦移動量, 横移動量)
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// ゲームに登場する全13種類の魔法リスト。
// id: 内部判定用の固有番号
// name: 魔法名
// desc: ツールチップなどで表示される魔法の効果説明
// requiresTarget: falseの場合は押下直後に効果発動。文字列（'stone'等）の場合は、プレイヤーが盤面をクリックして対象を選ぶモードに移行します。
const ALL_MAGICS = [
  { id: 1, name: "桜羽エマ（魔女殺し）", desc: "相手の魔法をカードごと物理的に1枚打ち消す（実質的に手札を4枚にする）。", requiresTarget: false },
  { id: 2, name: "二階堂ヒロ（死に戻り）", desc: "自分と相手の魔法をそれぞれの状態で引き直す。", requiresTarget: false },
  { id: 3, name: "夏目アンアン（洗脳）", desc: "次の相手のターンに石を置くマスを指定し、そこにしか置けなくする。", requiresTarget: 'valid_opponent' },
  { id: 4, name: "城ケ崎ノア（液体操作）", desc: "盤面上の任意の石1つを、指定した色（黒/白）に直接書き換える。", requiresTarget: 'stone' },
  { id: 5, name: "蓮見レイア（視線誘導）", desc: "相手の手札の魔法1つをランダムで使用済み（使用不可）にする。", requiresTarget: false },
  { id: 6, name: "佐伯ミリア（入れ替わり）", desc: "盤面上の自分の石1つと、相手の石1つの場所を入れ替える。", requiresTarget: 'miria_1' },
  { id: 7, name: "宝生マーゴ（モノマネ）", desc: "相手の未使用魔法を1つコピーして自分のカードとして上書きする（※コピーしたとき、ターンは消費されない）。", requiresTarget: false },
  { id: 8, name: "黒部ナノカ（幻視）", desc: "次の相手のターン中、相手は魔法を使用できなくなる。", requiresTarget: false },
  { id: 9, name: "紫藤アリサ（発火）", desc: "選択した石を発火させる。3ターン後にそこにある石は消滅する。", requiresTarget: 'cell' },
  { id: 10, name: "橘シェリー（怪力）", desc: "現在配置されている全ての石の数を維持したままランダムなマスに置き直す。", requiresTarget: false },
  { id: 11, name: "遠野ハンナ（浮遊）", desc: "盤面上の任意の石1つを、別の空いているマスへ移動させる。", requiresTarget: 'hanna_1' },
  { id: 12, name: "沢渡ココ（千里眼）", desc: "相手の伏せられている手札の魔法をすべて公開する。", requiresTarget: false },
  { id: 13, name: "氷上メルル（治療）", desc: "盤面を2ターン前（相手が打つ前）の状態まで時を戻す。さらに、相手が直前に打っていたマスを封鎖する。", requiresTarget: false }
];

// ==========================================
// Egaroucid AI (WASM) ロード処理
// ==========================================
let ai_initializing = true;
let initializing_var = null;

// window.Moduleは ai.js がロードされたときに認識され、設定をオーバーライドします
window.Module = {
  'noInitialRun': true,
  'onRuntimeInitialized': function() {
    initializing_var = setInterval(initialize_ai, 100);
  }
};

function initialize_ai() {
  if (window.Module['onRuntimeInitialized']) {
    try {
      let percent_pointer = window.Module._malloc(4);
      let init_result = window.Module._init_ai(percent_pointer);
      window.Module._free(percent_pointer);
      if (init_result === 0) {
        console.log("Egaroucid AI Loaded Successfully.");
        ai_initializing = false;
      } else {
        console.error("Egaroucid AI Load Failed. (init_result != 0)");
      }
    } catch (exception) {
      console.error("Egaroucid AI Exception:", exception);
    }
    clearInterval(initializing_var);
  }
}

// ai.js を動的にロード
window.addEventListener('DOMContentLoaded', () => {
  const scriptElem = document.createElement('script');
  scriptElem.src = 'https://www.egaroucid.nyanyan.dev/ja/web/ai.js';
  document.body.appendChild(scriptElem);
});

// ==========================================
// 2. 状態管理変数 (ステート)
// ==========================================
// --- 定石（オープニングブック） ---
const OPENING_BOOK = [
  "f5d6c3d3c4f4f6f3e6e7d7c5b6b4a5a3b3c6a4b5a2c2d2e3a6e8e2c7g3f7d1f2e1h3g2h1h2g1g4c1f1h4g6g7f8g8h8h5g5a7c8a1d8b2b1h6h7b8b7a8", // 虎コンボス定石
  "f5d6c3d3c4f4c5b3c2e6c6b4b5d2e3a6c1f3e2g4f6e1d1b1g5f1h3g6h6c7g3f2b6a5c8g7a4a3e7e8d8h4h5d7h8b8b7f8f7h7g2g1h1h2a1g8a8a7a2b2", // 虎大量定石
  "f5d6c3d3c4f4f6g5e6d7e3c5f3e7h5e2c6d2c2g3d1h4h3g4e1f2c7c1b1g2h1h2g6f7c8d8h6g7g8f8h8h7e8b5a4b6a5b4a3b3a2b7b8a8a7a6g1f1b2a1", // 虎ノーカン定石
  "f5f6e6d6c5e3d3f4f3e2g4g5f2h3f1c2c3c6c7c4d7b5b6d8b4a3a4b3d2c1e8f8e7g3f7d1e1g1h6h5g6g8h4c8g7h8h7g2h1h2b1a7a6a5b2b7a8b8a2a1", // 牛定石
  "f5f6e6d6f7e3d7e7d8c8b8f8c4c5c7g5c6g8d3g6f3c3f4g4b3e2f1d1h5h4h3g3h2c2c1a3b2b4f2d2a2b6a4b1a5a7b5a6a8b7h6g7e1a1h8h7e8g1g2h1", // 蛇定石
  "f5d6c5f4e3c6d3f6e6d7g4c4g5c3f7d2e7f2e2f3c1g3f1h4h5h3h2e8b4c2b3f8b5d1e1b6c7d8a6g6b8b2a1g2h1g1b1a4a5c8g8g7h8a7b7a3a2a8h7h6"  // 兎ローズ定石
];

// 180度回転した定石（戦況が全く同じになるもの）を動的に生成して追加
const rotatedBooks = OPENING_BOOK.map(book => {
  let rotated = "";
  for (let i = 0; i < book.length; i += 2) {
    const cCode = book.charCodeAt(i) - 97; // 0-based 列 (a=0)
    const rNum = parseInt(book[i + 1], 10); // 1-based 行 (1=1)
    // 180度回転は、列を 7-col に、行を 9-row に反転させる
    rotated += String.fromCharCode(97 + (7 - cCode)) + (9 - rNum).toString();
  }
  return rotated;
});
OPENING_BOOK.push(...rotatedBooks);

let currentMoveHistory = "";  // 現在の着手履歴（例: "f5d6"）

// --- 基本のオセロゲーム用 ---
let board = [];               // 盤面の状態（2次元配列）。EMPTY, BLACK, WHITEのいずれかが入る。
let currentTurn = BLACK;      // 現在誰のターンか（初手は必ず黒）
let playerScores = { [BLACK]: 2, [WHITE]: 2 }; // 黒と白のそれぞれの石の数
let isCPUThinking = false;    // CPUが思考中（プレイヤーの操作を無効にするフラグ）
let gameEnded = false;        // ゲームが終了したかどうかのフラグ
let validMoves = [];          // 現在のターンプレイヤーが石を置ける座標と、ひっくり返せる石の一覧
let isManosabaMode = false;   // 「まじかるモード(魔法あり)」が選ばれているかどうか
let isSpecialMode = false;    // 「特殊モード」が選ばれているかどうか
let specialOpponent = null;   // 特殊モードの相手
let opponentType = 'cpu';     // 'cpu' または 'pvp'
let cpuDifficulty = 2;        // CPUの強さ (1:弱い, 2:普通, 3:強い, 7:定石)

function getCpuName() {
  if (isSpecialMode) {
    const names = {
      "anan_noa": "夏目アンアン＆城ケ崎ノア",
      "miria": "佐伯ミリア",
      "arisa": "紫藤アリサ",
      "sherry_hanna": "橘シェリー＆遠野ハンナ",
      "margo": "宝生マーゴ"
    };
    return names[specialOpponent] || "CPU";
  }
  if (isManosabaMode) {
    const names = { 4: "黒部ナノカ", 5: "沢渡ココ", 7: "氷上メルル" };
    return names[cpuDifficulty] || "CPU";
  } else {
    const names = { 1: "桜羽エマ", 3: "蓮見レイア", 7: "二階堂ヒロ", /* 15: "ゴクチョー", */ 16: "二階堂ヒロ(裏)" };
    return names[cpuDifficulty] || "CPU";
  }
}
let playerColor = BLACK;      // プレイヤーの色
let cpuColor = WHITE;         // CPUの色

// --- まじかる（魔法）モード用 ---
let magicHistory = [];          // 直近の盤面状態を保存しておく履歴（氷上メルルの巻き戻し魔法で使用）
let fireStates = [];            // 紫藤アリサの魔法で発火しているマスのリスト({r, c, turns:残りターン数})
let playerMagics = [];          // プレイヤーに手札として配られている5つの魔法オブジェクト配列
let cpuMagics = [];             // CPUに手札として配られている5つの魔法オブジェクト配列
let cpuSpecialDeck = [];        // 特殊モード用のCPUの控えデッキ（10枚や20枚から手札を引いた後の残り）

// 魔法使用回数の変数は撤去（無制限化に伴う削除）

// 「完全ゲーム中1回のみ」の制限を管理するためのグローバル使用済みIDリスト
let playerUsedMagicIds = new Set();
let cpuUsedMagicIds = new Set();

let targetingState = null;      // 対象選択中かどうか。null以外なら選択中のモード('stone', 'cell'など)
let targetingCache = null;      // ハンナやミリアなど「石を選んでから別のアクションをする」ための、最初のクリック位置の一時保存用
let activeMagicIndex = null;    // 現在使用しようとしている（ダイアログなどを出している）魔法の手札インデックス
let activeMagicIsCpuDeck = false; // P2(CPU側)の手札から選ばれた魔法かどうかを判定

// 魔法の特殊効果によるステータス異常フラグ
let forcedOpponentMove = null;  // アンアンの魔法により、相手がここにしか置けなくなった座標
let cpuMagicBlocked = 0;    // ナノカの魔法により、CPUが次のターン魔法を使えない残りターン数
let playerMagicBlocked = 0; // ナノカの魔法により、プレイヤーが次のターン魔法を使えない残りターン数
let cpuMagicRevealed = false;   // ココの魔法により、CPUの伏せられた手札魔法が丸見えになるフラグ

// 特殊な演出を施すためのトラッキング変数
let lastPlacedMove = null;      // 前回置かれた（あるいは魔法を使った）アクションの記録
let bannedOpponentMove = null;  // メルルで巻き戻された際、相手が直前に打っていたため打つことが禁じられた手
let specialStones = [];         // ノア(変色)、ハンナ(移動)、ミリア(入れ替え)などで特殊なグロー効果を与える石を記録する2次元配列

// ==========================================
// 3. HTML(DOM) 要素の取得
// ==========================================
// スクリプト内で操作するHTML要素を取得し、変数に格納しておきます。
const boardEl = document.getElementById('board');
const playerScoreEl = document.getElementById('player-score');
const cpuScoreEl = document.getElementById('cpu-score');
const playerScoreCard = document.getElementById('player-score-card');
const cpuScoreCard = document.getElementById('cpu-score-card');
const playerLabelEl = document.getElementById('player-label');
const cpuLabelEl = document.getElementById('cpu-label');
const turnIndicator = document.getElementById('turn-indicator');
const titleScreenModal = document.getElementById('title-screen');
const gameOverModal = document.getElementById('game-over-modal');
const passModal = document.getElementById('pass-modal');
const winnerText = document.getElementById('winner-text');
const surrenderBtn = document.getElementById('surrender-btn');
const btnPlayBlack = document.getElementById('btn-play-black');
const btnPlayWhite = document.getElementById('btn-play-white');
const radios = document.getElementsByName('game-mode');
const pMagicDeck = document.getElementById('player-magic-deck');
const cMagicDeck = document.getElementById('cpu-magic-deck');
const magicConfirmModal = document.getElementById('magic-confirm-modal');
const magicConfirmName = document.getElementById('magic-confirm-name');
const magicConfirmImg = document.getElementById('magic-confirm-img');
const magicConfirmDesc = document.getElementById('magic-confirm-desc');
const btnCancelMagic = document.getElementById('btn-cancel-magic');
const btnConfirmMagic = document.getElementById('btn-confirm-magic');
const targetBar = document.getElementById('targeting-bar');
const targetInfo = document.getElementById('targeting-info');
const colorSelectModal = document.getElementById('color-select-modal');
const confirmSurrenderModal = document.getElementById('confirm-surrender-modal');
const restartBtn = document.getElementById('restart-btn');
const finalPlayerScore = document.getElementById('final-player-score');
const finalCpuScore = document.getElementById('final-cpu-score');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const bgmVolumeSlider = document.getElementById('bgm-volume-slider');
const bgmVolumeIcon = document.getElementById('bgm-volume-icon');

// 効果音・BGMファイルの事前読み込み
const bgmSound = new Audio('BGM/rAwTell Owk.mp3');
bgmSound.loop = true;
bgmSound.volume = 0.05;
const placeSound = new Audio('SE/ishi.mp3');
const spraySound = new Audio('SE/spray.mp3');
const fireSound = new Audio('SE/fire.mp3');
const panchiSound = new Audio('SE/panchi.mp3');
const magicSound = new Audio('SE/magic.mp3');
const shuffleSound = new Audio('SE/shuffle.mp3');
const allSounds = [placeSound, spraySound, fireSound, panchiSound, magicSound, shuffleSound];
placeSound.volume = 0.5;
spraySound.volume = 0.3;
fireSound.volume = 0.3;
panchiSound.volume = 0.3;
magicSound.volume = 0.3;

//allSounds.forEach(s => s.volume = 0.5);

function playMagicSound(spellId) {
  if (spellId === 2) return; // 二階堂ヒロはshuffle.mp3のみ鳴らす
  let s = magicSound;
  if (spellId === 4) s = spraySound;       // 城ケ崎ノア
  else if (spellId === 9) s = fireSound;   // 紫藤アリサ
  else if (spellId === 10) s = panchiSound;// 橘シェリー

  s.currentTime = 0;
  s.play().catch(e => console.warn('魔法の音源再生がブロックされました:', e));
}

// ==========================================
// 4. ゲームの初期化 (Initialization)
// ==========================================
/**
 * タイトル画面で色を選んだ時に呼ばれ、ゲームを初期状態にリセットして開始します。
 * @param {number} selectedPlayerColor - プレイヤーが選んだ色 (BLACK 又は WHITE)
 */
function initGame(selectedPlayerColor) {
  // 色の決定とモードの判定
  playerColor = selectedPlayerColor;
  cpuColor = playerColor === BLACK ? WHITE : BLACK;
  const modeRadios = document.getElementsByName('game-mode');
  if (modeRadios.length) {
    for (const radio of modeRadios) {
      if (radio.checked) {
        if (radio.value === 'manosaba') {
          isManosabaMode = true; isSpecialMode = false;
        } else if (radio.value === 'special') {
          isManosabaMode = true; isSpecialMode = true;
        } else {
          isManosabaMode = false; isSpecialMode = false;
        }
      }
    }
  }

  const opRadios = document.getElementsByName('opponent-type');
  if (opRadios.length) { for (const radio of opRadios) { if (radio.checked) opponentType = radio.value; } }

  if (isSpecialMode) {
    const specialRadios = document.getElementsByName('special-opponent');
    for (const radio of specialRadios) { if (radio.checked) specialOpponent = radio.value; }
    cpuDifficulty = 4; // 特殊モードは強制的にLv4
  } else if (isManosabaMode) {
    const diffRadios = document.getElementsByName('cpu-difficulty-manosaba');
    if (diffRadios.length) { for (const radio of diffRadios) { if (radio.checked) cpuDifficulty = parseInt(radio.value, 10); } }
  } else {
    const diffRadios = document.getElementsByName('cpu-difficulty-normal');
    if (diffRadios.length) { for (const radio of diffRadios) { if (radio.checked) cpuDifficulty = parseInt(radio.value, 10); } }
  }

  // 盤面をすべて空(EMPTY)の配列で初期化し、中央の4マスに初期の石を配置
  board = Array(ROWS).fill().map(() => Array(COLS).fill(EMPTY));
  board[3][3] = WHITE; board[3][4] = BLACK; board[4][3] = BLACK; board[4][4] = WHITE;

  currentTurn = BLACK; // オセロは常に黒が先手
  isCPUThinking = false;
  gameEnded = false;
  currentMoveHistory = ""; // 着手履歴のリセット

  // 各種変数のリセット
  magicHistory = []; fireStates = []; playerMagics = []; cpuMagics = []; cpuSpecialDeck = [];
  playerUsedMagicIds.clear(); cpuUsedMagicIds.clear();
  targetingState = null; targetingCache = null; activeMagicIndex = null; activeMagicIsCpuDeck = false;
  forcedOpponentMove = null; cpuMagicBlocked = 0; playerMagicBlocked = 0; cpuMagicRevealed = false;
  lastPlacedMove = null; bannedOpponentMove = null;
  // 特殊装飾用の配列もリセット
  specialStones = Array(ROWS).fill().map(() => Array(COLS).fill(null));

  // UIの非表示設定などのリセット
  titleScreenModal.style.display = 'none'; gameOverModal.style.display = 'none';
  passModal.style.display = 'none'; confirmSurrenderModal.style.display = 'none'; surrenderBtn.style.display = 'block';

  // スコアボード上のUIテキストを正しい色に設定
  playerLabelEl.textContent = opponentType === 'pvp' ? `プレイヤー1 (${playerColor === BLACK ? '黒' : '白'})` : `あなた (${playerColor === BLACK ? '黒' : '白'})`;
  cpuLabelEl.textContent = opponentType === 'pvp' ? `プレイヤー2 (${cpuColor === BLACK ? '黒' : '白'})` : `${getCpuName()} (${cpuColor === BLACK ? '黒' : '白'})`;
  document.querySelector('#player-score-card .score-avatar').className = `score-avatar ${playerColor === BLACK ? 'black-disc' : 'white-disc'}`;
  document.querySelector('#cpu-score-card .score-avatar').className = `score-avatar ${cpuColor === BLACK ? 'black-disc' : 'white-disc'}`;

  // まじかるモードのみ、画面下にカードを描画表示してカードを配る
  document.getElementById('player-hand-area').style.display = isManosabaMode ? 'flex' : 'none';
  document.getElementById('cpu-hand-area').style.display = isManosabaMode ? 'flex' : 'none';
  targetBar.style.display = 'none';
  if (isManosabaMode) {
    playerMagics = drawMagics(5, playerUsedMagicIds);
    if (isSpecialMode && opponentType === 'cpu') {
      cpuSpecialDeck = generateSpecialMagics(specialOpponent);
      cpuMagics = cpuSpecialDeck.splice(0, 5); // デッキから5枚だけを手札にする
    } else {
      cpuMagics = drawMagics(5, cpuUsedMagicIds);
    }
    
    createBoardDOM();  // 盤面のHTML(DOM)構造を生成
    saveHistoryState(); // メルル用に初期状態を記録
    
    isCPUThinking = true;
    distributeMagicsAnimation(() => {
      isCPUThinking = false;
      renderMagics(true); // 手札を描画（フリップインアニメーションあり）
      updateBoardDOM();
      updateGameState();
    });
    return; // アニメーション後に実行するためここで終了
  }

  createBoardDOM();  // 盤面のHTML(DOM)構造を生成
  saveHistoryState(); // メルル用に初期状態を記録
  updateBoardDOM();   // DOMに状態を同期して石を表示
  updateGameState();  // 有効手などの判定を行い、ターンを開始数r
}

function generateSpecialMagics(opType) {
  let initialIds = [];
  let remainingIds = [];

  if (opType === 'anan_noa') {
    if (Math.random() < 0.5) {
      initialIds = [3, 3, 3, 4, 4];
      remainingIds = [...Array(7).fill(3), ...Array(8).fill(4)];
    } else {
      initialIds = [3, 3, 4, 4, 4];
      remainingIds = [...Array(8).fill(3), ...Array(7).fill(4)];
    }
  } else if (opType === 'sherry_hanna') {
    if (Math.random() < 0.5) {
      initialIds = [10, 10, 10, 11, 11];
      remainingIds = [...Array(7).fill(10), ...Array(8).fill(11)];
    } else {
      initialIds = [10, 10, 11, 11, 11];
      remainingIds = [...Array(8).fill(10), ...Array(7).fill(11)];
    }
  } else if (opType === 'miria') {
    initialIds = Array(5).fill(6);
    remainingIds = Array(5).fill(6);
  } else if (opType === 'arisa') {
    initialIds = Array(5).fill(9);
    remainingIds = Array(5).fill(9);
  } else if (opType === 'margo') {
    initialIds = Array(5).fill(7);
    remainingIds = Array(5).fill(7);
  }

  // シャッフル
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);
  const finalIds = [...shuffle(initialIds), ...shuffle(remainingIds)];

  const drawn = [];
  for (let i = 0; i < finalIds.length; i++) {
    const spell = ALL_MAGICS.find(m => m.id === finalIds[i]);
    drawn.push({ spell: { ...spell }, used: false });
  }
  return drawn;
}

/**
 * 山札から指定数ランダムに魔法を抽出します。
 * すでに使われた魔法(usedIdsSetに登録済み)は、山札から完全に除外されるためドローされません。
 */
function drawMagics(count, usedIdsSet) {
  const drawn = [];
  // 使用済みのカードはプールから除外する
  let available = [...ALL_MAGICS].filter(m => !(usedIdsSet && usedIdsSet.has(m.id)));
  // 2人プレイ(pvp)時および特殊モード時は、相手の魔法が公開情報のため「沢渡ココ(ID:12)」を除外する
  if (opponentType === 'pvp' || isSpecialMode) { available = available.filter(m => m.id !== 12); }

  const deck = available.sort(() => Math.random() - 0.5); // シャッフル
  for (let i = 0; i < count && i < deck.length; i++) {
    drawn.push({ spell: deck[i], used: false });
  }
  return drawn;
}

// ==========================================
// 5. 魔法システム (UI構築・表示)
// ==========================================
/**
 * 両プレイヤーの魔法の手札（DOM）を再構築して画面に表示します。
 */
const MAGIC_IMAGES = {
  0: "img/00_back.png",
  1: "img/658_ema.png",
  2: "img/659_hiro.png",
  3: "img/660_anan.png",
  4: "img/661_noa.png",
  5: "img/662_reia.png",
  6: "img/663_miria.png",
  7: "img/664_mago.png",
  8: "img/665_nanoka.png",
  9: "img/666_arisa.png",
  10: "img/667_shelly.png",
  11: "img/668_hanna.png",
  12: "img/669_koko.png",
  13: "img/670_meruru.png"
};

function renderMagics(animateFlipTarget = false) {
  if (!isManosabaMode) return;

  // プレイヤー側の手札描画
  pMagicDeck.innerHTML = '';
  playerMagics.forEach((m, i) => {
    // 実際に自分が消費した魔法が他にもないか（マーゴのコピー含む）照合
    const checkId = m.spell.name.startsWith('宝生マーゴ→') ? 7 : m.spell.id;
    const isGlobal = playerUsedMagicIds.has(checkId);

    const card = document.createElement('div');
    // すでに使われたか、グローバル制限に引っかかるなら .used クラスを付けて暗くする
    card.className = 'magic-card' + (m.used || isGlobal ? ' used' : '');
    if (animateFlipTarget === 'all') card.classList.add('flip-in');
    
    const img = document.createElement('img');
    img.src = MAGIC_IMAGES[m.spell.id] || MAGIC_IMAGES[0];
    img.alt = m.spell.name;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '8px';
    card.appendChild(img);

    // ツールチップ(説明文ポップアップ)の追加
    const tt = document.createElement('div'); tt.className = 'magic-tooltip'; tt.textContent = m.spell.desc;
    card.appendChild(tt);

    // カードを押したときの処理
    card.addEventListener('click', () => {
      // 魔法が使えないタイミング（相手ターン中、CPU思考中、ターゲッティング強制中など）は反応をブロック
      if (m.used || isGlobal || isCPUThinking || currentTurn !== playerColor || gameEnded || targetingState) return;
      if (playerMagicBlocked > 0) { showModalAlert(`黒部ナノカの効果によりあと ${playerMagicBlocked} ターン魔法が使えません！`); return; }

      promptMagic(i); // ダイアログ表示へ
    });
    pMagicDeck.appendChild(card);
  });

  // CPU側の手札描画
  cMagicDeck.innerHTML = '';
  cpuMagics.forEach((m, i) => {
    const checkId = m.spell.name.startsWith('宝生マーゴ→') ? 7 : m.spell.id;
    // 特殊モード時は同カードの複数使用が許可されているため、グローバルの使用済み判定をスキップする
    const isGlobal = (isSpecialMode && opponentType === 'cpu') ? false : cpuUsedMagicIds.has(checkId);

    const card = document.createElement('div');
    card.className = 'magic-card' + (m.used || isGlobal ? ' used' : '');
    
    const isFaceUp = opponentType === 'pvp' || cpuMagicRevealed;
    if ((animateFlipTarget === 'all' || animateFlipTarget === 'cpu') && isFaceUp) card.classList.add('flip-in');
    
    const img = document.createElement('img');
    img.src = isFaceUp ? (MAGIC_IMAGES[m.spell.id] || MAGIC_IMAGES[0]) : MAGIC_IMAGES[0];
    img.alt = isFaceUp ? m.spell.name : "裏向きのカード";
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '8px';
    card.appendChild(img);
    if (opponentType === 'pvp' || cpuMagicRevealed) {
      const tt = document.createElement('div'); tt.className = 'magic-tooltip'; tt.textContent = m.spell.desc;
      card.appendChild(tt);
    }

    // 2人プレイモードではクリックを許可する
    if (opponentType === 'pvp') {
      card.addEventListener('click', () => {
        if (m.used || isGlobal || isCPUThinking || currentTurn !== cpuColor || gameEnded || targetingState) return;
        if (cpuMagicBlocked > 0) { showModalAlert(`黒部ナノカの効果によりあと ${cpuMagicBlocked} ターン魔法が使えません！`); return; }
        promptMagic(i, true);
      });
    }
    cMagicDeck.appendChild(card);
  });
}

/**
 * 山札から手札へカードを配るアニメーションを実行します。
 * @param {function} onComplete - アニメーション完了後に呼ばれるコールバック
 */
function distributeMagicsAnimation(onComplete) {
  // 実際の枠（プレースホルダー）を先に作って座標を取得する
  pMagicDeck.innerHTML = ''; cMagicDeck.innerHTML = '';
  const pSlots = []; const cSlots = [];
  
  for (let i = 0; i < playerMagics.length; i++) {
    const pCard = document.createElement('div'); pCard.className = 'magic-card'; pCard.style.opacity = '0';
    const pImg = document.createElement('img');
    pImg.src = MAGIC_IMAGES[0];
    pImg.style.width = '100%'; pImg.style.height = '100%'; pImg.style.objectFit = 'cover'; pImg.style.borderRadius = '8px';
    pCard.appendChild(pImg);
    pMagicDeck.appendChild(pCard); pSlots.push(pCard);
  }
  for (let i = 0; i < cpuMagics.length; i++) {
    const cCard = document.createElement('div'); cCard.className = 'magic-card'; cCard.style.opacity = '0';
    const cImg = document.createElement('img');
    cImg.src = MAGIC_IMAGES[0];
    cImg.style.width = '100%'; cImg.style.height = '100%'; cImg.style.objectFit = 'cover'; cImg.style.borderRadius = '8px';
    cCard.appendChild(cImg);
    cMagicDeck.appendChild(cCard); cSlots.push(cCard);
  }

  // プレイヤーは左から、CPUは右から配る順序を作成
  const targets = [];
  for (let i = 0; i < playerMagics.length; i++) {
    targets.push({ slot: pSlots[i], type: 'player', idx: i });
  }
  for (let i = cpuMagics.length - 1; i >= 0; i--) {
    targets.push({ slot: cSlots[i], type: 'cpu', idx: i });
  }

  // それぞれの山札の座標を取得
  const pDeckEl = document.getElementById('player-deck-stack');
  const cDeckEl = document.getElementById('cpu-deck-stack');
  const pDeckRect = pDeckEl ? pDeckEl.getBoundingClientRect() : { left: 10, top: window.innerHeight / 2 };
  const cDeckRect = cDeckEl ? cDeckEl.getBoundingClientRect() : { left: 10, top: window.innerHeight / 2 };
  
  // 同時に配るため、効果音は1回だけ再生する
  shuffleSound.currentTime = 0;
  shuffleSound.play().catch(e => console.warn('シャッフル音源再生ブロック:', e));

  targets.forEach((targetObj) => {
    const flyingCard = document.createElement('div');
    flyingCard.className = 'flying-card';
    const img = document.createElement('img');
    
    // 配る際は常に裏面として飛んでくる
    img.src = MAGIC_IMAGES[0];
    
    flyingCard.appendChild(img);
    document.body.appendChild(flyingCard);
    
    // スタート位置（それぞれの山札）
    const deckRect = targetObj.type === 'player' ? pDeckRect : cDeckRect;
    flyingCard.style.left = `${deckRect.left}px`;
    flyingCard.style.top = `${deckRect.top}px`;
    flyingCard.style.transform = 'scale(1) rotate(0deg)';
    flyingCard.style.opacity = '1';
    
    // リフローを強制してアニメーションを開始させる
    void flyingCard.offsetWidth;
    
    // ゴール位置（プレースホルダーの場所）
    const slotRect = targetObj.slot.getBoundingClientRect();
    flyingCard.style.left = `${slotRect.left}px`;
    flyingCard.style.top = `${slotRect.top}px`;
    flyingCard.style.transform = 'scale(1) rotate(0deg)';
    
    // アニメーション完了後の処理 (transition: 0.4s)
    setTimeout(() => {
      flyingCard.style.opacity = '0'; // 飛んでいたカードを消す
      targetObj.slot.style.opacity = '1'; // プレースホルダーを可視化
      setTimeout(() => flyingCard.remove(), 200); // 完全に消えたらDOMから削除
    }, 400);
  });
  
  // すべてのカード配りが終わるまで待つ (0.4s)
  setTimeout(() => {
    pSlots.forEach(s => s.classList.add('flip-out'));
    
    const isCpuFaceUp = opponentType === 'pvp' || cpuMagicRevealed;
    if (isCpuFaceUp) {
      cSlots.forEach(s => s.classList.add('flip-out'));
    }

    setTimeout(() => {
      if (onComplete) onComplete();
    }, 150);
  }, 400);
}

/**
 * 手札にあるカードをそれぞれの山札へ戻すアニメーションを実行します。
 * @param {function} onComplete - アニメーション完了後に呼ばれるコールバック
 */
function returnMagicsToDeckAnimation(onComplete) {
  const pCardsDOM = Array.from(pMagicDeck.querySelectorAll('.magic-card'));
  const cCardsDOM = Array.from(cMagicDeck.querySelectorAll('.magic-card'));
  
  const pDeckEl = document.getElementById('player-deck-stack');
  const cDeckEl = document.getElementById('cpu-deck-stack');
  const pDeckRect = pDeckEl ? pDeckEl.getBoundingClientRect() : { left: 10, top: window.innerHeight / 2 };
  const cDeckRect = cDeckEl ? cDeckEl.getBoundingClientRect() : { left: 10, top: window.innerHeight / 2 };

  let cardsAnimated = false;

  // 1. 全てのカードを一度裏返す(flip-out)
  pCardsDOM.forEach(c => c.classList.add('flip-out'));
  cCardsDOM.forEach(c => c.classList.add('flip-out'));

  setTimeout(() => {
    // 2. flip-outが完了したら、裏面のフライングカードを作成して山札に飛ばす
    const animateCard = (cardElement, deckRect) => {
      cardsAnimated = true;
      const flyingCard = document.createElement('div');
      flyingCard.className = 'flying-card flip-in'; // 裏面がパタンと開くように
      const cloneImg = document.createElement('img');
      cloneImg.src = MAGIC_IMAGES[0]; // 全て裏面に
      flyingCard.appendChild(cloneImg);
      document.body.appendChild(flyingCard);
      
      const slotRect = cardElement.getBoundingClientRect();
      flyingCard.style.left = `${slotRect.left}px`;
      flyingCard.style.top = `${slotRect.top}px`;
      flyingCard.style.transform = 'scale(1) rotate(0deg)';
      flyingCard.style.opacity = '1';
      
      cardElement.style.opacity = '0';
      
      setTimeout(() => {
        flyingCard.classList.remove('flip-in');
        void flyingCard.offsetWidth;
        
        // ゴール位置（山札）: サイズは小さくせず scale(1) のまま
        flyingCard.style.left = `${deckRect.left}px`;
        flyingCard.style.top = `${deckRect.top}px`;
        flyingCard.style.transform = 'scale(1) rotate(0deg)';
        
        setTimeout(() => {
          flyingCard.style.opacity = '0';
          setTimeout(() => flyingCard.remove(), 200);
        }, 400);
      }, 150);
    };

    pCardsDOM.forEach(c => animateCard(c, pDeckRect));
    cCardsDOM.forEach(c => animateCard(c, cDeckRect));

    if (cardsAnimated) {
      setTimeout(() => { // flip-in完了を待つ
        shuffleSound.currentTime = 0;
        shuffleSound.play().catch(e => console.warn(e));
        setTimeout(() => { // 山札への移動完了を待つ
          if (onComplete) onComplete();
        }, 400);
      }, 150);
    } else {
      if (onComplete) onComplete();
    }
  }, 150); // DOMカードのflip-outを待つ
}

/**
 * 魔法を使用するかどうかの確認ダイアログを開きます。
 */
function promptMagic(index, isCpuDeck = false) {
  const magic = isCpuDeck ? cpuMagics[index] : playerMagics[index];
  activeMagicIndex = index; // 選択された魔法が何番目なのかを一時記憶
  activeMagicIsCpuDeck = isCpuDeck;
  magicConfirmName.textContent = magic.spell.name;
  magicConfirmDesc.textContent = magic.spell.desc;
  
  if (magicConfirmImg) {
    const trueId = magic.spell.name.startsWith('宝生マーゴ→') ? 7 : magic.spell.id;
    magicConfirmImg.src = (isCpuDeck && !cpuMagicRevealed) ? MAGIC_IMAGES[0] : (MAGIC_IMAGES[trueId] || MAGIC_IMAGES[0]);
  }
  
  magicConfirmModal.style.display = 'flex';
}

// 確認ダイアログの「やめる」ボタン
btnCancelMagic.addEventListener('click', () => {
  magicConfirmModal.style.display = 'none';
  activeMagicIndex = null;
});

// 確認ダイアログの「使用する」ボタン
btnConfirmMagic.addEventListener('click', () => {
  magicConfirmModal.style.display = 'none';
  const index = activeMagicIndex;
  const isCpuMode = activeMagicIsCpuDeck;
  const magic = isCpuMode ? cpuMagics[index] : playerMagics[index];

  if (magic.spell.requiresTarget) {
    // もしその魔法が「対象を指定する必要がある魔法」なら、ターゲッティングモードに移行する
    targetingState = magic.spell.requiresTarget;
    targetInfo.textContent = `${magic.spell.name}：` + getTargetingPromptText(targetingState);
    targetBar.style.display = 'block'; // 画面上部に操作指示バーを出す

    // 【夏目アンアン】特別処理：相手が置けるマスを一時的に赤く光らせて見えるようにする
    if (targetingState === 'valid_opponent') {
      const targetOpponent = isCpuMode ? playerColor : cpuColor;
      const opMoves = getValidMoves(targetOpponent);
      opMoves.forEach(m => {
        const idx = m.r * COLS + m.c;
        if (boardEl.children[idx]) boardEl.children[idx].classList.add('opponent-valid-move');
      });
    }
  } else {
    // ターゲッティングが不要な魔法なら、そのまま直ちに効果を実行（発動）する
    executeMagicLogic(magic.spell.id, isCpuMode, index);
  }
});

// 魔法ごとに要求される指示テキストを返す関数
function getTargetingPromptText(state) {
  if (state === 'valid_opponent') return "相手が置けるマスを1つ指定してください。";
  if (state === 'stone') return "色を変更する石をクリックしてください。";
  if (state === 'miria_1') return "入れ替える【自分の石】をクリックしてください。";
  if (state === 'cell') return "発火させる【盤面上の石】を1つクリックしてください。";
  if (state === 'hanna_1') return "移動する【盤面上の石】をクリックしてください。";
  return "対象を選択してください。";
}

// ==========================================
// 6. 魔法の実行と反映ロジック
// ==========================================
/**
 * 魔法の消費判定（使用回数の加算など）を確定させ、魔法の効果を実行します。
 * @param {number} index - 使った手札のインデックス
 * @param {boolean} casterIsCpu - 使用者がCPUかどうか
 * @param {function} logicCallback - 実際の魔法の効果を適用する処理関数
 * @param {boolean} isMargo - このロジックが「宝生マーゴ（コピー動作）」の初動によるものかどうか
 */
function commitMagic(index, casterIsCpu, logicCallback, isMargo = false) {
  const magic = casterIsCpu ? cpuMagics[index] : playerMagics[index];

  // 魔法実行時の効果音再生
  playMagicSound(magic.spell.id);

  // もしそのカードが「すでにマーゴでコピー済み」だった場合、ゲームシステム全体としては
  // 元の魔法ではなく「マーゴ（ID: 7）」を消費した扱いとする。
  // （※マーゴのコピー魔法使用で消費されるのはマーゴですが、コピー効果を行使したプレイヤー自身は
  // その魔法を「使用した」という事実が残るため、自分の山札からは以降ドローされなくなります。
  // もちろんコピー元の相手の魔法の消費状態には一切影響を与えません）
  const trueId = magic.spell.name.startsWith('宝生マーゴ→') ? 7 : magic.spell.id;

  if (casterIsCpu) {
    magic.used = true;
    cpuUsedMagicIds.add(trueId);
  } else {
    magic.used = true;
    playerUsedMagicIds.add(trueId);
  }

  // いつでも安全に不要な情報を消すために、アンアンのハイライトをここで取り除く
  document.querySelectorAll('.opponent-valid-move').forEach(el => el.classList.remove('opponent-valid-move'));

  let isAsync = false;
  if (logicCallback) {
    isAsync = logicCallback() === 'async'; // 実際の効果(switch/case側から渡されたもの)を発動
  }

  if (isAsync) return; // 非同期処理を含む場合はコールバック側で後続処理を行うためここで終了
  if (isMargo) {
    // マーゴを初めて手札から使用して他人の魔法をコピーした瞬間は、
    // まだマーゴ自体を「消費した」ことにはせず、手札を上書きして一旦戻す。(次にその魔法を使うときに消費判定になる)
    if (casterIsCpu) { cpuMagics[index].used = false; cpuUsedMagicIds.delete(7); }
    else { playerMagics[index].used = false; playerUsedMagicIds.delete(7); }

    renderMagics();

    // マーゴでコピーが終わったら、ターゲットの強制を解除してターンを『進めずに』保持する
    if (!casterIsCpu || opponentType === 'pvp') {
      activeMagicIndex = null; targetBar.style.display = 'none'; targetingState = null;
      updateGameState();
    }
    else { makeCPUMovePlacement(); } // CPUの場合はそのままシームレスに次の石置きアクションへ行く
  } else {
    // マーゴ以外（またはコピー済みのマーゴ）を実際に発動した後は、ターンを強制終了して相手に移す
    renderMagics();
    endMagicTurn();
  }
}

/**
 * 魔法によるアクションが完了した後、ターンを相手へ渡す処理。
 */
function endMagicTurn() {
  lastPlacedMove = { type: 'magic', player: currentTurn }; // 今回のターンは「魔法を使った」として履歴に残す
  currentMoveHistory += "XX"; // 魔法使用で定石から外れる

  // もし前のターンでメルルの制約（打てないマス）が生まれていた場合、自分の番が終わるのでその制約を解除する
  if (bannedOpponentMove && currentTurn === bannedOpponentMove.player) bannedOpponentMove = null;

  targetingState = null;
  activeMagicIndex = null;
  targetBar.style.display = 'none';
  isCPUThinking = false;

  // ターンを交代
  currentTurn = currentTurn === BLACK ? WHITE : BLACK;
  updateGameState(); // ボードの状態を評価して相手の処理へ
}

/**
 * 非ターゲッティング魔法(RequiresTarget=false)の実際の効果を内包したコントローラーです（プレイヤー用）。
 */
function executeMagicLogic(magicId, casterIsCpu, index) {
  commitMagic(index, casterIsCpu, () => {
    switch (magicId) {
      case 1: { // 桜羽エマ: 相手の魔法をカードごと物理的に1枚打ち消す（実質的に手札を4枚にする）。
        const targetDeck = casterIsCpu ? playerMagics : cpuMagics;
        const targetGlobal = casterIsCpu ? playerUsedMagicIds : cpuUsedMagicIds;
        const u = targetDeck.map((m, i) => ({ i, id: m.spell.id, used: m.used })).filter(m => {
          if (m.used) return false;
          if (!casterIsCpu && isSpecialMode && opponentType === 'cpu') return true;
          return !targetGlobal.has(m.id);
        });
        if (u.length > 0) { targetDeck.splice(u[Math.floor(Math.random() * u.length)].i, 1); }
        break;
      }
      case 2: { // 二階堂ヒロ: 自分と相手の魔法をそれぞれの状態で引き直す。
        playerMagics = drawMagics(playerMagics.length, playerUsedMagicIds);
        if (isSpecialMode && opponentType === 'cpu') {
          cpuMagics = cpuSpecialDeck.splice(0, cpuMagics.length);
        } else {
          cpuMagics = drawMagics(cpuMagics.length, cpuUsedMagicIds);
        }
        // まずカードを山札へ戻すアニメーションを実行
        isCPUThinking = true;
        returnMagicsToDeckAnimation(() => {
          distributeMagicsAnimation(() => {
            isCPUThinking = false;
            renderMagics('all');
            updateBoardDOM();
            endMagicTurn(); // 非同期で完了後にターンを終了させる
          });
        });
        return 'async'; // 同期的な処理をスキップするフラグ
      }
      // case 3, 4, 6, 9, 11 (アンアン、ノア、ミリア、アリサ、ハンナ等) は全て「対象選択モード」側で実行されるためここには来ない
      case 5: { // 蓮見レイア: 相手の手札の魔法1つをランダムで使用済み（使用不可）にする。
        const targetDeck = casterIsCpu ? playerMagics : cpuMagics;
        const targetGlobal = casterIsCpu ? playerUsedMagicIds : cpuUsedMagicIds;
        const u = targetDeck.filter(m => {
          if (m.used) return false;
          if (!casterIsCpu && isSpecialMode && opponentType === 'cpu') return true;
          return !targetGlobal.has(m.spell.id);
        });
        if (u.length > 0) {
          const targetCard = u[Math.floor(Math.random() * u.length)];
          targetCard.used = true;
          // 再ドロー時にも復活しないよう完全に使用済みにする
          targetGlobal.add(targetCard.spell.id);
        }
        break;
      }
      case 7: { // 宝生マーゴ: 相手の未使用カードを一つコピーして、自分のカードへ上書きする
        const targetDeck = casterIsCpu ? playerMagics : cpuMagics;
        const targetGlobal = casterIsCpu ? playerUsedMagicIds : cpuUsedMagicIds;
        const myDeck = casterIsCpu ? cpuMagics : playerMagics;
        const u = targetDeck.filter(m => {
          if (m.used) return false;
          if (!casterIsCpu && isSpecialMode && opponentType === 'cpu') return true;
          return !targetGlobal.has(m.spell.id);
        });
        if (u.length > 0) {
          const cp = u[Math.floor(Math.random() * u.length)].spell; // コピー元の実体をクローン
          myDeck[index].spell = { ...cp, name: `宝生マーゴ→${cp.name}` };
        }
        break;
      }
      case 8: // 黒部ナノカ: 相手の次のターンに強制フラグを立て、魔法を使えなくする。
        if (casterIsCpu) playerMagicBlocked = 3; else cpuMagicBlocked = 3;
        break;
      case 10: { // 橘シェリー: 石の総数を保持しつつ、完全にランダムな座標へ盤面ごと再配置する大技。
        specialStones = Array(ROWS).fill().map(() => Array(COLS).fill(null)); // 特殊効果は初期化
        let bs = 0, ws = 0; const coords = [];
        // 現在の石を回収
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (board[r][c] === BLACK) bs++; if (board[r][c] === WHITE) ws++;
          if (board[r][c] !== EMPTY) coords.push({ r, c });
        }
        coords.sort(() => Math.random() - 0.5); // 座標をシャッフル
        coords.forEach((p, i) => board[p.r][p.c] = i < bs ? BLACK : WHITE); // 元の数だけ白/黒をバラ撒く
        break;
      }
      case 12: { // 沢渡ココ: 相手の手札を見る
        cpuMagicRevealed = true;
        
        // 相手のカードを回転させて見せるアニメーション
        const cCards = cMagicDeck.querySelectorAll('.magic-card');
        if (cCards.length > 0) {
          cCards.forEach(c => c.classList.add('flip-out'));
          isCPUThinking = true;
          setTimeout(() => {
            isCPUThinking = false;
            renderMagics('cpu'); // flip-inで描画される (CPUのみ)
            endMagicTurn();
          }, 150);
          return 'async';
        }
        break;
      }
      case 13: { // 氷上メルル: 履歴配列から2手前(自分にとって直前の盤面)の状況を引っ張り出して復元する。
        if (magicHistory.length >= 2) {
          // 1手前（相手の打った状況）。このアクションの座標を相手に禁止させるために取得
          const stateBeforeMyTurn = magicHistory.pop();
          const opAction = stateBeforeMyTurn.lastAction;

          // 2手前（自分が打つ前の状況＝つまりいま巻き戻したい盤面）
          const dest = magicHistory.pop();
          board = JSON.parse(JSON.stringify(dest.board));
          fireStates = JSON.parse(JSON.stringify(dest.fireStates));
          specialStones = JSON.parse(JSON.stringify(dest.specialStones));
          lastPlacedMove = dest.lastAction;
          currentMoveHistory = dest.moveSequence || "";

          // もし相手が直前に石を打っていたのであれば、そのマスへの禁止令（banned）を登録する
          if (opAction && opAction.r !== undefined) {
            bannedOpponentMove = { r: opAction.r, c: opAction.c, player: opAction.player };
          }
        } else {
          // まだゲームが始まったばかりで巻き戻せない場合
          showModalAlert("氷上メルル：戻る履歴が足りませんでした（不発）");
        }
        break;
      }
    }
  }, magicId === 7 /* マーゴの場合は isMargo=true として送信 */);
}

// ==========================================
// 7. ターゲッティング（盤面クリックで対象を選ぶ）処理
// ==========================================
/**
 * 魔法の対象を選択している「ターゲッティング状態」中のクリックされたマスの処理ロジックです。
 */
function handleTargetingClick(r, c) {
  const v = board[r][c]; // クリックした場所の石の状態
  const myColor = activeMagicIsCpuDeck ? cpuColor : playerColor;
  const opColor = activeMagicIsCpuDeck ? playerColor : cpuColor;

  if (targetingState === 'valid_opponent') { // 夏目アンアン
    const opMoves = getValidMoves(opColor);
    // 相手が本当に置ける場所以外なら弾く
    if (!opMoves.find(m => m.r === r && m.c === c)) { showModalAlert("有効なマスではありません。"); return; }
    forcedOpponentMove = { r, c };

    // 多重動作防止のため、魔法のインデックスをローカルに確保して全体を無効化する
    const idx = activeMagicIndex; activeMagicIndex = null;
    commitMagic(idx, activeMagicIsCpuDeck, null);
  }
  else if (targetingState === 'stone') { // 城ケ崎ノア
    // 石がある場所のみ許可し、その後に表示されるカラー選択の中間ダイアログを開く
    if (v === EMPTY) { showModalAlert("石を選択してください。"); return; }
    targetingCache = { r, c };
    colorSelectModal.style.display = 'flex';
  }
  else if (targetingState === 'miria_1') { // 佐伯ミリア 第一選択
    // まず自分の石を選ぶ
    if (v !== myColor) { showModalAlert("自分の石を選択してください。"); return; }
    targetingCache = { r1: r, c1: c }; targetingState = 'miria_2';
    targetInfo.textContent = "佐伯ミリア：入れ替える【相手の石】を選択してください。";

    // 即座に選んだ石が黄色く光る演出をオンにする
    specialStones[r][c] = 'swapped';
    const disc = document.getElementById(`disc-${r}-${c}`);
    if (disc) disc.classList.add('swapped-stone-effect');
  }
  else if (targetingState === 'miria_2') { // 佐伯ミリア 第二選択
    // 相手の石を選んで、最終的に入れ替える
    if (v !== opColor) { showModalAlert("相手の石を選択してください。"); return; }

    // 両方の石をスワップする
    board[r][c] = myColor;
    board[targetingCache.r1][targetingCache.c1] = opColor;

    // 入れ替えた石の両方を黄色く光らせるマークをつける
    specialStones[r][c] = 'swapped';
    specialStones[targetingCache.r1][targetingCache.c1] = 'swapped';

    const idx = activeMagicIndex; activeMagicIndex = null;
    commitMagic(idx, activeMagicIsCpuDeck, null);
  }
  else if (targetingState === 'cell') { // 紫藤アリサ
    if (v === EMPTY) { showModalAlert("石のある場所を選択してください。"); return; }
    if (fireStates.find(f => f.r === r && f.c === c)) { showModalAlert("既に発火している石です。別の石を選んでください。"); return; }
    applyFire(r, c);
    const idx = activeMagicIndex; activeMagicIndex = null;
    commitMagic(idx, activeMagicIsCpuDeck, null);
  }
  else if (targetingState === 'hanna_1') { // 遠野ハンナ 第一選択
    if (v === EMPTY) { showModalAlert("石を選択してください。"); return; }
    targetingCache = { r1: r, c1: c, col: v }; targetingState = 'hanna_2';
    targetInfo.textContent = "遠野ハンナ：移動先の空きマスを選択してください。";

    // 選択した石が即座に青く光る
    specialStones[r][c] = 'selected';
    const disc = document.getElementById(`disc-${r}-${c}`);
    if (disc) disc.classList.add('moved-stone-effect');
  }
  else if (targetingState === 'hanna_2') { // 遠野ハンナ 第二選択
    if (v !== EMPTY) { showModalAlert("空きマスを選択してください。"); return; }

    board[r][c] = targetingCache.col; // 選んだ空きマスへ移動
    board[targetingCache.r1][targetingCache.c1] = EMPTY; // 元いた場所は消える

    // 動いた先は青くし、元いた空きマスは点線のトレースを出す
    specialStones[r][c] = 'moved';
    specialStones[targetingCache.r1][targetingCache.c1] = 'moved-from';

    const idx = activeMagicIndex; activeMagicIndex = null;
    commitMagic(idx, activeMagicIsCpuDeck, null);
  }
}

// 城ケ崎ノアにおけるカラー選択ダイアログの「黒にする」ボタンの処理
document.getElementById('btn-color-black').addEventListener('click', () => {
  if (activeMagicIndex === null) return; // 既に別の魔法が終了して無効なら多重防止のためリターン
  colorSelectModal.style.display = 'none';
  board[targetingCache.r][targetingCache.c] = BLACK;
  specialStones[targetingCache.r][targetingCache.c] = 'changed'; // 紫に光らせる記録
  const idx = activeMagicIndex; activeMagicIndex = null;
  commitMagic(idx, activeMagicIsCpuDeck, null);
});

// 城ケ崎ノアにおけるカラー選択ダイアログの「白にする」ボタンの処理
document.getElementById('btn-color-white').addEventListener('click', () => {
  if (activeMagicIndex === null) return;
  colorSelectModal.style.display = 'none';
  board[targetingCache.r][targetingCache.c] = WHITE;
  specialStones[targetingCache.r][targetingCache.c] = 'changed';
  const idx = activeMagicIndex; activeMagicIndex = null;
  commitMagic(idx, activeMagicIsCpuDeck, null);
});

/**
 * 紫藤アリサの着火魔法を適用し、指定したマスを3ターンの間「発火状態」にします。
 */
function applyFire(r, c) {
  fireStates.push({ r, c, turns: 4 }); // 次のターン減るため4を初期値に
}

// ==========================================
// 8. 盤面描画・更新とオセロ基本処理
// ==========================================
/**
 * 盤面のDIVを8x8=64個生成してHTMLに埋め込みます。
 */
function createBoardDOM() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.r = r; cell.dataset.c = c;
      cell.addEventListener('click', () => handleCellClick(r, c)); // クリックした時用のイベント
      boardEl.appendChild(cell);
    }
  }
}

/**
 * JavaScript内の「board（二次元配列）」の情報を、ブラウザ（DOM全体）へ反映させます。
 */
function updateBoardDOM() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = getCellEl(r, c); const val = board[r][c];

      // もしこのマスがアリサの魔法で燃えていたら、発火エフェクトを付ける
      if (fireStates.find(f => f.r === r && f.c === c)) cell.classList.add('on-fire'); else cell.classList.remove('on-fire');

      // もしこのマスがハンナの魔法で抜け出た後の空間なら、移動元の軌跡エフェクトを付ける
      if (specialStones[r][c] === 'moved-from') cell.classList.add('moved-from-effect'); else cell.classList.remove('moved-from-effect');

      let dc = cell.querySelector('.disc-container'); // このマスに乗っている石を探す
      if (val !== EMPTY) {
        let disc;
        if (!dc) {
          // 何もない空白マスに石が新しく置かれた場合、即座に生成する
          dc = document.createElement('div'); dc.className = 'disc-container new';
          disc = document.createElement('div'); disc.id = `disc-${r}-${c}`;
          dc.appendChild(disc); cell.appendChild(dc);
        } else {
          // すでに昔からあれば、その石の要素をそのまま持ってくる
          disc = document.getElementById(`disc-${r}-${c}`);
        }

        // 指定された色にクラスを付与(黒なら 'is-black', 白なら 'is-white')
        if (disc) {
          disc.className = `disc ${val === WHITE ? 'is-white' : 'is-black'}`;

          // 各種魔法によって光る演出が指定されている場合は、そのクラスを重ねがけする
          if (specialStones[r][c] === 'moved' || specialStones[r][c] === 'selected') disc.classList.add('moved-stone-effect');
          else if (specialStones[r][c] === 'changed') disc.classList.add('changed-stone-effect');
          else if (specialStones[r][c] === 'swapped') disc.classList.add('swapped-stone-effect');
        }
      } else {
        // 逆に盤面のデータ上で空っぽ(EMPTY)なのに、HTMLでは石が置かれている場合は削除する
        if (dc) cell.removeChild(dc);
      }
    }
  }
}

/**
 * 盤面の特定のマスがクリックされたときの処理です。
 */
function handleCellClick(r, c) {
  if (gameEnded) return; // 終わってるなら無効

  // ターゲッティング選択中の場合は別ロジックへ
  if (targetingState) { handleTargetingClick(r, c); return; }

  // CPU操作時など、人間が触ってはいけないタイミングのブロック
  // pvpモード時は currentTurn に関係なく(どちらの番でも) 人間のクリックを許可する
  if (isCPUThinking || (opponentType === 'cpu' && currentTurn !== playerColor)) return;

  // 今クリックしようとしているマスが、通常でちゃんと「置けるマス(validMoves)」かどうか調べる
  const move = validMoves.find(m => m.r === r && m.c === c);
  if (move) {
    // 夏目アンアンによって特定のマスに置くことを強制されている場合は、弾く
    if (forcedOpponentMove && currentTurn === playerColor) {
      if (r !== forcedOpponentMove.r || c !== forcedOpponentMove.c) {
        showModalAlert('夏目アンアン：相手に指定されたマスにしか置けません！'); return;
      }
    }

    // 有効なら石を置くオセロの基本処理へ
    executeMove(move);
  }
}

/**
 * 対象のマスに石を置き、挟んだ敵の石をひっくり返します。
 */
function executeMove(move) {
  // まずUI上に表示されていた「置けるよ！という小さな点（ヒント）」を全て消去する
  document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('valid-move'));
  const { r, c, flips } = move; const moveTurn = currentTurn;

  // 定石履歴の記録 (f5, d6 などの形式)
  const colStr = String.fromCharCode(97 + c);
  const rowStr = (r + 1).toString();
  currentMoveHistory += colStr + rowStr;

  // このアクションをした結果を保存用ステータスに保持
  lastPlacedMove = { r, c, player: moveTurn };

  // メルルの魔法で禁止されていた手ならば、石を無事に置けたので禁止状態を解除する
  if (bannedOpponentMove && currentTurn === bannedOpponentMove.player) {
    bannedOpponentMove = null;
  }

  // ハンナ・ノアなどで光り続けていたエフェクトは、ここで新しく石が「置かれた」と同時にすべてクリアして消灯する
  specialStones = Array(ROWS).fill().map(() => Array(COLS).fill(null));

  // 指定のマスを自分の色にする
  board[r][c] = moveTurn;

  // 石を置いた時の効果音を再生する
  placeSound.currentTime = 0;
  placeSound.play().catch(err => {
    console.warn("プレイヤーの操作がないため音が再生されませんでした:", err);
  });

  // 挟んだ石を反転するためのアニメーション処理の開始（一旦scaleXを0にして見えなくする）
  flips.forEach(f => {
    board[f.r][f.c] = moveTurn;
    const flippedDisc = document.getElementById(`disc-${f.r}-${f.c}`);
    if (flippedDisc) flippedDisc.style.transform = 'scaleX(0)';
  });

  // ナノカなどによる魔法制限を解除し、次の人のターンへ
  if (currentTurn === playerColor) { if (playerMagicBlocked > 0) playerMagicBlocked--; forcedOpponentMove = null; }
  else { if (cpuMagicBlocked > 0) cpuMagicBlocked--; forcedOpponentMove = null; }

  currentTurn = currentTurn === BLACK ? WHITE : BLACK;
  updateGameState();

  // アニメーションのため、150ミリ秒後に石がくるっと回って相手の色として広がる（scaleX(1)に戻る）
  flips.forEach(f => {
    setTimeout(() => {
      const flippedDisc = document.getElementById(`disc-${f.r}-${f.c}`);
      if (flippedDisc) flippedDisc.style.transform = 'scaleX(1)';
    }, 150);
  });
}

function getCellEl(r, c) { return boardEl.children[r * COLS + c]; }

/**
 * あるプレイヤーにとって、「現在どこになら石を置けるか」を算出してリストで返します。
 */
function getValidMoves(player) {
  const moves = []; const opponent = player === BLACK ? WHITE : BLACK;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== EMPTY) continue; // すでに石が置いてある場所には置けない

      const flips = [];
      // 左上~右下までの全8方向へ飛んでいく
      for (const [dr, dc] of DIRECTIONS) {
        let nr = r + dr; let nc = c + dc; const pFlips = [];
        // 相手の石が続く限り進む
        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === opponent) {
          pFlips.push({ r: nr, c: nc }); nr += dr; nc += dc;
        }
        // 相手の石の先に、自分の石があれば、それはその間で全て挟めている証拠
        if (pFlips.length > 0 && nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
          flips.push(...pFlips);
        }
      }
      // もし1個でも挟めるなら、それは『有効手(置ける場所)』として配列に返す
      if (flips.length > 0) moves.push({ r, c, flips });
    }
  }
  return moves;
}

/**
 * メルルの巻き戻し魔法のために、現在の情報をまるごと配列の最後尾に保存します。（ディープコピー）
 */
function saveHistoryState() {
  magicHistory.push({
    board: JSON.parse(JSON.stringify(board)),
    fireStates: JSON.parse(JSON.stringify(fireStates)),
    specialStones: JSON.parse(JSON.stringify(specialStones)),
    lastAction: lastPlacedMove ? { ...lastPlacedMove } : null,
    moveSequence: currentMoveHistory
  });
}

/**
 * 毎ターンの始まりなど節目に実行され、勝敗の判定やターンの準備を行います。
 */
function updateGameState() {
  if (gameEnded) return;

  // アリサの発火で燃えた部分の残りターンをマイナス1。もし0になったらそこにある石は消滅(EMPTY)する
  fireStates.forEach(f => f.turns--);
  fireStates.forEach(f => { if (f.turns <= 0 && board[f.r][f.c] !== EMPTY) { board[f.r][f.c] = EMPTY; } });
  fireStates = fireStates.filter(f => f.turns > 0); // ターンが残っているものだけ残す

  // 今の状態を保存し、DOMへ反映させる
  saveHistoryState();
  updateBoardDOM();
  renderMagics();

  // 黒と白それぞれの正確な石の数をカウントし、ヘッダーに表示する
  let blackCount = 0, whiteCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === BLACK) blackCount++; if (board[r][c] === WHITE) whiteCount++;
    }
  }
  playerScores[BLACK] = blackCount; playerScores[WHITE] = whiteCount;
  playerScoreEl.textContent = playerScores[playerColor]; cpuScoreEl.textContent = playerScores[cpuColor];

  // 黒白どちらかが0になったか、盤面すべてのマスが埋まったら「ゲーム終了」
  if (blackCount + whiteCount === ROWS * COLS || blackCount === 0 || whiteCount === 0) { endGame(); return; }

  // 以前付与されていたバツ印(banned-move)やヒントマーカーの表示を一旦すべて消去する
  document.querySelectorAll('.cell.banned-move').forEach(el => el.classList.remove('banned-move'));
  document.querySelectorAll('.cell.valid-move').forEach(el => el.classList.remove('valid-move'));

  // 次の人(currentTurn)にとって、置ける場所はあるか？
  validMoves = getValidMoves(currentTurn);

  // もしメルルに「さっき打ったその場所はだめ！」と言われていて(bannedOpponentMove)
  // かつ他に置ける場所があるなら、その禁止マスの候補を物理的に削る
  if (bannedOpponentMove && currentTurn === bannedOpponentMove.player && validMoves.length > 1) {
    const hasBan = validMoves.find(m => m.r === bannedOpponentMove.r && m.c === bannedOpponentMove.c);
    if (hasBan) {
      validMoves = validMoves.filter(m => m.r !== bannedOpponentMove.r || m.c !== bannedOpponentMove.c);
      const idx = bannedOpponentMove.r * COLS + bannedOpponentMove.c;
      // 打てなくなったことを赤バツ印で分かりやすく視覚化
      if (boardEl.children[idx]) boardEl.children[idx].classList.add('banned-move');
    }
  }

  // プレイヤーのターン、または2人プレイモードなら「ここに置けるよ」というヒントマーカーを付ける
  if (currentTurn === playerColor || opponentType === 'pvp') {
    if (forcedOpponentMove) {
      // もしアンアンに強制指定されているなら、そこ以外光らせない
      const idx = forcedOpponentMove.r * COLS + forcedOpponentMove.c;
      if (boardEl.children[idx]) boardEl.children[idx].classList.add('valid-move');
    } else {
      // 全部の候補を光らせる
      validMoves.forEach(move => { const idx = move.r * COLS + move.c; boardEl.children[idx].classList.add('valid-move'); });
    }
  }

  // ヘッダーの点灯(UI)を切り替える
  updateTurnUI();

  // もしこのターン置ける場所がどこもなかったら「パス」となる
  if (validMoves.length === 0) {
    const op = currentTurn === BLACK ? WHITE : BLACK;
    if (getValidMoves(op).length === 0) {
      // もし「相手も」置ける場所がないなら身動きが取れないのでゲーム終了
      endGame();
    } else {
      // 相手だけが置けるなら一方的な「パス」表示ダイアログを出す
      showPassMessage(currentTurn);
      isCPUThinking = true;
      setTimeout(() => {
        if (currentTurn === playerColor) { if (playerMagicBlocked > 0) playerMagicBlocked--; } else { if (cpuMagicBlocked > 0) cpuMagicBlocked--; }
        forcedOpponentMove = null;
        currentTurn = op; // 相手に回す
        isCPUThinking = false;
        updateGameState();
      }, 2000);
    }
    return;
  }

  // もしCPU対戦モードで且つCPUのターンなら、少しの間を開けて思考を開始させる
  if (opponentType === 'cpu' && currentTurn === cpuColor && !isCPUThinking) {
    isCPUThinking = true;
    setTimeout(makeCPUMove, 800 + Math.random() * 700);
  }
}

function updateTurnUI() {
  if (currentTurn === playerColor) {
    turnIndicator.textContent = opponentType === 'pvp' ? "プレイヤー1の番" : "あなたの番";
    turnIndicator.className = "turn-indicator";
    playerScoreCard.classList.remove('inactive');
    cpuScoreCard.classList.add('inactive');
  } else {
    turnIndicator.textContent = opponentType === 'pvp' ? "プレイヤー2の番" : `${getCpuName()} 考え中...`;
    turnIndicator.className = "turn-indicator cpu-turn";
    playerScoreCard.classList.add('inactive');
    cpuScoreCard.classList.remove('inactive');
  }
}

// ランダムに盤上の自分の石を探して返す（CPUの魔法などで使用）
function getRandomStone(col) { const st = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c] === col) st.push({ r, c }); return st.length ? st[Math.floor(Math.random() * st.length)] : null; }
function getRandomEmpty() { const em = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c] === EMPTY) em.push({ r, c }); return em.length ? em[Math.floor(Math.random() * em.length)] : null; }

// ==========================================
// 9. CPU（敵）のロジック
// ==========================================
/**
 * CPUが戦略を決定し、石を置くか魔法を使うかを決めます。
 */
function makeCPUMove() {
  if (gameEnded) return;
  // 魔法が許可されていれば、確率25%で魔法を使う
  const turnsTaken = currentMoveHistory.length / 2;
  const isEarlyGame = turnsTaken < 4; // CPUの1,2手目(全体で4手目未満)は魔法を使わない

  if (isManosabaMode && cpuMagicBlocked <= 0 && !isEarlyGame && Math.random() < 0.25) {
    const avail = cpuMagics.map((m, i) => ({ ...m, i })).filter(m => {
      if (m.used) return false;
      const checkId = m.spell.name.startsWith('宝生マーゴ→') ? 7 : m.spell.id;
      if (isSpecialMode) return true; // 特殊モードは同カードが複数あるため重複チェックをスキップ
      return !cpuUsedMagicIds.has(checkId);
    });
    if (avail.length > 0) {
      const magic = avail[Math.floor(Math.random() * avail.length)];
      // CPUが選んだ魔法を使って成功したらリターン（魔法をかけ終えてターン完了）
      if (executeCpuMagic(magic.spell, magic.i)) return;
    }
  }
  // もし魔法を使わなかった、あるいは魔法の使用に失敗した場合は、普通に盤面に石を置くロジックへ
  makeCPUMovePlacement();
}

// --- AI（Lv3）用 純粋シミュレーション関数 ---
function getValidMovesForBoard(b, player) {
  const moves = []; const opponent = player === BLACK ? WHITE : BLACK;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c] !== EMPTY) continue;
      const flips = [];
      for (const [dr, dc] of DIRECTIONS) {
        let nr = r + dr; let nc = c + dc; const pFlips = [];
        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && b[nr][nc] === opponent) {
          pFlips.push({ r: nr, c: nc }); nr += dr; nc += dc;
        }
        if (pFlips.length > 0 && nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && b[nr][nc] === player) {
          flips.push(...pFlips);
        }
      }
      // 評価値と一緒に保存する (Move Ordering用)
      if (flips.length > 0) moves.push({ r, c, flips, weight: BOARD_WEIGHTS[r][c] + flips.length });
    }
  }
  // Move Ordering: 評価が高い順に並べ替えることでアルファベータ枝刈りを大幅に効率化
  moves.sort((a, b) => b.weight - a.weight);
  return moves;
}

function simulateMove(b, move, player) {
  const newBoard = b.map(row => [...row]);
  newBoard[move.r][move.c] = player;
  move.flips.forEach(f => newBoard[f.r][f.c] = player);
  return newBoard;
}

const BOARD_WEIGHTS = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120]
];

function getEmptySquares(b) {
  let count = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (b[r][c] === EMPTY) count++;
  }
  return count;
}

function evaluateBoard(b, player, isEndgame = false) {
  let score = 0;
  const opponent = player === BLACK ? WHITE : BLACK;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // 終盤(完全読みモード)は、評価値ではなく純粋な石の枚数差で判断する
      if (b[r][c] === player) score += isEndgame ? 1 : BOARD_WEIGHTS[r][c];
      else if (b[r][c] === opponent) score -= isEndgame ? 1 : BOARD_WEIGHTS[r][c];
    }
  }
  return score;
}

function minimax(b, depth, alpha, beta, isMaximizing, player, opponent, isEndgame = false) {
  if (depth === 0) return evaluateBoard(b, player, isEndgame);

  const currentTurn = isMaximizing ? player : opponent;
  const moves = getValidMovesForBoard(b, currentTurn);

  if (moves.length === 0) {
    const opMoves = getValidMovesForBoard(b, isMaximizing ? opponent : player);
    if (opMoves.length === 0) {
      let pScore = 0, oScore = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (b[r][c] === player) pScore++;
        else if (b[r][c] === opponent) oScore++;
      }
      return (pScore - oScore) * 10000; // 確定勝ちは特大スコア
    }
    return minimax(b, depth - 1, alpha, beta, !isMaximizing, player, opponent, isEndgame);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const nb = simulateMove(b, move, currentTurn);
      const ev = minimax(nb, depth - 1, alpha, beta, false, player, opponent, isEndgame);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const nb = simulateMove(b, move, currentTurn);
      const ev = minimax(nb, depth - 1, alpha, beta, true, player, opponent, isEndgame);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getBookMove() {
  const matchingBooks = OPENING_BOOK.filter(book => book.startsWith(currentMoveHistory));
  if (matchingBooks.length > 0) {
    const book = matchingBooks[Math.floor(Math.random() * matchingBooks.length)];
    if (currentMoveHistory.length < book.length) {
      const nextMoveStr = book.substring(currentMoveHistory.length, currentMoveHistory.length + 2);
      const c = nextMoveStr.charCodeAt(0) - 97;
      const r = parseInt(nextMoveStr[1], 10) - 1;
      const validMove = validMoves.find(m => m.r === r && m.c === c);
      if (validMove) return validMove;
    }
  }
  return null;
}

/**
 * CPUが石を置く場所を決めるロジック
 */
function makeCPUMovePlacement() {
  if (validMoves.length === 0) return;

  let bestMove = validMoves[0];
  if (forcedOpponentMove && currentTurn === cpuColor) {
    // アンアンにより指定されていた場合は問答無用でそこへ置く
    const forceTarget = validMoves.find(m => m.r === forcedOpponentMove.r && m.c === forcedOpponentMove.c);
    if (forceTarget) bestMove = forceTarget;
  } else {
    let diff = cpuDifficulty;

    if (diff === 15 || diff === 16) {
      if (typeof window.Module !== 'undefined' && window.Module._ai_js && !ai_initializing) {
        let res = new Int32Array(64).fill(-1);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (board[r][c] === BLACK) res[r * COLS + c] = 0;
            else if (board[r][c] === WHITE) res[r * COLS + c] = 1;
          }
        }
        let pointer = window.Module._malloc(64 * 4);
        window.Module.HEAP32.set(res, pointer / 4);
        let ai_player = cpuColor === BLACK ? 0 : 1;

        if (diff === 16) {
          // 二階堂ヒロ(裏): 20手目までは定石を優先、以降（または定石外）は妥協なしの最善手（Lv15）のみを打つ
          let bookMove = null;
          if ((currentMoveHistory.length / 2) < 20) {
            bookMove = getBookMove();
          }

          if (bookMove) {
            bestMove = bookMove;
          } else {
            let val = window.Module._ai_js(pointer, 15, ai_player);
            let y = Math.floor(val / 1000 / COLS);
            let x = Math.floor((val - y * 1000 * COLS) / 1000);
            let found = validMoves.find(m => m.r === y && m.c === x);
            if (found) {
              bestMove = found;
            } else {
              console.error("WASM returned invalid move", y, x, "Fallback to Lv7");
              diff = 7;
            }
          }
          window.Module._free(pointer);
        } else {
          /*
          // ゴクチョー(Lv15): 評価値によるランダム選択
          let pointer_value = window.Module._malloc((64 + 10) * 4);
          // 全合法手の評価値を取得（フリーズ防止のため探索深さは上限の7に固定）
          window.Module._calc_value(pointer, pointer_value, 7, ai_player);
          let output_array = new Int32Array(window.Module.HEAP32.buffer, pointer_value, 64 + 10);

          let moveScores = [];
          for (let m of validMoves) {
            let score = output_array[10 + m.r * COLS + m.c];
            if (score >= -64 && score <= 64) {
              moveScores.push({ move: m, score: score });
            }
          }

          window.Module._free(pointer);
          window.Module._free(pointer_value);

          if (moveScores.length > 0) {
            // スコアが高い順（降順）にソート
            moveScores.sort((a, b) => b.score - a.score);
            // 評価値が0以上になる手を基本とし、唐突な悪手を防ぐ
            // 次善手(5%)を選ぶ条件: 「最善手もマイナス(全手マイナス)である」または「次善手が0以上である」場合
            let randIdx = 0;
            if (moveScores.length >= 2) {
              if ((moveScores[0].score < 0 || moveScores[1].score >= 0) && Math.random() < 0.05) {
                randIdx = 1;
              }
            }
            bestMove = moveScores[randIdx].move;
          } else {
            console.error("WASM calc_value returned no valid scores. Fallback to Lv7");
            diff = 7;
          }
          */
        }
      } else {
        console.warn("WASM AI not loaded yet. Fallback to Lv7 logic.");
        diff = 7;
      }
    }

    if (diff === 15 || diff === 16) {
      // bestMove is already set by WASM logic above
    } else if (diff === 1) {
      // Lv1: 完全ランダム
      bestMove = validMoves[Math.floor(Math.random() * validMoves.length)];
    } else if (diff === 2) {
      // Lv2: 単純にひっくり返せる枚数が最も多い手を優先 (欲張り)
      let maxFlips = -1;
      validMoves.forEach(move => {
        if (move.flips.length > maxFlips) { maxFlips = move.flips.length; bestMove = move; }
        else if (move.flips.length === maxFlips && Math.random() > 0.5) { bestMove = move; }
      });
    } else if (diff >= 4) {
      const emptySq = getEmptySquares(board);
      let depth = 3; // Lv4
      let isEndgame = false;
      let bookMove = null;

      if (diff === 5) depth = 5; // Lv5
      if (diff >= 6) { // Lv6, Lv7
        if (diff === 7) {
          bookMove = getBookMove();
        }

        if (emptySq <= 12) {
          depth = emptySq; // 残り12マス以下なら最後まで完全読み切り（エンドゲームソルバー）
          isEndgame = true;
        } else {
          depth = 7; // ブラウザがフリーズしない実用的な限界深度（7手先）
        }
      }

      if (bookMove) {
        bestMove = bookMove;
      } else {
        let maxScore = -Infinity;

        // ルートノードのMove Ordering
        const orderedMoves = [...validMoves].map(m => ({ ...m, weight: BOARD_WEIGHTS[m.r][m.c] + m.flips.length })).sort((a, b) => b.weight - a.weight);

        orderedMoves.forEach(move => {
          const nb = simulateMove(board, move, cpuColor);
          const score = minimax(nb, depth, -Infinity, Infinity, false, cpuColor, playerColor, isEndgame);
          const adjustedScore = score + (Math.random() * 0.1);
          if (adjustedScore > maxScore) { maxScore = adjustedScore; bestMove = move; }
        });
      }
    } else {
      // Lv3 (デフォルト): 従来の固定評価値アルゴリズム
      let maxScore = -Infinity;
      validMoves.forEach(move => {
        const score = BOARD_WEIGHTS[move.r][move.c] + (move.flips.length * 2) + (Math.random() * 5);
        if (score > maxScore) { maxScore = score; bestMove = move; }
      });
    }
  }
  executeMove(bestMove);
  isCPUThinking = false;
}

/**
 * CPUが選ばれた「魔法」を使用し、盤面にランダムに効果を適用させます。
 * (プレイヤーと違って画面のクリックを待つ必要がないので、自動で処理を追えます)
 */
function executeCpuMagic(spell, index) {
  let ok = true;
  let cb = null;
  switch (spell.id) {
    case 1: {
      const u = playerMagics.map((m, i) => ({ i, id: m.spell.id, used: m.used })).filter(m => !m.used && !playerUsedMagicIds.has(m.id));
      if (u.length > 0) { cb = () => { playerMagics.splice(u[Math.floor(Math.random() * u.length)].i, 1); }; } else { ok = false; }
      break;
    }
    case 2: cb = () => { 
      playerMagics = drawMagics(playerMagics.length, playerUsedMagicIds); 
      if (isSpecialMode && opponentType === 'cpu') {
        cpuMagics = cpuSpecialDeck.splice(0, cpuMagics.length);
      } else {
        cpuMagics = drawMagics(cpuMagics.length, cpuUsedMagicIds); 
      }
      isCPUThinking = true;
      returnMagicsToDeckAnimation(() => {
        distributeMagicsAnimation(() => {
          isCPUThinking = false;
          renderMagics('all');
          updateBoardDOM();
          endMagicTurn(); // 非同期で完了後にターンを終了させる
        });
      });
      return 'async'; // commitMagic側で同期実行をキャンセルするフラグ
    }; break;
    case 3: { const pm = getValidMoves(playerColor); if (pm.length > 0) { cb = () => { forcedOpponentMove = pm[Math.floor(Math.random() * pm.length)]; }; } else { ok = false; } break; }
    case 4: { const s = getRandomStone(playerColor) || getRandomStone(cpuColor); if (s) { cb = () => { board[s.r][s.c] = Math.random() < 0.5 ? BLACK : WHITE; specialStones[s.r][s.c] = 'changed'; }; } else { ok = false; } break; }
    case 5: { const u = playerMagics.filter(m => !m.used && !playerUsedMagicIds.has(m.spell.id)); if (u.length > 0) { cb = () => { u[Math.floor(Math.random() * u.length)].used = true; }; } else { ok = false; } break; }
    case 6: { const ms = getRandomStone(cpuColor); const os = getRandomStone(playerColor); if (ms && os) { cb = () => { board[ms.r][ms.c] = playerColor; board[os.r][os.c] = cpuColor; specialStones[ms.r][ms.c] = 'swapped'; specialStones[os.r][os.c] = 'swapped'; }; } else { ok = false; } break; }
    case 7: {
      const u = playerMagics.filter(m => !m.used && !playerUsedMagicIds.has(m.spell.id));
      if (u.length > 0) {
        cb = () => {
          const cp = u[Math.floor(Math.random() * u.length)].spell;
          cpuMagics[index].spell = { ...cp, name: `宝生マーゴ→${cp.name}` };
        };
      } else { ok = false; }
      break;
    }
    case 8: cb = () => { playerMagicBlocked = 3; }; break;
    case 9: { 
      const st = []; 
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] !== EMPTY && !fireStates.find(f => f.r === r && f.c === c)) st.push({ r, c });
        }
      }
      const s = st.length ? st[Math.floor(Math.random() * st.length)] : null;
      if (s) { cb = () => { applyFire(s.r, s.c); }; } else { ok = false; } 
      break; 
    }
    case 10: { cb = () => { specialStones = Array(ROWS).fill().map(() => Array(COLS).fill(null)); let bs = 0, ws = 0; const co = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (board[r][c] === BLACK) bs++; if (board[r][c] === WHITE) ws++; if (board[r][c] !== EMPTY) co.push({ r, c }); } co.sort(() => Math.random() - 0.5); co.forEach((p, i) => board[p.r][p.c] = i < bs ? BLACK : WHITE); }; break; }
    case 11: { const s = getRandomStone(cpuColor) || getRandomStone(playerColor); const e = getRandomEmpty(); if (s && e) { cb = () => { board[e.r][e.c] = board[s.r][s.c]; board[s.r][s.c] = EMPTY; specialStones[e.r][e.c] = 'moved'; specialStones[s.r][s.c] = 'moved-from'; }; } else { ok = false; } break; }
    case 12: cb = () => { }; break; // ココ：プレイヤー側のカードを見てもCPUには関係ないので何もしない
    case 13: {
      if (magicHistory.length >= 2) {
        cb = () => {
          const stateBeforeMyTurn = magicHistory.pop();
          const opAction = stateBeforeMyTurn.lastAction;
          const dest = magicHistory.pop();
          board = JSON.parse(JSON.stringify(dest.board));
          fireStates = JSON.parse(JSON.stringify(dest.fireStates));
          specialStones = JSON.parse(JSON.stringify(dest.specialStones));
          lastPlacedMove = dest.lastAction;
          currentMoveHistory = dest.moveSequence || "";
          if (opAction && opAction.r !== undefined) {
            bannedOpponentMove = { r: opAction.r, c: opAction.c, player: opAction.player };
          }
        };
      } else { ok = false; }
      break;
    }
  }

  if (ok && cb) {
    // 相手が魔法を使用したときのメッセージをモーダルで表示する
    const modal = document.getElementById('cpu-magic-modal');
    const msgEl = document.getElementById('cpu-magic-message');
    const btnClose = document.getElementById('btn-close-cpu-magic');
    
    msgEl.textContent = `${getCpuName()} が 魔法「${spell.name}」を使用しました！`;
    modal.style.display = 'flex';
    
    // 一度だけクリックイベントをリッスンするための関数
    const closeHandler = () => {
      modal.style.display = 'none';
      btnClose.removeEventListener('click', closeHandler);
      commitMagic(index, true, cb, spell.id === 7);
    };
    btnClose.addEventListener('click', closeHandler);
    
    return true;
  }
  return false;
}

// ==========================================
// 10. 全般的なUI関連の表示とゲーム終了
// ==========================================
function showPassMessage(passedPlayer) {
  passModal.style.animation = 'fadeIn 0.3s ease'; passModal.style.display = 'flex';
  setTimeout(() => {
    passModal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => { passModal.style.display = 'none'; passModal.style.animation = 'fadeIn 0.3s ease'; }, 300);
  }, 1500);
}

function surrenderGame() {
  if (gameEnded) return;
  gameEnded = true; isCPUThinking = false; surrenderBtn.style.display = 'none';
  finalPlayerScore.textContent = playerScores[playerColor]; finalCpuScore.textContent = playerScores[cpuColor];

  if (opponentType === 'pvp') {
    const winnerName = currentTurn === playerColor ? "プレイヤー2" : "プレイヤー1";
    winnerText.textContent = `投了 (${winnerName}の勝ち)`;
  } else {
    winnerText.textContent = `投了 (${getCpuName()}の勝ち)`;
  }
  winnerText.className = "lose";
  gameOverModal.style.display = 'flex';
}

function endGame() {
  if (gameEnded) return;
  gameEnded = true; surrenderBtn.style.display = 'none';
  const pScore = playerScores[playerColor]; const cScore = playerScores[cpuColor];
  finalPlayerScore.textContent = pScore; finalCpuScore.textContent = cScore;
  isCPUThinking = false;
  // 点数を比較して勝敗を決める
  if (pScore > cScore) {
    winnerText.textContent = opponentType === 'pvp' ? "プレイヤー1の勝ち！" : "あなたの勝ち！";
    winnerText.className = "win";
  }
  else if (cScore > pScore) {
    winnerText.textContent = opponentType === 'pvp' ? "プレイヤー2の勝ち！" : `${getCpuName()}の勝ち！`;
    winnerText.className = "lose";
  }
  else { winnerText.textContent = "引き分け！"; winnerText.className = "draw"; }
  gameOverModal.style.display = 'flex';
}

// 各種ボタン類のイベント登録
document.getElementById('btn-cancel-surrender').addEventListener('click', () => confirmSurrenderModal.style.display = 'none');
document.getElementById('btn-confirm-surrender').addEventListener('click', () => { confirmSurrenderModal.style.display = 'none'; surrenderGame(); });

// 効果音の音量スライダーイベント
if (volumeSlider) {
  volumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    allSounds.forEach(s => s.volume = vol);
    if (vol === 0) volumeIcon.textContent = "🔇";
    else if (vol < 0.5) volumeIcon.textContent = "🔉";
    else volumeIcon.textContent = "🔊";
  });

  // アイコンクリックでオン／オフの切り替え
  let lastVolume = 0.5;
  volumeIcon.addEventListener('click', () => {
    const currentVol = allSounds[0].volume;
    if (currentVol > 0) {
      lastVolume = currentVol;
      volumeSlider.value = 0;
      allSounds.forEach(s => s.volume = 0);
      volumeIcon.textContent = "🔇";
    } else {
      volumeSlider.value = lastVolume || 0.5;
      allSounds.forEach(s => s.volume = volumeSlider.value);
      volumeIcon.textContent = allSounds[0].volume >= 0.5 ? "🔊" : "🔉";
    }
  });
}

// BGMの音量スライダーイベント
if (bgmVolumeSlider) {
  bgmVolumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    bgmSound.volume = vol;
    if (vol === 0) bgmVolumeIcon.textContent = "🔇";
    else if (vol < 0.5) bgmVolumeIcon.textContent = "🔉";
    else bgmVolumeIcon.textContent = "🔊";
  });

  let bgmLastVolume = 0.05;
  bgmVolumeIcon.addEventListener('click', () => {
    const currentVol = bgmSound.volume;
    if (currentVol > 0) {
      bgmLastVolume = currentVol;
      bgmVolumeSlider.value = 0;
      bgmSound.volume = 0;
      bgmVolumeIcon.textContent = "🔇";
    } else {
      bgmVolumeSlider.value = bgmLastVolume || 0.05;
      bgmSound.volume = bgmVolumeSlider.value;
      bgmVolumeIcon.textContent = bgmSound.volume >= 0.5 ? "🔊" : "🔉";
    }
  });
}

// まじかるモードのルール表示用
document.getElementById('btn-show-rules')?.addEventListener('click', () => document.getElementById('rules-modal').style.display = 'flex');
document.getElementById('btn-close-rules')?.addEventListener('click', () => document.getElementById('rules-modal').style.display = 'none');

btnPlayBlack.addEventListener('click', () => {
  bgmSound.play().catch(e => console.warn('BGM再生がブロックされました:', e));
  initGame(BLACK);
});
btnPlayWhite.addEventListener('click', () => {
  bgmSound.play().catch(e => console.warn('BGM再生がブロックされました:', e));
  initGame(WHITE);
});
surrenderBtn.addEventListener('click', () => { if (!gameEnded) confirmSurrenderModal.style.display = 'flex'; });
restartBtn.addEventListener('click', () => { 
  gameOverModal.style.display = 'none'; 
  titleScreenModal.style.display = 'flex'; 
});

// モード切替のUI制御
function updateModeUI() {
  const normalContainer = document.getElementById('normal-opponent-container');
  const manosabaContainer = document.getElementById('manosaba-opponent-container');
  const specialContainer = document.getElementById('special-opponent-container');
  const specialModeLabel = document.getElementById('special-mode-label');
  const opType = document.querySelector('input[name="opponent-type"]:checked')?.value || 'cpu';
  let mode = document.querySelector('input[name="game-mode"]:checked')?.value || 'normal';

  if (opType === 'pvp') {
    if (specialModeLabel) specialModeLabel.style.display = 'none';
    if (mode === 'special') {
      document.querySelector('input[name="game-mode"][value="normal"]').checked = true;
      mode = 'normal';
    }
  } else {
    if (specialModeLabel) specialModeLabel.style.display = 'block';
  }

  if (opType === 'cpu') {
    if (mode === 'special') {
      if (normalContainer) normalContainer.style.display = 'none';
      if (manosabaContainer) manosabaContainer.style.display = 'none';
      if (specialContainer) specialContainer.style.display = 'block';
    } else if (mode === 'manosaba') {
      if (normalContainer) normalContainer.style.display = 'none';
      if (manosabaContainer) manosabaContainer.style.display = 'block';
      if (specialContainer) specialContainer.style.display = 'none';
    } else {
      if (normalContainer) normalContainer.style.display = 'block';
      if (manosabaContainer) manosabaContainer.style.display = 'none';
      if (specialContainer) specialContainer.style.display = 'none';
    }
  } else {
    if (normalContainer) normalContainer.style.display = 'none';
    if (manosabaContainer) manosabaContainer.style.display = 'none';
    if (specialContainer) specialContainer.style.display = 'none';
  }
}

document.getElementsByName('opponent-type').forEach(radio => radio.addEventListener('change', updateModeUI));
document.getElementsByName('game-mode').forEach(radio => radio.addEventListener('change', updateModeUI));

// 初期状態反映
updateModeUI();
