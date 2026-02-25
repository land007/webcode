/**
 * audio-bar.js - floating audio toggle button for noVNC
 *
 * Detects if running inside iframe (Launcher) - if so, hides button and lets parent handle audio.
 * Otherwise, shows floating button for direct browser access.
 *
 * Port detection:
 * - From URL query parameter ?audioPort=XXXX
 * - Or from window.location.port (default 20006)
 *
 * Must be triggered by user gesture due to browser autoplay policy.
 */
(function () {
  'use strict';

  // ── Detect iframe environment ───────────────────────────────────────
  var isInIframe = (window.self !== window.top);
  if (isInIframe) {
    console.log('[audio-bar] Running inside iframe, hiding button - parent window should handle audio');
    return; // Don't create button in iframe
  }

  // ── Port detection ───────────────────────────────────────────────────
  function getAudioPort() {
    // Try URL query parameter first: ?audioPort=20006
    var urlParams = new URLSearchParams(window.location.search);
    var portParam = urlParams.get('audioPort');
    if (portParam) {
      return parseInt(portParam, 10);
    }
    // Fall back to default port
    return 20006;
  }

  var AUDIO_WS_PORT = getAudioPort();
  var SAMPLE_RATE = 44100;
  var CHANNELS = 2;

  console.log('[audio-bar] Audio WebSocket port:', AUDIO_WS_PORT);

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

    nextPlayTime = audioCtx.currentTime + 0.02; // 20ms initial buffer for low latency

    // Construct WebSocket URL with detected port
    var wsUrl = 'ws://' + location.hostname + ':' + AUDIO_WS_PORT;
    console.log('[audio-bar] Connecting to:', wsUrl);

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
        nextPlayTime = now + 0.01; // re-sync with 10ms buffer for low latency
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
