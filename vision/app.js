/**
 * HOYT VISION - Application Logic
 * AI-Powered Field Inspection Assistant
 *
 * Handles:
 * - File upload & preview
 * - Live camera feed capture
 * - Gemini Vision API integration
 * - OpenClaw/Wraybot tool execution
 * - Chat interface & messaging
 * - Voice input/output
 * - Settings persistence
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
    currentMode: 'upload', // 'upload' or 'camera'
    currentImage: null,
    currentImageBase64: null,
    cameraStream: null,
    isRecording: false,
    chatMessages: [],
    isProcessing: false,
    voiceRecognition: null,
    voiceIsActive: false,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeSettings();
    initializeEventListeners();
    initializeVoiceInput();
    console.log('Hoyt Vision initialized');
});

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

function initializeSettings() {
    const savedSettings = JSON.parse(localStorage.getItem('hoytVisionSettings') || '{}');

    const geminiKey = document.getElementById('geminiKey');
    const wraybotUrl = document.getElementById('wraybotUrl');
    const wraybotToken = document.getElementById('wraybotToken');
    const enableVoiceOutput = document.getElementById('enableVoiceOutput');

    geminiKey.value = savedSettings.geminiKey || 'AIzaSyCt4mtXYoafxagEWa3JRAkZT5QYJXEjxE8';
    wraybotUrl.value = savedSettings.wraybotUrl || '';
    wraybotToken.value = savedSettings.wraybotToken || '';
    if (savedSettings.enableVoiceOutput !== undefined) enableVoiceOutput.checked = savedSettings.enableVoiceOutput;
}

function getSettings() {
    return {
        geminiKey: document.getElementById('geminiKey').value,
        wraybotUrl: document.getElementById('wraybotUrl').value,
        wraybotToken: document.getElementById('wraybotToken').value,
        enableVoiceOutput: document.getElementById('enableVoiceOutput').checked,
    };
}

function saveSettings() {
    const settings = getSettings();
    localStorage.setItem('hoytVisionSettings', JSON.stringify(settings));
    showNotification('Settings saved successfully');
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initializeEventListeners() {
    // Settings
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.querySelector('.settings-overlay').addEventListener('click', closeSettings);

    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Upload
    const dragDropZone = document.getElementById('dragDropZone');
    dragDropZone.addEventListener('click', () => document.getElementById('fileInput').click());
    dragDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dragDropZone.classList.add('dragover');
    });
    dragDropZone.addEventListener('dragleave', () => dragDropZone.classList.remove('dragover'));
    dragDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDropZone.classList.remove('dragover');
        handleFileDrop(e.dataTransfer.files);
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
        handleFileDrop(e.target.files);
    });

    document.getElementById('clearPreviewBtn').addEventListener('click', clearPreview);

    // Camera
    document.getElementById('toggleCameraBtn').addEventListener('click', toggleCamera);
    document.getElementById('captureFrameBtn').addEventListener('click', captureAndAnalyzeFrame);

    // Chat
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Voice
    document.getElementById('voiceInputBtn').addEventListener('click', toggleVoiceInput);
}

// ============================================================================
// SETTINGS PANEL
// ============================================================================

function openSettings() {
    document.getElementById('settingsPanel').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('active');
    document.body.style.overflow = '';
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function switchTab(tabName) {
    state.currentMode = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach((tab) => {
        tab.classList.toggle('active', tab.id === `${tabName}Tab`);
    });

    // Stop camera if switching away
    if (tabName !== 'camera') {
        stopCamera();
    }
}

// ============================================================================
// FILE UPLOAD & PREVIEW
// ============================================================================

function handleFileDrop(files) {
    if (files.length === 0) return;

    const file = files[0];
    const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'];

    if (!validTypes.some((type) => file.type.startsWith(type.split('/')[0]) || file.type === type)) {
        showNotification('Please upload a photo or video', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        state.currentImage = file;
        state.currentImageBase64 = e.target.result;
        displayPreview(file, e.target.result);
    };
    reader.readAsDataURL(file);
}

function displayPreview(file, dataUrl) {
    const previewContainer = document.getElementById('previewContainer');
    const preview = document.getElementById('preview');

    preview.innerHTML = '';

    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = dataUrl;
        preview.appendChild(img);
    } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = dataUrl;
        video.controls = true;
        preview.appendChild(video);
    }

    document.getElementById('dragDropZone').style.display = 'none';
    previewContainer.style.display = 'block';
}

function clearPreview() {
    state.currentImage = null;
    state.currentImageBase64 = null;
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('dragDropZone').style.display = 'flex';
    document.getElementById('fileInput').value = '';
}

// ============================================================================
// CAMERA MANAGEMENT
// ============================================================================

async function toggleCamera() {
    const btn = document.getElementById('toggleCameraBtn');
    const captureBtn = document.getElementById('captureFrameBtn');
    const status = document.getElementById('cameraStatus');

    if (!state.cameraStream) {
        btn.textContent = 'Stop Camera';
        status.textContent = 'Starting camera...';
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            };

            state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            document.getElementById('videoElement').srcObject = state.cameraStream;
            status.textContent = 'Camera ready';
            captureBtn.disabled = false;
            state.isRecording = true;

            // Start auto-capture loop
            startAutoCapture();
        } catch (err) {
            console.error('Camera error:', err);
            status.textContent = 'Camera access denied';
            btn.textContent = 'Start Camera';
            showNotification('Unable to access camera', 'error');
        }
    } else {
        stopCamera();
        btn.textContent = 'Start Camera';
        captureBtn.disabled = true;
        status.textContent = 'Camera stopped';
    }
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
        state.isRecording = false;
    }
}

// Capture frames at ~1fps for continuous analysis
let captureInterval = null;

function startAutoCapture() {
    captureInterval = setInterval(() => {
        if (state.isRecording && !state.isProcessing) {
            // Capture frame but don't analyze automatically
            // User will click "Analyze Frame" button
        }
    }, 1000);
}

async function captureAndAnalyzeFrame() {
    if (!state.cameraStream) return;

    const video = document.getElementById('videoElement');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const frameBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
    state.currentImageBase64 = frameBase64;

    // Analyze the frame
    await analyzeImage('Camera frame captured. What do you see?');
}

// ============================================================================
// GEMINI INTEGRATION
// ============================================================================

async function analyzeImage(userPrompt) {
    const settings = getSettings();

    if (!settings.geminiKey) {
        showNotification('Please configure Gemini API key in settings', 'error');
        return;
    }

    if (!state.currentImageBase64) {
        showNotification('No image selected', 'error');
        return;
    }

    showProcessing(true);

    try {
        // Add user message to chat
        addMessage(userPrompt, 'user');

        // Call Gemini API
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + settings.geminiKey, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: buildSystemPrompt() + '\n\nUser question: ' + userPrompt,
                            },
                            {
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: state.currentImageBase64,
                                },
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Gemini API error:', error);
            throw new Error(error.error?.message || 'API error');
        }

        const data = await response.json();
        const aiResponse = data.contents?.[0]?.parts?.[0]?.text || 'No response';

        // Check for tool calls
        if (aiResponse.includes('[TOOL_CALL]')) {
            await handleToolCall(aiResponse);
        } else {
            addMessage(aiResponse, 'ai');

            // Read response aloud if enabled
            if (getSettings().enableVoiceOutput) {
                speakText(aiResponse);
            }
        }
    } catch (err) {
        console.error('Analysis error:', err);
        addMessage(`Error: ${err.message}`, 'ai');
        showNotification('Analysis failed', 'error');
    }

    showProcessing(false);
}

function buildSystemPrompt() {
    return `You are Hoyt Vision, an AI field inspection assistant for Hoyt Exteriors, a roofing and exterior construction company in Apple Valley, MN.

Your role:
- Analyze photos and videos of roofs, siding, gutters, decks, windows, and other building exteriors
- Provide detailed inspection reports with observations about condition, damage, and needed repairs
- Answer questions about what's shown in images
- Provide professional, clear assessments that field technicians can use
- Suggest next steps and when repairs should be prioritized

Be direct, specific, and professional. Use technical language but keep it understandable.
Format responses clearly with sections when appropriate.
Always identify the type of damage (if any) and severity.
Mention material types observed (asphalt shingles, vinyl siding, etc.)
If you identify issues that need urgent attention, flag them clearly.

If the user asks you to perform an action that requires field service coordination, respond with:
[TOOL_CALL] action: create_job | customer: [name] | location: [address] | issue: [description] | priority: [high/medium/low]`;
}

async function handleToolCall(response) {
    const settings = getSettings();

    if (!settings.wraybotToken || !settings.wraybotUrl) {
        addMessage('Tool execution disabled: Wraybot not configured', 'ai');
        return;
    }

    try {
        // Parse tool call from response
        const toolMatch = response.match(/\[TOOL_CALL\](.*?)\n/s);
        if (!toolMatch) {
            addMessage(response, 'ai');
            return;
        }

        const toolCall = toolMatch[1];

        // Route to Wraybot
        const wraybotResponse = await fetch(`${settings.wraybotUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.wraybotToken}`,
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        content: `Execute this tool call:\n${toolCall}`,
                    },
                ],
                channel: 'web',
            }),
        });

        if (!wraybotResponse.ok) {
            throw new Error('Wraybot execution failed');
        }

        const wraybotData = await wraybotResponse.json();
        const result = wraybotData.choices?.[0]?.message?.content || 'Tool executed';

        addMessage(result, 'ai');
    } catch (err) {
        console.error('Tool call error:', err);
        addMessage(`Tool execution error: ${err.message}`, 'ai');
    }
}

// ============================================================================
// CHAT INTERFACE
// ============================================================================

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    messageDiv.appendChild(bubble);

    document.getElementById('chatMessages').appendChild(messageDiv);
    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;

    state.chatMessages.push({ text, sender, timestamp: new Date() });
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message) return;

    input.value = '';

    if (!state.currentImageBase64) {
        addMessage(message, 'user');
        addMessage('Please upload a photo or capture a camera frame first', 'ai');
        return;
    }

    await analyzeImage(message);
}

// ============================================================================
// VOICE INPUT/OUTPUT
// ============================================================================

function initializeVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        document.getElementById('voiceInputBtn').disabled = true;
        document.getElementById('voiceInputBtn').title = 'Voice input not supported on this device';
        return;
    }

    state.voiceRecognition = new SpeechRecognition();
    state.voiceRecognition.continuous = false;
    state.voiceRecognition.interimResults = false;
    state.voiceRecognition.lang = 'en-US';

    state.voiceRecognition.onstart = () => {
        state.voiceIsActive = true;
        document.getElementById('voiceInputBtn').classList.add('active');
        document.getElementById('voiceIndicator').style.display = 'flex';
    };

    state.voiceRecognition.onend = () => {
        state.voiceIsActive = false;
        document.getElementById('voiceInputBtn').classList.remove('active');
        document.getElementById('voiceIndicator').style.display = 'none';
    };

    state.voiceRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        if (event.results[0].isFinal) {
            document.getElementById('chatInput').value = transcript;
        }
    };

    state.voiceRecognition.onerror = (event) => {
        console.error('Voice error:', event.error);
        showNotification(`Voice error: ${event.error}`, 'error');
    };
}

function toggleVoiceInput() {
    if (!state.voiceRecognition) return;

    if (state.voiceIsActive) {
        state.voiceRecognition.stop();
    } else {
        state.voiceRecognition.start();
    }
}

function speakText(text) {
    if (!('speechSynthesis' in window)) {
        console.warn('Text-to-speech not supported');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showProcessing(show) {
    state.isProcessing = show;
    const indicator = document.getElementById('processingIndicator');
    indicator.style.display = show ? 'flex' : 'none';
    document.getElementById('sendBtn').disabled = show;
    document.getElementById('captureFrameBtn').disabled = show;
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Could be enhanced with a toast notification UI
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

window.addEventListener('error', (e) => {
    console.error('Global error:', e);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e);
});
