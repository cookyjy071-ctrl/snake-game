const GRID = 20;          // 20 x 20 격자
const CELL = 20;          // 한 칸 = 20px (400 / 20)
const STORAGE_KEY = 'snake-high-score';

// 난이도별 기본 이동 간격(ms): 작을수록 빠름
const DIFFICULTIES = { easy: 200, normal: 150, hard: 100, expert: 50 };

const LEVEL_SCORE = 50;     // 50점마다 레벨업
const LEVEL_SPEEDUP = 10;   // 레벨이 오를 때마다 간격 10ms 감소 (더 빨라짐)
const MIN_INTERVAL = 20;    // 이 이하로는 빨라지지 않음

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const overlay = document.getElementById('overlay');
const overlayMsg = document.getElementById('overlay-msg');
const startBtn = document.getElementById('start-btn');
const levelEl = document.getElementById('level');
const pauseBtn = document.getElementById('pause-btn');
const difficultyBtns = document.querySelectorAll('.speed-btn');
const soundBtn = document.getElementById('sound-btn');

let snake;        // [{x, y}, ...] 머리가 맨 앞
let direction;    // 현재 이동 방향
let nextDir;      // 다음 틱에 적용할 방향 (한 틱에 두 번 꺾어 역주행하는 것 방지)
let food;
let score;
let highScore = loadHighScore();
let difficulty = 'normal';
let level = 1;
let playing = false;   // 게임 진행 중 (일시정지 포함)
let paused = false;
let soundOn = true;
let timer = null;

/* ---------- 최고 점수 ---------- */

// 저장소를 쓸 수 없어도 게임은 계속 동작
function loadHighScore() {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY), 10) || 0;
  } catch (e) {
    return 0;
  }
}

function saveHighScore() {
  try {
    localStorage.setItem(STORAGE_KEY, highScore);
  } catch (e) {
    // 저장만 건너뜀
  }
}

function updateScoreboard() {
  scoreEl.textContent = score;
  highScoreEl.textContent = highScore;
  levelEl.textContent = level;
}

/* ---------- 소리 (Web Audio, 별도 파일 없이 합성) ---------- */

let audioCtx = null;

// 브라우저 정책상 사용자 클릭 이후에 AudioContext를 만든다
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// 음 하나 재생: 주파수, 시작 지연(초), 길이(초)
function tone(freq, delay, dur, type = 'square', vol = 0.07) {
  if (!soundOn || !audioCtx) return;

  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

function playStart() {
  tone(392, 0, 0.1, 'triangle');
  tone(523, 0.1, 0.16, 'triangle');
}

function playEat() {
  tone(660, 0, 0.08);
  tone(990, 0.07, 0.12);
}

function playGameOver() {
  tone(330, 0, 0.18, 'sawtooth', 0.08);
  tone(247, 0.18, 0.18, 'sawtooth', 0.08);
  tone(165, 0.36, 0.4, 'sawtooth', 0.08);
}

/* ---------- 상태 ---------- */

// 뱀과 먹이를 초기 상태로 되돌림
function resetState() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDir = direction;
  score = 0;
  level = 1;
  placeFood();
  updateScoreboard();
}

// 뱀이 없는 칸에 먹이 생성
function placeFood() {
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
  food = pos;
}

// 한 칸 이동하고 충돌/먹이 처리
function tick() {
  direction = nextDir;

  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  const hitWall = head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID;
  const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
  if (hitWall || hitSelf) {
    gameOver();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 10;
    const newLevel = Math.floor(score / LEVEL_SCORE) + 1;
    const leveledUp = newLevel > level;
    level = newLevel;
    if (score > highScore) {
      highScore = score;
      saveHighScore();
    }
    updateScoreboard();
    placeFood();
    playEat();
    if (leveledUp) startTimer(); // 새 레벨의 속도 적용
  } else {
    snake.pop();
  }
}

// 현재 이동 간격: 난이도 기본값에서 레벨마다 10ms씩 줄어듦
function intervalMs() {
  return Math.max(MIN_INTERVAL, DIFFICULTIES[difficulty] - (level - 1) * LEVEL_SPEEDUP);
}

function startTimer() {
  clearInterval(timer);
  timer = setInterval(tick, intervalMs());
}

function updatePauseBtn() {
  pauseBtn.disabled = !playing;
  pauseBtn.textContent = paused ? '재개' : '일시정지';
}

// 일시정지 / 재개
function togglePause() {
  if (!playing) return;

  paused = !paused;
  if (paused) {
    clearInterval(timer);
    timer = null;
  } else {
    startTimer();
  }
  updatePauseBtn();
}

function startGame() {
  ensureAudio();
  resetState();
  playing = true;
  paused = false;
  updatePauseBtn();
  overlay.classList.add('hidden');
  startTimer();
  playStart();
}

function gameOver() {
  clearInterval(timer);
  timer = null;
  playing = false;
  paused = false;
  updatePauseBtn();
  playGameOver();

  overlayMsg.textContent = `게임 오버\n점수: ${score}`;
  startBtn.textContent = '다시 시작';
  overlay.classList.remove('hidden');
  startBtn.focus();
}

/* ---------- 그래픽 ---------- */

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 어두운 그라데이션 바닥 + 은은한 체스판 무늬
function drawBoard() {
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, '#1b1d3a');
  bg.addColorStop(1, '#2a2150');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
}

// 빛나는 먹이 (살짝 맥동)
function drawFood(time) {
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  const r = 6.5 + Math.sin(time / 220) * 1.2;

  const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
  g.addColorStop(0, '#ffd1d1');
  g.addColorStop(0.45, '#ff6b6b');
  g.addColorStop(1, '#d6246e');

  ctx.save();
  ctx.shadowColor = 'rgba(255, 90, 120, 0.9)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 머리에서 꼬리로 갈수록 어두워지는 둥근 몸통
function drawSnake() {
  const n = snake.length;

  for (let i = n - 1; i >= 0; i--) {
    const seg = snake[i];
    const t = n > 1 ? i / (n - 1) : 0;
    const pad = i === 0 ? 1 : 2;

    ctx.save();
    ctx.shadowColor = 'rgba(80, 255, 150, 0.45)';
    ctx.shadowBlur = i === 0 ? 14 : 8;
    ctx.fillStyle = `hsl(146, 72%, ${64 - 26 * t}%)`;
    roundedRect(
      seg.x * CELL + pad,
      seg.y * CELL + pad,
      CELL - pad * 2,
      CELL - pad * 2,
      i === 0 ? 7 : 5
    );
    ctx.fill();
    ctx.restore();
  }

  drawEyes();
}

// 이동 방향을 바라보는 눈
function drawEyes() {
  const head = snake[0];
  const cx = head.x * CELL + CELL / 2;
  const cy = head.y * CELL + CELL / 2;
  const fx = direction.x;
  const fy = direction.y;

  [-1, 1].forEach((side) => {
    const ex = cx + fx * 3.5 + -fy * side * 4;
    const ey = cy + fy * 3.5 + fx * side * 4;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1b1d3a';
    ctx.beginPath();
    ctx.arc(ex + fx * 0.9, ey + fy * 0.9, 1.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPaused() {
  ctx.fillStyle = 'rgba(20, 22, 46, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  ctx.font = '700 36px "Segoe UI", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('일시정지', canvas.width / 2, canvas.height / 2);
}

// 매 프레임 현재 상태를 그림 (게임 로직은 tick이 담당)
function render(time) {
  drawBoard();
  drawFood(time);
  drawSnake();
  if (paused) drawPaused();
  requestAnimationFrame(render);
}

/* ---------- 입력 ---------- */

const KEY_DIRS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

// 방향키 (반대 방향으로는 바로 꺾을 수 없음)
document.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.key];
  if (!dir) return;

  e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게

  if (!timer) return;
  if (dir.x === -direction.x && dir.y === -direction.y) return;
  nextDir = dir;
});

// 난이도 선택: 플레이 중에 바꾸면 바로 적용 (일시정지 중이면 재개할 때 적용)
function setDifficulty(next) {
  difficulty = next;
  difficultyBtns.forEach((btn) => {
    const active = btn.dataset.speed === difficulty;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });
  if (timer) startTimer();
}

function toggleSound() {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '소리 켜짐' : '소리 꺼짐';
  soundBtn.classList.toggle('off', !soundOn);
  soundBtn.setAttribute('aria-pressed', soundOn);
  if (soundOn) {
    ensureAudio();
    tone(660, 0, 0.08); // 켰을 때 확인음
  }
}

difficultyBtns.forEach((btn) => {
  btn.addEventListener('click', () => setDifficulty(btn.dataset.speed));
});
pauseBtn.addEventListener('click', togglePause);
soundBtn.addEventListener('click', toggleSound);
startBtn.addEventListener('click', startGame);

resetState();
setDifficulty(difficulty);
updatePauseBtn();
requestAnimationFrame(render);
