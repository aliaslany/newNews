(function(){
  const FEED_URL = '/data/news.json';
  const POLL_MS = 60000;
  const LANG = document.documentElement.lang === 'fa' ? 'fa' : 'en';
  const IS_FA = LANG === 'fa';

  const DICT = {
    en: {
      stamp_verified: 'Verified', stamp_disputed: 'Disputed', stamp_mixed: 'Mixed', stamp_unreviewed: 'Unreviewed',
      reliability_suffix: 'reliability',
      just_now: 'just now', m_ago: 'm ago', h_ago: 'h ago', d_ago: 'd ago',
      feed_updated: 'feed updated', no_fetch_yet: 'no fetch yet', feed_unreachable: 'feed unreachable',
      unknown_source: 'Unknown source'
    },
    fa: {
      stamp_verified: 'تأییدشده', stamp_disputed: 'مورد مناقشه', stamp_mixed: 'ترکیبی', stamp_unreviewed: 'بررسی‌نشده',
      reliability_suffix: 'اعتبار',
      just_now: 'همین الان', m_ago: 'دقیقه پیش', h_ago: 'ساعت پیش', d_ago: 'روز پیش',
      feed_updated: 'به‌روزرسانی فید:', no_fetch_yet: 'هنوز دریافتی نشده', feed_unreachable: 'فید در دسترس نیست',
      unknown_source: 'منبع نامشخص'
    }
  };
  const t = DICT[LANG];

  const feedEl = document.getElementById('feed');
  const emptyState = document.getElementById('empty-state');
  const errorState = document.getElementById('error-state');
  const lastFetchEl = document.getElementById('last-fetch');
  const clockEl = document.getElementById('clock-time');

  const seen = new Set();
  let activeFilter = 'all';

  const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  function localizeDigits(str){
    if(!IS_FA) return str;
    return String(str).replace(/[0-9]/g, d => FA_DIGITS[d]);
  }

  function tickClock(){
    const now = new Date();
    clockEl.textContent = localizeDigits(now.toISOString().slice(11,19)) + ' UTC';
  }
  tickClock();
  setInterval(tickClock, 1000);

  function timeAgo(iso){
    if(!iso) return '';
    const then = new Date(iso).getTime();
    if(isNaN(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if(mins < 1) return t.just_now;
    if(mins < 60) return localizeDigits(mins) + t.m_ago;
    const hrs = Math.round(mins/60);
    if(hrs < 24) return localizeDigits(hrs) + t.h_ago;
    return localizeDigits(Math.round(hrs/24)) + t.d_ago;
  }

  function classifyRating(text){
    const s = (text || '').toLowerCase();
    if(!s) return 'unreviewed';
    const negative = ['false','fake','fabricated','incorrect','pants on fire','hoax','scam'];
    const mixed = ['half true','mixed','partly false','partially false','misleading','unproven','exaggerated','out of context'];
    const positive = ['true','correct','accurate'];
    if(negative.some(w => s.includes(w))) return 'reviewed-negative';
    if(mixed.some(w => s.includes(w))) return 'reviewed-mixed';
    if(positive.some(w => s.includes(w))) return 'reviewed-positive';
    return 'reviewed-mixed';
  }

  function stampFor(item){
    const fc = item.fact_check || {};
    if(fc.status !== 'reviewed' || !fc.matches || !fc.matches.length){
      return { cls:'unreviewed', label:t.stamp_unreviewed };
    }
    const bucket = classifyRating(fc.matches[0].rating);
    const labels = { 'reviewed-positive':t.stamp_verified, 'reviewed-negative':t.stamp_disputed, 'reviewed-mixed':t.stamp_mixed };
    return { cls:bucket, label: labels[bucket] || t.stamp_mixed };
  }

  function credentialFor(item){
    const rel = item.reliability || {};
    const rating = rel.rating || 'Unrated';
    const tierClass = rating.toLowerCase().includes('very') ? 'very-high' : 'high';
    return { rating, tierClass };
  }

  function escapeHtml(s){
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderItem(item, animate){
    const li = document.createElement('li');
    const stamp = stampFor(item);
    const cred = credentialFor(item);
    const meta = item.publisher_meta || {};
    const color = meta.color || '#8d93a3';
    const abbr = meta.abbr || (item.source_name || '?').slice(0,3).toUpperCase();
    const displayName = (IS_FA && meta.name_fa) ? meta.name_fa : (item.source_name || t.unknown_source);

    li.className = 'dispatch' + (animate ? ' enter' : '') + (stamp.cls === 'reviewed-negative' ? ' is-disputed' : '');
    li.dataset.status = stamp.cls;

    li.innerHTML = `
      <div class="meta">
        <span class="pub-badge" style="--pub-color:${escapeHtml(color)}">
          <img class="pub-favicon" alt="" loading="lazy"
               src="https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(meta.domain || '')}"
               onerror="this.remove()">
          <span class="pub-mono" style="color:${escapeHtml(color)}">${escapeHtml(abbr)}</span>
        </span>
        <span class="pub-name" style="--pub-color:${escapeHtml(color)}">${escapeHtml(displayName)}</span>
        <span class="sep">·</span>
        <span class="time">${timeAgo(item.fetched_at)}</span>
      </div>
      <h2><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
      <div class="badges">
        <span class="credential"><span class="tier-dot ${cred.tierClass}"></span>${escapeHtml(cred.rating)} ${t.reliability_suffix}</span>
        <span class="stamp ${stamp.cls}">${stamp.label}</span>
      </div>
    `;
    return li;
  }

  function updateCounts(items){
    const counts = { all: items.length, 'reviewed-positive':0, 'reviewed-negative':0, 'reviewed-mixed':0, unreviewed:0 };
    items.forEach(it => { const s = stampFor(it).cls; counts[s] = (counts[s] || 0) + 1; });
    document.getElementById('count-all').textContent = localizeDigits(counts.all);
    document.getElementById('count-verified').textContent = localizeDigits(counts['reviewed-positive']);
    document.getElementById('count-disputed').textContent = localizeDigits(counts['reviewed-negative']);
    document.getElementById('count-mixed').textContent = localizeDigits(counts['reviewed-mixed']);
    document.getElementById('count-unreviewed').textContent = localizeDigits(counts.unreviewed);
  }

  function applyFilter(){
    document.querySelectorAll('#feed .dispatch').forEach(li => {
      const show = activeFilter === 'all' || li.dataset.status === activeFilter;
      li.style.display = show ? '' : 'none';
    });
  }

  function render(items, isFirstLoad){
    updateCounts(items);
    if(!items.length){ emptyState.hidden = false; return; }
    emptyState.hidden = true;
    items.forEach((item, idx) => {
      if(seen.has(item.id)) return;
      const li = renderItem(item, !isFirstLoad);
      feedEl.insertBefore(li, feedEl.children[idx] || null);
      seen.add(item.id);
    });
    applyFilter();
  }

  async function poll(isFirstLoad){
    try{
      const res = await fetch(FEED_URL + '?_=' + Date.now(), { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      errorState.hidden = true;
      render(data.items || [], isFirstLoad);
      lastFetchEl.textContent = data.generated_at ? (t.feed_updated + ' ' + timeAgo(data.generated_at)) : t.no_fetch_yet;
    }catch(err){
      console.error('feed load failed', err);
      if(isFirstLoad){ errorState.hidden = false; }
      lastFetchEl.textContent = t.feed_unreachable;
    }
  }

  const filtersEl = document.getElementById('filters');
  if(filtersEl){
    filtersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if(!btn) return;
      document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed','false'));
      btn.setAttribute('aria-pressed','true');
      activeFilter = btn.dataset.filter;
      applyFilter();
    });
  }

  const dialog = document.getElementById('methodology');
  const openBtn = document.getElementById('open-methodology');
  const closeBtn = document.getElementById('close-methodology');
  if(dialog && openBtn && closeBtn){
    openBtn.addEventListener('click', () => dialog.showModal());
    closeBtn.addEventListener('click', () => dialog.close());
  }

  poll(true);
  setInterval(() => poll(false), POLL_MS);
})();
