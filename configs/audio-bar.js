/**
 * audio-bar.js - integrated audio toggle button for noVNC
 *
 * Always shows in noVNC toolbar regardless of iframe environment.
 * If audioPort parameter is present in URL, auto-starts audio playback.
 * Audio control is now handled within noVNC itself.
 * Full-duplex: also includes a microphone button to send browser mic to container.
 */
(function () {
  'use strict';

  // ── SVG Icons (white) ─────────────────────────────────────
  function getIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  }

  function getMicIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="9" y="2" width="6" height="11" rx="3"></rect>' +
      '<path d="M19 10a7 7 0 0 1-14 0"></path>' +
      '<line x1="12" y1="19" x2="12" y2="22"></line>' +
      '<line x1="8" y1="22" x2="16" y2="22"></line>' +
      '</svg>';
  }

  function getRecordIcon() {   // white circle = ready to record
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="7" fill="white" stroke="white" stroke-width="1.5"/></svg>';
  }

  function getRecordingIcon() {  // white square = recording (click to stop)
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<rect x="5" y="5" width="14" height="14" rx="2" fill="white" stroke="white" stroke-width="1.5"/></svg>';
  }

  // ── Audio WebSocket URL ───────────────────────────────────
  function getAudioWebSocketUrl() {
    var port = parseInt(location.port) || 80;

    // NW.js launcher ports (11001-11004) don't support path routing
    // Use dedicated audio port (20006) for these
    if (port >= 11001 && port <= 11004) {
      var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return protocol + '//localhost:20006/';
    }

    // For other ports, use path-based routing on current port
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + location.host + '/audio';
  }

  var AUDIO_WS_URL = getAudioWebSocketUrl();
  console.log('[audio-bar] WebSocket URL:', AUDIO_WS_URL);

  // ── Check if should auto-start ─────────────────────────────
  // Auto-start if URL has autoconnect=true (noVNC parameter)
  function shouldAutoStart() {
    return location.search.match(/autoconnect=true/i) !== null;
  }

  // ── Create audio output button ────────────────────────────
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
    console.log('[audio-bar] ✅ Audio button created in noVNC toolbar');
    return true;
  }

  // ── Create microphone button (inserted before audio button) ──
  function createMicButton() {
    var audioBtn = document.getElementById('noVNC_audio_button');
    if (!audioBtn) return false;

    if (document.getElementById('noVNC_mic_button')) return true;

    var btn = document.createElement('input');
    btn.type = 'image';
    btn.id = 'noVNC_mic_button';
    btn.className = 'noVNC_button';
    btn.alt = '麦克风';
    btn.title = '麦克风输入';
    btn.src = 'data:image/svg+xml;base64,' + btoa(getMicIcon());

    audioBtn.parentNode.insertBefore(btn, audioBtn);
    console.log('[audio-bar] ✅ Mic button created in noVNC toolbar');
    return true;
  }

  // ── Create record button (inserted after mic button) ──────
  function createRecordButton() {
    var micBtn = document.getElementById('noVNC_mic_button');
    if (!micBtn) return false;

    if (document.getElementById('noVNC_record_button')) return true;

    var btn = document.createElement('input');
    btn.type = 'image';
    btn.id = 'noVNC_record_button';
    btn.className = 'noVNC_button';
    btn.alt = '录制';
    btn.title = '录制桌面视频';
    btn.src = 'data:image/svg+xml;base64,' + btoa(getRecordIcon());

    micBtn.parentNode.insertBefore(btn, micBtn.nextSibling);
    console.log('[audio-bar] ✅ Record button created in noVNC toolbar');
    return true;
  }

  // ── Wait and create all three buttons ────────────────────
  function tryCreate() {
    var audioOk = createButton();
    if (!audioOk) {
      setTimeout(tryCreate, 100);
      return;
    }
    if (!createMicButton()) {
      setTimeout(tryCreate, 100);
      return;
    }
    if (!createRecordButton()) {
      setTimeout(tryCreate, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCreate);
  } else {
    setTimeout(tryCreate, 100);
  }

  // ── Audio output logic ───────────────────────────────────
  var audioCtx, ws, nextPlayTime = 0, active = false;
  var SAMPLE_RATE = 44100, CHANNELS = 2;
  var autoStartAttempted = false;
  var recordActive = false;

  function setSelected(selected) {
    var btn = document.getElementById('noVNC_audio_button');
    if (!btn) return;
    if (selected) {
      btn.className = 'noVNC_button noVNC_selected';
    } else {
      btn.className = 'noVNC_button';
    }
  }

  function setRecordSelected(selected) {
    var btn = document.getElementById('noVNC_record_button');
    if (!btn) return;
    btn.className = selected ? 'noVNC_button noVNC_selected' : 'noVNC_button';
    btn.src = 'data:image/svg+xml;base64,' + btoa(selected ? getRecordingIcon() : getRecordIcon());
    btn.title = selected ? '停止录制' : '录制桌面视频';
  }

  function handleRecordingMessage(text) {
    var msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (msg.event === 'recording_started') {
      recordActive = true;
      setRecordSelected(true);
      console.log('[audio-bar] Recording started:', msg.filename);
    } else if (msg.event === 'recording_stopped') {
      recordActive = false;
      setRecordSelected(false);
      console.log('[audio-bar] Recording saved:', msg.filename);
    } else if (msg.event === 'recording_error') {
      recordActive = false;
      setRecordSelected(false);
      console.error('[audio-bar] Recording error:', msg.error);
    } else if (msg.event === 'recording_status') {
      recordActive = msg.recording;
      setRecordSelected(msg.recording);
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
    console.log('[audio-bar] Connecting:', AUDIO_WS_URL);

    try {
      ws = new WebSocket(AUDIO_WS_URL);
    } catch (e) {
      console.error('[audio-bar]', e);
      stopAudio();
      return;
    }

    ws.binaryType = 'arraybuffer';

    ws.onopen = function () {
      setSelected(true);
      console.log('[audio-bar] ✅ Connected');
      try { ws.send(JSON.stringify({action: 'recording_status'})); } catch (e) {}
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
      if (typeof event.data === 'string') {
        handleRecordingMessage(event.data);
        return;
      }
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

  // ── Microphone input logic ───────────────────────────────
  var micActive = false;
  var micStream = null;
  var micAudioCtx = null;
  var micProcessor = null;
  var micWs = null;

  function setMicSelected(selected) {
    var btn = document.getElementById('noVNC_mic_button');
    if (!btn) return;
    btn.className = selected ? 'noVNC_button noVNC_selected' : 'noVNC_button';
  }

  function stopMicrophone() {
    micActive = false;
    if (micProcessor) { micProcessor.disconnect(); micProcessor = null; }
    if (micStream) { micStream.getTracks().forEach(function(t) { t.stop(); }); micStream = null; }
    if (micAudioCtx) { micAudioCtx.close(); micAudioCtx = null; }
    if (micWs) { micWs.close(); micWs = null; }
    setMicSelected(false);
    console.log('[audio-bar] Microphone stopped');
  }

  async function startMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[audio-bar] getUserMedia not available in this environment');
      return;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: CHANNELS },
          sampleRate: { ideal: SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
    } catch (e) {
      console.error('[audio-bar] getUserMedia failed:', e);
      return;
    }

    micActive = true;
    setMicSelected(true);

    try {
      micAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    } catch (e) {
      console.error('[audio-bar] AudioContext failed:', e);
      stopMicrophone();
      return;
    }

    var source = micAudioCtx.createMediaStreamSource(micStream);
    // bufferSize=2048 → ~46ms @ 44100Hz
    micProcessor = micAudioCtx.createScriptProcessor(2048, CHANNELS, CHANNELS);

    micProcessor.onaudioprocess = function(e) {
      if (!micWs || micWs.readyState !== WebSocket.OPEN) return;
      var numFrames = e.inputBuffer.length;
      var buf = new Int16Array(numFrames * CHANNELS);
      for (var ch = 0; ch < CHANNELS; ch++) {
        var channelData = e.inputBuffer.getChannelData(ch);
        for (var i = 0; i < numFrames; i++) {
          var sample = Math.max(-1, Math.min(1, channelData[i]));
          buf[i * CHANNELS + ch] = sample < 0 ? sample * 32768 : sample * 32767;
        }
      }
      micWs.send(buf.buffer);
    };

    source.connect(micProcessor);
    micProcessor.connect(micAudioCtx.destination);

    console.log('[audio-bar] Mic WebSocket connecting:', AUDIO_WS_URL);
    try {
      micWs = new WebSocket(AUDIO_WS_URL);
    } catch (e) {
      console.error('[audio-bar] Mic WebSocket failed:', e);
      stopMicrophone();
      return;
    }

    micWs.binaryType = 'arraybuffer';

    micWs.onerror = function(e) {
      console.error('[audio-bar] Mic WebSocket error:', e);
      stopMicrophone();
    };

    micWs.onclose = function() {
      if (micActive) stopMicrophone();
    };

    console.log('[audio-bar] ✅ Microphone started');
  }

  // ── Click handlers ────────────────────────────────────────
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
    if (e.target && e.target.id === 'noVNC_record_button') {
      e.preventDefault();
      console.log('[audio-bar] Record button clicked, recordActive:', recordActive);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        startAudio();  // establish WS connection first
        return;
      }
      ws.send(JSON.stringify({action: recordActive ? 'stop_recording' : 'start_recording'}));
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
