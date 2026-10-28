import { describe, expect, it } from "vitest";
import { HUM, RECIPES, VIBRATION, cueDurationMs, renderCue, renderHum } from "@/lib/warmup/sounds";
import type { CueKind } from "@/lib/warmup/timelineTypes";

type Event = { op: "set" | "linear" | "exp" | "target"; value: number; time: number };

class FakeParam {
  value = 0;
  events: Event[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ op: "set", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ op: "linear", value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError("exponential ramp to non-positive value");
    this.events.push({ op: "exp", value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push({ op: "target", value, time });
    return this;
  }
}

class FakeNode {
  outputs: FakeNode[] = [];
  constructor(public kind: string) {}
  connect(n: FakeNode) {
    this.outputs.push(n);
    return n;
  }
  disconnect() {
    this.outputs = [];
  }
}

class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  type = "sine";
  frequency = new FakeParam();
  buffer: unknown = null;
  start(t = 0) {
    this.startAt = t;
  }
  stop(t = 0) {
    this.stopAt = t;
  }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode("destination");
  nodes: FakeNode[] = [];
  private track<T extends FakeNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  createOscillator() {
    return this.track(new FakeSource("osc"));
  }
  createBufferSource() {
    return this.track(new FakeSource("buffer"));
  }
  createGain() {
    return this.track(Object.assign(new FakeNode("gain"), { gain: new FakeParam() }));
  }
  createBiquadFilter() {
    return this.track(
      Object.assign(new FakeNode("biquad"), { type: "lowpass", frequency: new FakeParam(), Q: new FakeParam() }),
    );
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  count(kind: string) {
    return this.nodes.filter((n) => n.kind === kind).length;
  }
  sources() {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }
  gains() {
    return this.nodes.filter((n) => n.kind === "gain") as (FakeNode & { gain: FakeParam })[];
  }
}

const KINDS: CueKind[] = ["campana", "tic", "cuenco", "doble"];

function render(kind: CueKind, when = 1, scale = 1) {
  const ctx = new FakeContext();
  const bus = ctx.createGain();
  ctx.nodes = []; // count only what renderCue creates
  renderCue(ctx as unknown as BaseAudioContext, kind, when, bus as unknown as GainNode, scale);
  return { ctx, bus };
}

describe("warm-up cue synthesis", () => {
  it("creates the expected nodes per cue", () => {
    const campana = render("campana").ctx;
    expect(campana.count("osc")).toBe(4);
    expect(campana.count("gain")).toBe(4);
    expect(campana.count("biquad")).toBe(1);

    const tic = render("tic").ctx;
    expect(tic.count("osc")).toBe(1);
    expect(tic.count("buffer")).toBe(1);
    expect(tic.count("biquad")).toBe(1); // bandpass on the noise
    expect(tic.count("gain")).toBe(2);

    const cuenco = render("cuenco").ctx;
    expect(cuenco.count("osc")).toBe(4);
    expect(cuenco.count("gain")).toBe(4);
    expect(cuenco.count("biquad")).toBe(0);

    const doble = render("doble").ctx;
    expect(doble.count("osc")).toBe(8);
    expect(doble.count("biquad")).toBe(2);
  });

  it("stops every source it starts, after its start", () => {
    for (const kind of KINDS) {
      const { ctx } = render(kind);
      for (const s of ctx.sources()) {
        expect(s.startAt, kind).not.toBeNull();
        expect(s.stopAt, kind).not.toBeNull();
        expect(s.stopAt!).toBeGreaterThan(s.startAt!);
      }
    }
  });

  it("orders each envelope: 0 at when, linear to peak, exponential to the floor", () => {
    for (const kind of KINDS) {
      const { ctx } = render(kind, 2);
      for (const g of ctx.gains()) {
        const [a, b, c] = g.gain.events;
        expect(g.gain.events).toHaveLength(3);
        expect(a).toMatchObject({ op: "set", value: 0 });
        expect(b.op).toBe("linear");
        expect(c).toMatchObject({ op: "exp", value: 0.0001 });
        expect(a.time).toBeGreaterThanOrEqual(2);
        expect(b.time).toBeGreaterThan(a.time);
        expect(c.time).toBeGreaterThan(b.time);
        expect(b.value).toBeGreaterThan(0);
      }
    }
  });

  it("uses the recipe peaks and attack times", () => {
    const campana = render("campana", 1).ctx.gains();
    expect(campana[0].gain.events[1].value).toBeCloseTo(0.22);
    expect(campana[0].gain.events[1].time).toBeCloseTo(1.008);
    expect(campana[0].gain.events[2].time).toBeCloseTo(1.008 + 2.5);
    expect(campana[1].gain.events[1].value).toBeCloseTo(0.22 * 0.3);

    const tic = render("tic", 1);
    const [toneGain, noiseGain] = tic.ctx.gains();
    expect(toneGain.gain.events[1]).toMatchObject({ time: expect.closeTo(1.002) as number, value: expect.closeTo(0.16) as number });
    expect(toneGain.gain.events[2].time).toBeCloseTo(1.072);
    expect(noiseGain.gain.events[1].value).toBeCloseTo(0.06);
    const osc = tic.ctx.sources().find((s) => s.kind === "osc")!;
    expect(osc.type).toBe("triangle");
    expect(osc.frequency.events).toEqual([
      { op: "set", value: 520, time: 1 },
      { op: "exp", value: 420, time: expect.closeTo(1.04) as number },
    ]);

    const doble = render("doble", 1).ctx;
    const starts = [...new Set(doble.sources().map((s) => s.startAt))];
    expect(starts).toEqual([1, 1.6]);
    const firstPeak = doble.gains()[0].gain.events[1].value;
    const secondPeak = doble.gains()[4].gain.events[1].value;
    expect(secondPeak / firstPeak).toBeCloseTo(0.8);
    expect(doble.gains()[0].gain.events[2].time - doble.gains()[0].gain.events[1].time).toBeCloseTo(2.0);
  });

  it("scales by gainScale and clamps past start times to currentTime", () => {
    const half = render("cuenco", 1, 0.5).ctx.gains();
    expect(half[0].gain.events[1].value).toBeCloseTo(0.125);

    const ctx = new FakeContext();
    ctx.currentTime = 5;
    renderCue(ctx as unknown as BaseAudioContext, "campana", 4.97, ctx.createGain() as unknown as GainNode);
    expect(ctx.sources().every((s) => s.startAt === 5)).toBe(true);
  });

  it("never throws, even on a broken context", () => {
    for (const kind of KINDS) {
      expect(() => render(kind)).not.toThrow();
      expect(() =>
        renderCue({ currentTime: 0 } as unknown as BaseAudioContext, kind, 0, {} as unknown as GainNode),
      ).not.toThrow();
    }
  });

  it("reports durations and vibration patterns for every cue", () => {
    expect(cueDurationMs("campana")).toBe(2508);
    expect(cueDurationMs("tic")).toBe(72);
    expect(cueDurationMs("cuenco")).toBe(5015);
    expect(cueDurationMs("doble")).toBe(600 + 8 + 2000);
    for (const kind of KINDS) {
      expect(RECIPES[kind].strikes.length).toBeGreaterThan(0);
      expect(VIBRATION[kind]).toBeDefined();
    }
    expect(VIBRATION).toEqual({ campana: 30, tic: [12, 60, 12], cuenco: 40, doble: [30, 120, 30] });
  });
});

describe("renderHum (continuous drone under a movement)", () => {
  it("builds four partials + LFO through a lowpass into an envelope that fades in and out inside the window", () => {
    const ctx = new FakeContext();
    const bus = ctx.createGain();
    ctx.nodes = [];
    renderHum(ctx as unknown as BaseAudioContext, 2, 17, bus as unknown as GainNode);
    expect(ctx.count("osc")).toBe(HUM.partials.length + 1); // + LFO
    expect(ctx.count("biquad")).toBe(1);
    // Every source stops just after the window.
    for (const src of ctx.sources()) {
      expect(src.startAt).toBe(2);
      expect(src.stopAt).toBeCloseTo(17.05, 5);
    }
    // Envelope: 0 at 2 → peak by 3.5 → peak until 15.8 → 0 at 17.
    const env = ctx.gains().find((g) => g.gain.events.some((e) => e.op === "linear" && e.value === HUM.peak))!;
    const ev = env.gain.events;
    expect(ev[0]).toEqual({ op: "set", value: 0, time: 2 });
    expect(ev[1]).toEqual({ op: "linear", value: HUM.peak, time: 3.5 });
    expect(ev[2]).toEqual({ op: "set", value: HUM.peak, time: 15.8 });
    expect(ev[3]).toEqual({ op: "linear", value: 0, time: 17 });
  });
  it("shortens the fades for short windows, skips windows in the past, and never throws", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 5;
    const bus = ctx.createGain();
    ctx.nodes = [];
    renderHum(ctx as unknown as BaseAudioContext, 1, 5.2, bus as unknown as GainNode); // 0.2 s left → skipped
    expect(ctx.nodes).toHaveLength(0);
    renderHum(ctx as unknown as BaseAudioContext, 1, 6.5, bus as unknown as GainNode); // clamps start to now
    const env = ctx.gains().find((g) => g.gain.events.some((e) => e.op === "linear" && e.value === HUM.peak))!;
    expect(env.gain.events[1].time).toBeCloseTo(5.5, 5); // fade-in = len/3
    expect(() => renderHum({ currentTime: 0 } as unknown as BaseAudioContext, 0, 10, {} as unknown as GainNode)).not.toThrow();
  });
});
