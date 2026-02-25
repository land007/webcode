/**
 * audio-bar.js - integrated audio toggle button for noVNC
 *
 * Always shows in noVNC toolbar regardless of iframe environment.
 * If audioPort parameter is present in URL, auto-starts audio playback.
 * Audio control is now handled within noVNC itself.
 */
(function () {
  'use strict';

  // ── SVG Icon (white) ─────────────────────────────────────
  function getIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
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
  console.log('[audio-bar] Port:', AUDIO_WS_PORT, 'Auto-start:', shouldAutoStart());

  // ── Create button ────────────────────────────────────────
  function createButton() {
    var fsBtn = document.getElementById('noVNC_fullscreen_button');
    if (!fsBtn) {
      console.log('[audio-bar] Fullscreen button not found');
      return false;
    }

    if (document.getElementById('noVNC_audio_button')) {
      console.log('[audio-bar] Button already exists');
      return true;
    }

    var btn = document.createElement('input');
    btn.type = 'image';
    btn.id = 'noVNC_audio_button';
    btn.className = 'noVNC_button';
    btn.alt = '音频';
    btn.title = '桌面音频';
    btn.src = 'data:image/svg+xml;base64,' + btoa(getIcon());

    fsBtn.parentNode.insertBefore(btn, fsBtn);
    console.log('[audio-bar] ✅ Button created in noVNC toolbar');
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

  // ── Audio logic ──────────────────────────────────────────
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
      console.log('[audio-bar] Button clicked, active:', active);
      if (active) stopAudio(); else startAudio();
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
