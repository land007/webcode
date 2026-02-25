/**
 * audio-bar.js - integrated audio toggle button for noVNC
 *
 * Always shows in noVNC toolbar regardless of iframe environment.
 * If audioPort parameter is present in URL, auto-starts audio playback.
 * Audio control is now handled within noVNC itself.
 *
 * Includes microphone input button for sending browser audio to container.
 */
(function () {
  'use strict';

  // ── SVG Icons (white) ─────────────────────────────────────
  function getAudioIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  }

  // Microphone icons: off, on, error
  function getMicIcon(state) {
    if (state === 'on') {
      // Green microphone when active (will be styled with CSS)
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line><line x1="12" y1="3" x2="12" y2="1" stroke="#4CAF50" stroke-width="3"></line></svg>';
    } else if (state === 'error') {
      // Red X when error
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line><line x1="2" y1="2" x2="22" y2="22" stroke="#f44336" stroke-width="2"></line></svg>';
    }
    // Default off state
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
  }

  // ── Port detection ───────────────────────────────────────
  function getAudioPort() {
    var m = location.search.match(/audioPort=(\d+)/);
    return m ? parseInt(m[1]) : 20006;
  }

  // ── Check if auto-start is requested ─────────────────────
  function shouldAutoStart() {
    return location.search.match(/audioPort=\d+/) !== null;
  }

  var AUDIO_WS_PORT = getAudioPort();
  console.log('[audio-bar] Loading audio-bar.js, Port:', AUDIO_WS_PORT, 'Auto-start:', shouldAutoStart());
  console.log('[audio-bar] getMicIcon function exists:', typeof getMicIcon !== 'undefined');

  // ── Create buttons ────────────────────────────────────────
  function createButton() {
    var fsBtn = document.getElementById('noVNC_fullscreen_button');
    if (!fsBtn) {
      console.log('[audio-bar] Fullscreen button not found');
      return false;
    }

    var created = false;
    var audioBtn = document.getElementById('noVNC_audio_button');

    // Create audio output button if not exists
    if (!audioBtn) {
      audioBtn = document.createElement('input');
      audioBtn.type = 'image';
      audioBtn.id = 'noVNC_audio_button';
      audioBtn.className = 'noVNC_button';
      audioBtn.alt = '音频';
      audioBtn.title = '桌面音频';
      audioBtn.src = 'data:image/svg+xml;base64,' + btoa(getAudioIcon());
      fsBtn.parentNode.insertBefore(audioBtn, fsBtn);
      console.log('[audio-bar] ✅ Audio button created');
      created = true;
    }

    // Create microphone button if not exists (insert before audio button)
    if (!document.getElementById('noVNC_mic_button')) {
      var micBtn = document.createElement('input');
      micBtn.type = 'image';
      micBtn.id = 'noVNC_mic_button';
      micBtn.className = 'noVNC_button';
      micBtn.alt = '麦克风';
      micBtn.title = '桌面麦克风';
      micBtn.src = 'data:image/svg+xml;base64,' + btoa(getMicIcon('off'));
      // Insert microphone button before audio button
      audioBtn.parentNode.insertBefore(micBtn, audioBtn);
      console.log('[audio-bar] ✅ Mic button created');
      created = true;
    }

    if (!created) {
      console.log('[audio-bar] Buttons already exist');
    }
    return true;
  }

  // ── Wait and create ─────────────────────────────────────
  function tryCreate() {
    if (createButton()) return;
    setTimeout(tryCreate, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCreate);
  } else {
    setTimeout(tryCreate, 100);
  }

  // ── Audio output logic ──────────────────────────────────────────
  var audioCtx, ws, nextPlayTime = 0, active = false;
  var SAMPLE_RATE = 44100, CHANNELS = 2;
  var autoStartAttempted = false;

  function setSelected(selected) {
    var btn = document.getElementById('noVNC_audio_button');
    if (!btn) return;
    if (selected) {
      btn.className = 'noVNC_button noVNC_selected';
    } else {
      btn.className = 'noVNC_button';
    }
  }

  // ── Microphone input logic ──────────────────────────────────────────
  var micWs = null;
  var mediaStream = null;
  var micActive = false;

  function setMicSelected(state) {
    var btn = document.getElementById('noVNC_mic_button');
    if (!btn) return;
    if (state === 'on') {
      btn.className = 'noVNC_button noVNC_selected';
      btn.src = 'data:image/svg+xml;base64,' + btoa(getMicIcon('on'));
    } else if (state === 'error') {
      btn.className = 'noVNC_button';
      btn.src = 'data:image/svg+xml;base64,' + btoa(getMicIcon('error'));
    } else {
      btn.className = 'noVNC_button';
      btn.src = 'data:image/svg+xml;base64,' + btoa(getMicIcon('off'));
    }
  }

  function stopMicrophone() {
    micActive = false;
    if (mediaStream) {
      mediaStream.getTracks().forEach(function (track) {
        track.stop();
      });
      mediaStream = null;
    }
    if (micWs) {
      micWs.close();
      micWs = null;
    }
    setMicSelected('off');
    console.log('[audio-bar] Microphone stopped');
  }

  async function startMicrophone() {
    // Check if running in nw.js
    var isNW = (typeof process !== 'undefined' && process.versions && process.versions['node-webkit']);
    if (isNW) {
      console.warn('[audio-bar] Running in nw.js environment - microphone may not be supported');
      alert('麦克风功能在 nw.js 环境中可能不可用。请使用常规浏览器（Chrome、Edge、Firefox）访问 noVNC。');
      setMicSelected('error');
      micActive = false;
      return;
    }

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[audio-bar] getUserMedia not supported in this browser');
      alert('您的浏览器不支持麦克风访问。请使用最新版本的 Chrome、Edge 或 Firefox。');
      setMicSelected('error');
      micActive = false;
      return;
    }

    micActive = true;
    setMicSelected('on');

    try {
      // Get microphone access
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: CHANNELS,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      var audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE
      });

      var source = audioCtx.createMediaStreamSource(mediaStream);
      var processor = audioCtx.createScriptProcessor(16384, 2, 2);

      processor.onaudioprocess = function (e) {
        if (!micWs || micWs.readyState !== WebSocket.OPEN) return;

        var left = e.inputBuffer.getChannelData(0);
        var right = e.inputBuffer.getChannelData(1);

        // Convert Float32 to Int16 s16le
        var pcm = new Int16Array(left.length * 2);
        for (var i = 0; i < left.length; i++) {
          pcm[i * 2] = Math.max(-32768, Math.min(32767, left[i] * 32768));
          pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, right[i] * 32768));
        }

        micWs.send(pcm.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      // Connect to WebSocket (reuse same port as audio output)
      var wsUrl = 'ws://' + location.hostname + ':' + AUDIO_WS_PORT;
      micWs = new WebSocket(wsUrl);
      micWs.binaryType = 'arraybuffer';

      micWs.onopen = function () {
        setMicSelected('on');
        console.log('[audio-bar] Microphone connected');
      };

      micWs.onerror = function (e) {
        console.error('[audio-bar] Microphone WebSocket error:', e);
        stopMicrophone();
      };

      micWs.onclose = function () {
        if (micActive) {
          stopMicrophone();
        }
      };

    } catch (e) {
      console.error('[audio-bar] Microphone error:', e);
      alert('无法访问麦克风：' + e.message);
      setMicSelected('error');
      micActive = false;
    }
  }

  function stopAudio() {
    active = false;
    setSelected(false);
    if (ws) { ws.close(); ws = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  }

  function startAudio() {
    active = true;
    setSelected(true);

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    } catch (e) {
      console.error('[audio-bar]', e);
      stopAudio();
      return;
    }

    nextPlayTime = audioCtx.currentTime + 0.02;
    var wsUrl = 'ws://' + location.hostname + ':' + AUDIO_WS_PORT;
    console.log('[audio-bar] Connecting:', wsUrl);

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('[audio-bar]', e);
      stopAudio();
      return;
    }

    ws.binaryType = 'arraybuffer';

    ws.onopen = function () {
      setSelected(true);
      console.log('[audio-bar] ✅ Connected');
    };

    ws.onerror = function (e) {
      console.error('[audio-bar]', e);
      stopAudio();
    };

    ws.onclose = function () {
      if (active) {
        stopAudio();
      }
    };

    ws.onmessage = function (event) {
      if (!audioCtx) return;
      var raw = new Int16Array(event.data);
      var numFrames = raw.length / CHANNELS;
      if (numFrames < 1) return;

      var buffer = audioCtx.createBuffer(CHANNELS, numFrames, SAMPLE_RATE);
      for (var ch = 0; ch < CHANNELS; ch++) {
        var channelData = buffer.getChannelData(ch);
        for (var i = 0; i < numFrames; i++) {
          channelData[i] = raw[i * CHANNELS + ch] / 32768.0;
        }
      }

      var source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);

      var now = audioCtx.currentTime;
      if (nextPlayTime < now) nextPlayTime = now + 0.01;
      source.start(nextPlayTime);
      nextPlayTime += buffer.duration;
    };
  }

  // ── Click handler ────────────────────────────────────────
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'noVNC_audio_button') {
      e.preventDefault();
      console.log('[audio-bar] Audio button clicked, active:', active);
      if (active) stopAudio(); else startAudio();
    }
    if (e.target && e.target.id === 'noVNC_mic_button') {
      e.preventDefault();
      console.log('[audio-bar] Mic button clicked, active:', micActive);
      if (micActive) stopMicrophone(); else startMicrophone();
    }
  }, true);

  // ── Auto-start audio if audioPort parameter exists ──────────
  // Note: AudioContext requires user gesture, so we wait for first interaction
  function attemptAutoStart() {
    if (autoStartAttempted || !shouldAutoStart()) return;
    autoStartAttempted = true;

    console.log('[audio-bar] Auto-start requested, waiting for user gesture...');

    // Wait for any user interaction (click, keypress, touch)
    function onUserGesture() {
      if (!active && shouldAutoStart()) {
        console.log('[audio-bar] User gesture detected, starting audio...');
        startAudio();
      }
      // Remove listeners after first interaction
      document.removeEventListener('click', onUserGesture, true);
      document.removeEventListener('keydown', onUserGesture, true);
      document.removeEventListener('touchstart', onUserGesture, true);
    }

    document.addEventListener('click', onUserGesture, true);
    document.addEventListener('keydown', onUserGesture, true);
    document.addEventListener('touchstart', onUserGesture, true);
  }

  // Try auto-start after button is created
  function tryAutoStart() {
    if (document.getElementById('noVNC_audio_button')) {
      attemptAutoStart();
    } else {
      setTimeout(tryAutoStart, 100);
    }
  }

  if (shouldAutoStart()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAutoStart);
    } else {
      setTimeout(tryAutoStart, 100);
    }
  }
})();
