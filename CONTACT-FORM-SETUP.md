# Contact Form — AI-Powered Setup Guide

## What This Does

When someone submits the contact form:
1. **Claude AI** analyzes the lead (priority, summary, suggested next step)
2. **You get an email** with all lead info + the AI notes (styled, looks premium)
3. **Customer gets an auto-reply** — AI-written, personalized to their request
4. **Jane's API logs it** to Supabase in the background

## 5-Minute Setup

### Step 1 — Get a Resend API Key (free)
1. Go to [resend.com](https://resend.com) → Sign up (free, 3,000 emails/mo)
2. Add your domain: **hoytexteriors.com** → verify DNS (Cloudflare handles this automatically)
3. Create an API key → copy it

### Step 2 — Add Environment Variables in Cloudflare
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select your **hoyt-exteriors-site** Pages project
3. Settings → **Environment Variables** → Production → Edit
4. Add these variables:

| Variable | Value |
|----------|-------|
| `CLAUDE_API_KEY` | Your Anthropic API key (from console.anthropic.com) |
| `RESEND_API_KEY` | Your Resend API key |
| `FROM_EMAIL` | `leads@hoytexteriors.com` (must be verified in Resend) |
| `NOTIFY_EMAIL` | `levi@hoytexteriors.com,lisa@hoytexteriors.com` |
| `JANE_API_URL` | Jane's internal lead pipeline URL (ask Levi or check Cloudflare env vars) |

5. Click **Save** → redeploy (push any commit or trigger manual deploy)

### Step 3 — Push the Code
```bash
cd ~/Code/hoyt-exteriors-site
git add functions/ app.js
git commit -m "Add AI-powered contact form (Cloudflare Pages Function + Claude + Resend)"
git push origin main
```
Cloudflare deploys in ~30 seconds. Done.

## What the Emails Look Like

**Alert to Levi/Lisa:**
- Lead name, email, phone, services, message
- AI badge: HIGH / MEDIUM / LOW priority with reason
- AI summary of what they need
- AI-suggested next step ("Call within 2 hours — HOA property manager asking about full exterior")
- One-click Reply and Call buttons

**Auto-reply to customer:**
- Clean branded email, dark header
- AI-written personal response specific to their service request
- Your phone number for urgent inquiries
- Signed "The Hoyt Exteriors Team"

## No API Keys Yet? Fallback

If Resend isn't set up yet, the form still falls back to opening the user's mail client (`mailto:`) so leads are never lost.

## Files Changed
- `functions/api/contact.js` — new Cloudflare Pages Function (the whole brain)
- `app.js` — form now POSTs to `/api/contact` first
