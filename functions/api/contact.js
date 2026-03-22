/**
 * Hoyt Exteriors â Contact Form Handler
 * Cloudflare Pages Function â /api/contact
 *
 * Flow:
 *   1. Validate form data
 *   2. Claude AI analyzes the lead (priority, service type, suggested reply)
 *   3. Send alert email to Levi/Lisa via Resend (with AI notes)
 *   4. Send personalized auto-reply to customer via Resend
 *   5. Log lead to Jane's API (Supabase pipeline)
 *
 * Env vars required in Cloudflare Pages â Settings â Environment Variables:
 *   CLAUDE_API_KEY   â your Anthropic API key
 *   RESEND_API_KEY   â from resend.com (free tier: 3,000 emails/mo)
 *   JANE_API_URL     â http://159.203.114.9:3001/leads (internal, called server-side)
 *   NOTIFY_EMAIL     â who gets the alert (e.g. levi@hoytexteriors.com,lisa@hoytexteriors.com)
 *   FROM_EMAIL       â verified sender (e.g. noreply@hoytexteriors.com)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // ââ CORS headers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://www.hoytexteriors.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // ââ Parse body ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body' }, 400, corsHeaders);
  }

  const {
    firstName = '',
    lastName  = '',
    email     = '',
    phone     = '',
    message   = '',
    source    = 'website',
    smsConsent = 'no',
  } = body;

  // Collect checked services (FormData sends multiple values; we join them)
  const services = Array.isArray(body.services)
    ? body.services.join(', ')
    : body.services || 'Not specified';

  // ââ Basic validation ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (!firstName.trim() || !email.trim()) {
    return json({ ok: false, error: 'Missing required fields' }, 422, corsHeaders);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Invalid email address' }, 422, corsHeaders);
  }

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });

  // ââ 1. Claude AI lead analysis ââââââââââââââââââââââââââââââââââââââââââââ
  let aiAnalysis = null;
  try {
    aiAnalysis = await analyzeLeadWithClaude(env.CLAUDE_API_KEY, {
      fullName, email, phone, services, message, source,
    });
  } catch (err) {
    console.error('Claude analysis failed (non-fatal):', err.message);
  }

  // ââ 2. Send alert email to Levi/Lisa âââââââââââââââââââââââââââââââââââââ
  const notifyAddresses = (env.NOTIFY_EMAIL || 'levi@hoytexteriors.com')
    .split(',')
    .map(e => e.trim());

  try {
    await sendEmail(env.RESEND_API_KEY, {
      from: env.FROM_EMAIL || 'leads@hoytexteriors.com',
      to: notifyAddresses,
      subject: `ð´ New Lead: ${fullName} â ${services}`,
      html: buildAlertEmail({ fullName, email, phone, services, message, source, smsConsent, timestamp, aiAnalysis }),
    });
  } catch (err) {
    console.error('Alert email failed:', err.message);
    // Don't abort â still try to send auto-reply and log
  }

  // ââ 3. Send auto-reply to customer ââââââââââââââââââââââââââââââââââââââââ
  if (email) {
    try {
      const autoReplyText = aiAnalysis?.autoReply || buildDefaultAutoReply(fullName, services);
      await sendEmail(env.RESEND_API_KEY, {
        from: env.FROM_EMAIL || 'leads@hoytexteriors.com',
        to: [email],
        subject: `We got your message, ${firstName} â Hoyt Exteriors`,
        html: buildAutoReplyEmail(firstName, autoReplyText),
      });
    } catch (err) {
      console.error('Auto-reply failed (non-fatal):', err.message);
    }
  }

  // ââ 4. Log to Jane's API (Supabase pipeline) ââââââââââââââââââââââââââââââ
  // This is called server-side so HTTP is fine (Workers can call anything)
  try {
    const janeUrl = env.JANE_API_URL || 'http://159.203.114.9:3001/leads';
    await fetch(janeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName, lastName, email, phone, services, message,
        source, smsConsent,
        aiPriority: aiAnalysis?.priority || 'unknown',
        aiSummary:  aiAnalysis?.summary  || '',
      }),
    });
  } catch (err) {
    console.error('Jane API log failed (non-fatal):', err.message);
  }

  return json({ ok: true, message: 'Lead received. Talk soon!' }, 200, corsHeaders);
}

// Handle preflight CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://www.hoytexteriors.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Claude AI lead analysis
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function analyzeLeadWithClaude(apiKey, lead) {
  if (!apiKey) throw new Error('No CLAUDE_API_KEY configured');

  const prompt = `You are the AI assistant for Hoyt Exteriors, a premium exterior construction company in Apple Valley, MN (roofing, siding, gutters, windows, decks, insulation). You are analyzing a new inbound lead.

Lead info:
- Name: ${lead.fullName}
- Email: ${lead.email}
- Phone: ${lead.phone || 'not provided'}
- Services interested in: ${lead.services}
- Message: ${lead.message || 'none'}
- Source page: ${lead.source}

Respond ONLY with valid JSON in this exact shape:
{
  "priority": "high" | "medium" | "low",
  "priorityReason": "one sentence why",
  "summary": "2-3 sentence plain-English summary of what this person needs and any red flags or signals",
  "suggestedNextStep": "specific action for Levi or Lisa to take",
  "autoReply": "a warm, personal 2-3 sentence reply to send to the customer confirming receipt and setting expectations. Sign off as 'The Hoyt Exteriors Team'. Do not use em dashes. Do not promise a specific callback time."
}

Priority guidance: high = commercial/multifamily or large residential project or urgent language; medium = standard residential request; low = general inquiry or info request only.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`Claude API error: ${resp.status}`);
  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  // Extract JSON even if Claude adds a tiny bit of prose
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}


// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Email helpers (Resend API)
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function sendEmail(apiKey, { from, to, subject, html }) {
  if (!apiKey) throw new Error('No RESEND_API_KEY configured');
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Resend error ${resp.status}: ${err}`);
  }
  return resp.json();
}

function buildAlertEmail({ fullName, email, phone, services, message, source, smsConsent, timestamp, aiAnalysis }) {
  const priorityColor = { high: '#C41E3A', medium: '#E07B00', low: '#2D7D2D' }[aiAnalysis?.priority] || '#888';
  const priorityLabel = (aiAnalysis?.priority || 'unknown').toUpperCase();

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
  .badge { display: inline-block; background: ${priorityColor}; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; }
  .card { background: #111; border: 1px solid #222; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .label { font-size: 11px; color: #888; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
  .value { font-size: 15px; color: #fff; margin-bottom: 14px; }
  .ai-box { background: #1a0a0a; border: 1px solid #C41E3A33; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .ai-title { color: #C41E3A; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px; }
  .cta { display: inline-block; background: #C41E3A; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: 700; font-size: 14px; margin-top: 8px; }
  .footer { color: #444; font-size: 12px; margin-top: 24px; border-top: 1px solid #222; padding-top: 16px; }
  a { color: #C41E3A; }
</style></head>
<body>
<div class="wrap">
  <div style="margin-bottom:20px;">
    <span style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:18px;color:#fff;">HOYT EXTERIORS</span>
    <span style="color:#444;font-size:13px;margin-left:8px;">New Lead Alert</span>
  </div>

  <div style="margin-bottom:16px;">
    <span class="badge">${priorityLabel} PRIORITY</span>
    <span style="color:#888;font-size:13px;margin-left:12px;">${timestamp} CST</span>
  </div>

  <div class="card">
    <div class="label">Contact</div>
    <div class="value" style="font-size:20px;font-weight:700;">${fullName}</div>
    <div class="label">Email</div>
    <div class="value"><a href="mailto:${email}">${email}</a></div>
    ${phone ? `<div class="label">Phone</div><div class="value"><a href="tel:${phone.replace(/\D/g,'')}">${phone}</a></div>` : ''}
    <div class="label">Services</div>
    <div class="value">${services}</div>
    <div class="label">Source</div>
    <div class="value">${source}</div>
    <div class="label">SMS Consent</div>
    <div class="value">${smsConsent === 'yes' ? 'â Yes â OK to text' : 'â No'}</div>
    ${message ? `<div class="label">Their Message</div><div class="value" style="color:#ccc;font-style:italic;">"${message}"</div>` : ''}
  </div>

  ${aiAnalysis ? `
  <div class="ai-box">
    <div class="ai-title">AI Analysis</div>
    <div class="label">Summary</div>
    <div class="value" style="color:#ccc;">${aiAnalysis.summary || 'â'}</div>
    <div class="label">Priority Reason</div>
    <div class="value" style="color:#ccc;">${aiAnalysis.priorityReason || 'â'}</div>
    <div class="label">Suggested Next Step</div>
    <div class="value" style="color:#C41E3A;font-weight:600;">${aiAnalysis.suggestedNextStep || 'â'}</div>
  </div>
  ` : ''}

  <a class="cta" href="mailto:${email}?subject=Re: Your Hoyt Exteriors Inquiry">Reply to ${firstName(fullName)}</a>
  ${phone ? `&nbsp;&nbsp;<a class="cta" style="background:#111;border:1px solid #333;" href="tel:${phone.replace(/\D/g,'')}">Call ${firstName(fullName)}</a>` : ''}

  <div class="footer">Hoyt Exteriors Â· Apple Valley, MN Â· (651) 212-4965</div>
</div>
</body>
</html>`;
}

function buildAutoReplyEmail(first, bodyText) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f4; color: #111; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
  .header { background: #0a0a0a; padding: 28px 32px; }
  .body { padding: 32px; }
  .footer { background: #f9f9f9; border-top: 1px solid #eee; padding: 20px 32px; font-size: 13px; color: #888; }
  a { color: #C41E3A; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <span style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:20px;color:#fff;">HOYT EXTERIORS</span>
    <div style="color:#888;font-size:12px;margin-top:4px;">Est. 2000 Â· Apple Valley, MN</div>
  </div>
  <div class="body">
    <p style="font-size:17px;font-weight:600;margin:0 0 16px;">Hey ${first},</p>
    <p style="color:#333;line-height:1.7;margin:0 0 16px;">${bodyText}</p>
    <p style="color:#333;line-height:1.7;margin:0 0 24px;">In the meantime, if anything is urgent â give us a call directly at <a href="tel:6512124965">(651) 212-4965</a>.</p>
    <p style="color:#333;margin:0;">The Hoyt Exteriors Team</p>
  </div>
  <div class="footer">
    Hoyt Exteriors Inc. Â· 15112 Galaxie Ave, Apple Valley, MN 55124<br>
    <a href="https://www.hoytexteriors.com">hoytexteriors.com</a> Â· (651) 212-4965
  </div>
</div>
</body>
</html>`;
}

function buildDefaultAutoReply(fullName, services) {
  return `Thanks for reaching out about ${services}. We received your message and will be in touch soon to learn more about your project and get you on the schedule.`;
}

// Extract first name from full name
function firstName(fullName) {
  return fullName.split(' ')[0] || fullName;
}

// JSON response helper
function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
