// DOM Elements
const uiLayer = document.getElementById('ui-layer');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const comboBoxEl = document.getElementById('combo-box');
const judgmentText = document.getElementById('judgment-text');
const notesContainer = document.getElementById('notes-container');
const playArea = document.getElementById('play-area');
const lanes = [
    document.getElementById('lane-0'),
    document.getElementById('lane-1'),
    document.getElementById('lane-2'),
    document.getElementById('lane-3')
];

const startScreen = document.getElementById('start-screen');
const resultScreen = document.getElementById('result-screen');
const pauseScreen = document.getElementById('pause-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const titleBtn = document.getElementById('title-btn');
const volumeSlider = document.getElementById('volume-slider');
const audioUpload = document.getElementById('audio-upload');
const selectedFileName = document.getElementById('selected-file-name');
const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
const bgm = document.getElementById('bgm');
const offsetValueEl = document.getElementById('offset-value');
const offsetUpBtn = document.getElementById('offset-up-btn');
const offsetDownBtn = document.getElementById('offset-down-btn');

// 初期音量設定
bgm.volume = 0.25;

// Game Constants
let KEY_MAP = { 'd': 0, 'D': 0, 'f': 1, 'F': 1, 'j': 2, 'J': 2, 'k': 3, 'K': 3 };
let NOTE_SPEED = 1500; // ノーツが画面上部から判定ラインに到達するまでの時間(ms)
const FPS = 60;
let judgmentOffset = 120; // 判定ラインの高さ(px)

// 判定ウィンドウ (ms)
const WINDOW_PERFECT = 60;
const WINDOW_GREAT = 120;
const WINDOW_MISS = 200;

// スコア設定
const SCORE_PERFECT = 200;
const SCORE_GREAT = 100;

// Game State
let isPlaying = false;
let isPaused = false;
let score = 0;
let combo = 0;
let maxCombo = 0;
let stats = { perfect: 0, great: 0, miss: 0 };
let startTime = 0;
let animationId;

// 譜面データ (time: 押すタイミング(ms), lane: レーン(0~3))
let beatmap = [];
let activeNotes = [];
let noteIndex = 0;

// 音量調整
volumeSlider.addEventListener('input', (e) => {
    bgm.volume = e.target.value;
});

let currentDifficulty = 'normal';
let currentLanes = 4;

const laneRadios = document.querySelectorAll('input[name="lanes"]');
laneRadios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
        currentLanes = parseInt(e.target.value);

        // スタート画面のテキストを即座に更新
        if (currentLanes === 2) {
            document.querySelector('.instructions').textContent = 'Keys: F, J';
        } else {
            document.querySelector('.instructions').textContent = 'Keys: D, F, J, K';
        }

        if (audioAnalysisDone) {
            audioAnalysisDone = false;
            startBtn.textContent = 'ANALYZING...';
            startBtn.disabled = true;
            beatmap = await analyzeAudioAndGenerateBeatmap(bgm.src, currentDifficulty);
            beatmap.sort((a, b) => a.time - b.time);
            audioAnalysisDone = true;
            startBtn.disabled = false;
            startBtn.textContent = 'GAME START';
        }
    });
});

// 難易度変更時の再解析
difficultyRadios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
        currentDifficulty = e.target.value;
        if (currentDifficulty === 'hard') {
            NOTE_SPEED = 900; // ハードは落下スピードを速くする
        } else if (currentDifficulty === 'test') {
            NOTE_SPEED = 2000; // テスト用は確認しやすくゆっくりにする
        } else {
            NOTE_SPEED = 1500;
        }

        if (audioAnalysisDone) {
            audioAnalysisDone = false;
            startBtn.textContent = 'ANALYZING...';
            startBtn.disabled = true;
            beatmap = await analyzeAudioAndGenerateBeatmap(bgm.src, currentDifficulty);
            beatmap.sort((a, b) => a.time - b.time);
            audioAnalysisDone = true;
            startBtn.disabled = false;
            startBtn.textContent = 'GAME START';
        }
    });
});

// オーディオ解析と自動譜面生成
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioAnalysisDone = false;
let isAnalyzing = false;

async function analyzeAudioAndGenerateBeatmap(url, difficulty = 'normal') {
    if (difficulty === 'test') {
        return generateHoldTestBeatmap();
    }

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        // Safariの古いバージョン等に配慮したdecodeAudioDataのラッパー
        const audioBuffer = await new Promise((resolve, reject) => {
            const decodePromise = audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
            if (decodePromise) { // モダンブラウザでPromiseを返す場合
                decodePromise.catch(reject);
            }
        });

        const channelData = audioBuffer.getChannelData(0); // モノラル解析
        const sampleRate = audioBuffer.sampleRate;
        const map = [];

        // 1秒ごとのRMS(エネルギー)と最大ピークを計算して全体の平均やサビを判定
        const chunkSize = sampleRate; // 1秒
        const energies = [];
        const maxPeaks = [];
        for (let i = 0; i < channelData.length; i += chunkSize) {
            let sumSq = 0;
            let maxP = 0;
            const end = Math.min(i + chunkSize, channelData.length);
            for (let j = i; j < end; j++) {
                const val = Math.abs(channelData[j]);
                sumSq += val * val;
                if (val > maxP) maxP = val;
            }
            energies.push(Math.sqrt(sumSq / (end - i)));
            maxPeaks.push(maxP);
        }

        // エネルギーの上位30%をサビ（盛り上がり）と判定する
        const sortedEnergies = [...energies].sort((a, b) => b - a);
        const highEnergyThreshold = sortedEnergies[Math.floor(energies.length * 0.3)]; // 上位30%の境界値

        const isHard = difficulty === 'hard';
        // 連続ヒットの間隔を限界まで狭める(0.15 -> 0.1)
        const minGap = isHard ? sampleRate * 0.1 : sampleRate * 0.25;
        let lastPeakPos = 0;
        let holdEndTimes = [0, 0, 0, 0]; // 各レーンの長押し終了時間を記録

        for (let i = 0; i < channelData.length; i++) {
            const chunkIndex = Math.floor(i / chunkSize);
            const currentEnergy = energies[chunkIndex];
            const currentMaxPeak = maxPeaks[chunkIndex];

            // 基本はエネルギー（音圧）を基準にしきい値を動的計算
            let localThreshold = currentEnergy * (isHard ? 1.2 : 1.5);

            // ドラムなどが無い「のっぺりした」曲調だと、最大音量がエネルギーの1.5倍に届かずノーツが生成されない。
            // そのため、その1秒間の中で一番大きいピークの一定割合は必ず拾えるように上限を設ける。
            const guaranteedThreshold = currentMaxPeak * (isHard ? 0.6 : 0.8);
            localThreshold = Math.min(localThreshold, guaranteedThreshold);

            // ただし、完全な無音時のノイズを拾わないように最低値を設定
            localThreshold = Math.max(localThreshold, 0.015);

            if (Math.abs(channelData[i]) > localThreshold) {
                if (i - lastPeakPos > minGap) {
                    const timeMs = (i / sampleRate) * 1000;
                    if (timeMs > 2000) { // 開始直後は避ける
                        const isHighEnergy = energies[chunkIndex] > highEnergyThreshold;

                        // 現在長押し中ではないレーンを探す（200msの余裕を持たせる）
                        let availableLanes = [];
                        for (let l = 0; l < currentLanes; l++) {
                            if (timeMs > holdEndTimes[l] + 200) {
                                availableLanes.push(l);
                            }
                        }

                        // 全レーンが長押し中の場合はスキップ
                        if (availableLanes.length === 0) {
                            lastPeakPos = i;
                            continue;
                        }

                        // メインのノーツを配置
                        const laneIndex = Math.floor(Math.random() * availableLanes.length);
                        const lane = availableLanes[laneIndex];
                        availableLanes.splice(laneIndex, 1);

                        // 高エネルギー時はホールドノーツを出す確率を追加（通常時も少し出す）
                        let isHoldChance = isHighEnergy ? (isHard ? 0.5 : 0.3) : (isHard ? 0.1 : 0.05);
                        let isHold = Math.random() < isHoldChance;
                        let duration = isHold ? 400 + Math.random() * (isHard ? 600 : 400) : 0; // 400ms~1000ms

                        if (isHold) {
                            holdEndTimes[lane] = timeMs + duration;
                        }

                        map.push({ time: timeMs, lane: lane, type: isHold ? 'hold' : 'tap', duration: duration, handled: false, isHolding: false, element: null });

                        // サビ（盛り上がり）時やハードモード時は同時押しを増やす
                        let simultaneousChance = isHighEnergy ? (isHard ? 0.85 : 0.6) : (isHard ? 0.4 : 0.15);
                        if (Math.random() < simultaneousChance && availableLanes.length > 0) {
                            let extraLaneIndex = Math.floor(Math.random() * availableLanes.length);
                            let extraLane = availableLanes[extraLaneIndex];
                            availableLanes.splice(extraLaneIndex, 1);

                            // 同時押しはタップにする（長押しでも良いが複雑化を防ぐため）
                            map.push({ time: timeMs, lane: extraLane, type: 'tap', duration: 0, handled: false, isHolding: false, element: null });

                            // 高エネルギー時、ハードはさらに3つ同時押し確率も大幅上昇
                            if (isHighEnergy && Math.random() < (isHard ? 0.75 : 0.3) && availableLanes.length > 0) {
                                let thirdLaneIndex = Math.floor(Math.random() * availableLanes.length);
                                let thirdLane = availableLanes[thirdLaneIndex];
                                map.push({ time: timeMs, lane: thirdLane, type: 'tap', duration: 0, handled: false, isHolding: false, element: null });
                            }
                        }
                    }
                    lastPeakPos = i;
                }
            }
        }

        // デフォルト曲「test.wav」専用：2分経過後(120000ms)の強制生成ロジック
        const currentFileName = document.getElementById('selected-file-name').textContent;
        if (url.includes('test') || currentFileName.includes('test')) {
            const fallbackStartTime = 120000; // 2分経過時点 (120000ms)
            const totalDurationMs = audioBuffer.duration * 1000;

            if (totalDurationMs > fallbackStartTime + 5000) { // 曲が確実に2分以上ある場合
                console.log("デフォルト曲の2分以降のノーツを強制生成します！");

                // 2分以降の既存ノーツ（もしあれば）を全てクリア
                const filteredMap = map.filter(n => n.time < fallbackStartTime);
                map.length = 0;
                map.push(...filteredMap);

                // 一定間隔でノーツを生成 (Normal:800ms, Hard:400ms)
                const interval = isHard ? 400 : 800;
                for (let t = fallbackStartTime; t < totalDurationMs - 3000; t += interval) {
                    const lane = Math.floor(Math.random() * currentLanes);
                    const isHold = Math.random() < (isHard ? 0.3 : 0.1);
                    const duration = isHold ? (isHard ? 600 : 400) : 0;

                    map.push({ time: t, lane: lane, type: isHold ? 'hold' : 'tap', duration: duration, handled: false, isHolding: false, element: null });

                    // ハードモードの場合は同時押しも追加
                    if (isHard && Math.random() < 0.4 && currentLanes > 1) {
                        let extraLane = Math.floor(Math.random() * currentLanes);
                        if (extraLane !== lane) {
                            map.push({ time: t, lane: extraLane, type: 'tap', duration: 0, handled: false, isHolding: false, element: null });
                        }
                    }
                }
            }
        }

        if (map.length === 0) {
            console.warn("ピークが検出されませんでした。仮譜面を使用します。");
            return generateTestBeatmap();
        }
        return map;
    } catch (e) {
        console.warn("解析エラー (ローカルファイルの場合は「音源を選択」から読み込んでください):", e);
        return generateTestBeatmap();
    }
}

// 解析の共通ラッパー
async function handleAudioLoad(url) {
    if (audioAnalysisDone || isAnalyzing) return;
    isAnalyzing = true;

    startBtn.textContent = 'ANALYZING...';
    startBtn.disabled = true;

    // スマホSafari対策: AudioContextがsuspendedの場合はresume
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.warn(e));
    }

    beatmap = await analyzeAudioAndGenerateBeatmap(url, currentDifficulty);
    beatmap.sort((a, b) => a.time - b.time);
    
    audioAnalysisDone = true;
    isAnalyzing = false;
    
    startBtn.disabled = false;
    startBtn.textContent = 'GAME START';
}

// デフォルト曲等用：オーディオがロード可能になったら解析
function checkDefaultAudio() {
    if (bgm.src && !bgm.src.endsWith('/')) {
        handleAudioLoad(bgm.src);
    }
}

if (bgm.readyState >= 3) { // HAVE_FUTURE_DATA 以上であればすでに読み込み済み
    checkDefaultAudio();
} else {
    bgm.addEventListener('canplaythrough', checkDefaultAudio);
}

// カスタムファイルアップロードの処理
audioUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedFileName.textContent = file.name;
        const objectURL = URL.createObjectURL(file);
        bgm.src = objectURL;
        
        // スマホSafari対策: 明示的にloadを呼ぶ
        bgm.load(); 
        
        audioAnalysisDone = false;
        // 即座に解析処理を開始
        handleAudioLoad(objectURL);
    }
});

// 仮の譜面を生成する関数 (テスト用)
function generateTestBeatmap() {
    const map = [];
    let currentTime = 2000; // 最初のノーツは2秒後

    // 約2分間分のノーツを生成 (BPM120想定、0.5秒間隔)
    for (let i = 0; i < 240; i++) {
        // ランダムなレーンに配置
        const lane = Math.floor(Math.random() * currentLanes);
        map.push({ time: currentTime, lane: lane, type: 'tap', duration: 0, handled: false, isHolding: false, element: null });

        // たまに同時押し（違うレーン）
        if (Math.random() > 0.8 && currentLanes > 1) {
            let extraLane = Math.floor(Math.random() * currentLanes);
            if (extraLane !== lane) {
                map.push({ time: currentTime, lane: extraLane, type: 'tap', duration: 0, handled: false, isHolding: false, element: null });
            }
        }

        currentTime += 500; // 500ms間隔
    }
    return map;
}

// ホールド専用テスト譜面を生成する関数
function generateHoldTestBeatmap() {
    const map = [];
    let currentTime = 2000; // 最初のノーツは2秒後

    // 長押しノーツが順番に1つずつ落ちてくる
    for (let i = 0; i < 60; i++) {
        const lane = i % currentLanes; // 左から順番
        map.push({ time: currentTime, lane: lane, type: 'hold', duration: 1500, handled: false, isHolding: false, element: null });

        currentTime += 3000; // 3秒間隔でゆったり降らせる
    }
    return map;
}

// ホールド中のノーツ管理
let activeHolds = {};

// ゲーム初期化
function initGame() {
    score = 0;
    combo = 0;
    maxCombo = 0;
    stats = { perfect: 0, great: 0, miss: 0 };
    noteIndex = 0;
    activeNotes = [];
    activeHolds = {};
    notesContainer.innerHTML = '';

    updateScoreUI();
    comboBoxEl.classList.add('hidden');
    judgmentText.style.opacity = 0;

    // 譜面はすでに解析済みのものをそのまま使う（クローンして再利用）
    beatmap.forEach(note => {
        note.handled = false;
        note.isHolding = false;
        note.isHoldingCompleted = false;
        note.element = null;
    });
}

// ゲーム開始
function startGame() {
    // レーンモードに応じたUIとキーバインドの設定
    if (currentLanes === 2) {
        KEY_MAP = { 'f': 0, 'F': 0, 'j': 1, 'J': 1 };
        playArea.classList.add('mode-2lane');
        document.querySelector('.instructions').textContent = 'Keys: F, J';
        document.querySelector('#lane-0 .key-label').textContent = 'F';
        document.querySelector('#lane-1 .key-label').textContent = 'J';
    } else {
        KEY_MAP = { 'd': 0, 'D': 0, 'f': 1, 'F': 1, 'j': 2, 'J': 2, 'k': 3, 'K': 3 };
        playArea.classList.remove('mode-2lane');
        document.querySelector('.instructions').textContent = 'Keys: D, F, J, K';
        document.querySelector('#lane-0 .key-label').textContent = 'D';
        document.querySelector('#lane-1 .key-label').textContent = 'F';
    }

    initGame();
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');

    isPaused = false;
    isPlaying = true;
    
    // PCやスマホでの自動再生ブロック対策としてここで明示的に再開
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.warn(e));
    }
    
    // 音源の再生
    bgm.currentTime = 0;
    bgm.play().catch(e => {
        console.warn("自動再生がブロックされました。適当なキーを押してください。", e);
    });

    startTime = performance.now();

    // bgmの終了を検知
    bgm.onended = endGame;

    gameLoop();
}

// ゲーム終了
function endGame() {
    isPlaying = false;
    cancelAnimationFrame(animationId);

    // リザルト画面の更新
    document.getElementById('result-score').textContent = score;
    document.getElementById('result-max-combo').textContent = maxCombo;
    document.getElementById('result-perfect').textContent = stats.perfect;
    document.getElementById('result-great').textContent = stats.great;
    document.getElementById('result-miss').textContent = stats.miss;

    resultScreen.classList.remove('hidden');
}

// メインループ
function gameLoop() {
    if (!isPlaying || isPaused) return;

    // bgm.currentTimeを使って時間を同期（ミリ秒に変換）
    // オーディオがまだロードされていない場合は performance.now() をフォールバックに使用
    const currentTime = bgm.readyState >= 2 ? bgm.currentTime * 1000 : performance.now() - startTime;

    // プログレスバーと残り時間の更新
    if (bgm.duration) {
        const progressPercent = (bgm.currentTime / bgm.duration) * 100;
        document.getElementById('progress-bar').style.width = `${progressPercent}%`;

        const remainingSeconds = Math.max(0, Math.ceil(bgm.duration - bgm.currentTime));
        const m = Math.floor(remainingSeconds / 60);
        const s = remainingSeconds % 60;
        document.getElementById('time-remaining').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // ノーツの生成 (画面に現れるタイミング = 判定時間 - NOTE_SPEED)
    while (noteIndex < beatmap.length) {
        const note = beatmap[noteIndex];
        const spawnTime = note.time - NOTE_SPEED;

        if (currentTime >= spawnTime) {
            spawnNoteElement(note);
            activeNotes.push(note);
            noteIndex++;
        } else {
            break;
        }
    }

    // 画面の高さと判定ラインの位置を取得
    const playAreaHeight = playArea.clientHeight;
    const judgmentLineY = playAreaHeight - judgmentOffset;

    // ノーツの位置更新とMISS判定
    for (let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        // 進行度を計算
        // currentY はノーツの「下端」の位置を表すようにCSSが変更されている（bottom: 100%）
        const progress = (currentTime - (note.time - NOTE_SPEED)) / NOTE_SPEED;
        const currentY = progress * judgmentLineY;

        if (note.element) {
            note.element.style.transform = `translateY(${currentY}px)`;
            if (note.type === 'hold') {
                note.element.style.height = `${(note.duration / NOTE_SPEED) * judgmentLineY}px`;
            }
        }

        // 画面外（判定ラインのはるか下）に出たら完全削除
        const noteHeight = note.type === 'hold' ? (note.duration / NOTE_SPEED) * judgmentLineY : 30;
        const noteTopY = currentY - noteHeight;

        if (noteTopY > playAreaHeight + 50) { // 余裕をもたせて画面外で消す
            if (note.element && note.element.parentNode) {
                note.element.parentNode.removeChild(note.element);
            }
            activeNotes.splice(i, 1);
            continue;
        }

        // 処理済み（ヒットまたはミス）の場合は判定を行わず落下だけさせる
        if (note.handled) {
            continue;
        }

        // MISS判定とホールド判定
        if (note.type === 'tap') {
            if (currentTime > note.time + WINDOW_MISS) {
                registerHit('miss', note, note.lane);
                note.handled = true;
                if (note.element) note.element.style.opacity = '0.5'; // 見逃したノーツは半透明に
            }
        } else if (note.type === 'hold') {
            if (!note.isHolding && currentTime > note.time + WINDOW_MISS) {
                // 開始を見逃した
                registerHit('miss', note, note.lane);
                note.handled = true;
                if (note.element) note.element.style.opacity = '0.5';
            } else if (note.isHolding) {
                // ホールド中のエフェクト（間引いて表示）
                if (Math.random() > 0.5) createHitEffect(note.lane);

                // 終了時間を過ぎても押し続けている場合はパーフェクト扱いにする
                if (currentTime > note.time + note.duration + WINDOW_PERFECT) {
                    note.isHoldingCompleted = true;
                    registerHit('perfect', note, note.lane);
                    delete activeHolds[note.lane];
                }
            }
        }
    }

    animationId = requestAnimationFrame(gameLoop);
}

// ノーツのDOM要素を生成
function spawnNoteElement(note) {
    const el = document.createElement('div');
    el.classList.add('note');
    el.classList.add(`note-${note.lane}`);
    if (note.type === 'hold') {
        el.classList.add('hold');
    }
    notesContainer.appendChild(el);
    note.element = el;
}

// キー入力処理
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPlaying) {
        togglePause();
        return;
    }

    if (!isPlaying || isPaused) return;
    if (e.repeat) return; // 押しっぱなし防止

    const lane = KEY_MAP[e.key];
    if (lane !== undefined) {
        // レーンの発光エフェクト
        lanes[lane].classList.add('active');

        // 判定処理
        checkHit(lane);
    }
});

window.addEventListener('keyup', (e) => {
    const lane = KEY_MAP[e.key];
    if (lane !== undefined) {
        lanes[lane].classList.remove('active');

        // ホールドノーツの終了判定
        if (activeHolds[lane]) {
            const note = activeHolds[lane];
            const currentTime = bgm.readyState >= 2 ? bgm.currentTime * 1000 : performance.now() - startTime;
            const endTime = note.time + note.duration;
            const timeDiff = Math.abs(endTime - currentTime);

            note.isHoldingCompleted = true; // 削除可能にする

            if (timeDiff <= WINDOW_PERFECT) {
                registerHit('perfect', note, lane);
            } else if (timeDiff <= WINDOW_GREAT) {
                registerHit('great', note, lane);
            } else {
                registerHit('miss', note, lane);
            }

            delete activeHolds[lane];
        }
    }
});

// 判定処理
function checkHit(lane) {
    const currentTime = bgm.readyState >= 2 ? bgm.currentTime * 1000 : performance.now() - startTime;

    // そのレーンでまだ処理されていないノーツを探す
    let targetNote = null;
    for (let i = 0; i < activeNotes.length; i++) {
        const note = activeNotes[i];
        if (note.lane === lane && !note.handled && !note.isHolding) {
            targetNote = note;
            break;
        }
    }

    if (!targetNote) return; // 該当ノーツなし

    const timeDiff = Math.abs(targetNote.time - currentTime);

    // 判定ウィンドウに入っているか
    if (timeDiff <= WINDOW_PERFECT || timeDiff <= WINDOW_GREAT || timeDiff <= WINDOW_MISS) {
        let judgment = timeDiff <= WINDOW_PERFECT ? 'perfect' : (timeDiff <= WINDOW_GREAT ? 'great' : 'miss');

        if (targetNote.type === 'tap') {
            registerHit(judgment, targetNote, lane);
        } else if (targetNote.type === 'hold') {
            if (judgment === 'miss') {
                registerHit('miss', targetNote, lane);
            } else {
                // 開始成功
                targetNote.isHolding = true;
                activeHolds[lane] = targetNote;

                // 長押し中は少し色を明るくする
                targetNote.element.classList.add('active-hold');
            }
        }
    }
}

// ヒット結果の登録とエフェクト表示
function registerHit(judgment, note = null, lane = -1) {
    if (note && note.type === 'tap') {
        note.handled = true;
        if (judgment !== 'miss' && note.element && note.element.parentNode) {
            note.element.parentNode.removeChild(note.element);
        }
    } else if (note && note.type === 'hold') {
        if (judgment === 'miss' || note.isHoldingCompleted) {
            note.handled = true;
            if (note.element) {
                // 長押し終了時にエフェクトを外す
                note.element.classList.remove('active-hold');
                if (judgment === 'miss') {
                    note.element.style.opacity = '0.5';
                }
            }
            // 成功や失敗に限らずバーの下回るまで消さないため、removeChildは行わない
        }
    }

    // 判定テキストの表示
    judgmentText.textContent = judgment.toUpperCase();
    judgmentText.className = '';

    // アニメーションをリセットするために一度reflow
    void judgmentText.offsetWidth;

    judgmentText.classList.add('judgement-anim');
    judgmentText.classList.add(`judge-${judgment}`);

    // スコアとコンボの計算
    if (judgment === 'perfect') {
        stats.perfect++;
        combo++;
        score += SCORE_PERFECT + combo; // コンボボーナス（1コンボにつき1点）
        createHitEffect(lane);
    } else if (judgment === 'great') {
        stats.great++;
        combo++;
        score += SCORE_GREAT + Math.floor(combo * 0.5);
        createHitEffect(lane);
    } else if (judgment === 'miss') {
        stats.miss++;
        combo = 0;
    }

    if (combo > maxCombo) {
        maxCombo = combo;
    }

    updateScoreUI();
}

// UIの更新
function updateScoreUI() {
    scoreEl.textContent = score;
    comboEl.textContent = combo;

    if (combo >= 5) {
        comboBoxEl.classList.remove('hidden');
        // コンボが上がるたびに少しポップするアニメーション
        comboEl.classList.add('combo-pop');
        setTimeout(() => comboEl.classList.remove('combo-pop'), 100);
    } else {
        comboBoxEl.classList.add('hidden');
    }
}

// ヒットエフェクト（パーティクル）の生成
function createHitEffect(lane) {
    if (lane === -1) return;

    const hitZone = lanes[lane].querySelector('.hit-zone');
    const particle = document.createElement('div');
    particle.classList.add('hit-particle');

    // 色をレーンに合わせる
    const colors = ['rgba(255, 0, 85, 0.8)', 'rgba(0, 238, 255, 0.8)', 'rgba(0, 255, 102, 0.8)', 'rgba(255, 170, 0, 0.8)'];
    particle.style.background = `radial-gradient(circle, ${colors[lane]} 0%, transparent 70%)`;

    hitZone.appendChild(particle);

    setTimeout(() => {
        if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
        }
    }, 300);
}

// イベントリスナー登録
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
    resultScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    // 音源をリセット
    bgm.pause();
    bgm.currentTime = 0;
});

// ポーズ処理
function togglePause() {
    if (!isPlaying) return;

    if (isPaused) {
        isPaused = false;
        pauseScreen.classList.add('hidden');
        bgm.play();
        animationId = requestAnimationFrame(gameLoop);
    } else {
        isPaused = true;
        bgm.pause();
        cancelAnimationFrame(animationId);
        pauseScreen.classList.remove('hidden');
    }
}

resumeBtn.addEventListener('click', togglePause);
titleBtn.addEventListener('click', () => {
    isPaused = false;
    isPlaying = false;
    bgm.pause();
    bgm.currentTime = 0;
    pauseScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});

// UI上のポーズボタン
document.getElementById('pause-btn-ui').addEventListener('click', togglePause);

// 判定バー高さ（オフセット）の調整機能
function updateJudgmentOffset(val) {
    // 0px(一番下)から 400px(画面中央付近)の範囲に制限
    judgmentOffset = Math.max(0, Math.min(400, val));
    offsetValueEl.textContent = judgmentOffset;

    // CSSを動的に更新
    document.getElementById('judgment-line').style.bottom = `${judgmentOffset}px`;
    document.querySelectorAll('.hit-zone').forEach(hz => {
        hz.style.bottom = `${judgmentOffset}px`;
    });
}

offsetUpBtn.addEventListener('click', () => updateJudgmentOffset(judgmentOffset + 5));
offsetDownBtn.addEventListener('click', () => updateJudgmentOffset(judgmentOffset - 5));

// キーボード操作（ゲーム中も調整可能にするため）
document.addEventListener('keydown', (e) => {
    // 上下キーで判定バーの高さを調整
    if (e.key === 'ArrowUp') {
        updateJudgmentOffset(judgmentOffset + 5);
        e.preventDefault(); // スクロール防止
    } else if (e.key === 'ArrowDown') {
        updateJudgmentOffset(judgmentOffset - 5);
        e.preventDefault(); // スクロール防止
    }
});
