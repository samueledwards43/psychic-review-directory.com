/* Session Meter: калькулятор pay-per-minute + AI-нотатка (три голоси). Розрахунок локальний, AI лише пише нотатку.
   Конфіг із <script id="sm-config">. Worker: /api/session-meter/ (локально — порт 8841). */
(function () {
  'use strict';
  var root = document.getElementById('sm-app');
  var cfgEl = document.getElementById('sm-config');
  if (!root || !cfgEl) return;
  var CFG = JSON.parse(cfgEl.textContent);
  var ENDPOINT = (window.PRD_SM && window.PRD_SM.endpoint) || '/api/session-meter/';
  // Лише коли в адресі є порт (локальна розробка) — локальний Worker; на проді порту немає.
  if (location.port) ENDPOINT = location.protocol + '//' + location.hostname + ':8841/api/session-meter/';

  var S = { minutes: 25, rate: 6, introOn: true, introRate: 1, introMin: 10, overrun: 10, hold: 15, sessions: 2, cap: 60, voice: CFG.voices[0].id, worry: CFG.worries[0].id, note: '' };

  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cost(m) {
    if (!S.introOn) return m * S.rate;
    return Math.min(m, S.introMin) * S.introRate + Math.max(0, m - S.introMin) * S.rate;
  }
  /* Скільки хвилин одного сеансу вміщається в місячний ліміт, поділений на кількість сеансів. */
  function allowanceMinute() {
    if (!S.cap) return null;
    var a = S.cap / S.sessions;
    if (!S.introOn) return Math.floor(a / S.rate);
    var introTotal = S.introMin * S.introRate;
    if (a <= introTotal) return Math.floor(a / S.introRate);
    return S.introMin + Math.floor((a - introTotal) / S.rate);
  }

  var sliders = [
    { k: 'minutes', label: 'Session length', unit: 'min', min: 5, max: 90, step: 5 },
    { k: 'rate', label: 'Regular rate', unit: '$/min', min: 0.5, max: 25, step: 0.25, dec: 2 },
    { k: 'overrun', label: 'If I lose track, I run over by', unit: 'min', min: 0, max: 30, step: 1 },
    { k: 'hold', label: 'Card hold before we start', unit: 'min of rate', min: 0, max: 30, step: 5 },
    { k: 'sessions', label: 'Sessions this month', unit: '', min: 1, max: 12, step: 1 }
  ];

  function sliderHtml(d) {
    return '<div class="sm-field"><label for="sm-' + d.k + '"><span>' + d.label + '</span><output id="sm-o-' + d.k + '"></output></label>' +
      '<input type="range" id="sm-' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + S[d.k] + '"></div>';
  }

  var voicesHtml = CFG.voices.map(function (v, i) {
    return '<label class="sm-voice"><input type="radio" name="sm-voice" value="' + v.id + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<span class="sm-voice-card"><span class="sm-voice-mark" aria-hidden="true">' + esc(v.name.charAt(0)) + '</span>' +
      '<strong>' + esc(v.name) + '</strong><em>' + esc(v.role) + '</em><small>' + esc(v.blurb) + '</small><span class="sm-ai-tag">AI voice</span></span></label>';
  }).join('');
  var worriesHtml = CFG.worries.map(function (w, i) {
    return '<label class="sm-chip"><input type="radio" name="sm-worry" value="' + w.id + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + esc(w.label) + '</b><i>' + esc(w.hint) + '</i></span></label>';
  }).join('');

  root.innerHTML =
    '<div class="sm-desk">' +
      '<section class="sm-panel" aria-label="Your numbers">' +
        '<h2 class="sm-h">1. Dial in your numbers</h2>' +
        '<p class="sm-sub">Type what the platform advertises. Nothing here is looked up or stored; the maths runs in your browser.</p>' +
        sliderHtml(sliders[0]) + sliderHtml(sliders[1]) +
        '<div class="sm-intro"><label class="sm-switch"><input type="checkbox" id="sm-introOn" checked><span class="sm-knob" aria-hidden="true"></span><span>It advertises an intro offer</span></label>' +
          '<div class="sm-intro-body" id="sm-intro-body">' +
            '<div class="sm-field"><label for="sm-introRate"><span>Intro rate</span><output id="sm-o-introRate"></output></label><input type="range" id="sm-introRate" min="0.25" max="10" step="0.25" value="1"></div>' +
            '<div class="sm-field"><label for="sm-introMin"><span>Intro lasts</span><output id="sm-o-introMin"></output></label><input type="range" id="sm-introMin" min="5" max="30" step="5" value="10"></div>' +
          '</div></div>' +
        sliderHtml(sliders[2]) + sliderHtml(sliders[3]) + sliderHtml(sliders[4]) +
        '<div class="sm-field sm-cap"><label for="sm-cap"><span>Monthly limit I set myself</span><span class="sm-capwrap">$<input type="number" id="sm-cap" min="0" max="5000" step="5" value="60" inputmode="numeric"></span></label><small>0 means no limit.</small></div>' +
      '</section>' +
      '<section class="sm-tape-wrap" aria-label="Receipt">' +
        '<h2 class="sm-h">2. Read the tape</h2>' +
        '<div class="sm-tape" id="sm-tape" role="status" aria-live="polite"></div>' +
      '</section>' +
    '</div>' +
    '<section class="sm-ruler-wrap" aria-label="Minute ruler"><h2 class="sm-h">3. Walk the minutes</h2><p class="sm-sub" id="sm-ruler-sub"></p><div class="sm-ruler" id="sm-ruler"></div>' +
      '<ul class="sm-legend"><li><i class="k-intro"></i>Intro minutes</li><li><i class="k-reg"></i>Regular minutes</li><li><i class="k-over"></i>Minutes you did not plan</li><li><i class="k-cap"></i>Where your limit lands</li></ul></section>' +
    '<section class="sm-ai" aria-label="AI guardrail note"><h2 class="sm-h">4. Ask a voice for a guardrail note <span class="sm-ai-tag">AI-written</span></h2>' +
      '<p class="sm-sub">Pick a voice and your biggest worry. The note uses only the numbers above. It is written by AI, is not advice from a psychic, and does not name any platform.</p>' +
      '<div class="sm-voices" role="radiogroup" aria-label="Voice">' + voicesHtml + '</div>' +
      '<div class="sm-chips" role="radiogroup" aria-label="Biggest worry">' + worriesHtml + '</div>' +
      '<label class="sm-note"><span>One rule of your own (optional)</span><input type="text" id="sm-note" maxlength="160" placeholder="For example: never more than one session a week"></label>' +
      '<div class="sm-actions"><button type="button" class="btn btn--primary" id="sm-go" data-nebula-preserve="1">Write my guardrail note</button><span class="sm-status" id="sm-status" role="status"></span></div>' +
      '<div class="sm-out" id="sm-out" hidden><div class="sm-out-head"><span class="sm-out-voice" id="sm-out-voice"></span><span class="sm-ai-tag">AI-written, not a live session</span></div><div class="sm-out-text" id="sm-out-text"></div></div>' +
    '</section>';

  function $(id) { return document.getElementById(id); }

  function render() {
    sliders.forEach(function (d) {
      var v = S[d.k];
      $('sm-o-' + d.k).textContent = (d.k === 'rate' ? money(v) + '/min' : v + (d.unit ? ' ' + d.unit : ''));
    });
    $('sm-o-introRate').textContent = money(S.introRate) + '/min';
    $('sm-o-introMin').textContent = S.introMin + ' min';
    $('sm-intro-body').classList.toggle('is-off', !S.introOn);
    $('sm-introRate').disabled = $('sm-introMin').disabled = !S.introOn;

    var planned = cost(S.minutes), lost = cost(S.minutes + S.overrun), monthly = planned * S.sessions;
    var rows = '';
    if (S.introOn) {
      var im = Math.min(S.minutes, S.introMin), rm = Math.max(0, S.minutes - S.introMin);
      rows += row('Intro', im + ' min &times; ' + money(S.introRate), money(im * S.introRate));
      if (rm) rows += row('Regular', rm + ' min &times; ' + money(S.rate), money(rm * S.rate));
    } else {
      rows += row('Flat rate', S.minutes + ' min &times; ' + money(S.rate), money(planned));
    }
    rows += '<hr>' + row('<b>Session total</b>', '', '<b>' + money(planned) + '</b>', 'big');
    rows += row('Average per minute', '', money(planned / S.minutes));
    if (S.introOn && S.minutes > S.introMin) rows += row('Price steps up at', 'minute ' + (S.introMin + 1), '&times;' + (S.rate / S.introRate).toFixed(1));
    rows += '<hr>' + row('If you run ' + S.overrun + ' min over', '', money(lost), S.overrun ? 'warn' : '');
    if (S.overrun) rows += row('Extra you did not plan', '', '+' + money(lost - planned), 'warn');
    rows += '<hr>' + row('Card hold (not a charge)', S.hold + ' min of rate', money(S.hold * S.rate));
    rows += '<hr>' + row('<b>Month: ' + S.sessions + ' session' + (S.sessions > 1 ? 's' : '') + '</b>', '', '<b>' + money(monthly) + '</b>', 'big');
    if (S.cap) {
      var diff = monthly - S.cap;
      rows += row('Your limit', money(S.cap), diff > 0 ? '<span class="sm-bad">over by ' + money(diff) + '</span>' : '<span class="sm-good">' + money(-diff) + ' to spare</span>');
      var lostMonthly = lost * S.sessions;
      if (S.overrun && lostMonthly > S.cap && diff <= 0) rows += row('If every session runs over', '', '<span class="sm-bad">' + money(lostMonthly - S.cap) + ' past limit</span>');
    } else {
      rows += row('Your limit', 'none set', '&mdash;');
    }
    $('sm-tape').innerHTML = '<div class="sm-tape-top">SESSION METER<span>' + (S.introOn ? 'intro + regular' : 'flat rate') + '</span></div>' + rows + '<div class="sm-tape-foot">Estimate from the numbers you typed. Check the platform&rsquo;s own terms.</div>';
    renderRuler(planned, lost);
  }
  function row(a, b, c, cls) { return '<div class="sm-row ' + (cls || '') + '"><span>' + a + '</span><em>' + b + '</em><strong>' + c + '</strong></div>'; }

  function renderRuler(planned, lost) {
    var total = S.minutes + S.overrun;
    var allow = allowanceMinute();
    var max = Math.max(total, S.introOn ? S.introMin : 0, allow || 0, 10);
    max = Math.ceil((max + 2) / 5) * 5;
    var pct = function (m) { return (m / max * 100).toFixed(2) + '%'; };
    var html = '<div class="sm-track">';
    var im = S.introOn ? Math.min(S.minutes, S.introMin) : 0;
    if (im) html += '<div class="sm-seg k-intro" style="left:0;width:' + pct(im) + '"><span>' + money(im * S.introRate) + '</span></div>';
    if (S.minutes > im) html += '<div class="sm-seg k-reg" style="left:' + pct(im) + ';width:' + pct(S.minutes - im) + '"><span>' + money(planned) + ' by minute ' + S.minutes + '</span></div>';
    if (S.overrun) html += '<div class="sm-seg k-over" style="left:' + pct(S.minutes) + ';width:' + pct(S.overrun) + '"><span>' + money(lost) + '</span></div>';
    if (allow !== null && allow <= max) html += '<div class="sm-cap-line" style="left:' + pct(allow) + '"><span>limit: minute ' + allow + '</span></div>';
    html += '</div><div class="sm-ticks">';
    for (var t = 0; t <= max; t += 5) html += '<span style="left:' + pct(t) + '">' + t + '</span>';
    html += '</div>';
    $('sm-ruler').innerHTML = html;
    var msg = 'One session, minute by minute.';
    if (allow !== null) msg = allow >= S.minutes ? 'Your limit is split evenly across ' + S.sessions + ' session' + (S.sessions > 1 ? 's' : '') + ': each one has room for ' + allow + ' minutes. You plan ' + S.minutes + '.'
      : 'Your limit split across ' + S.sessions + ' session' + (S.sessions > 1 ? 's' : '') + ' leaves room for ' + allow + ' minutes each, but you plan ' + S.minutes + '.';
    $('sm-ruler-sub').textContent = msg;
  }

  /* Події */
  sliders.forEach(function (d) {
    $('sm-' + d.k).addEventListener('input', function (e) { S[d.k] = parseFloat(e.target.value); render(); });
  });
  ['introRate', 'introMin'].forEach(function (k) { $('sm-' + k).addEventListener('input', function (e) { S[k] = parseFloat(e.target.value); render(); }); });
  $('sm-introOn').addEventListener('change', function (e) { S.introOn = e.target.checked; render(); });
  $('sm-cap').addEventListener('input', function (e) { var v = parseFloat(e.target.value); S.cap = isFinite(v) && v > 0 ? Math.min(5000, v) : 0; render(); });
  root.addEventListener('change', function (e) {
    if (e.target.name === 'sm-voice') S.voice = e.target.value;
    if (e.target.name === 'sm-worry') S.worry = e.target.value;
  });
  $('sm-note').addEventListener('input', function (e) { S.note = e.target.value; });

  /* AI-нотатка: потік SSE, автоповтор при обриві (до 3 спроб). */
  function fmt(text) {
    return esc(text).split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function payload() {
    return { voice: S.voice, worry: S.worry, introOn: S.introOn, introRate: S.introRate, introMin: S.introMin, rate: S.rate, minutes: S.minutes, overrun: S.overrun, hold: S.hold, sessions: S.sessions, cap: S.cap, note: S.note };
  }
  function attempt(n, onText) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) }).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.error || 'The note is unavailable right now.'); e.fatal = res.status < 500; throw e; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', full = '', cut = false;
      function pump() {
        return reader.read().then(function (r) {
          if (r.value) buf += dec.decode(r.value, { stream: !r.done });
          var i;
          while ((i = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (line.indexOf('data:') !== 0) continue;
            var d = line.slice(5).trim();
            if (d === '[DONE]') continue;
            try { var j = JSON.parse(d); if (typeof j.t === 'string') { full += j.t; onText(full); } if (j.cut) cut = true; } catch (e) { /* неповний рядок */ }
          }
          if (r.done) return { text: full, cut: cut || !/Before you start[\s\S]{40,}/.test(full) };
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      if (err.fatal || n >= 3) throw err;
      return { text: '', cut: true, err: err };
    });
  }
  function run() {
    var btn = $('sm-go'), status = $('sm-status'), out = $('sm-out'), box = $('sm-out-text');
    var v = CFG.voices.filter(function (x) { return x.id === S.voice; })[0];
    btn.disabled = true; out.hidden = false; box.innerHTML = '<p class="sm-wait">' + esc(v.name) + ' is reading your tape&hellip;</p>';
    $('sm-out-voice').textContent = v.name + ' · ' + v.role;
    var n = 1;
    function go() {
      status.textContent = n > 1 ? 'Connection dropped, trying again (' + n + ' of 3)…' : '';
      return attempt(n, function (t) { box.innerHTML = fmt(t); }).then(function (r) {
        if (r.cut && n < 3) { n++; return go(); }
        if (r.cut && !r.text) throw new Error('The note is unavailable right now. Please try again in a moment.');
        status.textContent = r.cut ? 'This note ended early. You can write it again.' : '';
      });
    }
    go().catch(function (e) { box.innerHTML = '<p class="sm-error">' + esc(e.message) + '</p>'; status.textContent = ''; })
      .then(function () { btn.disabled = false; });
  }
  $('sm-go').addEventListener('click', run);
  render();
})();
