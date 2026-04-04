/**
 * Hoyt Exteriors — Agent Talk Page Widget
 * Full-screen chat + voice interface for a specific agent.
 * Set window.HOYT_AGENT before loading: { name, path, greeting }
 */
(function () {
  var A = window.HOYT_AGENT || { name: 'Jane', path: 'jane', greeting: '' };
  var BASE = 'https://wray.hoytexteriors.com/' + A.path;
  var CHAT_API = BASE + '/api/chat';
  var WS_VOICE = BASE.replace('https://', 'wss://') + '/web-call';
  var RED = '#C41E3A';

  var root = document.getElementById('hoyt-talk');
  if (!root) return;

  // Clear root safely
  while (root.firstChild) root.removeChild(root.firstChild);

  // ─── Build UI with DOM methods only ──────────────────────────

  function mk(tag, styles, text) {
    var el = document.createElement(tag);
    if (styles) el.style.cssText = styles;
    if (text) el.textContent = text;
    return el;
  }

  var container = mk('div', 'max-width:480px;margin:0 auto;display:flex;flex-direction:column;height:100%;');
  var msgArea = mk('div', 'flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;');
  var inputRow = mk('div', 'padding:16px;display:flex;gap:10px;border-top:1px solid #222;align-items:center;');

  var callBtn = mk('button', 'width:44px;height:44px;border-radius:50%;border:none;background:' + RED + ';color:#fff;font-size:20px;cursor:pointer;flex-shrink:0;', '\uD83C\uDF99');
  callBtn.title = 'Voice call with ' + A.name;

  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type a message\u2026';
  input.autocomplete = 'off';
  input.style.cssText = 'flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:12px 14px;color:#fff;font-size:14px;outline:none;font-family:Inter,sans-serif;';

  var sendBtn = mk('button', 'width:44px;height:44px;border-radius:8px;border:none;background:' + RED + ';color:#fff;font-size:18px;font-weight:700;cursor:pointer;flex-shrink:0;', '\u2192');

  inputRow.appendChild(callBtn);
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  container.appendChild(msgArea);
  container.appendChild(inputRow);
  root.appendChild(container);

  var callBar = mk('div', 'display:none;padding:12px 20px;background:#111;border-top:1px solid #222;text-align:center;color:#fff;font-size:13px;font-family:Inter,sans-serif;', 'Connected to ' + A.name + ' \u2014 tap mic to end');
  root.appendChild(callBar);

  function addMsg(text, role) {
    var div = mk('div', 'max-width:85%;padding:12px 16px;border-radius:14px;font-size:14px;line-height:1.5;color:#fff;word-wrap:break-word;' +
      (role === 'user'
        ? 'align-self:flex-end;background:' + RED + ';border-bottom-right-radius:4px;'
        : 'align-self:flex-start;background:#1e1e1e;border-bottom-left-radius:4px;'));
    div.textContent = text;
    if (role === 'typing') { div.style.color = '#888'; div.style.fontStyle = 'italic'; }
    msgArea.appendChild(div);
    msgArea.scrollTop = msgArea.scrollHeight;
    return div;
  }

  addMsg(A.greeting || ("Hi! I'm " + A.name + " from Hoyt Exteriors. How can I help you?"), 'agent');
  input.focus();

  // ─── Text Chat ───────────────────────────────────────────────
  var sessionId = null;

  function sendChat() {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg(text, 'user');
    var typing = addMsg('Typing\u2026', 'typing');

    fetch(CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: sessionId })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      sessionId = d.sessionId;
      typing.remove();
      addMsg(d.reply, 'agent');
    })
    .catch(function() {
      typing.remove();
      addMsg('Connection issue. Call us at (651) 212-4965.', 'agent');
    });
  }

  sendBtn.addEventListener('click', sendChat);
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendChat(); });

  // ─── Voice Call ──────────────────────────────────────────────
  var callActive = false, ws = null, audioCtx = null, micStream = null, processor = null;
  var audioQueue = [], isPlaying = false;

  callBtn.addEventListener('click', function() { callActive ? endCall() : startCall(); });

  function startCall() {
    navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    .then(function(stream) {
      micStream = stream;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      ws = new WebSocket(WS_VOICE);
      ws.binaryType = 'arraybuffer';

      ws.onopen = function() {
        callActive = true;
        callBtn.style.background = '#444';
        callBtn.textContent = '\uD83D\uDCF5';
        callBar.style.display = 'block';
        addMsg('Voice call started with ' + A.name, 'typing');
        var source = audioCtx.createMediaStreamSource(micStream);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = function(e) {
          if (!callActive || !ws || ws.readyState !== 1) return;
          var f32 = e.inputBuffer.getChannelData(0);
          var i16 = new Int16Array(f32.length);
          for (var i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767));
          ws.send(i16.buffer);
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = function(ev) {
        audioQueue.push(new Int16Array(ev.data));
        if (!isPlaying) playNext();
      };

      ws.onclose = ws.onerror = function() { endCall(); };
    })
    .catch(function() {
      addMsg('Microphone access needed for voice calls. Please allow and try again.', 'agent');
    });
  }

  function playNext() {
    if (!audioQueue.length) { isPlaying = false; return; }
    isPlaying = true;
    var pcm = audioQueue.shift();
    var buf = audioCtx.createBuffer(1, pcm.length, 24000);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = playNext;
    src.start();
  }

  function endCall() {
    callActive = false;
    callBtn.style.background = RED;
    callBtn.textContent = '\uD83C\uDF99';
    callBar.style.display = 'none';
    if (processor) processor.disconnect();
    if (micStream) micStream.getTracks().forEach(function(t) { t.stop(); });
    if (ws) ws.close();
    audioQueue = []; isPlaying = false;
    processor = null; micStream = null; ws = null;
    if (audioCtx) audioCtx.close().then(function() { audioCtx = null; });
  }
})();
