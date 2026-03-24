// v2026.03.23-panel-audit
document.addEventListener('DOMContentLoaded', () => {

  /* ─────────────────────────────────────────────────
     DIVISION COOKIE TRACKING
  ───────────────────────────────────────────────── */
  const DIVISION_KEY = 'hoyt_division';
  const path = window.location.pathname;

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = name + '=' + value + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  if (path.includes('/commercial')) setCookie(DIVISION_KEY, 'commercial', 90);
  else if (path.includes('/multifamily')) setCookie(DIVISION_KEY, 'multifamily', 90);
  else if (path.includes('/residential')) setCookie(DIVISION_KEY, 'residential', 90);

  /* ─────────────────────────────────────────────────
     SCROLL REVEAL
  ───────────────────────────────────────────────── */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => observer.observe(el));
  }

  /* ─────────────────────────────────────────────────
     HAMBURGER / MOBILE DRAWER
  ───────────────────────────────────────────────── */
  const hamburger = document.querySelector('.hamburger');
  const drawer = document.querySelector('.mobile-drawer');
  const overlay = document.querySelector('.mobile-drawer-overlay');

  function toggleNav() {
    hamburger?.classList.toggle('active');
    drawer?.classList.toggle('open');
    overlay?.classList.toggle('open');
    document.body.style.overflow = drawer?.classList.contains('open') ? 'hidden' : '';
  }
  hamburger?.addEventListener('click', toggleNav);
  overlay?.addEventListener('click', toggleNav);
  drawer?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => { if (drawer.classList.contains('open')) toggleNav(); });
  });

  /* ─────────────────────────────────────────────────
     FAQ ACCORDION
  ───────────────────────────────────────────────── */
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item.active').forEach(other => {
        if (other !== item) { other.classList.remove('active'); other.querySelector('.faq-answer').style.maxHeight = '0'; }
      });
      item.classList.toggle('active');
      answer.style.maxHeight = isActive ? '0' : answer.scrollHeight + 'px';
    });
  });

  /* ─────────────────────────────────────────────────
     NAV SCROLL EFFECT
  ───────────────────────────────────────────────── */
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.style.background = window.pageYOffset > 50 ? 'rgba(10,10,10,0.98)' : 'rgba(10,10,10,0.92)';
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────────
     SMOOTH SCROLL (non-#contact anchors only)
  ───────────────────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const id = this.getAttribute('href');
      if (id === '#' || id === '#contact') return; // panel handles #contact
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        const navH = document.querySelector('.nav')?.offsetHeight || 72;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - navH - 20, behavior: 'smooth' });
      }
    });
  });

  /* ─────────────────────────────────────────────────
     CONTACT PANEL
  ───────────────────────────────────────────────── */
  const SERVICES = ['Roofing', 'Siding', 'Gutters', 'Windows', 'Decks', 'Insulation', 'Commercial', 'Other'];

  function detectService() {
    if (path.includes('/roofing')) return 'Roofing';
    if (path.includes('/siding')) return 'Siding';
    if (path.includes('/gutters')) return 'Gutters';
    if (path.includes('/windows')) return 'Windows';
    if (path.includes('/decks')) return 'Decks';
    if (path.includes('/insulation')) return 'Insulation';
    if (path.includes('/commercial')) return 'Commercial';
    return '';
  }

  function detectSource() {
    return path.replace(/^\/|\/$/g, '') || 'homepage';
  }

  function buildPanel() {
    // Backdrop
    const bd = document.createElement('div');
    bd.id = 'cpBackdrop';
    bd.className = 'cp-backdrop';
    bd.setAttribute('aria-hidden', 'true');

    // Panel shell
    const pn = document.createElement('div');
    pn.id = 'cpPanel';
    pn.className = 'cp-panel';
    pn.setAttribute('role', 'dialog');
    pn.setAttribute('aria-modal', 'true');
    pn.setAttribute('aria-label', 'Get a Free Quote');

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'cp-header';
    const title = document.createElement('span');
    title.textContent = 'Get a Free Quote';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cp-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    hdr.append(title, closeBtn);

    // Body / form
    const body = document.createElement('div');
    body.className = 'cp-body';

    const form = document.createElement('form');
    form.id = 'cpForm';
    form.noValidate = true;

    // Name
    const nameField = document.createElement('div');
    nameField.className = 'cp-field';
    const nameLbl = document.createElement('label');
    nameLbl.textContent = 'Full Name *';
    nameLbl.setAttribute('for', 'cp-name');
    const nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.id = 'cp-name'; nameInp.name = 'name';
    nameInp.placeholder = 'Your name'; nameInp.required = true;
    nameField.append(nameLbl, nameInp);

    // Phone + Email row
    const row = document.createElement('div');
    row.className = 'cp-row';

    const phoneField = document.createElement('div');
    phoneField.className = 'cp-field';
    const phoneLbl = document.createElement('label');
    phoneLbl.textContent = 'Phone *';
    phoneLbl.setAttribute('for', 'cp-phone');
    const phoneInp = document.createElement('input');
    phoneInp.type = 'tel'; phoneInp.id = 'cp-phone'; phoneInp.name = 'phone';
    phoneInp.placeholder = '(612) 555-0100'; phoneInp.required = true;
    phoneField.append(phoneLbl, phoneInp);

    const emailField = document.createElement('div');
    emailField.className = 'cp-field';
    const emailLbl = document.createElement('label');
    emailLbl.textContent = 'Email';
    emailLbl.setAttribute('for', 'cp-email');
    const emailInp = document.createElement('input');
    emailInp.type = 'email'; emailInp.id = 'cp-email'; emailInp.name = 'email';
    emailInp.placeholder = 'you@email.com';
    emailField.append(emailLbl, emailInp);

    row.append(phoneField, emailField);

    // Service select
    const svcField = document.createElement('div');
    svcField.className = 'cp-field';
    const svcLbl = document.createElement('label');
    svcLbl.textContent = 'Service Needed *';
    svcLbl.setAttribute('for', 'cp-service');
    const svcSel = document.createElement('select');
    svcSel.id = 'cp-service'; svcSel.name = 'service'; svcSel.required = true;
    const blankOpt = document.createElement('option');
    blankOpt.value = ''; blankOpt.textContent = 'Select a service…';
    svcSel.append(blankOpt);
    SERVICES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      svcSel.append(opt);
    });
    svcField.append(svcLbl, svcSel);

    // Message
    const msgField = document.createElement('div');
    msgField.className = 'cp-field';
    const msgLbl = document.createElement('label');
    msgLbl.textContent = 'Tell us about your project';
    msgLbl.setAttribute('for', 'cp-message');
    const msgTa = document.createElement('textarea');
    msgTa.id = 'cp-message'; msgTa.name = 'message';
    msgTa.placeholder = 'Address, describe the issue, best time to call…';
    msgTa.rows = 3;
    msgField.append(msgLbl, msgTa);

    // SMS consent
    const consent = document.createElement('label');
    consent.className = 'cp-consent';
    const consentChk = document.createElement('input');
    consentChk.type = 'checkbox'; consentChk.name = 'sms_consent'; consentChk.value = 'yes';
    const consentTxt = document.createTextNode(' I agree to receive SMS updates about my project. Reply STOP to opt out.');
    consent.append(consentChk, consentTxt);

    // Error message
    const errMsg = document.createElement('div');
    errMsg.className = 'cp-error-msg';
    errMsg.id = 'cpError';
    errMsg.setAttribute('hidden', '');
    errMsg.textContent = 'Something went wrong. Please call us at (651) 212-4965.';

    // Submit
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'cp-submit';
    submitBtn.textContent = 'GET MY FREE QUOTE →';

    form.append(nameField, row, svcField, msgField, consent, errMsg, submitBtn);

    // Success state
    const success = document.createElement('div');
    success.className = 'cp-success';
    success.id = 'cpSuccess';
    success.setAttribute('hidden', '');
    const successIcon = document.createElement('div');
    successIcon.className = 'cp-success-icon';
    successIcon.textContent = '✓';
    const successTitle = document.createElement('h3');
    successTitle.textContent = "We got your message!";
    const successText = document.createElement('p');
    successText.textContent = "Our team will reach out within 1 business day. You'll also get a confirmation email shortly.";
    success.append(successIcon, successTitle, successText);

    body.append(form, success);
    pn.append(hdr, body);
    document.body.append(bd, pn);

    // Wire up close
    closeBtn.addEventListener('click', closePanel);
    bd.addEventListener('click', closePanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errMsg.setAttribute('hidden', '');

      // Basic validation
      let valid = true;
      [nameInp, phoneInp, svcSel].forEach(el => {
        if (!el.value.trim()) { el.classList.add('cp-invalid'); valid = false; }
        else el.classList.remove('cp-invalid');
      });
      if (!valid) return;

      submitBtn.textContent = 'SENDING…';
      submitBtn.disabled = true;

      const fullName = nameInp.value.trim();
      const nameParts = fullName.split(' ');
      const payload = {
        firstName: nameParts[0] || fullName,
        lastName: nameParts.slice(1).join(' ') || '',
        phone: phoneInp.value.trim(),
        email: emailInp.value.trim(),
        services: svcSel.value,
        message: msgTa.value.trim(),
        smsConsent: consentChk.checked ? 'yes' : 'no',
        source: detectSource(),
      };

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          form.setAttribute('hidden', '');
          success.removeAttribute('hidden');
        } else {
          throw new Error('non-ok');
        }
      } catch {
        errMsg.removeAttribute('hidden');
        submitBtn.textContent = 'GET MY FREE QUOTE →';
        submitBtn.disabled = false;
      }
    });
  }

  function openPanel(preselect) {
    const panel = document.getElementById('cpPanel');
    const backdrop = document.getElementById('cpBackdrop');
    if (!panel) return;

    // Pre-select service if known
    if (preselect) {
      const sel = document.getElementById('cp-service');
      if (sel) sel.value = preselect;
    }

    panel.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => document.getElementById('cp-name')?.focus(), 100);
  }

  function closePanel() {
    document.getElementById('cpPanel')?.classList.remove('open');
    document.getElementById('cpBackdrop')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Build panel and wire up all CTAs
  buildPanel();

  const autoService = detectService();

  // Global click interceptor — #contact anchors + .btn-primary/.nav-cta links to contact page
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const isCta = link.classList.contains('btn-primary') || link.classList.contains('nav-cta');
    const triggersPanel = href === '#contact' || (isCta && href.includes('contact') && !href.startsWith('mailto') && !href.startsWith('tel'));
    if (triggersPanel) {
      e.preventDefault();
      openPanel(autoService);
    }
  });

  /* ─────────────────────────────────────────────────
     CONTACT PAGE FULL FORM (contact/index.html)
  ───────────────────────────────────────────────── */
  const allForms = document.querySelectorAll('#contactForm, #quoteForm, #estimate-form, #commercial-form, [data-source]');
  allForms.forEach(form => {
    if (form.id === 'cpForm') return; // panel form handles itself

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const successDiv = form.closest('section')?.querySelector('.form-success')
        || document.getElementById('formSuccess')
        || document.getElementById('form-success');
      const source = form.dataset.source || detectSource();

      // Clear errors
      form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
      let valid = true;
      form.querySelectorAll('[required]').forEach(field => {
        if (!field.value.trim()) { field.closest('.form-group')?.classList.add('error'); valid = false; }
      });
      const emailField = form.querySelector('[type="email"]');
      if (emailField && emailField.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value)) {
        emailField.closest('.form-group')?.classList.add('error'); valid = false;
      }
      const phoneField = form.querySelector('[type="tel"]');
      if (phoneField && phoneField.value && !/^\d{10,}$/.test(phoneField.value.replace(/\D/g, ''))) {
        phoneField.closest('.form-group')?.classList.add('error'); valid = false;
      }
      if (!valid) return;

      // Build payload — collect multi-value fields (services checkboxes) as array
      const data = {};
      const fd = new FormData(form);
      fd.forEach((value, key) => {
        if (key === 'services') {
          if (!Array.isArray(data.services)) data.services = [];
          data.services.push(value);
        } else {
          data[key] = value;
        }
      });
      data.source = source;

      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'SENDING…';
      submitBtn.disabled = true;

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          form.style.display = 'none';
          if (successDiv) { successDiv.removeAttribute('hidden'); successDiv.classList.add('show'); }
        } else {
          throw new Error('non-ok');
        }
      } catch {
        submitBtn.textContent = 'TRY AGAIN';
        submitBtn.disabled = false;
        // Show inline error if the form has one, otherwise surface a message
        const errEl = form.querySelector('.form-error') || form.querySelector('.error-message');
        if (errEl) { errEl.removeAttribute('hidden'); }
        else { submitBtn.insertAdjacentText('afterend', ' Error sending — please call (651) 212-4965.'); }
      }
    });
  });

});
