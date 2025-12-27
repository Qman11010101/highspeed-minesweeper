// --- 設定定数 ---
const ROWS = 9;
const COLS = 9;
const BOMB_COUNT = 10;
const LEFT_CHARS = ['W', 'E', 'R', 'S', 'D', 'F', 'X', 'C', 'V'];
const RIGHT_CHARS = ['U', 'I', 'O', 'J', 'K', 'L', 'M', ',', '.'];

// キーマッピング生成
const LEFT_KEYS = {};
const RIGHT_KEYS = {};
LEFT_CHARS.forEach((char, i) => LEFT_KEYS[char.toLowerCase()] = i);
RIGHT_CHARS.forEach((char, i) => RIGHT_KEYS[char.toLowerCase()] = i);

// --- グローバル状態 ---
let grid = [];
let gameState = 'menu'; // menu, countdown, playing, ended
let activeLeft = new Set();
let activeRight = new Set();
let timerInterval = null;
let countdownInterval = null;
let isFirstMove = true;
let boardId = 0;

// メニュー選択状態
let menuModeIndex = 0;
let menuSubIndex = 0;
const menuOptions = [
    { mode: 'single', subs: [null], sectionId: 'menu-single', btnClass: 'single-btn' },
    { mode: 'streak', subs: [3, 5, 10, 20, 30, 50, 100], sectionId: 'menu-streak', btnClass: 'streak-btn' },
    { mode: 'infinite', subs: ['easy', 'normal', 'hard', 'expert'], sectionId: 'menu-infinite', btnClass: 'infinite-btn' }
];

// ゲーム進行データ
let gameData = {
    mode: 'single',     // single, streak, infinite
    param: null,        // モードのパラメータ
    startTime: 0,       // 開始時刻 (Single/Streak用)
    remainingTime: 0,   // 残り時間 (Infinite用)
    panelsCleared: 0,   // クリア枚数
    targetPanels: 0,    // 目標枚数 (Streak用)
    mistakes: 0,        // ミス回数
    currentStreak: 0,   // 現在のstreak数 (Streak用)
};

// DOM要素
const boardEl = document.getElementById('game-board');
const timerEl = document.getElementById('timer');
const streakDisplayEl = document.getElementById('streak-display');
const clearedDisplayEl = document.getElementById('cleared-display');
const menuOverlay = document.getElementById('menu-overlay');
const msgOverlay = document.getElementById('msg-overlay');
const msgText = document.getElementById('msg-text');
const subMsg = document.getElementById('sub-msg');
const gameArea = document.getElementById('game-area'); // フラッシュ演出用

// --- 初期化 ---
function init() {
    createGridDOM(); // 枠だけ作っておく
    setupInput();
    updateMenuSelection();
    updateStreakDisplay();
}

function updateMenuSelection() {
    // 全てのselectedを削除
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    // 現在のモードのセクションにselected
    const currentMode = menuOptions[menuModeIndex];
    document.getElementById(currentMode.sectionId).classList.add('selected');
    // サブ選択がある場合、ボタンにselected
    if (currentMode.btnClass) {
        const btns = document.querySelectorAll(`.${currentMode.btnClass}`);
        if (btns[menuSubIndex]) btns[menuSubIndex].classList.add('selected');
    }
}

function updateStreakDisplay() {
    if (gameData.mode === 'streak') {
        streakDisplayEl.textContent = `STREAK ${gameData.panelsCleared} / ${gameData.targetPanels}`;
        streakDisplayEl.style.display = 'block';
        clearedDisplayEl.style.display = 'none';
    } else if (gameData.mode === 'infinite') {
        clearedDisplayEl.textContent = `CLEARED: ${gameData.panelsCleared}`;
        clearedDisplayEl.style.display = 'block';
        streakDisplayEl.style.display = 'none';
    } else {
        streakDisplayEl.style.display = 'none';
        clearedDisplayEl.style.display = 'none';
    }
}

// 盤面DOM生成（初期1回と、中身のクリアに使用）
function createGridDOM() {
    boardEl.innerHTML = '';
    grid = [];

    // ヘッダー行
    const cornerTopLeft = document.createElement('div');
    cornerTopLeft.className = 'label';
    boardEl.appendChild(cornerTopLeft);
    for (let c = 0; c < COLS; c++) {
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = RIGHT_CHARS[c];
        boardEl.appendChild(label);
    }
    const cornerTopRight = document.createElement('div');
    cornerTopRight.className = 'label';
    boardEl.appendChild(cornerTopRight);

    // 各行
    for (let r = 0; r < ROWS; r++) {
        let rowData = [];
        const labelLeft = document.createElement('div');
        labelLeft.className = 'label';
        labelLeft.textContent = LEFT_CHARS[r];
        boardEl.appendChild(labelLeft);

        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            boardEl.appendChild(cell);

            rowData.push({
                r, c,
                isBomb: false,
                isOpen: false,
                value: 0,
                element: cell
            });
        }
        const labelRight = document.createElement('div');
        labelRight.className = 'label';
        labelRight.textContent = LEFT_CHARS[r];
        boardEl.appendChild(labelRight);
        grid.push(rowData);
    }

    // 下側行
    const cornerBottomLeft = document.createElement('div');
    cornerBottomLeft.className = 'label';
    boardEl.appendChild(cornerBottomLeft);
    for (let c = 0; c < COLS; c++) {
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = RIGHT_CHARS[c];
        boardEl.appendChild(label);
    }
    const cornerBottomRight = document.createElement('div');
    cornerBottomRight.className = 'label';
    boardEl.appendChild(cornerBottomRight);
}

function getBonusTime(difficulty) {
    switch (difficulty) {
        case 'easy': return 40;
        case 'normal': return 30;
        case 'hard': return 20;
        case 'expert': return 10;
        default: return 40;
    }
}

function getInitialTime(difficulty) {
    switch (difficulty) {
        case 'easy': return 120; // 2:00
        case 'normal': return 100; // 1:40
        case 'hard': return 80; // 1:20
        case 'expert': return 60; // 1:00
        default: return 120;
    }
}

// HTMLのボタンから呼ばれる関数
window.startGame = function (mode, param) {
    gameData.mode = mode;
    gameData.param = param;
    gameData.mistakes = 0;
    gameData.panelsCleared = 0;

    // モード別初期設定
    if (mode === 'single') {
        gameData.targetPanels = 1;
    } else if (mode === 'streak') {
        gameData.targetPanels = param;
    } else if (mode === 'infinite') {
        gameData.remainingTime = getInitialTime(param);
        gameData.panelsCleared = 0;
    }

    // 初期状態に戻す
    resetBoard();
    timerEl.textContent = '00:00.000';
    timerEl.style.color = '#00ff00';

    updateStreakDisplay();

    gameState = 'countdown';
    menuOverlay.classList.add('hidden');
    msgOverlay.classList.remove('hidden');

    startCountdown();
};

function startCountdown() {
    msgText.style.color = "#fff"; // 色をリセット
    let count = 3;
    msgText.textContent = count;
    subMsg.textContent = "READY...";

    // Infinite Modeの場合、タイマーを初期時間に設定
    if (gameData.mode === 'infinite') {
        const minutes = Math.floor(gameData.remainingTime / 60);
        const seconds = gameData.remainingTime % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
    }

    countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            msgText.textContent = count;
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            msgText.textContent = 'GO!';
            setTimeout(() => {
                msgOverlay.classList.add('hidden');
                startSession();
            }, 200);
        }
    }, 800); // 少し早めのカウント
}

function startSession() {
    gameState = 'playing';
    countdownInterval = null;
    gameData.startTime = Date.now();
    resetBoard();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(gameLoop, 10);
}

// 新しい盤面の準備（Streak/Infiniteで使い回す）
function resetBoard() {
    isFirstMove = true;
    boardId++;
    grid.forEach(row => row.forEach(c => {
        c.isBomb = false;
        c.isOpen = false;
        c.value = 0;
        c.element.className = 'cell';
        c.element.textContent = '';

        // ハイライト状態の復元（キー押しっぱなし対応）
        if (activeLeft.has(c.r) || activeRight.has(c.c)) {
            c.element.classList.add('highlight');
        }
    }));
    // タイマーの色をリセット
    timerEl.style.color = '#00ff00';
}

// --- メインループ ---
function gameLoop() {
    if (gameState !== 'playing' && !(gameState === 'waiting' && (gameData.mode === 'streak' || gameData.mode === 'infinite'))) return;

    const now = Date.now();

    if (gameData.mode === 'infinite') {
        // カウントダウン
        gameData.remainingTime -= 0.01; // 10ms減
        if (gameData.remainingTime <= 0) {
            gameData.remainingTime = 0;
            timerEl.textContent = '00:00.000';
            gameOver(false);
            return;
        }
        const minutes = Math.floor(gameData.remainingTime / 60);
        const seconds = gameData.remainingTime % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
        // タイマーの色設定
        if (gameState === 'waiting') {
            timerEl.style.color = '#ff0000';
        } else if (gameData.remainingTime < 10) {
            timerEl.style.color = '#ff0000';
        } else {
            timerEl.style.color = '#00ff00';
        }
    } else {
        // カウントアップ (Single / Streak)
        const diff = (now - gameData.startTime) / 1000;
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
    }
}

// --- 入力処理 ---
function setupInput() {
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            e.preventDefault();
            // すべての状態をリセット
            gameState = 'menu';
            clearInterval(timerInterval);
            timerInterval = null;
            clearInterval(countdownInterval);
            countdownInterval = null;
            activeLeft.clear();
            activeRight.clear();
            isFirstMove = true;
            gameData = {
                mode: 'single',
                param: null,
                startTime: 0,
                remainingTime: 0,
                panelsCleared: 0,
                targetPanels: 0,
                mistakes: 0,
            };
            timerEl.textContent = '00:00.000';
            timerEl.style.color = '#00ff00';
            msgOverlay.classList.add('hidden');
            menuOverlay.classList.remove('hidden');
            document.body.classList.remove('danger');
            createGridDOM();
            updateMenuSelection();
            updateStreakDisplay();
            return;
        }

        if (gameState === 'menu') {
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') {
                e.preventDefault();
            }
            if (e.code === 'ArrowLeft') {
                menuModeIndex = (menuModeIndex - 1 + menuOptions.length) % menuOptions.length;
                menuSubIndex = 0; // リセット
                updateMenuSelection();
            } else if (e.code === 'ArrowRight') {
                menuModeIndex = (menuModeIndex + 1) % menuOptions.length;
                menuSubIndex = 0; // リセット
                updateMenuSelection();
            } else if (e.code === 'ArrowUp') {
                const currentMode = menuOptions[menuModeIndex];
                if (currentMode.subs.length > 1) {
                    menuSubIndex = (menuSubIndex - 1 + currentMode.subs.length) % currentMode.subs.length;
                    updateMenuSelection();
                }
            } else if (e.code === 'ArrowDown') {
                const currentMode = menuOptions[menuModeIndex];
                if (currentMode.subs.length > 1) {
                    menuSubIndex = (menuSubIndex + 1) % currentMode.subs.length;
                    updateMenuSelection();
                }
            } else if (e.code === 'Space') {
                const currentMode = menuOptions[menuModeIndex];
                startGame(currentMode.mode, currentMode.subs[menuSubIndex]);
            }
            return;
        }

        if (e.code === 'Space') {
            e.preventDefault();
            // ゲームオーバー/クリア後のリトライ
            if (gameState === 'ended') {
                msgOverlay.classList.add('hidden');
                startGame(gameData.mode, gameData.param);
            }
            return;
        }

        if (gameState !== 'playing') return;
        if (e.repeat) return;

        const key = e.key.toLowerCase();

        if (key in LEFT_KEYS) {
            const r = LEFT_KEYS[key];
            activeLeft.add(r);
            highlightRow(r, true);
            activeRight.forEach(c => attemptOpen(r, c));
        }
        if (key in RIGHT_KEYS) {
            const c = RIGHT_KEYS[key];
            activeRight.add(c);
            highlightCol(c, true);
            activeLeft.forEach(r => attemptOpen(r, c));
        }
    });

    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in LEFT_KEYS) {
            const r = LEFT_KEYS[key];
            activeLeft.delete(r);
            highlightRow(r, false);
        }
        if (key in RIGHT_KEYS) {
            const c = RIGHT_KEYS[key];
            activeRight.delete(c);
            highlightCol(c, false);
        }
    });
}

function highlightRow(r, on) {
    if (r < 0 || r >= ROWS) return;
    for (let c = 0; c < COLS; c++) updateHighlight(r, c);
}
function highlightCol(c, on) {
    if (c < 0 || c >= COLS) return;
    for (let r = 0; r < ROWS; r++) updateHighlight(r, c);
}
function updateHighlight(r, c) {
    const el = grid[r][c].element;
    const on = activeLeft.has(r) || activeRight.has(c);
    if (on) el.classList.add('highlight');
    else el.classList.remove('highlight');
}

// --- ロジック ---
function attemptOpen(r, c) {
    if (gameState !== 'playing') return;
    const cell = grid[r][c];
    if (cell.isOpen) return;

    if (isFirstMove) {
        generateBoard(r, c);
        isFirstMove = false;
    }
    openCell(r, c);
}

function generateBoard(safeR, safeC) {
    const cands = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
            cands.push({ r, c });
        }
    }
    // Shuffle
    for (let i = cands.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    // Set Bombs
    for (let i = 0; i < BOMB_COUNT && i < cands.length; i++) {
        grid[cands[i].r][cands[i].c].isBomb = true;
    }
    // Calc Numbers
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c].isBomb) continue;
            let cnt = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc].isBomb) cnt++;
                }
            }
            grid[r][c].value = cnt;
        }
    }
}

function openCell(r, c) {
    const currentBoardId = boardId;
    const cell = grid[r][c];
    if (cell.isOpen) return;

    cell.isOpen = true;
    cell.element.classList.add('open');
    updateHighlight(r, c);

    if (cell.isBomb) {
        cell.element.classList.add('bomb');
        handleMistake();
        return;
    }

    if (cell.value > 0) {
        cell.element.textContent = cell.value;
    } else {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                // ボードがリセットされたら再帰を中断
                if (boardId !== currentBoardId) return;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) openCell(nr, nc);
            }
        }
    }
    // ボードがリセットされたらクリア判定もしない
    if (boardId !== currentBoardId) return;
    checkBoardClear();
}

// ミス時の処理（モード分岐）
function handleMistake() {
    gameData.mistakes++;

    // Single Mode: 即ゲームオーバー
    if (gameData.mode === 'single') {
        gameOver(false);
        return;
    }

    // Streak / Infinite Mode: ペナルティ

    // 赤フラッシュ演出
    triggerFlash('flash-red');

    // ペナルティ計算
    if (gameData.mode === 'streak') {
        // 時間加算ペナルティ (内部開始時間をずらして現在時間を増やす)
        gameData.startTime -= 3000;
        // 地雷を表示
        grid.forEach(row => row.forEach(c => {
            if (c.isBomb) {
                c.element.textContent = 'X';
                c.element.classList.add('bomb');
            }
        }));
        // タイマーを赤く
        timerEl.style.color = '#ff0000';
        // 2秒待機してからリセット
        gameState = 'waiting';
        setTimeout(() => {
            gameState = 'playing';
            resetBoard();
        }, 2000);
    } else if (gameData.mode === 'infinite') {
        // 地雷を表示
        grid.forEach(row => row.forEach(c => {
            if (c.isBomb) {
                c.element.textContent = 'X';
                c.element.classList.add('bomb');
            }
        }));
        // タイマーを赤く
        timerEl.style.color = '#ff0000';
        // 2秒待機してからリセット
        gameState = 'waiting';
        setTimeout(() => {
            gameState = 'playing';
            resetBoard();
        }, 2000);
    }
}

// 盤面クリア判定
function checkBoardClear() {
    let opened = 0;
    grid.forEach(row => row.forEach(c => { if (c.isOpen) opened++; }));

    if (opened === (ROWS * COLS - BOMB_COUNT)) {
        handleBoardClear();
    }
}

function handleBoardClear() {
    gameData.panelsCleared++;
    updateStreakDisplay();
    triggerFlash('flash-green');

    // Single Mode: 即クリア
    if (gameData.mode === 'single') {
        gameOver(true);
        return;
    }

    // Streak Mode: 目標枚数チェック
    if (gameData.mode === 'streak') {
        if (gameData.panelsCleared >= gameData.targetPanels) {
            gameOver(true);
        } else {
            resetBoard();
        }
    }

    // Infinite Mode: 時間を加算して続行
    if (gameData.mode === 'infinite') {
        gameData.remainingTime += getBonusTime(gameData.param);
        resetBoard();
    }
}

function gameOver(isWin) {
    gameState = 'ended';
    clearInterval(timerInterval);
    document.body.classList.remove('danger');

    msgOverlay.classList.remove('hidden');

    if (isWin) {
        msgText.textContent = "FINISHED!";
        msgText.style.color = "#0f0";
        if (gameData.mode === 'single') {
            subMsg.textContent = `TIME: ${timerEl.textContent}`;
        } else if (gameData.mode === 'streak') {
            subMsg.textContent = `${gameData.panelsCleared} Streaks\nTIME: ${timerEl.textContent} / MISS: ${gameData.mistakes}`;
        } else if (gameData.mode === 'infinite') {
            subMsg.textContent = `CLEARED: ${gameData.panelsCleared} / MISS: ${gameData.mistakes}`;
        }
    } else {
        if (gameData.mode === 'infinite' && gameData.remainingTime <= 0) {
            msgText.textContent = "FINISHED!";
            msgText.style.color = "#0f0";
            subMsg.textContent = `CLEARED: ${gameData.panelsCleared} / MISS: ${gameData.mistakes}`;
        } else {
            msgText.textContent = "GAME OVER";
            msgText.style.color = "#f00";
            if (gameData.mode === 'single') {
                subMsg.textContent = "PRESS SPACE TO RESTART";
            } else {
                subMsg.textContent = `CLEARED: ${gameData.panelsCleared} / PRESS SPACE TO RESTART`;
            }
        }
    }

    // 最後に爆弾全表示
    grid.forEach(row => row.forEach(c => {
        if (c.isBomb) {
            c.element.textContent = 'X';
            c.element.classList.add('bomb');
        }
    }));
}

// 演出トリガー
function triggerFlash(className) {
    // アニメーション再発火のためのハック
    const el = gameArea;
    el.classList.remove('flash-red', 'flash-green');
    void el.offsetWidth; // Reflow
    el.classList.add(className);
}

// 実行
init();