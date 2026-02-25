/**
 * audio-bar.js — floating audio toggle button for noVNC
 * Connects to the PulseAudio WebSocket stream (port 20006) and plays via Web Audio API.
 * Must be triggered by a user gesture due to browser autoplay policy.
 */
(function () {
  'use strict';

  var AUDIO_WS_PORT = 20006;
  var SAMPLE_RATE = 44100;
  var CHANNELS = 2;

  // ── Create floating button ──────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'audio-toggle-btn';
  btn.title = 'Toggle audio (PulseAudio stream)';
  btn.textContent = '🔇';
  btn.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:10px',
    'z-index:9999',
    'font-size:18px',
    'line-height:1',
    'padding:6px 8px',
    'border:none',
    'border-radius:6px',
    'background:rgba(0,0,0,0.55)',
    'color:#fff',
    'cursor:pointer',
    'user-select:none',
    'box-shadow:0 2px 6px rgba(0,0,0,0.4)',
    'transition:background 0.2s',
  ].join(';');

  document.body.appendChild(btn);

  // ── State ────────────────────────────────────────────────────────────
  var audioCtx = null;
  var ws = null;
  var nextPlayTime = 0;
  var active = false;

  function stopAudio() {
    active = false;
    btn.textContent = '🔇';
    btn.style.background = 'rgba(0,0,0,0.55)';
    if (ws) {
      ws.close();
      ws = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  }

  function startAudio() {
    active = true;
    btn.textContent = '⏳';
    btn.style.background = 'rgba(30,100,200,0.7)';

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
    } catch (e) {
      console.error('[audio-bar] AudioContext error:', e);
      stopAudio();
      return;
    }

    nextPlayTime = audioCtx.currentTime + 0.1; // small initial buffer

    var wsUrl = 'ws://' + location.hostname + ':' + AUDIO_WS_PORT;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('[audio-bar] WebSocket error:', e);
      stopAudio();
      return;
    }

    ws.binaryType = 'arraybuffer';

    ws.onopen = function () {
      btn.textContent = '🔊';
      btn.style.background = 'rgba(20,160,80,0.75)';
      console.log('[audio-bar] connected to', wsUrl);
    };

    ws.onerror = function (e) {
      console.error('[audio-bar] WebSocket error', e);
      stopAudio();
    };

    ws.onclose = function () {
      if (active) {
        // Unexpected close — show error state briefly then reset
        btn.textContent = '❌';
        btn.style.background = 'rgba(180,30,30,0.7)';
        setTimeout(function () {
          if (!active) return; // already stopped by user
          stopAudio();
        }, 2000);
      }
    };

    ws.onmessage = function (event) {
      if (!audioCtx) return;

      var raw = new Int16Array(event.data);
      var numFrames = raw.length / CHANNELS; // frames = samples per channel
      if (numFrames < 1) return;

      var buffer = audioCtx.createBuffer(CHANNELS, numFrames, SAMPLE_RATE);

      // De-interleave Int16 → Float32 for each channel
      for (var ch = 0; ch < CHANNELS; ch++) {
        var channelData = buffer.getChannelData(ch);
        for (var i = 0; i < numFrames; i++) {
          channelData[i] = raw[i * CHANNELS + ch] / 32768.0;
        }
      }

      var source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);

      // Clamp nextPlayTime if we've fallen behind real time
      var now = audioCtx.currentTime;
      if (nextPlayTime < now) {
        nextPlayTime = now + 0.05; // re-sync with a small 50ms buffer
      }

      source.start(nextPlayTime);
      nextPlayTime += buffer.duration;
    };
  }

  btn.addEventListener('click', function () {
    if (active) {
      stopAudio();
    } else {
      startAudio();
    }
  });
})();
