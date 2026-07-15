// Procedural sound: no audio files, everything synthesized with Web Audio.
const Sfx = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  let lastRustle = 0;
  let brushSrc = null;
  let brushFilter = null;
  let brushGain = null;
  let ambGain = null;
  let ambLfoGain = null;
  let beeOsc = null;
  let beeGain = null;
  let beePan = null;
  const AMB_LEVEL = 0.022;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new AudioContext();
      } catch (e) {
        return;
      }
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      // Always-running rustle layer; brush() ducks its gain up with swipe speed.
      brushFilter = ctx.createBiquadFilter();
      brushFilter.type = 'bandpass';
      brushFilter.frequency.value = 1300;
      brushFilter.Q.value = 0.6;
      brushGain = ctx.createGain();
      brushGain.gain.value = 0;
      brushSrc = ctx.createBufferSource();
      brushSrc.buffer = noiseBuf;
      brushSrc.loop = true;
      brushSrc.playbackRate.value = 0.85;
      brushSrc.connect(brushFilter).connect(brushGain).connect(master);
      brushSrc.start();

      // bee buzz: low sawtooth with a ~25Hz wing-beat tremolo, panned to
      // follow the bee across the lawn. Silent until beeBuzz() opens it.
      beeGain = ctx.createGain();
      beeGain.gain.value = 0;
      const beeFilter = ctx.createBiquadFilter();
      beeFilter.type = 'lowpass';
      beeFilter.frequency.value = 900;
      beeOsc = ctx.createOscillator();
      beeOsc.type = 'sawtooth';
      beeOsc.frequency.value = 175;
      const am = ctx.createGain();
      am.gain.value = 0.65;
      const wing = ctx.createOscillator();
      wing.type = 'sine';
      wing.frequency.value = 25;
      const wingDepth = ctx.createGain();
      wingDepth.gain.value = 0.35;
      wing.connect(wingDepth).connect(am.gain);
      beeOsc.connect(am).connect(beeFilter).connect(beeGain);
      beePan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (beePan) {
        beeGain.connect(beePan).connect(master);
      } else {
        beeGain.connect(master);
      }
      beeOsc.start();
      wing.start();

      startAmbience();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  // Background ambience: a low wind bed that swells and fades on a slow LFO.
  function startAmbience() {
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;
    ambGain = ctx.createGain();
    ambGain.gain.value = 0;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.4;
    windSrc.connect(windFilter).connect(ambGain).connect(master);
    windSrc.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06; // one gust every ~16s
    ambLfoGain = ctx.createGain();
    ambLfoGain.gain.value = 0.011;
    lfo.connect(ambLfoGain).connect(ambGain.gain);
    lfo.start();

    if (enabled) ambGain.gain.setTargetAtTime(AMB_LEVEL, ctx.currentTime, 2);
  }

  function ready() {
    return enabled && ctx && ctx.state === 'running';
  }

  // Continuous rustle tied to swipe speed. Call every frame while brushing;
  // gain swells in ~25ms and falls away ~120ms after calls stop.
  function brush(intensity) {
    if (!ready() || !brushGain) return;
    const t = ctx.currentTime;
    const g = Math.min(1, intensity) * 0.16;
    brushGain.gain.cancelScheduledValues(t);
    brushGain.gain.setTargetAtTime(g, t, 0.025);
    brushGain.gain.setTargetAtTime(0.0001, t + 0.08, 0.12);
    brushFilter.frequency.setTargetAtTime(750 + Math.random() * 900, t, 0.06);
    brushSrc.playbackRate.setTargetAtTime(0.7 + Math.random() * 0.5, t, 0.1);
  }

  // Call every frame with the bee's presence (0-1) and screen position (-1..1).
  function beeBuzz(level, pan) {
    if (!ctx || !beeGain) return;
    const t = ctx.currentTime;
    const g = enabled && ctx.state === 'running' ? Math.min(1, level) * 0.02 : 0;
    beeGain.gain.setTargetAtTime(g, t, 0.15);
    if (beePan) beePan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.15);
    beeOsc.frequency.setTargetAtTime(165 + Math.random() * 25, t, 0.3); // lazy pitch wander
  }

  // Single soft swish — used for pressing into the grass.
  function rustle(intensity) {
    if (!ready()) return;
    const now = performance.now();
    if (now - lastRustle < 60) return;
    lastRustle = now;

    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.4;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500 + Math.random() * 1200;
    filter.Q.value = 0.55;

    const gain = ctx.createGain();
    const peak = Math.min(1, Math.max(0.1, intensity)) * 0.18;
    const dur = 0.09 + Math.random() * 0.08;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  // Cheerful two-note blip for a finished mow.
  function ding() {
    if (!ready()) return;
    const t = ctx.currentTime;
    [[523.25, 0], [783.99, 0.09]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.12, t + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
      osc.connect(gain).connect(master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.4);
    });
  }

  // Soft pop for bursting a daisy.
  function pop() {
    if (!ready()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.11);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Airy swell for dandelion seeds blowing away.
  function whoosh() {
    if (!ready()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.5;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random() * 0.4, 0.6);
  }

  function setEnabled(on) {
    enabled = on;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!on && brushGain) {
      brushGain.gain.cancelScheduledValues(t);
      brushGain.gain.setTargetAtTime(0, t, 0.02);
    }
    if (ambGain) {
      ambGain.gain.cancelScheduledValues(t);
      ambGain.gain.setTargetAtTime(on ? AMB_LEVEL : 0, t, 0.3);
      ambLfoGain.gain.setTargetAtTime(on ? 0.011 : 0, t, 0.3);
    }
    if (!on && beeGain) {
      beeGain.gain.cancelScheduledValues(t);
      beeGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  return { ensure, brush, beeBuzz, rustle, ding, pop, whoosh, setEnabled };
})();
