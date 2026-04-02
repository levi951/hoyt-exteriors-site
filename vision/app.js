/**
 * HOYT VISION — Web Application
 * AI-Powered Field Inspection Assistant
 * Hoyt Exteriors · Apple Valley, MN · Est. 2000
 *
 * Architecture:
 *   Camera/Upload → Gemini Vision API → AI Response
 *   Tool calls → Wray OpenClaw Gateway → KB / Jobber / Team
 *
 * No backend required. Runs entirely in-browser.
 * Degrades gracefully when Wray gateway is unreachable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS (persisted in-memory for session, localStorage for persistence)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
    wrayUrl: '',  // Set in Settings — e.g. http://wray:18789 (Tailscale) or gateway IP
    wrayToken: '',
    geminiKey: '',
    role: 'tech',
    voiceOutput: true,
    autoAnalyze: false,
};

let settings = { ...DEFAULTS };

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('hoyt-vision') || '{}');
        settings = { ...DEFAULTS, ...saved };
    } catch { /* use defaults */ }
}

function saveSettingsToDisk() {
    try {
        localStorage.setItem('hoyt-vision', JSON.stringify(settings));
    } catch { /* storage full or blocked */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

const state = {
    cameraStream: null,
    facingMode: 'environment',
    currentImageB64: null,     // base64 without prefix
    currentImageDataUrl: null, // full data URL for thumbnails
    isProcessing: false,
    wrayOnline: false,
    gpsCoords: null,
    voiceRecognition: null,
    voiceActive: false,
    chatHistory: [],           // {role, content} for Gemini context
};

// ─────────────────────────────────────────────────────────────────────────────
// SAFE MARKDOWN RENDERING
// ─────────────────────────────────────────────────────────────────────────────

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        const rawHtml = marked.parse(text, { breaks: true });
        return DOMPurify.sanitize(rawHtml);
    }
    // Fallback: escape HTML and return as-is
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt() {
    const role = settings.role;
    const roleContext = {
        tech: 'You are assisting a field technician doing on-site inspections.',
        john: 'You are assisting John, the Service Manager, who coordinates field operations.',
        jonny: 'You are assisting Jonny, the Project Manager, who manages larger projects.',
        lisa: 'You are assisting Lisa, the Office Manager, who handles scheduling and customer communication.',
        levi: 'You are assisting Levi, the owner. Full access to all information.',
        paul: 'You are assisting Paul, co-owner. Keep responses clear and simple.',
    }[role] || '';

    return `You are Hoyt Vision, the AI field inspection assistant for Hoyt Exteriors — a 3rd-generation, family-owned exterior construction company in Apple Valley, Minnesota. Est. 2000.

${roleContext}

## YOUR EXPERTISE
You are an expert in residential and commercial exterior construction with deep knowledge of:

**Roofing:** Asphalt shingles (3-tab, architectural, luxury), metal roofing (standing seam, corrugated), flat/low-slope (TPO, EPDM, modified bitumen), cedar shakes, slate, tile. Ice & water shield requirements, ridge vents, valley flashing, pipe boots, step flashing, drip edge.

**Siding:** LP SmartSide (engineered wood — must be back-primed, gaps per LP specs), vinyl, fiber cement (HardiePlank), cedar, stucco, stone veneer, EIFS. J-channel, utility trim, starter strips, house wrap (Tyvek).

**Gutters:** K-style, half-round, box gutters. Aluminum, copper, galvanized. Seamless vs sectional. Gutter guards (micro-mesh, reverse curve, foam, screen). Downspout sizing, splash blocks, underground drainage.

**Decks & Concrete:** Composite (Trex, TimberTech), pressure-treated lumber, cedar, PVC. Ledger board flashing, post footings (42" frost line in MN), joist hangers, railing code (36"/42" height, 4" baluster spacing). Concrete flatwork, stoops, steps, mudjacking, poly-leveling.

**Windows & Insulation:** Vinyl, fiberglass, wood-clad, aluminum. Double/triple pane, Low-E, argon fill. Proper flashing tape sequence. Blown-in cellulose, fiberglass batts, spray foam, attic insulation R-values for MN (R-49 to R-60).

## MINNESOTA-SPECIFIC KNOWLEDGE
- **Frost line:** 42 inches — all footings must go below this
- **Ice dams:** Caused by heat loss + freeze-thaw cycles. Proper fix = air sealing + insulation + ventilation, NOT just ice guard
- **Freeze-thaw cycles:** Major cause of concrete spalling, siding gaps, and roof damage
- **Wind:** Design for 90+ mph wind zones. Shingle nailing patterns critical
- **Snow load:** Roof structures must handle 35-50 psf ground snow load
- **Building codes:** Minnesota State Building Code (based on IRC/IBC), plus local amendments
- **Common insurance claims:** Wind, hail, ice dams, water intrusion

## INSPECTION PROTOCOL
When analyzing photos:
1. **Identify materials** — What type, brand if visible, approximate age
2. **Assess condition** — Rate as Good / Fair / Poor / Critical
3. **Document damage** — Type, location, extent, likely cause
4. **Prioritize** — Immediate safety concern > Water intrusion risk > Cosmetic
5. **Recommend** — Repair vs replace, estimated scope, urgency
6. **Flag** — Anything that needs a closer look or specialist

## RESPONSE STYLE
- Be direct and specific. Field techs need actionable info, not essays.
- Use technical terms but explain if uncommon.
- When you see damage, say what it is, how bad, and what to do about it.
- If you're not sure, say so — don't guess on structural issues.
- For cost questions, give ranges and note that final pricing requires on-site measurement.

## ESCALATION TRIGGERS
Flag for immediate manager attention if you see:
- Structural damage (sagging ridge, compromised rafters, foundation cracks)
- Active water intrusion
- Mold or rot
- Electrical hazards near exterior work
- Asbestos-era materials (pre-1980 siding, insulation, floor tiles)
- Code violations that could affect safety

## TOOL DELEGATION
If the user asks you to look something up in the company knowledge base, check pricing, create a ticket, or message the team — acknowledge the request and note that it requires the Wray gateway connection. Do NOT fabricate company-specific pricing or scheduling information.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI API
// ─────────────────────────────────────────────────────────────────────────────

async function callGemini(userMessage) {
    if (!settings.geminiKey) {
        throw new Error('Gemini API key not configured. Open Settings to add it.');
    }

    // Build conversation context (last 6 turns for efficiency)
    const recentHistory = state.chatHistory.slice(-6);
    const parts = [];

    // System instruction + conversation context
    let contextText = buildSystemPrompt() + '\n\n';
    for (const msg of recentHistory) {
        contextText += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
    }
    contextText += `User: ${userMessage}`;
    parts.push({ text: contextText });

    // Attach current image if available
    if (state.currentImageB64) {
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: state.currentImageB64,
            }
        });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiKey}`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 2048,
            },
        }),
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error (${resp.status})`);
    }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// WRAY GATEWAY (OpenClaw)
// ─────────────────────────────────────────────────────────────────────────────

async function checkWrayConnection() {
    if (!settings.wrayUrl || !settings.wrayToken) {
        updateConnectionStatus('offline');
        return;
    }
    updateConnectionStatus('checking');
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(`${settings.wrayUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.wrayToken}`,
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'ping' }],
                channel: 'web',
                max_tokens: 5,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        state.wrayOnline = resp.ok;
        updateConnectionStatus(resp.ok ? 'online' : 'offline');
    } catch {
        state.wrayOnline = false;
        updateConnectionStatus('offline');
    }
}

async function queryWray(message) {
    if (!state.wrayOnline) return null;

    const sessionKey = `agent:main:${settings.role === 'tech' ? 'tech' : settings.role}`;

    try {
        const resp = await fetch(`${settings.wrayUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.wrayToken}`,
                'x-session-key': sessionKey,
                'x-channel': 'vision-web',
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: message }],
                channel: 'vision-web',
            }),
        });

        if (!resp.ok) return null;
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || null;
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────────────────────────────────────

async function startCamera() {
    try {
        if (state.cameraStream) stopCamera();

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: state.facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false,
        });

        state.cameraStream = stream;
        const video = document.getElementById('videoEl');
        video.srcObject = stream;

        document.getElementById('cameraPlaceholder').classList.add('hidden');
        document.getElementById('cameraHud').style.display = '';
        document.getElementById('captureBtn').disabled = false;
        document.getElementById('flipCameraBtn').disabled = false;
        document.getElementById('startCameraBtn').textContent = 'Stop Camera';

        requestGPS();
        toast('Camera ready', 'success');
    } catch (err) {
        console.error('Camera error:', err);
        toast('Camera access denied — check permissions', 'error');
    }
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
        state.cameraStream = null;
    }
    const video = document.getElementById('videoEl');
    video.srcObject = null;
    document.getElementById('cameraPlaceholder').classList.remove('hidden');
    document.getElementById('cameraHud').style.display = 'none';
    document.getElementById('captureBtn').disabled = true;
    document.getElementById('flipCameraBtn').disabled = true;
    document.getElementById('startCameraBtn').textContent = 'Start Camera';
}

function captureFrame() {
    const video = document.getElementById('videoEl');
    if (!video.videoWidth) return;

    const canvas = document.getElementById('captureCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    state.currentImageDataUrl = dataUrl;
    state.currentImageB64 = dataUrl.split(',')[1];

    // Flash effect
    const wrapper = document.querySelector('.camera-wrapper');
    wrapper.style.opacity = '0.5';
    setTimeout(() => { wrapper.style.opacity = '1'; }, 100);

    toast('Photo captured', 'success');

    if (settings.autoAnalyze) {
        sendMessage('What do you see? Identify any damage or issues.');
    }
}

async function flipCamera() {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    const label = document.getElementById('cameraLabel');
    label.textContent = state.facingMode === 'environment' ? 'REAR CAM' : 'FRONT CAM';
    await startCamera();
}

function requestGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            state.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const label = document.getElementById('gpsLabel');
            label.textContent = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        },
        () => {
            document.getElementById('gpsLabel').textContent = 'GPS: unavailable';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

function handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast('Please select a photo or video', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        state.currentImageDataUrl = dataUrl;
        state.currentImageB64 = dataUrl.split(',')[1];

        document.getElementById('dropZone').style.display = 'none';
        const previewBox = document.getElementById('previewBox');
        previewBox.style.display = 'block';
        document.getElementById('previewImg').src = dataUrl;

        toast('Photo loaded', 'success');
    };
    reader.readAsDataURL(file);
}

function clearFilePreview() {
    state.currentImageDataUrl = null;
    state.currentImageB64 = null;
    document.getElementById('previewBox').style.display = 'none';
    document.getElementById('dropZone').style.display = '';
    document.getElementById('fileInput').value = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT & MESSAGING
// ─────────────────────────────────────────────────────────────────────────────

function addMessage(role, content, opts = {}) {
    const container = document.getElementById('messages');

    // Remove welcome on first message
    const welcome = container.querySelector('.welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `msg ${role}`;

    // Thumbnail for user messages with images
    if (role === 'user' && opts.thumb) {
        const img = document.createElement('img');
        img.className = 'msg-thumb';
        img.src = opts.thumb;
        div.appendChild(img);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (role === 'ai') {
        // Render markdown safely via DOMPurify for AI responses
        bubble.innerHTML = renderMarkdown(content);
    } else {
        bubble.textContent = content;
    }

    div.appendChild(bubble);

    // Metadata
    if (opts.meta) {
        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        meta.textContent = opts.meta;
        div.appendChild(meta);
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    return div;
}

function addTypingIndicator() {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.id = 'typingIndicator';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble typing-indicator';
    bubble.innerHTML = DOMPurify.sanitize('<span></span><span></span><span></span>');
    div.appendChild(bubble);

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

async function sendMessage(forcedText) {
    const input = document.getElementById('chatInput');
    const text = forcedText || input.value.trim();
    if (!text || state.isProcessing) return;

    input.value = '';
    updateSendButton();
    state.isProcessing = true;

    // Show user message (with image thumbnail if image is attached)
    addMessage('user', text, {
        thumb: state.currentImageB64 ? state.currentImageDataUrl : null,
        meta: state.gpsCoords
            ? `${new Date().toLocaleTimeString()} · ${state.gpsCoords.lat.toFixed(4)}, ${state.gpsCoords.lng.toFixed(4)}`
            : new Date().toLocaleTimeString(),
    });

    state.chatHistory.push({ role: 'user', content: text });

    addTypingIndicator();

    try {
        const response = await callGemini(text);
        removeTypingIndicator();

        let meta = new Date().toLocaleTimeString();
        if (state.wrayOnline) {
            meta += ' · Wray connected';
        }

        addMessage('ai', response, { meta });
        state.chatHistory.push({ role: 'assistant', content: response });

        // Voice output
        if (settings.voiceOutput) {
            speak(response);
        }

    } catch (err) {
        removeTypingIndicator();
        addMessage('ai', `**Error:** ${err.message}\n\nMake sure your Gemini API key is configured in Settings.`, {
            meta: 'Error',
        });
        toast(err.message, 'error');
    }

    state.isProcessing = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE
// ─────────────────────────────────────────────────────────────────────────────

function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        document.getElementById('voiceBtn').style.display = 'none';
        return;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        state.voiceActive = true;
        document.getElementById('voiceBtn').classList.add('active');
    };

    recognition.onend = () => {
        state.voiceActive = false;
        document.getElementById('voiceBtn').classList.remove('active');
    };

    recognition.onresult = (e) => {
        let final = '';
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                final += transcript;
            } else {
                interim += transcript;
            }
        }

        const input = document.getElementById('chatInput');
        if (final) {
            input.value = final;
            updateSendButton();
            // Auto-send after voice recognition completes
            setTimeout(() => sendMessage(), 300);
        } else {
            input.value = interim;
        }
    };

    recognition.onerror = (e) => {
        if (e.error !== 'no-speech') {
            toast(`Voice error: ${e.error}`, 'error');
        }
    };

    state.voiceRecognition = recognition;
}

function toggleVoice() {
    if (!state.voiceRecognition) return;
    if (state.voiceActive) {
        state.voiceRecognition.stop();
    } else {
        state.voiceRecognition.start();
    }
}

function speak(text) {
    if (!('speechSynthesis' in window) || !settings.voiceOutput) return;

    // Strip markdown for cleaner speech
    const clean = text
        .replace(/#{1,4}\s*/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[-*] /g, '')
        .trim();

    // Limit speech length (long responses are tedious to listen to)
    const truncated = clean.length > 500 ? clean.substring(0, 500) + '...' : clean;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(truncated);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function updateConnectionStatus(status) {
    const pill = document.getElementById('connectionStatus');
    pill.className = `status-pill ${status}`;
    const text = pill.querySelector('.status-text');
    text.textContent = status === 'online' ? 'Wray' : status === 'checking' ? 'Checking...' : 'Offline';
}

function updateSendButton() {
    const input = document.getElementById('chatInput');
    document.getElementById('sendBtn').disabled = !input.value.trim();
}

function toast(message, type = 'info') {
    const container = document.getElementById('toasts');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = message;
    container.appendChild(div);

    setTimeout(() => {
        div.classList.add('out');
        setTimeout(() => div.remove(), 200);
    }, 3000);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `${tabName}Tab`));

    if (tabName !== 'camera') stopCamera();
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS UI
// ─────────────────────────────────────────────────────────────────────────────

function openSettings() {
    document.getElementById('settingsDrawer').classList.add('open');
    document.getElementById('geminiKey').value = settings.geminiKey || '';
    document.getElementById('wrayUrl').value = settings.wrayUrl || '';
    document.getElementById('wrayToken').value = settings.wrayToken || '';
    document.getElementById('roleSelect').value = settings.role || 'tech';
    document.getElementById('voiceToggle').checked = settings.voiceOutput;
    document.getElementById('autoAnalyze').checked = settings.autoAnalyze;
}

function closeSettingsDrawer() {
    document.getElementById('settingsDrawer').classList.remove('open');
}

function applySettings() {
    settings.geminiKey = document.getElementById('geminiKey').value.trim();
    settings.wrayUrl = document.getElementById('wrayUrl').value.trim().replace(/\/$/, '');
    settings.wrayToken = document.getElementById('wrayToken').value.trim();
    settings.role = document.getElementById('roleSelect').value;
    settings.voiceOutput = document.getElementById('voiceToggle').checked;
    settings.autoAnalyze = document.getElementById('autoAnalyze').checked;

    saveSettingsToDisk();
    toast('Settings saved', 'success');
    closeSettingsDrawer();
    checkWrayConnection();
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initVoice();

    // Configure marked.js
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    // Header
    document.getElementById('settingsBtn').addEventListener('click', openSettings);

    // Settings drawer
    document.getElementById('closeSettings').addEventListener('click', closeSettingsDrawer);
    document.querySelector('.drawer-backdrop').addEventListener('click', closeSettingsDrawer);
    document.getElementById('saveSettings').addEventListener('click', applySettings);
    document.getElementById('testConnection').addEventListener('click', async () => {
        toast('Testing Wray connection...', 'info');
        settings.wrayUrl = document.getElementById('wrayUrl').value.trim().replace(/\/$/, '');
        settings.wrayToken = document.getElementById('wrayToken').value.trim();
        await checkWrayConnection();
        toast(state.wrayOnline ? 'Wray is online!' : 'Wray unreachable — check URL and token', state.wrayOnline ? 'success' : 'error');
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Camera
    document.getElementById('startCameraBtn').addEventListener('click', () => {
        state.cameraStream ? stopCamera() : startCamera();
    });
    document.getElementById('cameraPlaceholder').addEventListener('click', startCamera);
    document.getElementById('captureBtn').addEventListener('click', captureFrame);
    document.getElementById('flipCameraBtn').addEventListener('click', flipCamera);

    // Upload
    const dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
    });
    document.getElementById('fileInput').addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelect(e.target.files[0]);
    });
    document.getElementById('clearPreview').addEventListener('click', clearFilePreview);

    // Chat input
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('input', updateSendButton);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('sendBtn').addEventListener('click', () => sendMessage());

    // Voice
    document.getElementById('voiceBtn').addEventListener('click', toggleVoice);

    // Quick actions
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (!state.currentImageB64) {
                toast('Capture or upload a photo first', 'info');
                return;
            }
            sendMessage(prompt);
        });
    });

    // Check Wray on load + periodic
    checkWrayConnection();
    setInterval(checkWrayConnection, 60000);

    console.log('Hoyt Vision initialized');
});

// Global error handling
window.addEventListener('error', (e) => console.error('Error:', e));
window.addEventListener('unhandledrejection', (e) => console.error('Unhandled:', e));
