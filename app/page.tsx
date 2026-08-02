"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BPM = 155.12;
const BEAT = 60 / BPM;
const GRID_OFFSET = 0.331;
const SONG_LENGTH = 121.696;
const TRAVEL_TIME = 1.75;
const KEYS = ["D", "F", "J", "K"];
const COLORS = ["#36f1ff", "#7b61ff", "#ff4fd8", "#ffb84d"];

type Phase = "ready" | "playing" | "paused" | "results";
type Judge = "PERFECT" | "GREAT" | "GOOD" | "MISS";

type Note = {
  id: number;
  time: number;
  lane: number;
  hit: boolean;
  missed: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type Pulse = {
  x: number;
  y: number;
  life: number;
  color: string;
};

type Stats = {
  score: number;
  combo: number;
  maxCombo: number;
  sync: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  progress: number;
  overdrive: boolean;
};

const EMPTY_STATS: Stats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  sync: 0,
  perfect: 0,
  great: 0,
  good: 0,
  miss: 0,
  progress: 0,
  overdrive: false,
};

function buildChart(): Note[] {
  const notes: Note[] = [];
  const lanePatterns = [
    [0, 1, 2, 3, 1, 2, 0, 3],
    [0, 2, 1, 3, 2, 0, 3, 1],
    [3, 1, 2, 0, 1, 3, 0, 2],
  ];
  let id = 0;

  for (let step = 0; ; step += 1) {
    const time = GRID_OFFSET + step * (BEAT / 2);
    if (time > 119.2) break;

    const beatIndex = Math.floor(step / 2);
    const half = step % 2;
    let add = false;

    if (time >= 3.8 && time < 8) add = half === 0 && beatIndex % 2 === 0;
    else if (time < 32) add = half === 0 || beatIndex % 8 === 7;
    else if (time < 48) add = half === 0 || beatIndex % 4 >= 2;
    else if (time < 72) add = half === 0 || beatIndex % 4 !== 0;
    else if (time < 88) add = half === 0 && beatIndex % 2 === 0;
    else if (time < 112) add = half === 0 || beatIndex % 4 !== 0;
    else add = half === 0;

    if (!add) continue;

    const section = time < 48 ? 0 : time < 88 ? 1 : 2;
    const pattern = lanePatterns[section];
    const lane = pattern[(step + Math.floor(step / 9)) % pattern.length];
    notes.push({ id: id++, time, lane, hit: false, missed: false });

    const isDrop = (time >= 48 && time < 72) || (time >= 88 && time < 112);
    if (isDrop && half === 0 && beatIndex % 8 === 0) {
      notes.push({ id: id++, time, lane: (lane + 2) % 4, hit: false, missed: false });
    }
  }

  return notes;
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function getAccuracy(stats: Stats) {
  const total = stats.perfect + stats.great + stats.good + stats.miss;
  if (!total) return 100;
  return ((stats.perfect + stats.great * 0.72 + stats.good * 0.4) / total) * 100;
}

function getGrade(accuracy: number) {
  if (accuracy >= 97) return "S";
  if (accuracy >= 91) return "A";
  if (accuracy >= 82) return "B";
  if (accuracy >= 70) return "C";
  return "D";
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notesRef = useRef<Note[]>(buildChart());
  const particlesRef = useRef<Particle[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const feedbackRef = useRef<{ judge: Judge; at: number; lane: number } | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const statsRef = useRef<Stats>({ ...EMPTY_STATS });
  const shakeRef = useRef(0);
  const flashRef = useRef(0);
  const overdriveUntilRef = useRef(0);
  const lastHudUpdateRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS });
  const [offsetMs, setOffsetMs] = useState(0);
  const chartSize = useMemo(() => buildChart().length, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("neon-input-offset");
    if (stored) setOffsetMs(Number(stored) || 0);
    const audio = new Audio("/audio/neon-pulse-protocol.ogg");
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const updateOffset = (next: number) => {
    const value = Math.max(-150, Math.min(150, next));
    setOffsetMs(value);
    window.localStorage.setItem("neon-input-offset", String(value));
  };

  const spawnHitEffect = useCallback((lane: number, judge: Judge) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const laneWidth = canvas.width / 4;
    const x = laneWidth * (lane + 0.5);
    const y = canvas.height - Math.max(92, canvas.height * 0.13);
    const power = judge === "PERFECT" ? 1 : judge === "GREAT" ? 0.72 : 0.46;
    const count = Math.round(28 * power);

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (120 + Math.random() * 340) * power;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        life: 0.42 + Math.random() * 0.38,
        maxLife: 0.8,
        color: COLORS[lane],
        size: 2 + Math.random() * 6 * power,
      });
    }

    pulsesRef.current.push({ x, y, life: 1, color: COLORS[lane] });
    shakeRef.current = Math.max(shakeRef.current, judge === "PERFECT" ? 10 : judge === "GREAT" ? 6 : 3);
    flashRef.current = Math.max(flashRef.current, judge === "PERFECT" ? 0.2 : 0.1);
    if (navigator.vibrate) navigator.vibrate(judge === "PERFECT" ? 16 : 8);
  }, []);

  const registerMiss = useCallback((lane: number, currentTime: number) => {
    const current = statsRef.current;
    statsRef.current = {
      ...current,
      combo: 0,
      sync: Math.max(0, current.sync - 12),
      miss: current.miss + 1,
    };
    feedbackRef.current = { judge: "MISS", at: currentTime, lane };
    shakeRef.current = Math.max(shakeRef.current, 3);
  }, []);

  const hitLane = useCallback(
    (lane: number) => {
      if (phaseRef.current !== "playing") return;
      const audio = audioRef.current;
      if (!audio) return;
      const judgedTime = audio.currentTime + offsetMs / 1000;
      let candidate: Note | undefined;
      let closest = Infinity;

      for (const note of notesRef.current) {
        if (note.hit || note.missed || note.lane !== lane) continue;
        const distance = Math.abs(note.time - judgedTime);
        if (distance < closest) {
          closest = distance;
          candidate = note;
        }
        if (note.time > judgedTime + 0.18) break;
      }

      if (!candidate || closest > 0.15) {
        shakeRef.current = Math.max(shakeRef.current, 1.5);
        return;
      }

      candidate.hit = true;
      const judge: Judge = closest <= 0.04 ? "PERFECT" : closest <= 0.08 ? "GREAT" : "GOOD";
      const current = statsRef.current;
      const combo = current.combo + 1;
      let sync = Math.min(100, current.sync + (judge === "PERFECT" ? 8 : judge === "GREAT" ? 4 : 1));
      if (sync >= 100 && audio.currentTime > overdriveUntilRef.current) {
        overdriveUntilRef.current = audio.currentTime + 8;
        sync = 100;
      }
      const overdrive = audio.currentTime < overdriveUntilRef.current;
      const base = judge === "PERFECT" ? 1000 : judge === "GREAT" ? 700 : 400;
      const multiplier = 1 + Math.min(2, Math.floor(combo / 25) * 0.25) + (overdrive ? 0.5 : 0);

      statsRef.current = {
        ...current,
        score: current.score + Math.round(base * multiplier),
        combo,
        maxCombo: Math.max(current.maxCombo, combo),
        sync,
        perfect: current.perfect + (judge === "PERFECT" ? 1 : 0),
        great: current.great + (judge === "GREAT" ? 1 : 0),
        good: current.good + (judge === "GOOD" ? 1 : 0),
        overdrive,
      };
      feedbackRef.current = { judge, at: audio.currentTime, lane };
      spawnHitEffect(lane, judge);
    },
    [offsetMs, spawnHitEffect],
  );

  const resetGame = useCallback(() => {
    notesRef.current = buildChart();
    particlesRef.current = [];
    pulsesRef.current = [];
    feedbackRef.current = null;
    statsRef.current = { ...EMPTY_STATS };
    setStats({ ...EMPTY_STATS });
    shakeRef.current = 0;
    flashRef.current = 0;
    overdriveUntilRef.current = 0;
  }, []);

  const startGame = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    resetGame();
    audio.currentTime = 0;
    audio.volume = 0.88;
    try {
      await audio.play();
      phaseRef.current = "playing";
      setPhase("playing");
    } catch {
      phaseRef.current = "ready";
      setPhase("ready");
    }
  }, [resetGame]);

  const togglePause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (phaseRef.current === "playing") {
      audio.pause();
      phaseRef.current = "paused";
      setPhase("paused");
    } else if (phaseRef.current === "paused") {
      await audio.play();
      phaseRef.current = "playing";
      setPhase("playing");
    }
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const lane = KEYS.indexOf(event.key.toUpperCase());
      if (lane >= 0) {
        event.preventDefault();
        hitLane(lane);
      }
      if (event.key === "Escape") togglePause();
      if (event.code === "Space" && phaseRef.current === "paused") togglePause();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [hitLane, togglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animation = 0;
    let previous = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      const audio = audioRef.current;
      const currentTime = audio?.currentTime ?? 0;
      const width = canvas.width;
      const height = canvas.height;
      const laneWidth = width / 4;
      const hitY = height - Math.max(92, height * 0.13);
      const isOverdrive = currentTime < overdriveUntilRef.current;

      if (phaseRef.current === "playing") {
        for (const note of notesRef.current) {
          if (!note.hit && !note.missed && currentTime - note.time > 0.15) {
            note.missed = true;
            registerMiss(note.lane, currentTime);
          }
          if (note.time > currentTime + TRAVEL_TIME) break;
        }

        const current = statsRef.current;
        const nextSync = isOverdrive ? Math.max(0, current.sync - dt * 4) : current.sync;
        statsRef.current = {
          ...current,
          sync: nextSync,
          progress: Math.min(1, currentTime / SONG_LENGTH),
          overdrive: isOverdrive,
        };

        if (audio?.ended || currentTime >= SONG_LENGTH - 0.05) {
          audio?.pause();
          phaseRef.current = "results";
          setStats({ ...statsRef.current });
          setPhase("results");
        }

        if (now - lastHudUpdateRef.current > 50) {
          setStats({ ...statsRef.current });
          lastHudUpdateRef.current = now;
        }
      }

      const shake = shakeRef.current;
      const shakeX = shake ? (Math.random() - 0.5) * shake : 0;
      const shakeY = shake ? (Math.random() - 0.5) * shake : 0;
      shakeRef.current *= 0.86;

      ctx.save();
      ctx.translate(shakeX, shakeY);
      const background = ctx.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, isOverdrive ? "#160b38" : "#071120");
      background.addColorStop(0.55, "#070814");
      background.addColorStop(1, "#020307");
      ctx.fillStyle = background;
      ctx.fillRect(-20, -20, width + 40, height + 40);

      ctx.globalAlpha = 0.23;
      for (let i = 0; i < 28; i += 1) {
        const y = ((i * 97 + currentTime * (22 + (i % 4) * 8)) % (height + 60)) - 30;
        const x = (i * 173) % width;
        ctx.fillStyle = COLORS[i % 4];
        ctx.fillRect(x, y, 1.5 + (i % 3), 1.5 + (i % 3));
      }
      ctx.globalAlpha = 1;

      const beatPhase = ((currentTime - GRID_OFFSET) % BEAT + BEAT) % BEAT;
      for (let i = -1; i < Math.ceil(TRAVEL_TIME / BEAT) + 2; i += 1) {
        const secondsAhead = i * BEAT - beatPhase;
        const y = hitY - (secondsAhead / TRAVEL_TIME) * hitY;
        if (y < 0 || y > hitY) continue;
        ctx.strokeStyle = i % 4 === 0 ? "rgba(120,235,255,.2)" : "rgba(255,255,255,.07)";
        ctx.lineWidth = i % 4 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      for (let lane = 0; lane < 4; lane += 1) {
        const x = lane * laneWidth;
        ctx.fillStyle = lane % 2 ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.012)";
        ctx.fillRect(x, 0, laneWidth, hitY + 36);
        ctx.strokeStyle = "rgba(140,210,255,.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (const note of notesRef.current) {
        if (note.hit || note.missed) continue;
        const relative = note.time - currentTime;
        if (relative > TRAVEL_TIME || relative < -0.16) continue;
        const y = hitY - (relative / TRAVEL_TIME) * hitY;
        const x = note.lane * laneWidth + laneWidth * 0.12;
        const w = laneWidth * 0.76;
        const h = Math.max(12, height * 0.018);
        ctx.shadowColor = COLORS[note.lane];
        ctx.shadowBlur = isOverdrive ? 30 : 18;
        ctx.fillStyle = COLORS[note.lane];
        ctx.fillRect(x, y - h / 2, w, h);
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.fillRect(x + w * 0.12, y - h / 2 + 2, w * 0.76, 2);
        ctx.shadowBlur = 0;
      }

      ctx.shadowColor = isOverdrive ? "#ff4fd8" : "#36f1ff";
      ctx.shadowBlur = isOverdrive ? 35 : 20;
      ctx.fillStyle = isOverdrive ? "rgba(255,79,216,.95)" : "rgba(54,241,255,.9)";
      ctx.fillRect(0, hitY - 2, width, 4);
      ctx.shadowBlur = 0;

      for (let lane = 0; lane < 4; lane += 1) {
        const cx = lane * laneWidth + laneWidth / 2;
        ctx.beginPath();
        ctx.arc(cx, hitY, Math.min(24, laneWidth * 0.17), 0, Math.PI * 2);
        ctx.fillStyle = "#060916";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLORS[lane];
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.font = `700 ${Math.max(13, height * 0.02)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(KEYS[lane], cx, hitY);
      }

      for (const pulse of pulsesRef.current) {
        pulse.life -= dt * 2.3;
        const radius = (1 - pulse.life) * 110 + 18;
        ctx.globalAlpha = Math.max(0, pulse.life) * 0.75;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = pulse.color;
        ctx.lineWidth = 5 * pulse.life;
        ctx.stroke();
      }
      pulsesRef.current = pulsesRef.current.filter((pulse) => pulse.life > 0);

      for (const particle of particlesRef.current) {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 260 * dt;
        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
      particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0);
      ctx.globalAlpha = 1;

      const feedback = feedbackRef.current;
      if (feedback) {
        const age = currentTime - feedback.at;
        if (age < 0.62) {
          const strength = 1 - age / 0.62;
          const size = feedback.judge === "PERFECT" ? 48 : feedback.judge === "GREAT" ? 40 : 32;
          ctx.save();
          ctx.translate(width / 2, height * 0.61);
          ctx.scale(1 + strength * 0.18, 1 + strength * 0.18);
          ctx.globalAlpha = Math.min(1, strength * 2.5);
          ctx.font = `900 ${Math.max(28, size * (height / 800))}px Arial Black, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = feedback.judge === "MISS" ? "#ff365f" : feedback.judge === "GOOD" ? "#ffb84d" : "#ffffff";
          ctx.shadowColor = feedback.judge === "PERFECT" ? "#36f1ff" : COLORS[feedback.lane];
          ctx.shadowBlur = feedback.judge === "PERFECT" ? 36 : 22;
          ctx.fillText(feedback.judge, 0, 0);
          ctx.restore();
        }
      }

      if (flashRef.current > 0.005) {
        ctx.globalAlpha = flashRef.current;
        ctx.fillStyle = isOverdrive ? "#ff4fd8" : "#bffcff";
        ctx.fillRect(0, 0, width, height);
        flashRef.current *= 0.78;
      }

      ctx.restore();
      animation = requestAnimationFrame(draw);
    };

    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
    };
  }, [registerMiss]);

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const lane = Math.max(0, Math.min(3, Math.floor(((event.clientX - rect.left) / rect.width) * 4)));
    hitLane(lane);
  };

  const accuracy = getAccuracy(stats);
  const currentTime = stats.progress * SONG_LENGTH;

  return (
    <main className="game-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">NP</span>
          <div>
            <p className="eyebrow">RHYTHM RESTORATION SYSTEM</p>
            <h1>NEON PULSE PROTOCOL</h1>
          </div>
        </div>
        <button className="icon-button" onClick={togglePause} disabled={phase === "ready" || phase === "results"} aria-label="일시 정지">
          {phase === "paused" ? "▶" : "Ⅱ"}
        </button>
      </header>

      <section className={`hud ${stats.overdrive ? "overdrive" : ""}`}>
        <div className="score-block">
          <span>SCORE</span>
          <strong>{String(stats.score).padStart(8, "0")}</strong>
        </div>
        <div className="sync-block">
          <div className="sync-label">
            <span>{stats.overdrive ? "OVERDRIVE" : "SYNC LEVEL"}</span>
            <b>{Math.round(stats.sync)}%</b>
          </div>
          <div className="sync-track"><i style={{ width: `${stats.sync}%` }} /></div>
        </div>
        <div className="combo-block">
          <strong>{stats.combo}</strong>
          <span>COMBO</span>
        </div>
      </section>

      <section className="playfield-wrap">
        <div className="song-rail">
          <span>{formatTime(currentTime)}</span>
          <div><i style={{ width: `${stats.progress * 100}%` }} /></div>
          <span>{formatTime(SONG_LENGTH)}</span>
        </div>

        <div className="playfield-frame">
          <canvas ref={canvasRef} onPointerDown={handlePointer} aria-label="4레인 리듬 게임 플레이 영역" />
          {phase === "ready" && (
            <div className="overlay ready-panel">
              <p className="mission-code">PROTOCOL // 001</p>
              <h2>Restore the pulse.</h2>
              <p>신호가 판정선에 닿는 순간 탭하세요.<br />정확할수록 네온 코어가 강하게 폭발합니다.</p>
              <div className="track-spec">
                <span>155.12 BPM</span><span>4 LANES</span><span>{chartSize} NOTES</span>
              </div>
              <button className="primary-button" onClick={startGame}>START PROTOCOL <b>↗</b></button>
              <small>키보드 D F J K · 모바일 화면 터치</small>
            </div>
          )}

          {phase === "paused" && (
            <div className="overlay pause-panel">
              <p className="mission-code">SYSTEM SUSPENDED</p>
              <h2>PAUSED</h2>
              <button className="primary-button" onClick={togglePause}>RESUME <b>▶</b></button>
              <button className="text-button" onClick={startGame}>처음부터 다시 시작</button>
            </div>
          )}

          {phase === "results" && (
            <div className="overlay result-panel">
              <div className="grade">{getGrade(accuracy)}</div>
              <div className="result-copy">
                <p className="mission-code">PROTOCOL COMPLETE</p>
                <h2>{accuracy.toFixed(2)}% SYNCED</h2>
                <div className="judge-grid">
                  <span>PERFECT <b>{stats.perfect}</b></span>
                  <span>GREAT <b>{stats.great}</b></span>
                  <span>GOOD <b>{stats.good}</b></span>
                  <span>MISS <b>{stats.miss}</b></span>
                </div>
                <p className="max-combo">MAX COMBO <b>{stats.maxCombo}</b></p>
                <button className="primary-button" onClick={startGame}>RETRY PROTOCOL <b>↻</b></button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="control-strip">
        <div>
          <span className="status-light" />
          <p><b>Neon Pulse Protocol</b><small>Original Lyria generation · Normal</small></p>
        </div>
        <div className="latency-control">
          <span>INPUT OFFSET</span>
          <button onClick={() => updateOffset(offsetMs - 10)} aria-label="입력 오프셋 10밀리초 감소">−</button>
          <b>{offsetMs > 0 ? "+" : ""}{offsetMs}ms</b>
          <button onClick={() => updateOffset(offsetMs + 10)} aria-label="입력 오프셋 10밀리초 증가">＋</button>
        </div>
      </footer>
    </main>
  );
}
