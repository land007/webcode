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

  // ── SVG Icons (inline to avoid encoding issues) ─────────────────────
  var ICONS = {
    off: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>',
    connecting: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="16" y1="10" x2="16" y2="14"></line><line x1="20" y1="10" x2="20" y2="14"></line></svg>',
    on: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
  };

  // ── Detect iframe environment ───────────────────────────────────────
  // 方法1: 检查 window.self 和 window.top
  var check1 = (window.self !== window.top);

  // 方法2: 检查 window.frameElement（如果存在说明在 iframe 中）
  var check2 = (window.frameElement !== null);

  // 方法3: 检查父窗口（如果可访问且不同，说明在 iframe 中）
  var check3 = false;
  try {
    check3 = (window.parent !== window);
  } catch (e) {
    // 跨域访问失败，肯定在 iframe 中
    check3 = true;
  }

  var isInIframe = check1 || check2 || check3;

  if (isInIframe) {
    console.log('[audio-bar] Running inside iframe, hiding button - parent window should handle audio');
    console.log('[audio-bar] Detection: self≠top=' + check1 + ', frameElement=' + check2 + ', parent≠self=' + check3);
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
  console.log('[audio-bar] Creating floating button (not in iframe)');

  // ── Create floating button ──────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'audio-toggle-btn';
  btn.title = 'Toggle audio (PulseAudio stream)';
  btn.innerHTML = ICONS.off; // Use SVG instead of emoji
  btn.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:10px',
    'z-index:9999',
    'padding:4px 6px',
    'border:none',
    'border-radius:6px',
    'background:rgba(0,0,0,0.55)',
    'color:#fff',
    'cursor:pointer',
    'user-select:none',
    'box-shadow:0 2px 6px rgba(0,0,0,0.4)',
    'transition:background 0.2s',
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');

  document.body.appendChild(btn);

  // ── State ────────────────────────────────────────────────────────────
  var audioCtx = null;
  var ws = null;
  var nextPlayTime = 0;
  var active = false;

  function stopAudio() {
    active = false;
    btn.innerHTML = ICONS.off;
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
    btn.innerHTML = ICONS.connecting;
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
      btn.innerHTML = ICONS.on;
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
        btn.innerHTML = ICONS.error;
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
