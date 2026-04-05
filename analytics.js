/**
 * Hoyt Exteriors — Visitor Analytics Tracker
 * Captures who visits, what they do, and when they convert.
 *
 * Events tracked:
 *  - Page views (automatic)
 *  - Time on page + scroll depth (automatic, on exit)
 *  - CTA clicks — "Get Free Estimate", phone number, quote widget
 *  - Form submissions (contact page)
 *  - Phone number clicks
 *  - Roofle widget interactions
 *
 * Data sent to: http://159.65.33.45:3000/api/analytics/track
 */
(function() {
  'use strict';

  const ENDPOINT = 'http://159.65.33.45:3000/api/analytics';
  const SESSION_KEY = 'hoyt_sid';
  const VISITOR_KEY = 'hoyt_vid';

  // ── Session / Visitor IDs ──────────────────────────────────────────────
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  var sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) { sessionId = uuid(); sessionStorage.setItem(SESSION_KEY, sessionId); }

  var visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) { visitorId = uuid(); localStorage.setItem(VISITOR_KEY, visitorId); }

  // ── UTM Parameters ─────────────────────────────────────────────────────
  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source:   params.get('utm_source'),
      utm_medium:   params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_term:     params.get('utm_term'),
      utm_content:  params.get('utm_content')
    };
  }

  // ── Page Timing ────────────────────────────────────────────────────────
  var pageStartTime = Date.now();
  var maxScrollDepth = 0;

  function getScrollDepth() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight,
      document.body.offsetHeight, document.documentElement.offsetHeight
    ) - window.innerHeight;
    return docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 100;
  }

  document.addEventListener('scroll', function() {
    maxScrollDepth = Math.max(maxScrollDepth, getScrollDepth());
  }, { passive: true });

  // ── Core Send Function ─────────────────────────────────────────────────
  function send(type, data) {
    var payload = Object.assign({
      session_id: sessionId,
      visitor_id: visitorId,
      type: type,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || null
    }, getUtmParams(), data);

    // Use sendBeacon for timing events (fires even during page unload)
    if (type === 'timing' && navigator.sendBeacon) {
      navigator.sendBeacon(
        ENDPOINT + '/track',
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
      return;
    }

    // Standard fetch for everything else
    fetch(ENDPOINT + '/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function() {}); // Silent fail — never break the site
  }

  function sendConversion(data) {
    fetch(ENDPOINT + '/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ session_id: sessionId }, data)),
      keepalive: true
    }).catch(function() {});
  }

  // ── Page View ──────────────────────────────────────────────────────────
  send('pageview', {
    title: document.title
  });

  // ── Page Exit Timing ───────────────────────────────────────────────────
  function sendExitTiming() {
    var timeOnPage = (Date.now() - pageStartTime) / 1000;
    send('timing', {
      time_on_page: timeOnPage,
      scroll_depth: maxScrollDepth
    });
  }

  window.addEventListener('beforeunload', sendExitTiming);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') sendExitTiming();
  });

  // ── CTA Click Tracking ─────────────────────────────────────────────────
  // Track every meaningful click automatically
  document.addEventListener('click', function(e) {
    var el = e.target;

    // Walk up DOM to find the actual link or button
    while (el && el !== document) {
      var tag = el.tagName && el.tagName.toLowerCase();
      var href = el.href || '';
      var text = (el.textContent || el.innerText || '').trim().substring(0, 80);
      var id = el.id || '';
      var cls = el.className || '';

      // Phone number click
      if (tag === 'a' && href.startsWith('tel:')) {
        send('event', {
          event_name: 'phone_click',
          event_category: 'conversion',
          event_label: href.replace('tel:', ''),
          element_id: id
        });
        sendConversion({ type: 'phone_click', source_page: window.location.pathname });
        break;
      }

      // Email click
      if (tag === 'a' && href.startsWith('mailto:')) {
        send('event', {
          event_name: 'email_click',
          event_category: 'conversion',
          event_label: href.replace('mailto:', ''),
          element_id: id
        });
        break;
      }

      // CTA buttons ("Get Free Estimate", "Get Quote", "Schedule", etc.)
      if ((tag === 'a' || tag === 'button') && text) {
        var isCta = /estimate|quote|schedule|inspect|contact|free|start|get started|request|call us/i.test(text);
        if (isCta) {
          send('event', {
            event_name: 'cta_click',
            event_category: 'engagement',
            event_label: text,
            element_id: id,
            properties: { href: href, class: cls }
          });
          break;
        }
      }

      // Roofle widget interaction
      if (el.classList && (el.classList.contains('roofle') || (id && id.includes('roofle')))) {
        send('event', {
          event_name: 'quote_widget_open',
          event_category: 'conversion',
          event_label: 'Roofle Quote Widget'
        });
        break;
      }

      el = el.parentElement;
    }
  }, true);

  // ── Contact Form Tracking ──────────────────────────────────────────────
  // Auto-detect form submissions on /contact/ page
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;

    var formData = new FormData(form);
    var data = {};
    formData.forEach(function(val, key) {
      // Capture key form fields for conversion attribution
      var k = key.toLowerCase();
      if (/name|first|last/.test(k)) data.name = (data.name ? data.name + ' ' : '') + val;
      if (/email/.test(k)) data.email = val;
      if (/phone|tel/.test(k)) data.phone = val;
      if (/service|type|interest/.test(k)) data.service_interest = val;
      if (/message|note|comment/.test(k)) data.message = val ? val.substring(0, 500) : null;
    });

    send('event', {
      event_name: 'contact_form_submit',
      event_category: 'conversion',
      event_label: 'Contact Form',
      element_id: form.id
    });

    sendConversion(Object.assign({
      type: 'contact_form',
      source_page: window.location.pathname
    }, data));
  });

  // ── Roofle Widget Listener ─────────────────────────────────────────────
  // Listen for Roofle postMessage events
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;

    // Roofle sends events like { type: 'roofle:quote_requested', ... }
    if (e.data.type && e.data.type.startsWith('roofle:')) {
      var eventName = e.data.type.replace('roofle:', 'roofle_');
      send('event', {
        event_name: eventName,
        event_category: 'conversion',
        event_label: 'Roofle',
        properties: e.data
      });

      if (eventName === 'roofle_quote_requested' || eventName === 'roofle_lead_submitted') {
        sendConversion({
          type: 'quote_widget',
          service_interest: 'roofing',
          source_page: window.location.pathname,
          properties: e.data
        });
      }
    }
  });

  // ── Public API ─────────────────────────────────────────────────────────
  // Expose hoyt.track() for manual event tracking from other scripts
  window.hoyt = window.hoyt || {};
  window.hoyt.track = function(eventName, data) {
    send('event', Object.assign({ event_name: eventName, event_category: 'custom' }, data));
  };
  window.hoyt.convert = sendConversion;

})();
