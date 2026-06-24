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
const selectScoresBtn = document.getElementById('select-scores-btn');
const createMapBtn = document.getElementById('create-map-btn');

// Editor DOM Elements
const editorScreen = document.getElementById('editor-screen');
const editorPlayBtn = document.getElementById('editor-play-btn');
const editorStopBtn = document.getElementById('editor-stop-btn');
const editorSaveBtn = document.getElementById('editor-save-btn');
const editorExitBtn = document.getElementById('editor-exit-btn');
const editorTimeEl = document.getElementById('editor-time');
const recordingIndicator = document.getElementById('recording-indicator');
const editorBpmInput = document.getElementById('editor-bpm');
const editorGridSelect = document.getElementById('editor-grid');

let scoresDirHandle = null;
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
let globalBPM = 120; // 検出されたBPMを保持するグローバル変数

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
    
    // カスタム譜面が存在する場合はそれを優先的に読み込む
    if (scoresDirHandle && selectedFileName.textContent !== '未選択') {
        const customMap = await loadCustomBeatmap(selectedFileName.textContent);
        if (customMap) {
            console.log("カスタム譜面を読み込みました:", customMap);
            return customMap;
        }
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
        
        // --- 1. BPMとオフセットの解析フェーズ ---
        // 0.05秒(50ms)ごとのエネルギーを計算して解像度を上げる
        const blockSize = Math.floor(sampleRate * 0.05); 
        const energies = [];
        for (let i = 0; i < channelData.length; i += blockSize) {
            let sumSq = 0;
            let limit = Math.min(i + blockSize, channelData.length);
            for (let j = i; j < limit; j++) {
                sumSq += channelData[j] * channelData[j];
            }
            energies.push(Math.sqrt(sumSq / (limit - i)));
        }
        
        // 全体の平均エネルギー
        let totalEnergy = 0;
        energies.forEach(e => totalEnergy += e);
        const avgEnergy = totalEnergy / energies.length;
        
        // 局所的（ローカル）な平均エネルギーを計算（前後2.5秒 ＝ ±50ブロック）
        // これにより、曲全体で見て静かなパートでも、そのパート内での相対的なピークを拾えるようになる
        const windowSize = 50;
        const localAvgEnergies = [];
        for (let i = 0; i < energies.length; i++) {
            let sum = 0;
            let count = 0;
            for (let j = Math.max(0, i - windowSize); j <= Math.min(energies.length - 1, i + windowSize); j++) {
                sum += energies[j];
                count++;
            }
            localAvgEnergies.push(sum / count);
        }
        
        // ピークの抽出（平均より十分に高く、かつ前後のブロックより高い）
        const peaks = [];
        const peakThreshold = avgEnergy * 1.5;
        for (let i = 1; i < energies.length - 1; i++) {
            if (energies[i] > peakThreshold && energies[i] > energies[i-1] && energies[i] > energies[i+1]) {
                peaks.push(i * blockSize / sampleRate); // 発生時間(秒)
            }
        }
        
        // ピーク間の時間差（インターバル）を計算 (0.3秒〜1.5秒 = 40BPM〜200BPMの範囲)
        const intervals = [];
        for (let i = 0; i < peaks.length; i++) {
            for (let j = i + 1; j < Math.min(i + 10, peaks.length); j++) {
                const diff = peaks[j] - peaks[i];
                if (diff >= 0.3 && diff <= 1.5) { 
                    intervals.push(diff);
                }
            }
        }
        
        // インターバルからBPMを推定
        const tempoCounts = {};
        intervals.forEach(interval => {
            let theoreticalBPM = 60 / interval;
            // 90〜180の一般的なテンポ帯に正規化
            while (theoreticalBPM < 90) theoreticalBPM *= 2;
            while (theoreticalBPM > 180) theoreticalBPM /= 2;
            
            const roundedBPM = Math.round(theoreticalBPM);
            tempoCounts[roundedBPM] = (tempoCounts[roundedBPM] || 0) + 1;
        });
        
        // 最もカウントが多いBPMを採用
        let maxCount = 0;
        let guessedBPM = 120; // 検出できなかった場合のデフォルト
        for (let bpm in tempoCounts) {
            if (tempoCounts[bpm] > maxCount) {
                maxCount = tempoCounts[bpm];
                guessedBPM = parseInt(bpm);
            }
        }
        globalBPM = guessedBPM; // グローバルBPMを更新
        
        // 曲の開始位置（第1拍目のオフセット）を特定
        let offsetMs = 0;
        const strongThreshold = avgEnergy * 2.5; // より強いピークを最初の拍とする
        for (let i = 1; i < energies.length - 1; i++) {
            if (energies[i] > strongThreshold) {
                offsetMs = (i * blockSize / sampleRate) * 1000;
                break;
            }
        }
        console.log(`BPM Detected: ${guessedBPM}, Offset: ${offsetMs}ms`);

        // --- 2. ビートグリッド生成とノーツ配置（クォンタイズ）フェーズ ---
        const map = [];
        const isHard = difficulty === 'hard';
        const totalDurationMs = audioBuffer.duration * 1000;
        
        // 1拍（4分音符）と半拍（8分音符）の長さを計算
        const beatIntervalMs = 60000 / guessedBPM;
        const eighthNoteMs = beatIntervalMs / 2;
        
        let holdEndTimes = [0, 0, 0, 0];
        
        // オフセット位置（基準となる強い拍）から、曲の最初（2000ms付近）までグリッドを逆算する
        let startTime = offsetMs;
        while (startTime > 2000 + beatIntervalMs) {
            startTime -= beatIntervalMs;
        }
        while (startTime < 2000) {
            startTime += beatIntervalMs;
        }

        for (let time = startTime; time < totalDurationMs - 2000; time += eighthNoteMs) {
            // 現在のグリッド周辺のエネルギーを取得
            const timeInSeconds = time / 1000;
            const energyIndex = Math.floor((timeInSeconds * sampleRate) / blockSize);
            
            if (energyIndex < 0 || energyIndex >= energies.length) continue;
            
            const currentEnergy = energies[energyIndex];
            // その時点での周辺の平均エネルギーを基準にする（静かな場所でもノーツを降らせるため）
            const baseEnergy = localAvgEnergies[energyIndex];
            
            // グリッドが「表拍（ダウンビート）」か「裏拍（アップビート）」か
            const beatsFromOffset = Math.round((time - offsetMs) / eighthNoteMs);
            const isDownBeat = (beatsFromOffset % 2 === 0);
            
            // 配置のしきい値（大幅に下げてノーツを増やす）
            // Normal: 表拍は平均の0.8倍、裏拍は1.1倍
            // Hard: 表拍は平均の0.6倍、裏拍は0.9倍
            const threshold = isDownBeat ? baseEnergy * (isHard ? 0.6 : 0.8) : baseEnergy * (isHard ? 0.9 : 1.1);
            
            if (currentEnergy > threshold) {
                // 現在長押し中ではないレーンを探す
                let availableLanes = [];
                for (let l = 0; l < currentLanes; l++) {
                    if (time > holdEndTimes[l] + 200) {
                        availableLanes.push(l);
                    }
                }
                
                if (availableLanes.length === 0) continue;
                
                // 盛り上がり判定のしきい値も下げる（1.5倍以上でサビ/強打と判定）
                const isHighEnergy = currentEnergy > baseEnergy * 1.5;
                
                // メインノーツのレーンを決定
                const laneIndex = Math.floor(Math.random() * availableLanes.length);
                const lane = availableLanes[laneIndex];
                availableLanes.splice(laneIndex, 1);
                
                // 長押し（ホールド）ノーツの確率と長さ
                // 表拍でのみホールドを開始し、長さは拍の倍数（1拍分や1.5拍分）にぴったり合わせる
                let isHoldChance = isHighEnergy ? (isHard ? 0.3 : 0.2) : (isHard ? 0.1 : 0.05);
                let isHold = isDownBeat && (Math.random() < isHoldChance);
                let duration = isHold ? (Math.floor(Math.random() * 2) + 1) * beatIntervalMs : 0;
                
                if (isHold) {
                    holdEndTimes[lane] = time + duration;
                }
                
                map.push({ time: time, lane: lane, type: isHold ? 'hold' : 'tap', duration: duration, handled: false, isHolding: false, element: null });
                
                // 同時押しノーツの確率（サビやハードモードの表拍で発生しやすい）
                let simultaneousChance = isHighEnergy ? (isHard ? 0.6 : 0.3) : (isHard ? 0.2 : 0.05);
                if (isDownBeat && Math.random() < simultaneousChance && availableLanes.length > 0) {
                    let extraLaneIndex = Math.floor(Math.random() * availableLanes.length);
                    let extraLane = availableLanes[extraLaneIndex];
                    availableLanes.splice(extraLaneIndex, 1);
                    
                    map.push({ time: time, lane: extraLane, type: 'tap', duration: 0, handled: false, isHolding: false, element: null });
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
        
        // 前の解析状態をリセット
        audioAnalysisDone = false;
        isAnalyzing = false;
        
        // スマホSafari対策: 明示的にloadを呼ぶ
        bgm.load(); 
        
        // 即座に解析処理を開始
        handleAudioLoad(objectURL);
        
        // 譜面作成ボタンを有効化 (PCのみサポートされる想定)
        createMapBtn.disabled = false;
    }
});

// scoresフォルダを選択する
selectScoresBtn.addEventListener('click', async () => {
    try {
        scoresDirHandle = await window.showDirectoryPicker();
        selectScoresBtn.textContent = `📁 選択済: ${scoresDirHandle.name}`;
        selectScoresBtn.style.backgroundColor = '#10b981';
    } catch (e) {
        console.warn("フォルダ選択がキャンセルされたか失敗しました:", e);
    }
});

// カスタム譜面を読み込むロジック
async function loadCustomBeatmap(audioName) {
    if (!scoresDirHandle) return null;
    try {
        const matchingFiles = [];
        const baseName = audioName.split('.').slice(0, -1).join('.') || audioName;
        const prefix = baseName + '_';
        // フォルダ内のファイルを列挙
        for await (const entry of scoresDirHandle.values()) {
            if (entry.kind === 'file' && entry.name.startsWith(prefix) && entry.name.endsWith('.json')) {
                const suffix = entry.name.slice(prefix.length, -5); // '.json'を除いた部分
                // 日付部分が14桁の数字であることを確認 (他の曲と誤判定しないため)
                if (/^\d{14}$/.test(suffix)) {
                    matchingFiles.push(entry);
                }
            }
        }
        
        if (matchingFiles.length === 0) return null;
        
        // 最新のものを探すため、名前に含まれる日付(文字列)でソート
        matchingFiles.sort((a, b) => b.name.localeCompare(a.name));
        
        const latestFileHandle = matchingFiles[0];
        const file = await latestFileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);
        
        return data.notes || null;
    } catch (e) {
        console.error("カスタム譜面のロード中にエラー:", e);
        return null;
    }
}

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
async function startGame() {
    // プレイ直前に最新のカスタム譜面がないかチェックして更新する
    if (scoresDirHandle && selectedFileName.textContent !== '未選択') {
        const customMap = await loadCustomBeatmap(selectedFileName.textContent);
        if (customMap) {
            console.log("最新のカスタム譜面を再ロードしました:", customMap);
            beatmap = customMap;
        }
    }

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

// タッチ入力処理（スマホ対応）
lanes.forEach((laneEl, index) => {
    // 画面の長押しやスクロールなどデフォルトの動作を防ぐ
    laneEl.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        if (!isPlaying || isPaused) return;

        lanes[index].classList.add('active');
        checkHit(index);
    }, { passive: false });

    const endTouch = (e) => {
        e.preventDefault();
        lanes[index].classList.remove('active');

        if (activeHolds[index]) {
            const note = activeHolds[index];
            const currentTime = bgm.readyState >= 2 ? bgm.currentTime * 1000 : performance.now() - startTime;
            const endTime = note.time + note.duration;
            const timeDiff = Math.abs(endTime - currentTime);

            note.isHoldingCompleted = true; // 削除可能にする

            if (timeDiff <= WINDOW_PERFECT) {
                registerHit('perfect', note, index);
            } else if (timeDiff <= WINDOW_GREAT) {
                registerHit('great', note, index);
            } else {
                registerHit('miss', note, index);
            }

            delete activeHolds[index];
        }
    };

    laneEl.addEventListener('touchend', endTouch, { passive: false });
    laneEl.addEventListener('touchcancel', endTouch, { passive: false });
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
                } else if (note.element.parentNode) {
                    // パーフェクトまたはグレイトの時は画面からノーツを消す
                    note.element.parentNode.removeChild(note.element);
                }
            }
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

// ==========================================
// タイムラインエディタ (Editor Mode)
// ==========================================
let isEditorMode = false;
let isEditorPlaying = false;
let recordedNotes = [];
let editorUpdateId;
let editorZoom = 0.2; // 1ms = 0.2px

const timelineWrapper = document.getElementById('timeline-wrapper');
const timelineContent = document.getElementById('timeline-content');
const timelinePlayhead = document.getElementById('timeline-playhead');
const tlNotesContainer = document.getElementById('tl-notes-container');
const editorZoomIn = document.getElementById('editor-zoom-in');
const editorZoomOut = document.getElementById('editor-zoom-out');

createMapBtn.addEventListener('click', () => {
    if (!scoresDirHandle) {
        alert("先に「scoresフォルダを選択」から保存先フォルダを選んでください！\n(※ブラウザの制約によりフォルダのアクセス許可が必要です)");
        return;
    }
    
    startScreen.classList.add('hidden');
    editorScreen.classList.remove('hidden');
    isEditorMode = true;
    recordedNotes = [];
    
    // エディタの初期化
    initEditor();
});

editorExitBtn.addEventListener('click', () => {
    document.getElementById('confirm-screen').classList.remove('hidden');
});

document.getElementById('confirm-yes-btn').addEventListener('click', () => {
    document.getElementById('confirm-screen').classList.add('hidden');
    stopEditorPlay();
    editorScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    isEditorMode = false;
});

document.getElementById('confirm-no-btn').addEventListener('click', () => {
    document.getElementById('confirm-screen').classList.add('hidden');
});

function initEditor() {
    editorTimeEl.textContent = "00:00.000";
    tlNotesContainer.innerHTML = '';
    
    // タイムラインの長さを設定 (少し余白を持たせる)
    const duration = bgm.duration || 180; // 未取得の場合は仮で3分
    timelineContent.style.width = `${duration * 1000 * editorZoom + 500}px`;
    timelinePlayhead.style.transform = `translateX(0px)`;
    timelineWrapper.scrollLeft = 0;
    
    // 初期BPMを反映
    editorBpmInput.value = globalBPM;
    updateTimelineGrid();
}

function updateTimelineGrid() {
    const bpm = parseFloat(editorBpmInput.value) || 120;
    const gridDivision = parseInt(editorGridSelect.value) || 4;
    
    const beatMs = 60000 / bpm;
    const measureMs = beatMs * 4;
    const gridMs = measureMs / gridDivision;
    
    const measurePx = measureMs * editorZoom;
    const gridPx = gridMs * editorZoom;
    
    // タイムラインの背景にグリッドを描画
    timelineContent.style.backgroundImage = `
        linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px),
        linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)
    `;
    timelineContent.style.backgroundSize = `${measurePx}px 100%, ${gridPx}px 100%`;
}

function snapToGrid(timeMs) {
    const bpm = parseFloat(editorBpmInput.value) || 120;
    const gridDivision = parseInt(editorGridSelect.value) || 4;
    
    const beatMs = 60000 / bpm;
    const measureMs = beatMs * 4;
    const gridMs = measureMs / gridDivision;
    
    return Math.round(timeMs / gridMs) * gridMs;
}

editorBpmInput.addEventListener('change', () => {
    globalBPM = parseFloat(editorBpmInput.value) || 120;
    updateTimelineGrid();
});

editorGridSelect.addEventListener('change', () => {
    updateTimelineGrid();
});

function renderTimelineNotes() {
    tlNotesContainer.innerHTML = '';
    recordedNotes.forEach(note => {
        const el = document.createElement('div');
        el.className = 'tl-note' + (note.type === 'hold' ? ' hold' : '');
        el.dataset.id = note.id;
        el.dataset.lane = note.lane;
        
        // 位置と幅の計算
        const left = note.time * editorZoom;
        let width = note.duration > 0 ? note.duration * editorZoom : 10; // tapの場合は最低10px幅
        
        el.style.left = `${left}px`;
        el.style.width = `${width}px`;
        
        // ホールド用リサイズハンドル
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'tl-note-resize';
        el.appendChild(resizeHandle);
        
        tlNotesContainer.appendChild(el);
    });
}

function getNoteById(id) {
    return recordedNotes.find(n => n.id === id);
}

// ズーム機能
editorZoomIn.addEventListener('click', () => {
    editorZoom *= 1.5;
    initEditor(); // 幅を再計算 (recordedNotesはクリアされない)
    renderTimelineNotes();
});
editorZoomOut.addEventListener('click', () => {
    editorZoom /= 1.5;
    initEditor(); // 幅を再計算
    renderTimelineNotes();
});

editorPlayBtn.addEventListener('click', () => {
    if (isEditorPlaying) {
        stopEditorPlay();
    } else {
        // 再生開始 (プレイヘッドの位置から)
        const currentPx = parseFloat(timelinePlayhead.style.transform.replace('translateX(', '')) || 0;
        bgm.currentTime = currentPx / editorZoom / 1000;
        bgm.play();
        isEditorPlaying = true;
        editorPlayBtn.innerHTML = '⏸ PAUSE';
        updateEditorTime();
    }
});

editorStopBtn.addEventListener('click', () => {
    stopEditorPlay();
    bgm.currentTime = 0; // 最初に戻す
    timelinePlayhead.style.transform = `translateX(0px)`;
    timelineWrapper.scrollLeft = 0;
    editorTimeEl.textContent = "00:00.000";
});

function stopEditorPlay() {
    if (!isEditorPlaying) return;
    bgm.pause();
    isEditorPlaying = false;
    editorPlayBtn.innerHTML = '▶ PLAY / PAUSE';
    cancelAnimationFrame(editorUpdateId);
}

function updateEditorTime() {
    if (!isEditorPlaying) return;
    
    const timeInSeconds = bgm.currentTime;
    const timeMs = timeInSeconds * 1000;
    
    const mins = Math.floor(timeInSeconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    const ms = Math.floor((timeInSeconds % 1) * 1000).toString().padStart(3, '0');
    editorTimeEl.textContent = `${mins}:${secs}.${ms}`;
    
    // プレイヘッドとスクロール位置の更新
    const px = timeMs * editorZoom;
    timelinePlayhead.style.transform = `translateX(${px}px)`;
    
    // 画面外に出そうなら自動スクロール
    const wrapperRect = timelineWrapper.getBoundingClientRect();
    if (px > timelineWrapper.scrollLeft + wrapperRect.width * 0.8) {
        timelineWrapper.scrollLeft = px - wrapperRect.width * 0.2;
    }
    
    editorUpdateId = requestAnimationFrame(updateEditorTime);
}

// --- マウス操作（配置・移動・削除） ---
let isDragging = false;
let dragTarget = null;
let dragType = ''; // 'move' or 'resize' or 'create'
let dragStartX = 0;
let dragStartNoteTime = 0;
let dragStartNoteDur = 0;
let tempCreatedNote = null;

timelineContent.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 左クリックのみ
    
    // ターゲットがノーツかリサイズハンドルか
    if (e.target.classList.contains('tl-note-resize')) {
        isDragging = true;
        dragType = 'resize';
        dragTarget = e.target.parentElement;
        const note = getNoteById(dragTarget.dataset.id);
        dragStartX = e.clientX;
        dragStartNoteDur = note.duration;
        e.stopPropagation();
        return;
    }
    
    if (e.target.classList.contains('tl-note')) {
        isDragging = true;
        dragType = 'move';
        dragTarget = e.target;
        const note = getNoteById(dragTarget.dataset.id);
        dragStartX = e.clientX;
        dragStartNoteTime = note.time;
        e.stopPropagation();
        return;
    }
    
    // 空白レーンをクリックした場合は新規配置 (ドラッグでホールド化)
    const laneEl = e.target.closest('.tl-lane');
    if (laneEl) {
        const lane = parseInt(laneEl.dataset.lane);
        const rect = timelineContent.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        let timeMs = clickX / editorZoom;
        timeMs = snapToGrid(timeMs);
        
        const newNote = {
            id: Date.now().toString() + Math.random(),
            time: timeMs,
            lane: lane,
            type: 'tap',
            duration: 0,
            handled: false,
            isHolding: false,
            element: null
        };
        recordedNotes.push(newNote);
        renderTimelineNotes(); // 再描画
        
        // そのままリサイズモードに移行（ドラッグしてホールドにするため）
        const newlyAddedEl = tlNotesContainer.querySelector(`[data-id="${newNote.id}"]`);
        if (newlyAddedEl) {
            isDragging = true;
            dragType = 'create_resize';
            dragTarget = newlyAddedEl;
            dragStartX = e.clientX;
            tempCreatedNote = newNote;
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragTarget) return;
    
    const noteId = dragTarget.dataset.id;
    const note = getNoteById(noteId);
    if (!note) return;
    
    const deltaX = e.clientX - dragStartX;
    const deltaMs = deltaX / editorZoom;
    
    if (dragType === 'move') {
        let newTime = dragStartNoteTime + deltaMs;
        if (newTime < 0) newTime = 0;
        note.time = snapToGrid(newTime);
    } else if (dragType === 'resize' || dragType === 'create_resize') {
        let newDur = (dragType === 'resize' ? dragStartNoteDur : 0) + deltaMs;
        
        // 長さもグリッドにスナップさせるために、終了時間を計算してスナップする
        const endTimeMs = note.time + newDur;
        const snappedEndTimeMs = Math.max(note.time, snapToGrid(endTimeMs));
        newDur = snappedEndTimeMs - note.time;
        
        if (newDur > 20) {
            note.type = 'hold';
            note.duration = newDur;
        } else {
            note.type = 'tap';
            note.duration = 0;
        }
    }
    renderTimelineNotes();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    dragTarget = null;
    tempCreatedNote = null;
    
    // 時間順にソートしておく
    recordedNotes.sort((a, b) => a.time - b.time);
});

// 右クリックで削除
timelineContent.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // デフォルトメニュー禁止
    if (e.target.classList.contains('tl-note') || e.target.classList.contains('tl-note-resize')) {
        const target = e.target.classList.contains('tl-note') ? e.target : e.target.parentElement;
        const id = target.dataset.id;
        recordedNotes = recordedNotes.filter(n => n.id !== id);
        renderTimelineNotes();
    } else {
        // 空白部分の右クリックはプレイヘッドの移動（シーク）
        const rect = timelineContent.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        let timeMs = clickX / editorZoom;
        timeMs = snapToGrid(timeMs);
        bgm.currentTime = timeMs / 1000;
        timelinePlayhead.style.transform = `translateX(${timeMs * editorZoom}px)`;
        
        const mins = Math.floor(bgm.currentTime / 60).toString().padStart(2, '0');
        const secs = Math.floor(bgm.currentTime % 60).toString().padStart(2, '0');
        const ms = Math.floor((bgm.currentTime % 1) * 1000).toString().padStart(3, '0');
        editorTimeEl.textContent = `${mins}:${secs}.${ms}`;
    }
});

// キーボードでの配置機能
let activeKeyHolds = {};

window.addEventListener('keydown', (e) => {
    if (isEditorMode && !e.repeat) {
        const key = e.key;
        if (KEY_MAP[key] !== undefined) {
            const lane = KEY_MAP[key];
            let timeMs = bgm.currentTime * 1000;
            timeMs = snapToGrid(timeMs);
            
            const newNote = {
                id: Date.now().toString() + Math.random(),
                time: timeMs,
                lane: lane,
                type: 'tap',
                duration: 0,
                handled: false,
                isHolding: false,
                element: null
            };
            
            recordedNotes.push(newNote);
            activeKeyHolds[lane] = newNote;
            renderTimelineNotes();
            
            // 視覚的フィードバック
            lanes[lane].classList.add('active');
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (isEditorMode) {
        const key = e.key;
        if (KEY_MAP[key] !== undefined) {
            const lane = KEY_MAP[key];
            if (activeKeyHolds[lane]) {
                const note = activeKeyHolds[lane];
                let timeMs = bgm.currentTime * 1000;
                timeMs = snapToGrid(timeMs);
                const dur = timeMs - note.time;
                
                if (dur > 60) { // 短すぎる場合はタップ扱い、それ以上はホールド
                    note.type = 'hold';
                    note.duration = dur;
                }
                
                delete activeKeyHolds[lane];
                renderTimelineNotes();
            }
            // 視覚的フィードバック解除
            lanes[lane].classList.remove('active');
        }
    }
});

// 保存処理
editorSaveBtn.addEventListener('click', async () => {
    if (!scoresDirHandle) {
        alert("scoresフォルダが選択されていません。");
        return;
    }
    if (recordedNotes.length === 0) {
        alert("ノーツが一つも配置されていません。");
        return;
    }
    
    try {
        const audioName = selectedFileName.textContent;
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');
            
        const baseName = audioName.split('.').slice(0, -1).join('.') || audioName;
        const fileName = `${baseName}_${timestamp}.json`;
        
        // ゲーム実行時に不要なidを削除してクリーンなデータにする
        const cleanNotes = recordedNotes.map(n => ({
            time: n.time,
            lane: n.lane,
            type: n.type,
            duration: n.duration
        }));
        
        const mapData = {
            audioFile: audioName,
            createdAt: now.toISOString(),
            notes: cleanNotes
        };
        const jsonString = JSON.stringify(mapData, null, 2);
        
        const fileHandle = await scoresDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        
        alert(`譜面を保存しました！\nファイル名: ${fileName}`);
        editorExitBtn.click();
        
    } catch (e) {
        console.error("保存エラー:", e);
        alert("ファイルの保存に失敗しました。フォルダのアクセス権限を確認してください。");
    }
});
