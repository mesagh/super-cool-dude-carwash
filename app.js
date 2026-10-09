// Secret haunted-carwash mode: Up, Down, Right, then code 987.
(() => {
  const sequence = ['ArrowUp', 'ArrowDown', 'ArrowRight'];
  let progress = 0;
  let timer = null;
  let layer = null;
  let previousFocus = null;
  let codeDialog = null;
  const messages = [
    'We know what is hiding under the mud.',
    'Something is watching from the back seat.',
    'The footprints stop inside your car.',
    'You washed it. It came back.',
    'Do not look in the rearview mirror.',
    'Someone is hiding behind the car.'
  ];

  // The entity peeks out from behind the scrub-test car while this is on (scrub3d.js).
  function setHaunted(on) {
    document.documentElement.classList.toggle('is-haunted', on);
    document.dispatchEvent(new Event('hauntedchange'));
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    layer?.remove();
    layer = null;
    setHaunted(false);
    previousFocus?.focus();
  }

  function start() {
    if (layer) return;
    previousFocus = document.activeElement;
    layer = document.createElement('div');
    layer.className = 'haunted-layer';
    const exit = document.createElement('button');
    exit.className = 'haunted-exit';
    exit.textContent = 'End spooky mode (Esc)';
    exit.addEventListener('click', stop);
    layer.append(exit);
    document.body.append(layer);
    setHaunted(true);
    exit.focus();

    function popup() {
      // Keep the prank bounded even if it is left running, and leave room to see the page.
      const most = window.innerWidth < 600 ? 2 : 4;
      while (layer.querySelectorAll('.haunted-popup').length >= most) {
        layer.querySelector('.haunted-popup').remove();
      }
      const card = document.createElement('section');
      card.className = 'haunted-popup';
      const title = document.createElement('strong');
      title.textContent = '☠ THE CARWASH IS HAUNTED ☠';
      const message = document.createElement('p');
      message.textContent = messages[Math.floor(Math.random() * messages.length)];
      const close = document.createElement('button');
      close.textContent = 'Close';
      close.addEventListener('click', () => card.remove());
      card.append(title, message, close);
      layer.append(card);
      // Somewhere random that stays fully on screen, below the exit button.
      const spot = (space, size, from) => from + Math.random() * Math.max(0, space - size - from - 12);
      card.style.left = `${spot(window.innerWidth, card.offsetWidth, 12)}px`;
      card.style.top = `${spot(window.innerHeight, card.offsetHeight, 76)}px`;
    }
    popup();
    timer = setInterval(popup, 2600);
  }

  function askForCode() {
    if (codeDialog || layer) return;
    previousFocus = document.activeElement;
    codeDialog = document.createElement('dialog');
    codeDialog.className = 'haunted-code';
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Enter the secret carwash code';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.required = true;
    label.append(input);
    const error = document.createElement('p');
    error.setAttribute('role', 'status');
    const enter = document.createElement('button');
    enter.type = 'submit';
    enter.textContent = 'Enter';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    function dismiss() {
      codeDialog.close();
      codeDialog.remove();
      codeDialog = null;
      previousFocus?.focus();
    }
    cancel.addEventListener('click', dismiss);
    codeDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dismiss();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (input.value.trim() === '987') {
        dismiss();
        start();
      } else {
        error.textContent = 'That code is incorrect. Try again.';
        input.select();
      }
    });
    form.append(label, error, enter, cancel);
    codeDialog.append(form);
    codeDialog.setAttribute('aria-label', 'Secret carwash code');
    document.body.append(codeDialog);
    codeDialog.showModal();
    input.focus();
  }

  function acceptArrow(key) {
    if (layer || codeDialog) return;
    progress = key === sequence[progress] ? progress + 1 : key === sequence[0] ? 1 : 0;
    if (progress === sequence.length) {
      progress = 0;
      askForCode();
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layer) { stop(); return; }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest('input, textarea, select, [contenteditable]')) {
      progress = 0;
      return;
    }
    if (layer || codeDialog) return;
    // Only arrow keys count. They still scroll the page as usual.
    if (!event.key.startsWith('Arrow')) return;
    acceptArrow(event.key);
  }, true);
})();

(() => {
  'use strict';
  /* ---------- Booking: write the text message ---------- */
  const WASHES = {
    silver: { name: 'Silver', price: 8 },
    gold: { name: 'Gold', price: 12 },
    premium: { name: 'Premium', price: 20 },
    premiumplus: { name: 'Premium+', price: 24 },
    membership: { name: 'Membership', price: 32, monthly: true },
  };
  const PHONE_CLEANING = 4;
  const SMS_NUMBER = '+16503093989';
  const TEXT_NUMBER = '650-309-3989';

  const form = document.getElementById('booker');
  const msgEl = document.getElementById('msg');
  const totalEl = document.getElementById('total');
  const smsLink = document.getElementById('smsLink');
  const addPhone = document.getElementById('addPhone');
  const phoneRow = document.getElementById('phoneRow');
  const phoneLabel = phoneRow.querySelector('span');
  const whenInput = document.getElementById('when');
  const nameInput = document.getElementById('name');
  const note = document.getElementById('bookNote');
  const copyBtn = document.getElementById('copyBtn');
  const noteDefault = note.textContent;
  let messageText = '';

  function blank(text) {
    const s = document.createElement('span');
    s.className = 'blank';
    s.textContent = text;
    return s;
  }

  function compose() {
    const key = form.elements.wash.value || 'premium';
    const wash = WASHES[key];
    const included = key === 'premiumplus';
    const member = Boolean(wash.monthly);
    phoneRow.hidden = member;
    addPhone.disabled = included || member;
    if (included || member) addPhone.checked = false;
    phoneRow.classList.toggle('is-included', included);
    phoneLabel.innerHTML = included
      ? 'Phone cleaning comes with Premium+'
      : 'Add phone cleaning <em>+$4</em>';
    const extra = addPhone.checked && !included && !member;
    const total = wash.price + (extra ? PHONE_CLEANING : 0);
    const totalText = member ? `$${total} a month` : `$${total}`;
    const when = whenInput.value.trim();
    const name = nameInput.value.trim();

    const first = member
      ? `Hi Super Cool Dude Carwash! I'd like to sign up for the membership ($${wash.price} a month, one clean per week).`
      : `Hi Super Cool Dude Carwash! I'd like a ${wash.name} wash ($${wash.price})` +
        (extra ? ` plus phone cleaning ($${PHONE_CLEANING})` : '') + '.';
    const lines = [first];
    if (when) lines.push(`When: ${when}`);
    if (name) lines.push(`Name: ${name}`);
    lines.push(`Total: ${totalText}`);
    messageText = lines.join('\n');

    msgEl.replaceChildren(first + '\nWhen: ', when || blank('pick a time'), '\nName: ', name || blank('your name'), `\nTotal: ${totalText}`);
    totalEl.textContent = member ? `$${total}/mo` : `$${total}`;
    smsLink.href = `sms:${SMS_NUMBER}?&body=${encodeURIComponent(messageText)}`;
  }

  function setNote(text, ok) {
    note.textContent = text;
    note.classList.toggle('is-ok', !!ok);
  }

  function flash(btn, label) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = label;
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800);
  }

  function selectNode(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function copy(text) {
    try {
      return navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    compose();
    copy(messageText).then(() => {
      flash(copyBtn, 'Copied!');
      setNote(`Copied. Paste it into a text to ${TEXT_NUMBER}.`, true);
    }).catch(() => {
      selectNode(msgEl);
      setNote('Copying was blocked, so the text is selected. Press Ctrl+C (or ⌘C on a Mac) to copy it.', false);
    });
  });

  form.addEventListener('input', () => { compose(); setNote(noteDefault, false); });
  form.addEventListener('change', compose);

  document.querySelectorAll('[data-when]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.when;
      whenInput.value = v.charAt(0).toUpperCase() + v.slice(1);
      compose();
      setNote(noteDefault, false);
    });
  });

  document.querySelectorAll('[data-choose]').forEach((link) => {
    link.addEventListener('click', () => {
      const radio = document.getElementById('wash-' + link.dataset.choose);
      if (radio) { radio.checked = true; compose(); }
    });
  });

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      copy(btn.dataset.copy).then(() => flash(btn, 'Copied!')).catch(() => {
        const target = btn.previousElementSibling;
        if (target) selectNode(target);
        flash(btn, 'Press Ctrl+C');
      });
    });
  });

  compose();
  window.addEventListener('pageshow', compose);

  /* ---------- Reviews: write the review as a text message ---------- */
  const reviewForm = document.getElementById('reviewForm');
  const reviewList = document.getElementById('reviewList');
  const reviewEmpty = document.getElementById('reviewEmpty');
  const reviewStars = [...document.querySelectorAll('#reviewStars .star')];
  const reviewText = document.getElementById('reviewText');
  const reviewName = document.getElementById('reviewName');
  const reviewSms = document.getElementById('reviewSms');
  const reviewCopy = document.getElementById('reviewCopy');
  const reviewNote = document.getElementById('reviewNote');
  const reviewNoteDefault = reviewNote.textContent;
  let reviewMessage = '';

  // Until real reviews are added to the list, show the "no reviews yet" card instead.
  const hasReviews = Boolean(reviewList.querySelector('.review'));
  reviewList.hidden = !hasReviews;
  reviewEmpty.hidden = hasReviews;

  // Builds the text and returns what the customer wrote (empty if nothing yet).
  function composeReview() {
    const stars = Number(reviewForm.elements.stars.value) || 0;
    reviewStars.forEach((label, i) => label.classList.toggle('is-on', i < stars));
    const text = reviewText.value.trim();
    const name = reviewName.value.trim();
    const lines = ['Review for Super Cool Dude Carwash'];
    if (stars) lines.push(`${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} (${stars} out of 5)`);
    if (text) lines.push(`"${text}"`);
    if (name) lines.push(`From: ${name}`);
    reviewMessage = lines.join('\n');
    reviewSms.href = `sms:${SMS_NUMBER}?&body=${encodeURIComponent(reviewMessage)}`;
    return text;
  }

  function setReviewNote(text, ok) {
    reviewNote.textContent = text;
    reviewNote.classList.toggle('is-ok', !!ok);
  }

  function needWords() {
    setReviewNote('Write a few words about your wash first.', false);
    reviewText.focus();
  }

  reviewForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!composeReview()) { needWords(); return; }
    copy(reviewMessage).then(() => {
      flash(reviewCopy, 'Copied!');
      setReviewNote(`Copied. Paste it into a text to ${TEXT_NUMBER}.`, true);
    }).catch(() => {
      setReviewNote(`Copying was blocked. Text your review to ${TEXT_NUMBER}.`, false);
    });
  });

  reviewSms.addEventListener('click', (e) => {
    if (!composeReview()) { e.preventDefault(); needWords(); }
  });

  reviewForm.addEventListener('input', () => { composeReview(); setReviewNote(reviewNoteDefault, false); });
  composeReview();
  window.addEventListener('pageshow', composeReview);
})();
