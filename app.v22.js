// VINEST YouTube Knowledge Base - Shared Logic
const DATA_PATH = './entries.json?v=12';
const THEME_KEY = 'vinest-theme';
let db = null;

function applyTheme(theme) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', resolved);
  document.body?.setAttribute('data-theme', resolved);
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.dataset.theme = resolved;
    toggle.innerHTML = resolved === 'light' ? '<span>🌞</span><span>Light</span>' : '<span>🌙</span><span>Dark</span>';
    toggle.setAttribute('aria-label', `Switch to ${resolved === 'light' ? 'dark' : 'light'} mode`);
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(saved || preferred);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function mountThemeToggle() {
  const nav = document.querySelector('.site-nav');
  if (!nav || document.getElementById('themeToggle')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'themeToggle';
  button.className = 'theme-toggle';
  button.addEventListener('click', toggleTheme);
  nav.appendChild(button);
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    mountThemeToggle();
  });
} else {
  initTheme();
  mountThemeToggle();
}

// Load data
async function loadData() {
  if (db) return db;
  try {
    const res = await fetch(DATA_PATH);
    db = await res.json();
    return db;
  } catch (e) {
    console.error('Failed to load data:', e);
    return { entries: [], companies: [], sectors: [], themes: [] };
  }
}

// Get URL params
function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get('id'),
    company: params.get('company'),
    sector: params.get('sector'),
    theme: params.get('theme'),
    type: params.get('type') || '',
    search: params.get('q') || ''
  };
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Escape HTML
function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Render tags
function renderTags(items, type = '') {
  if (!items || !items.length) return '';
  return items.map(t => `<span class="tag ${type}">${esc(t)}</span>`).join('');
}

// Search entries
function searchEntries(entries, query) {
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter(e => {
    const text = [
      e.title, e.summary_short, e.summary_long,
      ...(e.companies||[]), ...(e.sectors||[]), ...(e.themes||[]),
      ...(e.key_points||[]), ...(e.bull_points||[]), ...(e.bear_points||[])
    ].join(' ').toLowerCase();
    return text.includes(q);
  });
}

// Filter entries
function filterEntries(entries, filters) {
  let result = entries;
  // Handle empty string as "all" - filter only if value is truthy
  if (filters.company && filters.company !== '') {
    result = result.filter(e => (e.companies||[]).some(c => c.toLowerCase().includes(filters.company.toLowerCase())));
  }
  if (filters.sector && filters.sector !== '') {
    result = result.filter(e => (e.sectors||[]).some(s => s.toLowerCase().includes(filters.sector.toLowerCase())));
  }
  if (filters.theme && filters.theme !== '') {
    result = result.filter(e => (e.themes||[]).some(t => t.toLowerCase().includes(filters.theme.toLowerCase())));
  }
  if (filters.source && filters.source !== '') {
    result = result.filter(e => e.source_type === filters.source);
  }
  return result;
}

// Sort entries
function sortEntries(entries, sortBy = 'date') {
  const sorted = [...entries];
  if (sortBy === 'date') {
    sorted.sort((a,b) => new Date(b.created_at || b.updated_at || b.date) - new Date(a.created_at || a.updated_at || a.date));
  } else if (sortBy === 'updated') {
    sorted.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  return sorted;
}

// Get related entries
function getRelatedEntries(entry, allEntries, limit = 5) {
  const related = allEntries.filter(e => {
    if (e.id === entry.id) return false;
    // Same company
    const sameCompany = (e.companies||[]).some(c => (entry.companies||[]).includes(c));
    // Same sector
    const sameSector = (e.sectors||[]).some(s => (entry.sectors||[]).includes(s));
    // Same theme
    const sameTheme = (e.themes||[]).some(t => (entry.themes||[]).includes(t));
    return sameCompany || sameSector || sameTheme;
  });
  return related.slice(0, limit);
}

// Get entity counts
function getEntityCounts(entries) {
  const companies = new Set();
  const sectors = new Set();
  const themes = new Set();
  entries.forEach(e => {
    (e.companies||[]).forEach(c => companies.add(c));
    (e.sectors||[]).forEach(s => sectors.add(s));
    (e.themes||[]).forEach(t => themes.add(t));
  });
  return { companies: companies.size, sectors: sectors.size, themes: themes.size };
}

// Get top entities
function getTopEntities(entries, field, limit = 5) {
  const counts = {};
  entries.forEach(e => {
    (e[field]||[]).forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

// Entry card HTML - Rich version with all details
function entryCardHTML(entry) {
  const hasDetails = entry.summary_long || entry.key_points?.length || entry.bull_points?.length;
  const summary = entry.summary_short || entry.summary_long || '暫時未有摘要';
  let extras = '';

  if (entry.source_name) {
    extras += `<div class="entry-channel"><span class="channel-badge">📺 ${esc(entry.source_name)}</span></div>`;
  }

  if (entry.speaker) {
    extras += `<div class="entry-extra"><span class="label">🎤 講者</span> ${esc(entry.speaker)}</div>`;
  }

  if (entry.stock_recommendations?.length) {
    const stocksHtml = entry.stock_recommendations.slice(0, 3).map(s => `
      <div class="stock-recommend">
        <span class="stock-tag">${esc(s.ticker || s.name || '-')}</span>
        <span class="stock-reason">${esc(s.reason || s.thesis || s['投資論點'] || '見詳情')}</span>
      </div>
    `).join('');
    extras += `<div class="entry-extra target-section"><span class="label">🎯 推介股票</span>${stocksHtml}</div>`;
  }

  return `
    <a href="detail.html?id=${entry.id}" class="entry-card-link entry-card">
      ${extras}
      <h3>${esc(entry.title)}</h3>
      <div class="meta">
        <span>📅 ${formatDate(entry.date)}</span>
        ${entry.source_type ? `<span>· ${esc(entry.source_type.toUpperCase())}</span>` : ''}
      </div>
      <p class="summary">${esc(summary)}</p>
      <div class="tags">
        ${renderTags(entry.companies, 'company')}
        ${renderTags(entry.sectors, 'sector')}
        ${renderTags(entry.themes, 'theme')}
      </div>
      ${hasDetails ? `<div class="view-more">查看詳情 →</div>` : ''}
    </a>
  `;
}

// Entity card HTML
function entityCardHTML(name, count, link) {
  return `
    <a class="entity-card" href="${link}">
      <h3>${esc(name)}</h3>
      <div class="count">${count} 條記錄</div>
    </a>
  `;
}

// Export for use
window.VINEST = {
  loadData, getParams, formatDate, esc, renderTags,
  searchEntries, filterEntries, sortEntries, getRelatedEntries,
  getEntityCounts, getTopEntities, entryCardHTML, entityCardHTML,
  initTheme, toggleTheme, mountThemeToggle, applyTheme
};
