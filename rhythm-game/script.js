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

// Settings & Option DOM Elements
const startSpeedDownBtn = document.getElementById('start-speed-down-btn');
const startSpeedUpBtn = document.getElementById('start-speed-up-btn');
const startSpeedValueEl = document.getElementById('start-speed-value');
const openOptionBtn = document.getElementById('open-option-btn');

const optionScreen = document.getElementById('option-screen');
const closeOptionBtn = document.getElementById('close-option-btn');
const optSpeedDownBtn = document.getElementById('opt-speed-down-btn');
const optSpeedUpBtn = document.getElementById('opt-speed-up-btn');
const optSpeedSlider = document.getElementById('opt-speed-slider');
const optSpeedDisplay = document.getElementById('opt-speed-display');
const optVolumeSlider = document.getElementById('opt-volume-slider');
const optVolumeDisplay = document.getElementById('opt-volume-display');
const optOffsetDownBtn = document.getElementById('opt-offset-down-btn');
const optOffsetUpBtn = document.getElementById('opt-offset-up-btn');
const optOffsetValueEl = document.getElementById('opt-offset-value');
const optSyncLineToggle = document.getElementById('opt-sync-line-toggle');

const pauseSpeedDownBtn = document.getElementById('pause-speed-down-btn');
const pauseSpeedUpBtn = document.getElementById('pause-speed-up-btn');
const pauseSpeedValueEl = document.getElementById('pause-speed-value');

// Editor DOM Elements
const editorScreen = document.getElementById('editor-screen');
const editorPlayBtn = document.getElementById('editor-play-btn');
const editorStopBtn = document.getElementById('editor-stop-btn');
const editorUndoBtn = document.getElementById('editor-undo-btn');
const editorRedoBtn = document.getElementById('editor-redo-btn');
const editorSaveBtn = document.getElementById('editor-save-btn');
const editorLoadBtn = document.getElementById('editor-load-btn');
const editorLoadFileInput = document.getElementById('editor-load-file');
const editorExitBtn = document.getElementById('editor-exit-btn');
const editorTimeEl = document.getElementById('editor-time');
const recordingIndicator = document.getElementById('recording-indicator');
const editorBpmInput = document.getElementById('editor-bpm');
const editorGridSelect = document.getElementById('editor-grid');

let currentAutoMap = [];

let scoresDirHandle = null;
const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
const bgm = document.getElementById('bgm');
const offsetValueEl = document.getElementById('offset-value');
const offsetUpBtn = document.getElementById('offset-up-btn');
const offsetDownBtn = document.getElementById('offset-down-btn');

// Game Constants & Settings
let KEY_MAP = { 'd': 0, 'D': 0, 'f': 1, 'F': 1, 'j': 2, 'J': 2, 'k': 3, 'K': 3 };
const BASE_NOTE_SPEED = 1500; // 基準到達時間(ms)
let noteSpeed = 1.0;
const savedSpeed = localStorage.getItem('rhythmias_note_speed');
if (savedSpeed !== null && !isNaN(parseFloat(savedSpeed))) {
    noteSpeed = Math.round(Math.max(0.5, Math.min(5.0, parseFloat(savedSpeed))) * 10) / 10;
}
let NOTE_SPEED = BASE_NOTE_SPEED / (noteSpeed || 1.0);
const FPS = 60;

// 判定幅 (ミリ秒)
const WINDOW_PERFECT = 60; // ±60ms
const WINDOW_GREAT = 120;  // ±120ms
const WINDOW_MISS = 180;   // ±180ms

// スコア計算用
const SCORE_PERFECT = 1000;
const SCORE_GREAT = 500;

// ゲーム状態管理変数
let score = 0;
let combo = 0;
let maxCombo = 0;
let stats = { perfect: 0, great: 0, miss: 0 };
let noteIndex = 0;
let activeNotes = [];
let beatmap = [];
let isPlaying = false;
let isPaused = false;
let startTime = 0;
let animationId = null;
let globalBPM = 120;

let judgmentOffset = 100; // 判定ラインの高さ(px)は100に固定
const JUDGMENT_LINE_OFFSET = 100;

// タイミングオフセット (ms): 音とノーツのタイミング微調整用 (デフォルト: +100ms)
let timingOffset = 100;
const savedTimingOffset = localStorage.getItem('rhythmias_timing_offset');
if (savedTimingOffset !== null && !isNaN(parseInt(savedTimingOffset))) {
    timingOffset = Math.max(-200, Math.min(200, parseInt(savedTimingOffset)));
} else {
    timingOffset = 100;
}

// 同時押しライン設定 (デフォルト: ON)
let showSyncLine = true;
const savedSyncLine = localStorage.getItem('rhythmias_sync_line');
if (savedSyncLine !== null) {
    showSyncLine = savedSyncLine === 'true';
} else {
    showSyncLine = true;
}

let syncLines = [];
let syncLineIndex = 0;
let activeSyncLines = [];

function updateSyncLine(enabled) {
    showSyncLine = !!enabled;
    localStorage.setItem('rhythmias_sync_line', showSyncLine.toString());
    if (optSyncLineToggle) {
        if (showSyncLine) {
            optSyncLineToggle.classList.add('active');
            optSyncLineToggle.textContent = 'ON';
        } else {
            optSyncLineToggle.classList.remove('active');
            optSyncLineToggle.textContent = 'OFF';
        }
    }
    // OFFに切り替えた場合は画面上のラインを即時クリア
    if (!showSyncLine && activeSyncLines.length > 0) {
        activeSyncLines.forEach(sl => {
            if (sl.element && sl.element.parentNode) {
                sl.element.parentNode.removeChild(sl.element);
            }
        });
        activeSyncLines = [];
    }
}

const savedVolume = localStorage.getItem('rhythmias_volume');
if (savedVolume !== null && !isNaN(parseFloat(savedVolume))) {
    bgm.volume = Math.max(0, Math.min(1, parseFloat(savedVolume)));
} else {
    bgm.volume = 0.25;
}

// 設定変更用の統一関数
function updateNoteSpeed(val) {
    const num = parseFloat(val);
    noteSpeed = isNaN(num) ? 1.0 : Math.round(Math.max(0.5, Math.min(5.0, num)) * 10) / 10;
    NOTE_SPEED = BASE_NOTE_SPEED / noteSpeed;
    localStorage.setItem('rhythmias_note_speed', noteSpeed.toFixed(1));

    const formatted = noteSpeed.toFixed(1);
    if (startSpeedValueEl) startSpeedValueEl.textContent = formatted;
    if (optSpeedDisplay) optSpeedDisplay.textContent = formatted;
    if (optSpeedSlider) optSpeedSlider.value = formatted;
    if (pauseSpeedValueEl) pauseSpeedValueEl.textContent = formatted;
}

function updateVolume(val) {
    const vol = Math.max(0, Math.min(1, parseFloat(val)));
    bgm.volume = vol;
    localStorage.setItem('rhythmias_volume', vol.toString());
    if (volumeSlider) volumeSlider.value = vol;
    if (optVolumeSlider) optVolumeSlider.value = vol;
    if (optVolumeDisplay) optVolumeDisplay.textContent = `${Math.round(vol * 100)}%`;
}

function updateTimingOffset(val) {
    const num = parseInt(val);
    timingOffset = isNaN(num) ? 100 : Math.max(-200, Math.min(200, num));
    localStorage.setItem('rhythmias_timing_offset', timingOffset.toString());

    // 表示用フォーマット (例: "+15ms", "-10ms", "0ms")
    let displayStr = `${timingOffset}ms`;
    if (timingOffset > 0) {
        displayStr = `+${timingOffset}ms`;
    }
    if (offsetValueEl) offsetValueEl.textContent = displayStr;
    if (optOffsetValueEl) optOffsetValueEl.textContent = displayStr;
}

// 音量調整
volumeSlider.addEventListener('input', (e) => {
    updateVolume(e.target.value);
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
            NOTE_SPEED = 900 / noteSpeed;
        } else if (currentDifficulty === 'test') {
            NOTE_SPEED = 2000 / noteSpeed;
        } else {
            NOTE_SPEED = BASE_NOTE_SPEED / noteSpeed;
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

    const genMap = await analyzeAudioAndGenerateBeatmap(url, currentDifficulty);
    genMap.sort((a, b) => a.time - b.time);
    currentAutoMap = genMap;
    beatmap = genMap;
    
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
        
        // 前の解析状態と譜面をリセット
        audioAnalysisDone = false;
        isAnalyzing = false;
        beatmap = [];
        currentAutoMap = [];
        
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
        
        if (data.bpm !== undefined && !isNaN(parseFloat(data.bpm))) {
            globalBPM = parseFloat(data.bpm);
        }
        
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

    // 同時押しラインの初期化
    syncLineIndex = 0;
    activeSyncLines = [];
    syncLines = [];

    if (showSyncLine) {
        // 同じ判定時間のノーツをグループ化（ミリ秒単位で丸めて比較）
        const timeGroups = new Map();
        beatmap.forEach(note => {
            const t = Math.round(note.time);
            if (!timeGroups.has(t)) timeGroups.set(t, []);
            timeGroups.get(t).push(note);
        });

        timeGroups.forEach((notes) => {
            if (notes.length >= 2) {
                // レーン順にソート
                notes.sort((a, b) => a.lane - b.lane);

                // 隣り合うノーツ同士のレーン差をチェック
                for (let k = 0; k < notes.length - 1; k++) {
                    const noteA = notes[k];
                    const noteB = notes[k + 1];
                    const laneDiff = noteB.lane - noteA.lane;

                    // 隣り合っていない（差が2以上、間に空きレーンがある）場合のみ横線を作成
                    if (laneDiff > 1) {
                        syncLines.push({
                            time: noteA.time,
                            laneA: noteA.lane,
                            laneB: noteB.lane,
                            noteA: noteA,
                            noteB: noteB,
                            element: null
                        });
                    }
                }
            }
        });
        syncLines.sort((a, b) => a.time - b.time);
    }
}

// ゲーム開始
async function startGame() {
    // プレイ直前に最新のカスタム譜面がないかチェックして更新する
    if (scoresDirHandle && selectedFileName.textContent !== '未選択') {
        const customMap = await loadCustomBeatmap(selectedFileName.textContent);
        if (customMap) {
            console.log("最新のカスタム譜面を再ロードしました:", customMap);
            beatmap = customMap;
        } else if (currentAutoMap && currentAutoMap.length > 0) {
            beatmap = currentAutoMap;
        }
    } else if (currentAutoMap && currentAutoMap.length > 0) {
        beatmap = currentAutoMap;
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
    activeSyncLines = [];

    // リザルト画面の更新
    document.getElementById('result-score').textContent = score;
    document.getElementById('result-max-combo').textContent = maxCombo;
    document.getElementById('result-perfect').textContent = stats.perfect;
    document.getElementById('result-great').textContent = stats.great;
    document.getElementById('result-miss').textContent = stats.miss;

    resultScreen.classList.remove('hidden');
}

// 現在のゲーム進行時間を安全に取得する（BGM未再生・遅延時もフォールバック）
function getCurrentGameTime() {
    let currentTime = performance.now() - startTime;
    if (bgm.readyState >= 2 && !bgm.paused && bgm.currentTime > 0) {
        currentTime = bgm.currentTime * 1000;
    }
    return currentTime;
}

// メインループ
function gameLoop() {
    if (!isPlaying || isPaused) return;

    try {
        const currentTime = getCurrentGameTime();

        // プログレスバーと残り時間の更新
        if (bgm.duration) {
            const currentBgmTime = (bgm.readyState >= 2 && !bgm.paused && bgm.currentTime > 0) ? bgm.currentTime : (currentTime / 1000);
            const progressPercent = Math.min(100, (currentBgmTime / bgm.duration) * 100);
            document.getElementById('progress-bar').style.width = `${progressPercent}%`;

            const remainingSeconds = Math.max(0, Math.ceil(bgm.duration - currentBgmTime));
            const m = Math.floor(remainingSeconds / 60);
            const s = remainingSeconds % 60;
            document.getElementById('time-remaining').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }

        // ノーツの生成 (画面に現れるタイミング = 判定時間 - NOTE_SPEED)
        while (noteIndex < beatmap.length) {
            const note = beatmap[noteIndex];
            const targetTime = note.time + timingOffset;
            const spawnTime = targetTime - NOTE_SPEED;

            if (currentTime >= spawnTime) {
                spawnNoteElement(note);
                activeNotes.push(note);
                noteIndex++;
            } else {
                break;
            }
        }

        // 同時押しラインの生成
        if (showSyncLine) {
            while (syncLineIndex < syncLines.length) {
                const sl = syncLines[syncLineIndex];
                const targetTime = sl.time + timingOffset;
                const spawnTime = targetTime - NOTE_SPEED;

                if (currentTime >= spawnTime) {
                    spawnSyncLineElement(sl);
                    activeSyncLines.push(sl);
                    syncLineIndex++;
                } else {
                    break;
                }
            }
        }

        // 画面の高さと判定ラインの位置を取得（下から100px固定）
        const playAreaHeight = playArea.clientHeight || window.innerHeight;
        const judgmentLineY = Math.max(100, playAreaHeight - JUDGMENT_LINE_OFFSET);

        // 同時押しラインの位置更新と削除
        if (showSyncLine) {
            for (let i = activeSyncLines.length - 1; i >= 0; i--) {
                const sl = activeSyncLines[i];
                const targetTime = sl.time + timingOffset;
                const progress = (currentTime - (targetTime - NOTE_SPEED)) / NOTE_SPEED;
                const currentY = progress * judgmentLineY;

                if (sl.element) {
                    sl.element.style.transform = `translateY(${currentY}px)`;
                }

                // 削除判定:
                // 1. 画面下端外に出た
                // 2. 構成ノーツのいずれかがヒットされた（タップされた、またはホールド中）
                // 3. 構成ノーツがすべて判定済みになった
                const isHit = (sl.noteA.isHolding || (sl.noteA.handled && (!sl.noteA.element || !sl.noteA.element.parentNode))) ||
                              (sl.noteB.isHolding || (sl.noteB.handled && (!sl.noteB.element || !sl.noteB.element.parentNode)));
                const allHandled = sl.noteA.handled && sl.noteB.handled;

                if (currentY > playAreaHeight + 50 || isHit || allHandled) {
                    if (sl.element && sl.element.parentNode) {
                        sl.element.parentNode.removeChild(sl.element);
                    }
                    activeSyncLines.splice(i, 1);
                }
            }
        }

        // ノーツの位置更新とMISS判定
        for (let i = activeNotes.length - 1; i >= 0; i--) {
            const note = activeNotes[i];
            const targetTime = note.time + timingOffset;

            // 進行度を計算
            // currentTime === targetTime の瞬間に progress = 1.0 (currentY = judgmentLineY)
            const progress = (currentTime - (targetTime - NOTE_SPEED)) / NOTE_SPEED;
            const currentY = progress * judgmentLineY;

            let holdHeight = 30;
            if (note.type === 'hold') {
                const calculatedHoldHeight = (note.duration / NOTE_SPEED) * judgmentLineY;
                // 単押しノーツ(30px)と確実に区別できるよう、最低高さを45px担保する
                holdHeight = Math.max(45, calculatedHoldHeight);
            }

            if (note.element) {
                note.element.style.transform = `translateY(${currentY}px)`;
                if (note.type === 'hold') {
                    note.element.style.height = `${holdHeight}px`;
                }
            }

            // 画面外（判定ラインのはるか下）に出たら完全削除
            const noteTopY = currentY - holdHeight;

            if (noteTopY > playAreaHeight + 50) { // 余裕をもたせて画面外で消す
                if (note.element && note.element.parentNode) {
                    note.element.parentNode.removeChild(note.element);
                }
                activeNotes.splice(i, 1);
                continue;
            }

            // 処理済みかつ画面から消去済みのノーツは即座に配列から解放
            if (note.handled && (!note.element || !note.element.parentNode)) {
                activeNotes.splice(i, 1);
                continue;
            }

            // 処理済み（ミスで見逃したノーツ等）の場合は判定を行わず落下だけさせる
            if (note.handled) {
                continue;
            }

            // MISS判定とホールド判定
            if (note.type === 'tap') {
                if (currentTime > targetTime + WINDOW_MISS) {
                    registerHit('miss', note, note.lane);
                    note.handled = true;
                    if (note.element) note.element.style.opacity = '0.5'; // 見逃したノーツは半透明に
                }
            } else if (note.type === 'hold') {
                if (!note.isHolding && currentTime > targetTime + WINDOW_MISS) {
                    // 開始を見逃した
                    registerHit('miss', note, note.lane);
                    note.handled = true;
                    if (note.element) note.element.style.opacity = '0.5';
                } else if (note.isHolding) {
                    // ホールド中のエフェクト（間引いて表示）
                    if (Math.random() > 0.5) createHitEffect(note.lane);

                    // 終了時間を過ぎても押し続けている場合はパーフェクト扱いにする
                    if (currentTime > targetTime + note.duration + WINDOW_PERFECT) {
                        note.isHoldingCompleted = true;
                        registerHit('perfect', note, note.lane);
                        delete activeHolds[note.lane];
                    }
                }
            }
        }
    } catch (err) {
        console.error("gameLoop error:", err);
    }

    if (isPlaying && !isPaused) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

// 同時押しラインのDOM要素を生成
function spawnSyncLineElement(syncLine) {
    const el = document.createElement('div');
    el.classList.add('sync-line');
    const laneWidthPercent = 100 / currentLanes;
    const leftPercent = syncLine.laneA * laneWidthPercent + (laneWidthPercent / 2);
    const widthPercent = (syncLine.laneB - syncLine.laneA) * laneWidthPercent;
    el.style.left = `${leftPercent}%`;
    el.style.width = `${widthPercent}%`;
    // ノーツより背面に配置するため先頭に挿入
    notesContainer.prepend(el);
    syncLine.element = el;
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

    // 自動再生ブロックや保留時のリカバリ
    if (bgm.paused) {
        bgm.play().catch(err => console.warn("BGM再生リカバリ:", err));
    }

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
            const currentTime = getCurrentGameTime();
            const endTime = note.time + timingOffset + note.duration;
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

        // 自動再生ブロックや保留時のリカバリ
        if (bgm.paused) {
            bgm.play().catch(err => console.warn("BGM再生リカバリ:", err));
        }

        lanes[index].classList.add('active');
        checkHit(index);
    }, { passive: false });

    const endTouch = (e) => {
        e.preventDefault();
        lanes[index].classList.remove('active');

        if (activeHolds[index]) {
            const note = activeHolds[index];
            const currentTime = getCurrentGameTime();
            const endTime = note.time + timingOffset + note.duration;
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
    const currentTime = getCurrentGameTime();

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

    const targetTime = targetNote.time + timingOffset;
    const timeDiff = Math.abs(targetTime - currentTime);

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
        startTime = performance.now() - (bgm.currentTime * 1000);
        bgm.play().catch(e => console.warn(e));
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
    activeSyncLines = [];
    pauseScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
});

// UI上のポーズボタン
document.getElementById('pause-btn-ui').addEventListener('click', togglePause);

// --- オプション・設定用イベントリスナー ---
// スタート画面のスピード調整
if (startSpeedDownBtn) {
    startSpeedDownBtn.addEventListener('click', () => updateNoteSpeed(noteSpeed - 0.1));
}
if (startSpeedUpBtn) {
    startSpeedUpBtn.addEventListener('click', () => updateNoteSpeed(noteSpeed + 0.1));
}
if (openOptionBtn && optionScreen) {
    openOptionBtn.addEventListener('click', () => {
        optionScreen.classList.remove('hidden');
    });
}
if (closeOptionBtn && optionScreen) {
    closeOptionBtn.addEventListener('click', () => {
        optionScreen.classList.add('hidden');
    });
}

// オプションモーダル内
if (optSpeedDownBtn) {
    optSpeedDownBtn.addEventListener('click', () => updateNoteSpeed(noteSpeed - 0.1));
}
if (optSpeedUpBtn) {
    optSpeedUpBtn.addEventListener('click', () => updateNoteSpeed(noteSpeed + 0.1));
}
if (optSpeedSlider) {
    optSpeedSlider.addEventListener('input', (e) => updateNoteSpeed(parseFloat(e.target.value)));
}
if (optVolumeSlider) {
    optVolumeSlider.addEventListener('input', (e) => updateVolume(parseFloat(e.target.value)));
}
if (optOffsetDownBtn) {
    optOffsetDownBtn.addEventListener('click', () => updateTimingOffset(timingOffset - 5));
}
if (optOffsetUpBtn) {
    optOffsetUpBtn.addEventListener('click', () => updateTimingOffset(timingOffset + 5));
}
if (optSyncLineToggle) {
    optSyncLineToggle.addEventListener('click', () => {
        updateSyncLine(!showSyncLine);
    });
}

// ポーズ画面
if (pauseSpeedDownBtn) {
    pauseSpeedDownBtn.addEventListener('click', () => updateNoteSpeed(noteSpeed - 0.1));
}
if (pauseSpeedUpBtn) {
    pauseSpeedUpBtn.addEventListener('click', () => updateNoteSpeed(noteSpeed + 0.1));
}
if (offsetUpBtn) {
    offsetUpBtn.addEventListener('click', () => updateTimingOffset(timingOffset + 5));
}
if (offsetDownBtn) {
    offsetDownBtn.addEventListener('click', () => updateTimingOffset(timingOffset - 5));
}

// 初期設定のUI同期を実行
updateNoteSpeed(noteSpeed);
updateVolume(bgm.volume);
updateTimingOffset(timingOffset);
updateSyncLine(showSyncLine);

// キーボード操作（ゲーム中も調整可能にするため）
document.addEventListener('keydown', (e) => {
    // 上下キーでタイミングオフセットを微調整 (5ms単位)
    if (e.key === 'ArrowUp') {
        updateTimingOffset(timingOffset + 5);
        e.preventDefault(); // スクロール防止
    } else if (e.key === 'ArrowDown') {
        updateTimingOffset(timingOffset - 5);
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

// Undo / Redo 履歴管理
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;
let dragStartSnapshot = null;

function getNotesSnapshot() {
    return {
        notes: JSON.parse(JSON.stringify(recordedNotes)),
        bpm: parseFloat(editorBpmInput.value) || globalBPM || 120
    };
}

function restoreSnapshot(snapshot) {
    if (Array.isArray(snapshot)) {
        recordedNotes = snapshot;
    } else if (snapshot && typeof snapshot === 'object') {
        recordedNotes = snapshot.notes || [];
        if (snapshot.bpm !== undefined && !isNaN(parseFloat(snapshot.bpm))) {
            const b = parseFloat(snapshot.bpm);
            editorBpmInput.value = b;
            globalBPM = b;
            updateTimelineGrid();
        }
    }
    renderTimelineNotes();
    updateUndoRedoButtons();
}

function saveState() {
    undoStack.push(getNotesSnapshot());
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (!isEditorMode || undoStack.length === 0) return;
    redoStack.push(getNotesSnapshot());
    const prev = undoStack.pop();
    restoreSnapshot(prev);
}

function redo() {
    if (!isEditorMode || redoStack.length === 0) return;
    undoStack.push(getNotesSnapshot());
    const next = redoStack.pop();
    restoreSnapshot(next);
}

function updateUndoRedoButtons() {
    if (editorUndoBtn) {
        editorUndoBtn.disabled = undoStack.length === 0;
        editorUndoBtn.style.opacity = undoStack.length === 0 ? '0.4' : '1';
        editorUndoBtn.style.cursor = undoStack.length === 0 ? 'not-allowed' : 'pointer';
    }
    if (editorRedoBtn) {
        editorRedoBtn.disabled = redoStack.length === 0;
        editorRedoBtn.style.opacity = redoStack.length === 0 ? '0.4' : '1';
        editorRedoBtn.style.cursor = redoStack.length === 0 ? 'not-allowed' : 'pointer';
    }
}

const timelineWrapper = document.getElementById('timeline-wrapper');
const timelineContent = document.getElementById('timeline-content');
const timelinePlayhead = document.getElementById('timeline-playhead');
const tlNotesContainer = document.getElementById('tl-notes-container');
const editorZoomIn = document.getElementById('editor-zoom-in');
const editorZoomOut = document.getElementById('editor-zoom-out');

editorUndoBtn.addEventListener('click', undo);
editorRedoBtn.addEventListener('click', redo);

createMapBtn.addEventListener('click', () => {
    if (!scoresDirHandle) {
        alert("先に「scoresフォルダを選択」から保存先フォルダを選んでください！\n(※ブラウザの制約によりフォルダのアクセス許可が必要です)");
        return;
    }
    
    startScreen.classList.add('hidden');
    editorScreen.classList.remove('hidden');
    isEditorMode = true;
    recordedNotes = [];
    undoStack = [];
    redoStack = [];
    dragStartSnapshot = null;
    updateUndoRedoButtons();
    
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

let prevBpmValue = null;
editorBpmInput.addEventListener('focus', () => {
    prevBpmValue = editorBpmInput.value;
});

editorBpmInput.addEventListener('change', () => {
    const newBpm = parseFloat(editorBpmInput.value) || 120;
    if (prevBpmValue !== null && parseFloat(prevBpmValue) !== newBpm) {
        undoStack.push({
            notes: JSON.parse(JSON.stringify(recordedNotes)),
            bpm: parseFloat(prevBpmValue) || 120
        });
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        updateUndoRedoButtons();
    }
    prevBpmValue = newBpm;
    globalBPM = newBpm;
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
    
    // 操作前の状態を保持（Undo用）
    dragStartSnapshot = getNotesSnapshot();
    
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

    // 操作によってノーツ状態に変化があればUndoスタックに保存
    if (dragStartSnapshot) {
        if (JSON.stringify(dragStartSnapshot) !== JSON.stringify(getNotesSnapshot())) {
            undoStack.push(dragStartSnapshot);
            if (undoStack.length > MAX_HISTORY) {
                undoStack.shift();
            }
            redoStack = [];
            updateUndoRedoButtons();
        }
        dragStartSnapshot = null;
    }
});

// 右クリックで削除
timelineContent.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // デフォルトメニュー禁止
    if (e.target.classList.contains('tl-note') || e.target.classList.contains('tl-note-resize')) {
        const target = e.target.classList.contains('tl-note') ? e.target : e.target.parentElement;
        const id = target.dataset.id;
        saveState(); // 削除前の状態を保存
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
    if (isEditorMode) {
        // 入力フォーム操作時はキーボードショートカットを除外
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            // スペースキーで再生/一時停止
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                editorPlayBtn.click();
                return;
            }

            // Ctrl+Z (Cmd+Z) で元に戻す / Ctrl+Shift+Z でやり直す
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
                return;
            }

            // Ctrl+Y (Cmd+Y) でやり直す
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                redo();
                return;
            }
        }

        if (!e.repeat) {
            const key = e.key;
            if (KEY_MAP[key] !== undefined) {
                const lane = KEY_MAP[key];
                
                // 既にそのレーンで長押し記録中の場合は追加しない（リピート誤爆防止）
                if (activeKeyHolds[lane]) return;
                
                // キーボードノーツ追加前の状態を保存
                saveState();

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
        
        const currentBpm = parseFloat(editorBpmInput.value) || globalBPM || 120;
        
        const mapData = {
            audioFile: audioName,
            createdAt: now.toISOString(),
            bpm: currentBpm,
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

// 譜面読み込み処理 (LOAD BEATMAP)
editorLoadBtn.addEventListener('click', () => {
    editorLoadFileInput.value = '';
    editorLoadFileInput.click();
});

editorLoadFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const notesArray = Array.isArray(data) ? data : (data.notes || []);

            if (!Array.isArray(notesArray)) {
                alert("有効な譜面データが見つかりませんでした。");
                return;
            }

            // 読み込み前の状態をUndoスタックに保存
            saveState();

            // BPMの読み込み・復元
            if (data.bpm !== undefined && !isNaN(parseFloat(data.bpm))) {
                const loadedBpm = parseFloat(data.bpm);
                editorBpmInput.value = loadedBpm;
                globalBPM = loadedBpm;
                updateTimelineGrid();
            }

            // ノーツの読み込み・復元
            recordedNotes = notesArray.map(n => ({
                id: Date.now().toString() + Math.random(),
                time: typeof n.time === 'number' ? n.time : 0,
                lane: typeof n.lane === 'number' ? n.lane : 0,
                type: n.type || (n.duration > 0 ? 'hold' : 'tap'),
                duration: typeof n.duration === 'number' ? n.duration : 0,
                handled: false,
                isHolding: false,
                element: null
            }));

            // 時間順にソート
            recordedNotes.sort((a, b) => a.time - b.time);

            // タイムライン描画更新
            renderTimelineNotes();

            // 再生中なら停止して先頭へシーク
            stopEditorPlay();
            bgm.currentTime = 0;
            timelinePlayhead.style.transform = `translateX(0px)`;
            timelineWrapper.scrollLeft = 0;
            editorTimeEl.textContent = "00:00.000";

            updateUndoRedoButtons();
            alert(`譜面データを読み込みました！（${recordedNotes.length} ノーツ）`);
        } catch (err) {
            console.error("JSON読み込みエラー:", err);
            alert("譜面ファイルの読み込みに失敗しました。正しいJSONファイルか確認してください。");
        }
    };
    reader.readAsText(file);
});
