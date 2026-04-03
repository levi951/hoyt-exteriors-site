/**
 * Wray Widget — Hoyt Exteriors
 * Floating voice + text chat powered by Gemini Live
 * Drop-in: <script src="/wray-widget.js"></script>
 */
(function () {
  const SERVER    = 'https://wray.hoytexteriors.com';
  const WS_SERVER = 'wss://wray.hoytexteriors.com';
  const RED   = '#C41E3A';
  const BLACK = '#0A0A0A';

  // ─── Styles ─────────────────────────────────────────────────────────────

  const style = document.createElement('style');
  style.textContent = `
    #wray-launcher {
      position:fixed;bottom:24px;right:24px;z-index:9999;
      display:flex;flex-direction:column;align-items:flex-end;gap:12px;
    }
    .wray-fab {
      width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 16px rgba(0,0,0,.35);
      transition:transform .15s,box-shadow .15s;color:#fff;font-size:22px;
    }
    .wray-fab:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.45);}
    #wray-chat-btn{background:${BLACK};}
    #wray-call-btn{background:${RED};}
    #wray-call-btn.active{background:#888;}
    #wray-chat-panel{
      position:fixed;bottom:100px;right:24px;z-index:9998;
      width:340px;max-height:500px;border-radius:16px;overflow:hidden;
      display:none;flex-direction:column;
      background:${BLACK};box-shadow:0 8px 32px rgba(0,0,0,.5);
      font-family:Inter,sans-serif;
    }
    #wray-chat-panel.open{display:flex;}
    #wray-chat-header{
      padding:14px 18px;background:${RED};color:#fff;
      font-weight:700;font-size:14px;
      display:flex;justify-content:space-between;align-items:center;
    }
    #wray-chat-close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;}
    #wray-chat-messages{
      flex:1;overflow-y:auto;padding:16px;
      display:flex;flex-direction:column;gap:10px;max-height:340px;
    }
    .wray-msg{
      max-width:85%;padding:10px 14px;border-radius:12px;
      font-size:13px;line-height:1.5;color:#fff;
    }
    .wray-msg.user {align-self:flex-end;background:${RED};border-bottom-right-radius:4px;}
    .wray-msg.agent{align-self:flex-start;background:#1e1e1e;border-bottom-left-radius:4px;}
    .wray-msg.typing{color:#888;font-style:italic;}
    #wray-chat-input-row{padding:12px;display:flex;gap:8px;border-top:1px solid #222;}
    #wray-chat-input{
      flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;
      padding:10px 12px;color:#fff;font-size:13px;outline:none;font-family:Inter,sans-serif;
    }
    #wray-chat-input::placeholder{color:#555;}
    #wray-chat-send{
      background:${RED};border:none;border-radius:8px;color:#fff;
      padding:0 16px;cursor:pointer;font-size:16px;font-weight:700;
    }
    #wray-call-status{
      position:fixed;bottom:100px;right:24px;z-index:9998;
      background:${BLACK};color:#fff;border-radius:12px;
      padding:14px 20px;font-family:Inter,sans-serif;font-size:13px;
      display:none;box-shadow:0 4px 16px rgba(0,0,0,.4);
    }
    #wray-call-status.open{display:block;}
    #wray-call-status span{color:${RED};font-weight:700;}
  `;
  document.head.appendChild(style);

  // ─── DOM structure (no innerHTML, no user content injected) ─────────────

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') node.className = v;
      else if (k === 'id') node.id = v;
      else if (k === 'type') node.type = v;
      else if (k === 'placeholder') node.placeholder = v;
      else if (k === 'title') node.title = v;
      else if (k === 'textContent') node.textContent = v;
      else if (k === 'autocomplete') node.setAttribute('autocomplete', v);
    });
    (children || []).forEach((c) => node.appendChild(
      typeof c === 'string' ? document.createTextNode(c) : c
    ));
    return node;
  }

  const closeBtn  = el('button', { id: 'wray-chat-close', title: 'Close', textContent: '×' });
  const header    = el('div', { id: 'wray-chat-header' }, [
    el('span', { textContent: 'Chat with Wray' }), closeBtn
  ]);
  const messages  = el('div', { id: 'wray-chat-messages' });
  const chatInput = el('input', { id: 'wray-chat-input', type: 'text', placeholder: 'Ask anything…', autocomplete: 'off' });
  const sendBtn   = el('button', { id: 'wray-chat-send', textContent: '→' });
  const inputRow  = el('div', { id: 'wray-chat-input-row' }, [chatInput, sendBtn]);
  const panel     = el('div', { id: 'wray-chat-panel' }, [header, messages, inputRow]);

  const callStatus = el('div', { id: 'wray-call-status' });
  callStatus.appendChild(el('span', { textContent: '🎙 Wray is listening…' }));
  callStatus.appendChild(document.createElement('br'));
  callStatus.appendChild(document.createTextNode('Click the mic button to end the call'));

  const chatFab = el('button', { className: 'wray-fab', id: 'wray-chat-btn', title: 'Chat with Wray', textContent: '💬' });
  const callFab = el('button', { className: 'wray-fab', id: 'wray-call-btn', title: 'Talk to Wray', textContent: '🎙' });

  const launcher = el('div', { id: 'wray-launcher' }, [callStatus, panel, chatFab, callFab]);
  document.body.appendChild(launcher);

  // Seed the first message safely via textContent
  addMessage('Hi! I\'m Wray, Hoyt Exteriors\' AI assistant. How can I help you today?', 'agent');

  // ─── Chat Logic ──────────────────────────────────────────────────────────

  let chatSessionId = null;

  chatFab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) chatInput.focus();
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));
  sendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  function addMessage(text, role) {
    const div = el('div', { className: 'wray-msg ' + role });
    div.textContent = text; // always textContent — never innerHTML
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  async function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    addMessage(text, 'user');
    const typing = addMessage('Typing…', 'agent typing');

    try {
      const res = await fetch(SERVER + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: chatSessionId })
      });
      const data = await res.json();
      chatSessionId = data.sessionId;
      typing.remove();
      addMessage(data.reply, 'agent');
    } catch {
      typing.remove();
      addMessage('Having trouble connecting. Call us at (651) 212-4965!', 'agent');
    }
  }

  // ─── Voice Call Logic ────────────────────────────────────────────────────

  let callActive     = false;
  let ws             = null;
  let audioCtx       = null;
  let micStream      = null;
  let processor      = null;
  let audioQueue     = [];
  let isPlayingAudio = false;

  callFab.addEventListener('click', () => callActive ? endCall() : startCall());

  async function startCall() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
    } catch {
      alert('Microphone access is required to call Wray. Please allow mic access and try again.');
      return;
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    ws = new WebSocket(WS_SERVER + '/web-call');
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      callActive = true;
      callFab.classList.add('active');
      callFab.title = 'End call';
      callFab.textContent = '📵';
      callStatus.classList.add('open');
      startMic();
    };

    ws.onmessage = (event) => {
      audioQueue.push(new Int16Array(event.data));
      if (!isPlayingAudio) playNextChunk();
    };

    ws.onclose = ws.onerror = () => endCall();
  }

  function startMic() {
    const source = audioCtx.createMediaStreamSource(micStream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!callActive || !ws || ws.readyState !== WebSocket.OPEN) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767));
      }
      ws.send(i16.buffer);
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  }

  function playNextChunk() {
    if (audioQueue.length === 0) { isPlayingAudio = false; return; }
    isPlayingAudio = true;
    const pcm16 = audioQueue.shift();
    const buf = audioCtx.createBuffer(1, pcm16.length, 24000);
    const data = buf.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) data[i] = pcm16[i] / 32768;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = playNextChunk;
    src.start();
  }

  function endCall() {
    callActive = false;
    callFab.classList.remove('active');
    callFab.title = 'Talk to Wray';
    callFab.textContent = '🎙';
    callStatus.classList.remove('open');
    processor && processor.disconnect();
    micStream && micStream.getTracks().forEach((t) => t.stop());
    ws && ws.close();
    audioQueue = []; isPlayingAudio = false;
    processor = null; micStream = null; ws = null;
    audioCtx && audioCtx.close().then(() => { audioCtx = null; });
  }
})();
