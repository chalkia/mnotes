/* =========================================
   sample-kit-data.js
   Embedded WAV sample kit for Eastern Sample
   ========================================= */

(function (global) {
  "use strict";

  const SAMPLE_RATE = 22050;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function envExp(t, attack, decay) {
    if (t < 0) return 0;
    if (t < attack) return t / Math.max(attack, 1e-6);
    return Math.exp(-(t - attack) / Math.max(decay, 1e-6));
  }

  function makeWavDataUri(durationSec, renderSample) {
    const sampleCount = Math.max(1, Math.floor(SAMPLE_RATE * durationSec));
    const pcm16 = new Int16Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / SAMPLE_RATE;
      const v = clamp(renderSample(t, i, sampleCount) || 0, -1, 1);
      pcm16[i] = Math.round(v * 32767);
    }

    const dataSize = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) {
      view.setInt16(offset, pcm16[i], true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    return "data:audio/wav;base64," + btoa(binary);
  }

  function makeNoise(seed = 1) {
    let x = seed >>> 0;
    return function () {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) / 4294967295) * 2 - 1;
    };
  }

  function makeDum(variant = 0) {
    const base = variant === 0 ? 96 : 88;
    return makeWavDataUri(0.28, (t) => {
      const e = envExp(t, 0.002, 0.12);
      const pitchDrop = Math.exp(-t * 18);
      const f1 = base * (0.72 + 0.55 * pitchDrop);
      const f2 = f1 * 1.55;
      const body =
        Math.sin(2 * Math.PI * f1 * t) * 0.82 +
        Math.sin(2 * Math.PI * f2 * t) * 0.18;
      return body * e * 0.9;
    });
  }

  function makeLow(variant = 0) {
    const base = variant === 0 ? 150 : 165;
    const noise = makeNoise(11 + variant);
    return makeWavDataUri(0.20, (t) => {
      const e = envExp(t, 0.001, 0.08);
      const tone = Math.sin(2 * Math.PI * base * t) * 0.55;
      const click = noise() * Math.exp(-t * 90) * 0.18;
      return (tone + click) * e;
    });
  }

  function makeMid(variant = 0) {
    const base = variant === 0 ? 430 : 520;
    const noise = makeNoise(21 + variant);
    return makeWavDataUri(0.13, (t) => {
      const e = envExp(t, 0.001, 0.055);
      const band =
        Math.sin(2 * Math.PI * base * t) * 0.28 +
        Math.sin(2 * Math.PI * (base * 1.8) * t) * 0.12;
      const noisy = noise() * Math.exp(-t * 40) * 0.22;
      return (band + noisy) * e;
    });
  }

  function makeTek(variant = 0) {
    const base = variant === 0 ? 1950 : 2350;
    const noise = makeNoise(31 + variant);
    return makeWavDataUri(0.085, (t) => {
      const e = envExp(t, 0.0005, 0.022);
      const bright =
        Math.sin(2 * Math.PI * base * t) * 0.18 +
        Math.sin(2 * Math.PI * (base * 1.7) * t) * 0.10;
      const noisy = noise() * Math.exp(-t * 65) * 0.45;
      return (bright + noisy) * e;
    });
  }

  function makeClap(variant = 0) {
    const noise = makeNoise(41 + variant);
    return makeWavDataUri(0.16, (t) => {
      const burst1 = Math.exp(-Math.max(0, t - 0.000) * 65);
      const burst2 = Math.exp(-Math.max(0, t - 0.012) * 72);
      const burst3 = Math.exp(-Math.max(0, t - 0.024) * 76);
      const shape = burst1 * 0.65 + burst2 * 0.55 + burst3 * 0.45;
      return noise() * shape * 0.55;
    });
  }

  function makeShaker(variant = 0) {
    const noise = makeNoise(51 + variant);
    return makeWavDataUri(0.12, (t) => {
      const fast = Math.exp(-t * 36);
      const grain = (Math.sin(2 * Math.PI * (55 + variant * 8) * t) * 0.5 + 0.5);
      return noise() * fast * grain * 0.42;
    });
  }

  const easternSampleKit = {
    v1: [
      { data: makeDum(0), gain: 1.0, playbackRate: 1.0 },
      { data: makeDum(1), gain: 0.96, playbackRate: 0.98 }
    ],
    v2: [
      { data: makeLow(0), gain: 0.92, playbackRate: 1.0 },
      { data: makeLow(1), gain: 0.90, playbackRate: 1.02 }
    ],
    v3: [
      { data: makeMid(0), gain: 0.82, playbackRate: 1.0 },
      { data: makeMid(1), gain: 0.80, playbackRate: 0.99 }
    ],
    v4: [
      { data: makeTek(0), gain: 0.95, playbackRate: 1.0 },
      { data: makeTek(1), gain: 0.92, playbackRate: 1.03 }
    ],
    v5: [
      { data: makeClap(0), gain: 0.82, playbackRate: 1.0 },
      { data: makeClap(1), gain: 0.78, playbackRate: 1.02 }
    ],
    v6: [
      { data: makeShaker(0), gain: 0.72, playbackRate: 1.0 },
      { data: makeShaker(1), gain: 0.70, playbackRate: 1.04 }
    ]
  };

  global.SAMPLE_KIT_DATA = global.SAMPLE_KIT_DATA || {};
  global.SAMPLE_KIT_DATA.easternSampleKit = easternSampleKit;
})(window);
