/**
 * Hoyt Exteriors Chat Widget — powered by Jane (Gemini Live)
 * Floating voice + text chat for hoytexteriors.com
 * Drop-in: <script src="/wray-widget.js" defer></script>
 */
(function () {
  const AGENT      = 'Jane';
  const CHAT_API   = 'https://wray.hoytexteriors.com/jane/api/chat';
  const WS_VOICE   = 'wss://wray.hoytexteriors.com/jane/web-call';
  const RED   = '#C41E3A';
  const BLACK = '#0A0A0A';

  // ─── Styles ─────────────────────────────────────────────────────────────

  const style = document.createElement('style');
  style.textContent = `
    #hoyt-launcher {
      position:fixed;bottom:24px;right:24px;z-index:9999;
      display:flex;flex-direction:column;align-items:flex-end;gap:12px;
    }
    .hoyt-fab {
      width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 16px rgba(0,0,0,.35);
      transition:transform .15s,box-shadow .15s;color:#fff;font-size:22px;
    }
    .hoyt-fab:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.45);}
    #hoyt-chat-btn{background:${BLACK};}
    #hoyt-call-btn{background:${RED};}
    #hoyt-call-btn.active{background:#444;}
    #hoyt-chat-panel{
      position:fixed;bottom:100px;right:24px;z-index:9998;
      width:360px;max-height:520px;border-radius:16px;overflow:hidden;
      display:none;flex-direction:column;
      background:${BLACK};border:1px solid #222;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;
    }
    #hoyt-chat-panel.open{display:flex;}
    #hoyt-chat-header{
      padding:14px 18px;background:${RED};color:#fff;
      font-weight:700;font-size:14px;
      display:flex;justify-content:space-between;align-items:center;
    }
    #hoyt-chat-close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;}
    #hoyt-chat-messages{
      flex:1;overflow-y:auto;padding:16px;
      display:flex;flex-direction:column;gap:10px;max-height:360px;
    }
    .hoyt-msg{
      max-width:85%;padding:10px 14px;border-radius:12px;
      font-size:13px;line-height:1.5;color:#fff;word-wrap:break-word;
    }
    .hoyt-msg.user {align-self:flex-end;background:${RED};border-bottom-right-radius:4px;}
    .hoyt-msg.agent{align-self:flex-start;background:#1e1e1e;border-bottom-left-radius:4px;}
    .hoyt-msg.typing{color:#888;font-style:italic;}
    #hoyt-chat-input-row{padding:12px;display:flex;gap:8px;border-top:1px solid #222;}
    #hoyt-chat-input{
      flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;
      padding:10px 12px;color:#fff;font-size:13px;outline:none;
      font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;
    }
    #hoyt-chat-input::placeholder{color:#555;}
    #hoyt-chat-input:focus{border-color:${RED};}
    #hoyt-chat-send{
      background:${RED};border:none;border-radius:8px;color:#fff;
      padding:0 16px;cursor:pointer;font-size:16px;font-weight:700;
    }
    #hoyt-chat-send:hover{background:#a51830;}
    #hoyt-call-status{
      position:fixed;bottom:100px;right:24px;z-index:9998;
      background:${BLACK};color:#fff;border-radius:12px;border:1px solid #222;
      padding:14px 20px;font-family:Inter,sans-serif;font-size:13px;
      display:none;box-shadow:0 4px 16px rgba(0,0,0,.4);
    }
    #hoyt-call-status.open{display:block;}
    #hoyt-call-status span{color:${RED};font-weight:700;}
    @media(max-width:480px){
      #hoyt-chat-panel{width:calc(100vw - 32px);right:16px;bottom:88px;max-height:60vh;}
      #hoyt-launcher{bottom:16px;right:16px;}
    }
  `;
  document.head.appendChild(style);

  // ─── DOM (no innerHTML — all textContent for security) ──────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(function(kv) {
      var k = kv[0], v = kv[1];
      if (k === 'className') node.className = v;
      else if (k === 'id') node.id = v;
      else if (k === 'type') node.type = v;
      else if (k === 'placeholder') node.placeholder = v;
      else if (k === 'title') node.title = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k === 'autocomplete') node.setAttribute('autocomplete', v);
    });
    (children || []).forEach(function(c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  var closeBtn  = el('button', { id: 'hoyt-chat-close', title: 'Close', textContent: '\u00d7' });
  var header    = el('div', { id: 'hoyt-chat-header' }, [
    el('span', { textContent: 'Hoyt Exteriors' }), closeBtn
  ]);
  var msgArea   = el('div', { id: 'hoyt-chat-messages' });
  var chatInput = el('input', { id: 'hoyt-chat-input', type: 'text', placeholder: 'Ask about roofing, siding, estimates\u2026', autocomplete: 'off' });
  var sendBtn   = el('button', { id: 'hoyt-chat-send', textContent: '\u2192' });
  var inputRow  = el('div', { id: 'hoyt-chat-input-row' }, [chatInput, sendBtn]);
  var panel     = el('div', { id: 'hoyt-chat-panel' }, [header, msgArea, inputRow]);

  var callStatus = el('div', { id: 'hoyt-call-status' });
  callStatus.appendChild(el('span', { textContent: 'Connected to ' + AGENT }));
  callStatus.appendChild(document.createElement('br'));
  callStatus.appendChild(document.createTextNode('Tap the mic to end the call'));

  var chatFab = el('button', { className: 'hoyt-fab', id: 'hoyt-chat-btn', title: 'Chat with us', textContent: '\uD83D\uDCAC' });
  var callFab = el('button', { className: 'hoyt-fab', id: 'hoyt-call-btn', title: 'Talk to ' + AGENT, textContent: '\uD83C\uDF99' });

  var launcher = el('div', { id: 'hoyt-launcher' }, [callStatus, panel, chatFab, callFab]);
  document.body.appendChild(launcher);

  addMessage("Hi! I'm " + AGENT + " from Hoyt Exteriors. How can I help you today?", 'agent');

  // ─── Chat ───────────────────────────────────────────────────────────────

  var chatSessionId = null;

  chatFab.addEventListener('click', function() {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) chatInput.focus();
  });
  closeBtn.addEventListener('click', function() { panel.classList.remove('open'); });
  sendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendChat(); });

  function addMessage(text, role) {
    var div = el('div', { className: 'hoyt-msg ' + role });
    div.textContent = text;
    msgArea.appendChild(div);
    msgArea.scrollTop = msgArea.scrollHeight;
    return div;
  }

  function sendChat() {
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    addMessage(text, 'user');
    var typing = addMessage('Typing\u2026', 'agent typing');

    fetch(CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: chatSessionId })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      chatSessionId = data.sessionId;
      typing.remove();
      addMessage(data.reply, 'agent');
    })
    .catch(function() {
      typing.remove();
      addMessage('Having trouble connecting. Call us at (651) 212-4965!', 'agent');
    });
  }

  // ─── Voice Call ─────────────────────────────────────────────────────────

  var callActive     = false;
  var ws             = null;
  var audioCtx       = null;
  var micStream      = null;
  var processor      = null;
  var audioQueue     = [];
  var isPlaying      = false;

  callFab.addEventListener('click', function() { callActive ? endCall() : startCall(); });

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
        callFab.classList.add('active');
        callFab.title = 'End call';
        callFab.textContent = '\uD83D\uDCF5';
        callStatus.classList.add('open');
        startMic();
      };

      ws.onmessage = function(event) {
        audioQueue.push(new Int16Array(event.data));
        if (!isPlaying) playNext();
      };

      ws.onclose = ws.onerror = function() { endCall(); };
    })
    .catch(function() {
      alert('Microphone access is needed for voice calls. Please allow mic access and try again.');
    });
  }

  function startMic() {
    var source = audioCtx.createMediaStreamSource(micStream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = function(e) {
      if (!callActive || !ws || ws.readyState !== WebSocket.OPEN) return;
      var f32 = e.inputBuffer.getChannelData(0);
      var i16 = new Int16Array(f32.length);
      for (var i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767));
      }
      ws.send(i16.buffer);
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  }

  function playNext() {
    if (audioQueue.length === 0) { isPlaying = false; return; }
    isPlaying = true;
    var pcm16 = audioQueue.shift();
    var buf = audioCtx.createBuffer(1, pcm16.length, 24000);
    var data = buf.getChannelData(0);
    for (var i = 0; i < pcm16.length; i++) data[i] = pcm16[i] / 32768;
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = playNext;
    src.start();
  }

  function endCall() {
    callActive = false;
    callFab.classList.remove('active');
    callFab.title = 'Talk to ' + AGENT;
    callFab.textContent = '\uD83C\uDF99';
    callStatus.classList.remove('open');
    if (processor) processor.disconnect();
    if (micStream) micStream.getTracks().forEach(function(t) { t.stop(); });
    if (ws) ws.close();
    audioQueue = []; isPlaying = false;
    processor = null; micStream = null; ws = null;
    if (audioCtx) audioCtx.close().then(function() { audioCtx = null; });
  }
})();
