// Sound: a quiet, generated city soundscape. Off until you turn it on (iPhone needs a tap first).
// - a low warm hum, like the city through a window
// - now and then an el train rolls by: a swelling rumble with soft clacks over the rail joints
// - rain or wind when the weather says so; snow muffles everything
// - a few soft bell tones, tuned to the hour: a bright major chord by day, a hushed one at night
// - very rarely a far-off two-note horn, softened so it sounds like it's blocks away
const Sound = (() => {
  let ac = null, master = null, on = false;
  let hum = null, rain = null, wind = null, muffle = null;
  let st = { night: false, wx: null };
  const timers = [], bufs = {};

  function noiseBuffer(kind) {   // 4 seconds of looped noise; "brown" is deep, "white" is hiss (made once)
    if (bufs[kind]) return bufs[kind];
    const len = ac.sampleRate * 4, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return (bufs[kind] = b);
  }
  function loop(buf, filterType, freq, q, gain) {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(muffle); src.start();
    return { src, f, g };
  }
  const fade = (param, to, secs) => { const t = ac.currentTime; param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(to, t + secs); };

  // a train rolls past: rumble swells and fades over ~9 seconds, with clacks over the joints
  function trainBy() {
    if (!on) return;
    const t = ac.currentTime, dur = 9;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer("brown");
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 140;
    const g = ac.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    f.frequency.setValueAtTime(90, t); f.frequency.linearRampToValueAtTime(260, t + dur * 0.45); f.frequency.linearRampToValueAtTime(90, t + dur);
    src.connect(f).connect(g).connect(muffle); src.start(t); src.stop(t + dur + 0.1);
    const low = ac.createOscillator(), lg = ac.createGain(); low.frequency.value = 46;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0.10, t + dur * 0.45); lg.gain.linearRampToValueAtTime(0, t + dur);
    low.connect(lg).connect(muffle); low.start(t); low.stop(t + dur + 0.1);
    // clack-clack, clack-clack: pairs of soft thuds, loudest as it passes
    for (let k = 0; k < 14; k++) {
      const at = t + 1.2 + k * 0.5 + (k % 2 ? 0.12 : 0), near = 1 - Math.abs((at - t) / dur - 0.45) * 2;
      if (near <= 0) continue;
      const b = ac.createBufferSource(); b.buffer = noiseBuffer("white");
      const bf = ac.createBiquadFilter(); bf.type = "bandpass"; bf.frequency.value = 900; bf.Q.value = 3;
      const bg = ac.createGain(); bg.gain.setValueAtTime(0.0001, at); bg.gain.exponentialRampToValueAtTime(0.06 * near, at + 0.005); bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      b.connect(bf).connect(bg).connect(muffle); b.start(at, Math.random() * 3); b.stop(at + 0.12);
    }
  }

  // soft bells: three notes of a chord, spaced out, lots of air between them
  const DAY = [261.63, 329.63, 392.0, 440.0, 523.25];          // C E G A C: open, sunny
  const NIGHT = [196.0, 246.94, 293.66, 369.99, 440.0];        // G B D F# A: hushed, a little starry
  function bells() {
    if (!on) return;
    const set = st.night ? NIGHT : DAY, t = ac.currentTime;
    for (let k = 0; k < 3; k++) {
      const f = set[Math.floor(Math.random() * set.length)], at = t + k * (1.1 + Math.random() * 0.9);
      [[1, 0.05], [2.01, 0.012], [3.0, 0.006]].forEach(([m, v]) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f * m;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 4.5);
        o.connect(g).connect(muffle); o.start(at); o.stop(at + 4.6);
      });
    }
  }

  // a horn, blocks away: two soft notes through a low filter
  function horn() {
    if (!on || st.night) return;
    const t = ac.currentTime, f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700; f.connect(muffle);
    [[392, 0, 0.22], [392, 0.32, 0.4]].forEach(([fr, at, len]) => {
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
      o.type = "sawtooth"; o2.type = "sawtooth"; o.frequency.value = fr; o2.frequency.value = fr * 1.26;   // a major-third honk
      g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(0.012, t + at + 0.03); g.gain.setValueAtTime(0.012, t + at + len); g.gain.linearRampToValueAtTime(0, t + at + len + 0.08);
      o.connect(g); o2.connect(g); g.connect(f); o.start(t + at); o2.start(t + at); o.stop(t + at + len + 0.1); o2.stop(t + at + len + 0.1);
    });
  }

  function every(fn, a, b) {   // run fn at random intervals between a and b seconds
    const go = () => { fn(); timers.push(setTimeout(go, (a + Math.random() * (b - a)) * 1000)); };
    timers.push(setTimeout(go, (a * 0.3 + Math.random() * a * 0.4) * 1000));
  }

  function applyWeather() {
    if (!on) return;
    const k = st.wx?.kind;
    fade(rain.g.gain, k === "rain" || k === "storm" ? (st.wx.heavy || k === "storm" ? 0.16 : 0.09) : 0, 3);
    fade(wind.g.gain, (st.wx?.wind ?? 0) >= 18 ? 0.07 : 0.0, 4);
    fade(muffle.frequency, k === "snow" ? 900 : 12000, 3);   // snow hushes the city
    fade(hum.g.gain, st.night ? 0.11 : 0.15, 4);
  }

  return {
    start() {
      if (on) return;
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      ac.resume();
      master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      muffle = ac.createBiquadFilter(); muffle.type = "lowpass"; muffle.frequency.value = 12000; muffle.connect(master);
      const brown = noiseBuffer("brown"), white = noiseBuffer("white");
      hum = loop(brown, "lowpass", 220, 0.5, 0.15);
      rain = loop(white, "highpass", 2500, 0.3, 0);
      wind = loop(brown, "bandpass", 500, 0.6, 0);
      on = true;
      fade(master.gain, 0.6, 2.5);
      st.applied = false; applyWeather();
      every(trainBy, 45, 110);
      every(bells, 25, 60);
      every(horn, 150, 400);
    },
    stop() {
      if (!on) return;
      on = false;
      timers.splice(0).forEach(clearTimeout);
      fade(master.gain, 0, 1.2);
      const old = [hum, rain, wind];
      setTimeout(() => old.forEach(n => { try { n.src.stop(); } catch (e) {} }), 1400);
    },
    pause(hidden) { if (ac && on) hidden ? ac.suspend() : ac.resume(); },
    set(s) {   // only re-fade when something actually changed (render calls this every second)
      const key = o => JSON.stringify([o.night, o.wx?.kind, o.wx?.heavy, (o.wx?.wind ?? 0) >= 18]);
      const before = key(st); st = { ...st, ...s };
      if (key(st) !== before || !st.applied) { st.applied = true; applyWeather(); }
    },
    get on() { return on; },
    trainBy() { if (on) trainBy(); },
  };
})();
