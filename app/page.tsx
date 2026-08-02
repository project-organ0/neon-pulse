"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

const TRAVEL_TIME = 1.75;
const KEYS = ["D", "F", "J", "K"];
const KEY_CODES = ["KeyD", "KeyF", "KeyJ", "KeyK"];
const COLORS = ["#36f1ff", "#7b61ff", "#ff4fd8", "#ffb84d"];

type Difficulty = "EASY" | "NORMAL" | "HARD";
type Phase = "select" | "ready" | "countdown" | "playing" | "paused" | "gameover" | "results";
type HitJudge = "PERFECT" | "GREAT" | "GOOD";
type Judge = HitJudge | "MISS" | "EMPTY" | "HOLD" | "BREAK";
type Timing = "EARLY" | "LATE" | "JUST";

type Track = {
  id: string;
  protocol: string;
  title: string;
  subtitle: string;
  bpm: number;
  gridOffset: number;
  duration: number;
  audio: string;
  accent: string;
  seed: number;
  levels: Record<Difficulty, number>;
  sections: { firstDropStart: number; firstDropEnd: number; breakEnd: number; finalDropEnd: number };
};

const TRACKS: Track[] = [
  {
    id: "circuit-bloom",
    protocol: "PROTOCOL // 001",
    title: "Circuit Bloom",
    subtitle: "Melodic future bass · Entry signal",
    bpm: 127.9,
    gridOffset: 0.464,
    duration: 122.88,
    audio: "/audio/circuit-bloom.ogg",
    accent: "#41ff9a",
    seed: 3,
    levels: { EASY: 2, NORMAL: 5, HARD: 8 },
    sections: { firstDropStart: 48, firstDropEnd: 72, breakEnd: 88, finalDropEnd: 112 },
  },
  {
    id: "neon-pulse-protocol",
    protocol: "PROTOCOL // 002",
    title: "Neon Pulse Protocol",
    subtitle: "Electro synthwave · Core signal",
    bpm: 155.12,
    gridOffset: 0.331,
    duration: 121.696,
    audio: "/audio/neon-pulse-protocol.ogg",
    accent: "#36f1ff",
    seed: 11,
    levels: { EASY: 3, NORMAL: 6, HARD: 9 },
    sections: { firstDropStart: 48, firstDropEnd: 72, breakEnd: 88, finalDropEnd: 112 },
  },
  {
    id: "overclock-horizon",
    protocol: "PROTOCOL // 003",
    title: "Overclock Horizon",
    subtitle: "Cyber drum & bass · Boss signal",
    bpm: 170.26,
    gridOffset: 0.195,
    duration: 121.344,
    audio: "/audio/overclock-horizon.ogg",
    accent: "#ff4fd8",
    seed: 19,
    levels: { EASY: 4, NORMAL: 7, HARD: 10 },
    sections: { firstDropStart: 44, firstDropEnd: 68, breakEnd: 84, finalDropEnd: 112 },
  },
];

const DIFFICULTIES: Difficulty[] = ["EASY", "NORMAL", "HARD"];

type Note = {
  id: number;
  time: number;
  lane: number;
  hit: boolean;
  missed: boolean;
  kind: "tap" | "hold";
  duration: number;
  started: boolean;
  startJudge?: HitJudge;
  startTiming?: Timing;
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
  integrity: number;
};

type RecordEntry = { score: number; accuracy: number; grade: string; maxCombo: number; fullCombo?: boolean };
type Records = Record<string, RecordEntry>;
type ResultMeta = { newBest: boolean; previousBest: number; fullCombo: boolean };

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
  integrity: 100,
};

const DAMAGE: Record<Difficulty, { miss: number; empty: number }> = {
  EASY: { miss: 5, empty: 2 },
  NORMAL: { miss: 7, empty: 3 },
  HARD: { miss: 10, empty: 4 },
};

function buildChart(track: Track, difficulty: Difficulty): Note[] {
  const notes: Note[] = [];
  const beat = 60 / track.bpm;
  const division = difficulty === "HARD" ? 4 : 2;
  const lanePatterns = [
    [0, 1, 2, 3, 1, 2, 0, 3],
    [0, 2, 1, 3, 2, 0, 3, 1],
    [3, 1, 2, 0, 1, 3, 0, 2],
  ];
  const holdUntil = [0, 0, 0, 0];
  let id = 0;

  for (let step = 0; ; step += 1) {
    const time = track.gridOffset + step * (beat / division);
    if (time > track.duration - 2.2) break;

    const beatIndex = Math.floor(step / division);
    const sub = step % division;
    let add = false;

    const { firstDropStart, firstDropEnd, breakEnd, finalDropEnd } = track.sections;
    const inDrop =
      (time >= firstDropStart && time < firstDropEnd) ||
      (time >= breakEnd && time < finalDropEnd);
    const inBreak = time >= firstDropEnd && time < breakEnd;
    if (time < 3.8) add = false;
    else if (difficulty === "EASY") {
      add = sub === 0 && (inDrop || beatIndex % 2 === 0);
    } else if (difficulty === "NORMAL") {
      if (time < 8) add = sub === 0 && beatIndex % 2 === 0;
      else if (inBreak) add = sub === 0 && beatIndex % 2 === 0;
      else add = sub === 0 || (sub === 1 && (inDrop || beatIndex % 4 === 3));
    } else {
      const eighth = sub === 0 || sub === 2;
      const burst = (sub === 1 || sub === 3) && beatIndex % 4 === 3;
      add = inBreak ? sub === 0 : eighth || burst;
    }

    if (!add) continue;

    const section = (time < firstDropStart ? 0 : time < breakEnd ? 1 : 2) + track.seed;
    const lanePattern = lanePatterns[section % lanePatterns.length];
    const lane = lanePattern[(step + Math.floor(step / 9) + track.seed) % lanePattern.length];
    if (time < holdUntil[lane] - 0.02) continue;
    const isHold =
      !inBreak &&
      sub === 0 &&
      time > 10 &&
      beatIndex % (difficulty === "EASY" ? 32 : 16) === track.seed % 8;
    const holdDuration = isHold ? beat * (difficulty === "HARD" ? 2.5 : difficulty === "NORMAL" ? 2 : 1.5) : 0;
    if (isHold) holdUntil[lane] = time + holdDuration;
    notes.push({
      id: id++, time, lane, hit: false, missed: false,
      kind: isHold ? "hold" : "tap", duration: holdDuration, started: false,
    });

    if (!isHold && difficulty !== "EASY" && inDrop && sub === 0 && beatIndex % 8 === 0) {
      const chordLane = (lane + 2) % 4;
      if (time < holdUntil[chordLane] - 0.02) continue;
      notes.push({
        id: id++, time, lane: chordLane, hit: false, missed: false,
        kind: "tap", duration: 0, started: false,
      });
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
  const [selectedTrackId, setSelectedTrackId] = useState(TRACKS[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [records, setRecords] = useState<Records>({});
  const track = useMemo(() => TRACKS.find((item) => item.id === selectedTrackId) ?? TRACKS[0], [selectedTrackId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const notesRef = useRef<Note[]>(buildChart(TRACKS[0], "EASY"));
  const particlesRef = useRef<Particle[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const feedbacksRef = useRef<Array<{ judge: Judge; at: number; lane: number; timing?: Timing }>>([]);
  const pressedUntilRef = useRef([0, 0, 0, 0]);
  const heldLanesRef = useRef([false, false, false, false]);
  const pointerLanesRef = useRef(new Map<number, number>());
  const phaseRef = useRef<Phase>("ready");
  const statsRef = useRef<Stats>({ ...EMPTY_STATS });
  const shakeRef = useRef(0);
  const flashRef = useRef(0);
  const overdriveUntilRef = useRef(0);
  const lastHudUpdateRef = useRef(0);
  const selectionRef = useRef({ track: TRACKS[0], difficulty: "EASY" as Difficulty });
  const countdownTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const recordsRef = useRef<Records>({});
  const [phase, setPhase] = useState<Phase>("select");
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS });
  const [offsetMs, setOffsetMs] = useState(0);
  const [countdown, setCountdown] = useState("3");
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [reducedFx, setReducedFx] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [resultMeta, setResultMeta] = useState<ResultMeta>({ newBest: false, previousBest: 0, fullCombo: false });
  const chartSize = useMemo(() => buildChart(track, difficulty).length, [track, difficulty]);

  useEffect(() => {
    selectionRef.current = { track, difficulty };
  }, [track, difficulty]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    const hydrationFrame = requestAnimationFrame(() => {
      const stored = window.localStorage.getItem("neon-input-offset");
      if (stored) setOffsetMs(Number(stored) || 0);
      const savedRecords = window.localStorage.getItem("neon-records-v1");
      if (savedRecords) {
        try { setRecords(JSON.parse(savedRecords)); } catch { /* ignore invalid local data */ }
      }
      const savedSettings = window.localStorage.getItem("neon-settings-v1");
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings) as Partial<{ sfx: boolean; reducedFx: boolean; vibration: boolean }>;
          if (typeof settings.sfx === "boolean") setSfxEnabled(settings.sfx);
          if (typeof settings.reducedFx === "boolean") setReducedFx(settings.reducedFx);
          if (typeof settings.vibration === "boolean") setVibrationEnabled(settings.vibration);
        } catch { /* ignore invalid local data */ }
      } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setReducedFx(true);
      }
    });
    const audio = new Audio(TRACKS[0].audio);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      cancelAnimationFrame(hydrationFrame);
      countdownTimersRef.current.forEach(clearTimeout);
      audio.pause();
      audio.src = "";
      void audioContextRef.current?.close();
    };
  }, []);

  const saveSettings = (next: { sfx: boolean; reducedFx: boolean; vibration: boolean }) => {
    window.localStorage.setItem("neon-settings-v1", JSON.stringify(next));
  };

  const updateOffset = (next: number) => {
    const value = Math.max(-150, Math.min(150, next));
    setOffsetMs(value);
    window.localStorage.setItem("neon-input-offset", String(value));
  };

  const playHitSound = useCallback((judge: Judge) => {
    if (!sfxEnabled || judge === "MISS" || judge === "EMPTY") return;
    const AudioContextClass = window.AudioContext;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const frequency = judge === "PERFECT" ? 1040 : judge === "GREAT" ? 820 : 560;
    oscillator.type = judge === "PERFECT" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + 0.055);
    gain.gain.setValueAtTime(judge === "PERFECT" ? 0.055 : 0.038, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.09);
  }, [sfxEnabled]);

  const spawnHitEffect = useCallback((lane: number, judge: Judge) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const laneWidth = canvas.width / 4;
    const x = laneWidth * (lane + 0.5);
    const y = canvas.height - Math.max(92, canvas.height * 0.13);
    const power = judge === "PERFECT" ? 1 : judge === "GREAT" ? 0.72 : 0.46;
    const count = Math.round(28 * power * (reducedFx ? 0.25 : 1));

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

    pulsesRef.current.push({ x, y, life: reducedFx ? 0.42 : 1, color: COLORS[lane] });
    if (!reducedFx) {
      shakeRef.current = Math.max(shakeRef.current, judge === "PERFECT" ? 8 : judge === "GREAT" ? 4 : 2);
      if (judge === "PERFECT") flashRef.current = Math.max(flashRef.current, 0.12);
    }
    if (vibrationEnabled && navigator.vibrate) navigator.vibrate(judge === "PERFECT" ? 16 : 8);
  }, [reducedFx, vibrationEnabled]);

  const awardNote = useCallback((lane: number, judge: HitJudge, currentTime: number, timing: Timing, displayJudge: Judge = judge) => {
    const current = statsRef.current;
    const combo = current.combo + 1;
    const wasOverdrive = currentTime < overdriveUntilRef.current;
    let sync = wasOverdrive
      ? current.sync
      : Math.min(100, current.sync + (judge === "PERFECT" ? 1.5 : judge === "GREAT" ? 0.8 : 0.3));
    if (sync >= 100 && !wasOverdrive) {
      overdriveUntilRef.current = currentTime + 8;
      sync = 100;
    }
    const overdrive = currentTime < overdriveUntilRef.current;
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
      integrity: Math.min(100, current.integrity + (judge === "PERFECT" ? 0.8 : judge === "GREAT" ? 0.3 : 0)),
    };
    feedbacksRef.current.push({ judge: displayJudge, at: currentTime, lane, timing });
    playHitSound(judge);
    spawnHitEffect(lane, judge);
  }, [playHitSound, spawnHitEffect]);

  const registerMiss = useCallback((lane: number, currentTime: number, feedbackJudge: Judge = "MISS") => {
    if (phaseRef.current !== "playing") return;
    const current = statsRef.current;
    const damage = DAMAGE[selectionRef.current.difficulty].miss;
    const integrity = Math.max(0, current.integrity - damage);
    const nextStats = {
      ...current,
      combo: 0,
      sync: Math.max(0, current.sync - 12),
      miss: current.miss + 1,
      integrity,
    };
    statsRef.current = nextStats;
    feedbacksRef.current.push({ judge: feedbackJudge, at: currentTime, lane });
    if (!reducedFx) shakeRef.current = Math.max(shakeRef.current, 3);
    if (integrity <= 0) {
      audioRef.current?.pause();
      phaseRef.current = "gameover";
      setStats(nextStats);
      setPhase("gameover");
    }
  }, [reducedFx]);

  const hitLane = useCallback(
    (lane: number) => {
      if (phaseRef.current !== "playing") return;
      const audio = audioRef.current;
      if (!audio) return;
      const judgedTime = audio.currentTime + offsetMs / 1000;
      pressedUntilRef.current[lane] = performance.now() + 95;
      let candidate: Note | undefined;
      let closest = Infinity;

      for (const note of notesRef.current) {
        if (note.hit || note.missed || note.started || note.lane !== lane) continue;
        const distance = Math.abs(note.time - judgedTime);
        if (distance < closest) {
          closest = distance;
          candidate = note;
        }
        if (note.time > judgedTime + 0.18) break;
      }

      if (!candidate || closest > 0.15) {
        const current = statsRef.current;
        const damage = DAMAGE[difficulty].empty;
        const nextStats = {
          ...current,
          combo: 0,
          sync: Math.max(0, current.sync - 5),
          integrity: Math.max(0, current.integrity - damage),
        };
        statsRef.current = nextStats;
        feedbacksRef.current.push({ judge: "EMPTY", at: audio.currentTime, lane });
        if (!reducedFx) shakeRef.current = Math.max(shakeRef.current, 1.5);
        if (nextStats.integrity <= 0) {
          audio.pause();
          phaseRef.current = "gameover";
          setStats(nextStats);
          setPhase("gameover");
        }
        return;
      }

      const judge: HitJudge = closest <= 0.04 ? "PERFECT" : closest <= 0.08 ? "GREAT" : "GOOD";
      const delta = judgedTime - candidate.time;
      const timing: Timing = Math.abs(delta) <= 0.012 ? "JUST" : delta < 0 ? "EARLY" : "LATE";
      if (candidate.kind === "hold") {
        candidate.started = true;
        candidate.startJudge = judge;
        candidate.startTiming = timing;
        feedbacksRef.current.push({ judge: "HOLD", at: audio.currentTime, lane, timing });
        playHitSound(judge);
        spawnHitEffect(lane, judge);
      } else {
        candidate.hit = true;
        awardNote(lane, judge, audio.currentTime, timing);
      }
    },
    [awardNote, difficulty, offsetMs, playHitSound, reducedFx, spawnHitEffect],
  );

  const releaseLane = useCallback((lane: number) => {
    heldLanesRef.current[lane] = false;
    if (phaseRef.current !== "playing") return;
    const audio = audioRef.current;
    if (!audio) return;
    const activeHold = notesRef.current.find((note) => note.kind === "hold" && note.started && !note.hit && !note.missed && note.lane === lane);
    if (!activeHold) return;
    if (audio.currentTime < activeHold.time + activeHold.duration - 0.08) {
      activeHold.started = false;
      activeHold.missed = true;
      registerMiss(lane, audio.currentTime, "BREAK");
    } else {
      activeHold.started = false;
      activeHold.hit = true;
      awardNote(lane, activeHold.startJudge ?? "GOOD", audio.currentTime, activeHold.startTiming ?? "JUST", "HOLD");
    }
  }, [awardNote, registerMiss]);

  const resetGame = useCallback(() => {
    notesRef.current = buildChart(track, difficulty);
    particlesRef.current = [];
    pulsesRef.current = [];
    feedbacksRef.current = [];
    pressedUntilRef.current = [0, 0, 0, 0];
    heldLanesRef.current = [false, false, false, false];
    pointerLanesRef.current.clear();
    statsRef.current = { ...EMPTY_STATS };
    setStats({ ...EMPTY_STATS });
    shakeRef.current = 0;
    flashRef.current = 0;
    overdriveUntilRef.current = 0;
    setResultMeta({ newBest: false, previousBest: 0, fullCombo: false });
  }, [track, difficulty]);

  const startGame = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    resetGame();
    const wantedSource = new URL(track.audio, window.location.href).href;
    if (audio.src !== wantedSource) audio.src = wantedSource;
    audio.currentTime = 0;
    audio.volume = 0.88;
    countdownTimersRef.current.forEach(clearTimeout);
    countdownTimersRef.current = [];
    try {
      await audio.play();
      setCountdown("3");
      phaseRef.current = "countdown";
      setPhase("countdown");
      countdownTimersRef.current = [
        setTimeout(() => setCountdown("2"), 850),
        setTimeout(() => setCountdown("1"), 1700),
        setTimeout(() => setCountdown("GO"), 2550),
        setTimeout(() => {
          phaseRef.current = "playing";
          setPhase("playing");
        }, 3000),
      ];
    } catch {
      phaseRef.current = "ready";
      setPhase("ready");
    }
  }, [resetGame, track]);

  const openTrackSelect = useCallback(() => {
    countdownTimersRef.current.forEach(clearTimeout);
    countdownTimersRef.current = [];
    audioRef.current?.pause();
    phaseRef.current = "select";
    setPhase("select");
  }, []);

  const togglePause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (phaseRef.current === "playing") {
      audio.pause();
      phaseRef.current = "paused";
      setPhase("paused");
    } else if (phaseRef.current === "paused") {
      try {
        await audio.play();
        phaseRef.current = "playing";
        setPhase("playing");
      } catch {
        phaseRef.current = "paused";
        setPhase("paused");
      }
    }
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      // Physical key codes keep controls working with Korean and other IMEs.
      const lane = KEY_CODES.indexOf(event.code);
      if (lane >= 0) {
        event.preventDefault();
        heldLanesRef.current[lane] = true;
        hitLane(lane);
      }
      if (event.key === "Escape") togglePause();
      if (event.code === "Space" && phaseRef.current === "paused") togglePause();
    };
    const up = (event: KeyboardEvent) => {
      const lane = KEY_CODES.indexOf(event.code);
      if (lane >= 0) releaseLane(lane);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [hitLane, releaseLane, togglePause]);

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
      const activeTrack = selectionRef.current.track;
      const activeDifficulty = selectionRef.current.difficulty;
      const beat = 60 / activeTrack.bpm;
      const width = canvas.width;
      const height = canvas.height;
      const laneWidth = width / 4;
      const hitY = height - Math.max(92, height * 0.13);
      const isOverdrive = currentTime < overdriveUntilRef.current;

      if (phaseRef.current === "playing") {
        for (const note of notesRef.current) {
          if (note.kind === "hold" && note.started && !note.hit && !note.missed) {
            if (currentTime >= note.time + note.duration) {
              note.started = false;
              note.hit = true;
              awardNote(note.lane, note.startJudge ?? "GOOD", currentTime, note.startTiming ?? "JUST", "HOLD");
            } else if (!heldLanesRef.current[note.lane]) {
              note.started = false;
              note.missed = true;
              registerMiss(note.lane, currentTime, "BREAK");
            }
          } else if (!note.hit && !note.missed && currentTime - note.time > 0.15) {
            note.missed = true;
            registerMiss(note.lane, currentTime);
            if (phaseRef.current === "gameover") break;
          }
          if (note.time > currentTime + TRAVEL_TIME) break;
        }

        if (phaseRef.current === "gameover") {
          animation = requestAnimationFrame(draw);
          return;
        }

        const current = statsRef.current;
        let nextSync = current.sync;
        if (isOverdrive) nextSync = Math.max(0, current.sync - dt * 12.5);
        else if (overdriveUntilRef.current > 0) {
          nextSync = 0;
          overdriveUntilRef.current = 0;
        }
        statsRef.current = {
          ...current,
          sync: nextSync,
          progress: Math.min(1, currentTime / activeTrack.duration),
          overdrive: isOverdrive,
        };

        if (audio?.ended || currentTime >= activeTrack.duration - 0.05) {
          audio?.pause();
          phaseRef.current = "results";
          const finalStats = { ...statsRef.current, progress: 1 };
          const finalAccuracy = getAccuracy(finalStats);
          const recordKey = `${activeTrack.id}:${activeDifficulty}`;
          const previousRecord = recordsRef.current[recordKey];
          const fullCombo = finalStats.miss === 0;
          const newBest = !previousRecord || finalStats.score > previousRecord.score;
          setResultMeta({ newBest, previousBest: previousRecord?.score ?? 0, fullCombo });
          setStats(finalStats);
          setRecords((previousRecords) => {
            const storedRecord = previousRecords[recordKey];
            if (storedRecord && storedRecord.score >= finalStats.score) {
              if (fullCombo && !storedRecord.fullCombo) {
                const upgraded = { ...previousRecords, [recordKey]: { ...storedRecord, fullCombo: true } };
                window.localStorage.setItem("neon-records-v1", JSON.stringify(upgraded));
                return upgraded;
              }
              return previousRecords;
            }
            const nextRecords = {
              ...previousRecords,
              [recordKey]: {
                score: finalStats.score,
                accuracy: finalAccuracy,
                grade: getGrade(finalAccuracy),
                maxCombo: finalStats.maxCombo,
                fullCombo,
              },
            };
            window.localStorage.setItem("neon-records-v1", JSON.stringify(nextRecords));
            return nextRecords;
          });
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

      const beatPhase = ((currentTime - activeTrack.gridOffset) % beat + beat) % beat;
      for (let i = -1; i < Math.ceil(TRAVEL_TIME / beat) + 2; i += 1) {
        const secondsAhead = i * beat - beatPhase;
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
        const endRelative = note.time + note.duration - currentTime;
        if (relative > TRAVEL_TIME || (note.kind === "tap" ? relative < -0.16 : endRelative < -0.16)) continue;
        const x = note.lane * laneWidth + laneWidth * 0.12;
        const w = laneWidth * 0.76;
        const h = Math.max(12, height * 0.018);
        ctx.shadowColor = COLORS[note.lane];
        ctx.shadowBlur = isOverdrive ? 30 : 18;
        if (note.kind === "hold") {
          const headY = note.started ? hitY : hitY - (relative / TRAVEL_TIME) * hitY;
          const tailY = hitY - (endRelative / TRAVEL_TIME) * hitY;
          const bodyTop = Math.max(-h, Math.min(headY, tailY));
          const bodyBottom = Math.min(hitY, Math.max(headY, tailY));
          ctx.globalAlpha = note.started ? 0.95 : 0.7;
          ctx.fillStyle = COLORS[note.lane];
          ctx.fillRect(x + w * 0.32, bodyTop, w * 0.36, Math.max(h, bodyBottom - bodyTop));
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(255,255,255,.92)";
          ctx.fillRect(x + w * 0.2, tailY - h * 0.45, w * 0.6, h * 0.9);
          ctx.fillStyle = COLORS[note.lane];
          ctx.fillRect(x, headY - h / 2, w, h);
          ctx.fillStyle = "rgba(4,10,20,.86)";
          ctx.font = `800 ${Math.max(9, height * 0.012)}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("HOLD", x + w / 2, headY);
          ctx.shadowBlur = 0;
          continue;
        }
        const y = hitY - (relative / TRAVEL_TIME) * hitY;
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
        const pressed = heldLanesRef.current[lane] || now < pressedUntilRef.current[lane];
        ctx.beginPath();
        ctx.arc(cx, hitY, Math.min(pressed ? 29 : 24, laneWidth * 0.19), 0, Math.PI * 2);
        ctx.fillStyle = pressed ? COLORS[lane] : "#060916";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLORS[lane];
        ctx.shadowColor = COLORS[lane];
        ctx.shadowBlur = pressed ? 28 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = pressed ? "#06101a" : "rgba(255,255,255,.82)";
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

      for (const feedback of feedbacksRef.current) {
        const age = currentTime - feedback.at;
        if (age < 0.62) {
          const strength = 1 - age / 0.62;
          const size = feedback.judge === "PERFECT" ? 48 : feedback.judge === "GREAT" ? 40 : 32;
          ctx.save();
          ctx.translate(laneWidth * (feedback.lane + 0.5), height * 0.61);
          ctx.scale(1 + strength * 0.18, 1 + strength * 0.18);
          ctx.globalAlpha = Math.min(1, strength * 2.5);
          ctx.font = `900 ${Math.max(28, size * (height / 800))}px Arial Black, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = feedback.judge === "MISS" || feedback.judge === "EMPTY" || feedback.judge === "BREAK" ? "#ff365f" : feedback.judge === "GOOD" ? "#ffb84d" : "#ffffff";
          ctx.shadowColor = feedback.judge === "PERFECT" ? "#36f1ff" : COLORS[feedback.lane];
          ctx.shadowBlur = feedback.judge === "PERFECT" ? 36 : 22;
          ctx.fillText(feedback.judge, 0, 0);
          if (feedback.timing && feedback.timing !== "JUST") {
            ctx.shadowBlur = 0;
            ctx.font = `800 ${Math.max(10, height * 0.016)}px ui-monospace, monospace`;
            ctx.fillStyle = feedback.timing === "EARLY" ? "#9aa9ff" : "#ff9edc";
            ctx.fillText(feedback.timing, 0, Math.max(22, height * 0.038));
          }
          ctx.restore();
        }
      }
      feedbacksRef.current = feedbacksRef.current.filter((feedback) => currentTime - feedback.at < 0.62);

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
  }, [awardNote, registerMiss]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const lane = Math.max(0, Math.min(3, Math.floor(((event.clientX - rect.left) / rect.width) * 4)));
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerLanesRef.current.set(event.pointerId, lane);
    heldLanesRef.current[lane] = true;
    hitLane(lane);
  };

  const handlePointerRelease = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const lane = pointerLanesRef.current.get(event.pointerId);
    if (lane === undefined) return;
    pointerLanesRef.current.delete(event.pointerId);
    releaseLane(lane);
  };

  const accuracy = getAccuracy(stats);
  const currentTime = stats.progress * track.duration;
  const activeRecord = records[`${track.id}:${difficulty}`];

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
        <button
          className="icon-button"
          onClick={phase === "playing" || phase === "paused" ? togglePause : openTrackSelect}
          disabled={phase === "select"}
          aria-label={phase === "paused" ? "게임 계속하기" : phase === "playing" ? "일시 정지" : "곡 선택"}
        >
          {phase === "paused" ? "▶" : phase === "playing" ? "Ⅱ" : "≡"}
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
          <div className="sync-track" role="progressbar" aria-label="오버드라이브 충전량" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats.sync)}><i style={{ width: `${stats.sync}%` }} /></div>
          <div className={`integrity-label ${stats.integrity <= 30 ? "critical" : ""}`}>
            <span>CORE INTEGRITY</span>
            <b>{Math.ceil(stats.integrity)}%</b>
          </div>
          <div className="integrity-track" role="progressbar" aria-label="코어 체력" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.ceil(stats.integrity)}>
            <i style={{ width: `${stats.integrity}%` }} />
          </div>
        </div>
        <div className="combo-block">
          <strong>{stats.combo}</strong>
          <span>COMBO</span>
        </div>
      </section>

      <section className="playfield-wrap">
        <div className="song-rail">
          <span>{formatTime(currentTime)}</span>
          <div role="progressbar" aria-label="곡 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats.progress * 100)}><i style={{ width: `${stats.progress * 100}%` }} /></div>
          <span>{formatTime(track.duration)}</span>
        </div>

        <div className="playfield-frame">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerRelease}
            onPointerCancel={handlePointerRelease}
            aria-label="4레인 리듬 게임 플레이 영역. 긴 노트는 끝까지 누르세요."
          />
          {phase === "select" && (
            <div className="overlay select-panel" role="dialog" aria-modal="true" aria-labelledby="track-select-title">
              <div className="select-heading">
                <div>
                  <p className="mission-code">SIGNAL LIBRARY // 03 TRACKS</p>
                  <h2 id="track-select-title">Choose your signal.</h2>
                </div>
                <p>곡과 난이도를 선택해 프로토콜을 시작하세요.</p>
              </div>
              <div className="track-grid">
                {TRACKS.map((item, index) => {
                  const itemRecord = records[`${item.id}:${difficulty}`];
                  const selected = item.id === track.id;
                  return (
                    <button
                      key={item.id}
                      className={`track-card ${selected ? "selected" : ""}`}
                      style={{ "--track-accent": item.accent } as CSSProperties}
                      onClick={() => setSelectedTrackId(item.id)}
                      aria-pressed={selected}
                    >
                      <span className="track-index">0{index + 1}</span>
                      <span className="track-wave"><i /><i /><i /><i /><i /><i /></span>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                      <span className="track-meta"><b>{item.bpm.toFixed(2)}</b> BPM · {formatTime(item.duration)}</span>
                      <span className="track-record">{itemRecord ? `${itemRecord.grade} · ${itemRecord.score.toLocaleString()}` : "NO RECORD"}</span>
                    </button>
                  );
                })}
              </div>
              <div className="difficulty-picker">
                <span>DIFFICULTY</span>
                <div>
                  {DIFFICULTIES.map((item) => (
                    <button key={item} className={difficulty === item ? "active" : ""} onClick={() => setDifficulty(item)} aria-pressed={difficulty === item}>
                      {item} <b>LV.{track.levels[item]}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div className="quick-settings" aria-label="게임 설정">
                <button
                  aria-pressed={sfxEnabled}
                  onClick={() => {
                    const next = !sfxEnabled;
                    setSfxEnabled(next);
                    saveSettings({ sfx: next, reducedFx, vibration: vibrationEnabled });
                  }}
                >HIT SFX {sfxEnabled ? "ON" : "OFF"}</button>
                <button
                  aria-pressed={reducedFx}
                  onClick={() => {
                    const next = !reducedFx;
                    setReducedFx(next);
                    saveSettings({ sfx: sfxEnabled, reducedFx: next, vibration: vibrationEnabled });
                  }}
                >REDUCED FX {reducedFx ? "ON" : "OFF"}</button>
                <button
                  aria-pressed={vibrationEnabled}
                  onClick={() => {
                    const next = !vibrationEnabled;
                    setVibrationEnabled(next);
                    saveSettings({ sfx: sfxEnabled, reducedFx, vibration: next });
                  }}
                >VIBRATION {vibrationEnabled ? "ON" : "OFF"}</button>
              </div>
              <div className="select-action">
                <p>{activeRecord ? `BEST ${activeRecord.score.toLocaleString()} · ${activeRecord.accuracy.toFixed(2)}%` : "새로운 신호가 기다리고 있습니다."}</p>
                <button className="primary-button" onClick={() => { phaseRef.current = "ready"; setPhase("ready"); }}>
                  LOCK IN TRACK <b>↗</b>
                </button>
              </div>
            </div>
          )}
          {phase === "ready" && (
            <div className="overlay ready-panel" role="dialog" aria-modal="true" aria-labelledby="ready-title">
              <p className="mission-code">{track.protocol} · {difficulty} LV.{track.levels[difficulty]}</p>
              <h2 id="ready-title">{track.title}</h2>
              <p>신호가 판정선에 닿는 순간 탭하세요.<br />길게 이어진 노트는 끝부분까지 누르고 있어야 합니다.</p>
              <div className="track-spec">
                <span>{track.bpm.toFixed(2)} BPM</span><span>4 LANES</span><span>{chartSize} NOTES</span>
              </div>
              <button className="primary-button" onClick={startGame}>START PROTOCOL <b>↗</b></button>
              <button className="text-button" onClick={openTrackSelect}>다른 곡 선택</button>
              <small>키보드 D F J K · 모바일 화면 터치</small>
            </div>
          )}

          {phase === "countdown" && (
            <div className="overlay countdown-panel" role="status" aria-live="assertive">
              <p className="mission-code">SYNCING INPUT</p>
              <strong>{countdown}</strong>
            </div>
          )}

          {phase === "paused" && (
            <div className="overlay pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <p className="mission-code">SYSTEM SUSPENDED</p>
              <h2 id="pause-title">PAUSED</h2>
              <button className="primary-button" onClick={togglePause}>RESUME <b>▶</b></button>
              <button className="text-button" onClick={startGame}>처음부터 다시 시작</button>
              <button className="text-button" onClick={openTrackSelect}>곡 선택으로 나가기</button>
            </div>
          )}

          {phase === "gameover" && (
            <div className="overlay gameover-panel" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
              <p className="mission-code">CORE SIGNAL LOST</p>
              <h2 id="gameover-title">GAME OVER</h2>
              <p>{Math.round(stats.progress * 100)}% 지점에서 코어가 붕괴했습니다.<br />MISS를 줄이고 빈 레인 탭을 피하세요.</p>
              <p className="gameover-score">{stats.score.toLocaleString()} <small>SCORE</small></p>
              <button className="primary-button" onClick={startGame}>RETRY PROTOCOL <b>↻</b></button>
              <button className="text-button" onClick={openTrackSelect}>곡 선택으로 돌아가기</button>
            </div>
          )}

          {phase === "results" && (
            <div className="overlay result-panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
              <div className="grade">{getGrade(accuracy)}</div>
              <div className="result-copy">
                <p className="mission-code">PROTOCOL COMPLETE</p>
                <h2 id="result-title">{accuracy.toFixed(2)}% SYNCED</h2>
                <div className="result-badges">
                  {resultMeta.newBest && <span>NEW BEST</span>}
                  {resultMeta.fullCombo && <span>FULL COMBO</span>}
                </div>
                <p className="result-score">{stats.score.toLocaleString()} <small>SCORE</small></p>
                <div className="judge-grid">
                  <span>PERFECT <b>{stats.perfect}</b></span>
                  <span>GREAT <b>{stats.great}</b></span>
                  <span>GOOD <b>{stats.good}</b></span>
                  <span>MISS <b>{stats.miss}</b></span>
                </div>
                <p className="max-combo">MAX COMBO <b>{stats.maxCombo}</b></p>
                <button className="primary-button" onClick={startGame}>RETRY PROTOCOL <b>↻</b></button>
                <button className="text-button" onClick={openTrackSelect}>곡 선택으로 돌아가기</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="sr-only" aria-live="polite">
        {phase === "playing" ? `${stats.combo} 콤보, 코어 체력 ${Math.ceil(stats.integrity)} 퍼센트` : phase === "gameover" ? "게임 오버" : phase === "results" ? `플레이 완료, 정확도 ${accuracy.toFixed(2)} 퍼센트` : ""}
      </p>

      <footer className="control-strip">
        <div>
          <span className="status-light" />
          <p><b>{track.title}</b><small>Original Lyria generation · {difficulty}</small></p>
        </div>
        <div className="latency-control">
          <span title="노트보다 입력이 늦게 판정되면 값을 올리고, 빠르게 판정되면 내리세요.">INPUT OFFSET</span>
          <button onClick={() => updateOffset(offsetMs - 10)} aria-label="입력 오프셋 10밀리초 감소">−</button>
          <b>{offsetMs > 0 ? "+" : ""}{offsetMs}ms</b>
          <button onClick={() => updateOffset(offsetMs + 10)} aria-label="입력 오프셋 10밀리초 증가">＋</button>
        </div>
      </footer>
    </main>
  );
}
