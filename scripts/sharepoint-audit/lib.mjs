import { createHash } from 'node:crypto';
export const SITE = 'https://mypps.sharepoint.com/sites/ConspiracyTheories';
const sensitive = /^(access_token|id_token|token|auth|authorization|sig|signature|tempauth|code|client_secret|refresh_token|sastoken)$/i;
export function safeUrl(value, base = SITE) {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.username = ''; url.password = '';
    for (const key of [...url.searchParams.keys()]) if (sensitive.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}
export function youtubeId(value) {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || null;
    if (/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)) {
      return url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] || null;
    }
  } catch {}
  return null;
}
export function isCoursePage(value) {
  try {
    const u = new URL(value), site = new URL(SITE);
    return u.origin === site.origin && /^\/sites\/ConspiracyTheories\/SitePages\/[^/]+\.aspx$/i.test(u.pathname);
  } catch { return false; }
}
export function canonicalPage(value) { const u = new URL(value); u.search = ''; u.hash = ''; return u.href; }
export function kind(value) {
  if (youtubeId(value) || /vimeo\.com|microsoftstream\.com|\/stream\.aspx|videomanifest|\.m3u8(?:\?|$)|\.(mp4|webm|mov)(?:\?|$)/i.test(value)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)(?:\?|$)/i.test(value)) return 'audio';
  if (/\.(pdf|docx?|pptx?|xlsx?|zip)(?:\?|$)/i.test(value)) return 'document';
  if (/\.(jpe?g|png|gif|webp|svg)(?:\?|$)|\/thumbnails\//i.test(value)) return 'image';
  return 'link';
}
export function decodeText(value) {
  let s = String(value);
  if(!/https?:\/\//i.test(s)&&/https?%3a%2f%2f/i.test(s)){try{s=decodeURIComponent(s);}catch{}}
  for (let n = 0; n < 3; n++) {
    s = s.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\//g, '/').replace(/&amp;|&#38;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return s;
}
export function embeddedUrls(value) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      const text = decodeText(v);
      for (const raw of text.match(/https?:\/\/[^\s<>"'\\]+/g) || []) {
        const u = safeUrl(raw.replace(/[),;]+$/, '')); if (u) found.add(u);
      }
      // Relative SharePoint asset links can live inside encoded web-part properties.
      for (const raw of text.match(/\/(?:sites\/ConspiracyTheories\/)[^\s<>"'\\]+/gi) || []) {
        const u = safeUrl(raw); if (u) found.add(u);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value); return [...found];
}
export function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'page'; }
export function downloadTarget(value) {
  let u; try { u = new URL(value); } catch { return null; }
  if (u.origin !== new URL(SITE).origin) return null;
  let p = decodeURIComponent(u.pathname).replace(/^\/:[a-z]:\/r\//i, '/');
  const prefix = new URL(SITE).pathname + '/';
  if (!p.toLowerCase().startsWith(prefix.toLowerCase()) || p.includes('/../')) return null;
  if (!/\.(pdf|docx?|pptx?|xlsx?|jpe?g|png|webp|gif|svg|mp3|mp4|wav|m4a|webm)$/i.test(p)) return null;
  const escaped = p.replaceAll("'", "''");
  const api = new URL(SITE + "/_api/web/GetFileByServerRelativeUrl('" + escaped + "')/$value").href;
  const filename = slug(p.split('/').pop().replace(/\.[^.]+$/, '')) + '-' + createHash('sha256').update(p).digest('hex').slice(0, 8) + p.match(/\.[^.]+$/)[0].toLowerCase();
  return { api, filename, kind: kind(p) };
}
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function compare(items, media, localFiles) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ids = new Set(Object.values(media.videos || {}).filter(v => v.provider === 'youtube').map(v => v.id));
  return items.map(item => {
    const id = youtubeId(item.url);
    let status = 'review';
    if (id) status = ids.has(id) ? 'already-embedded' : 'video-to-add';
    else if (['document', 'video', 'audio', 'image'].includes(item.kind)) {
      let filename; try { filename = decodeURIComponent(new URL(item.url).pathname).split('/').pop(); } catch {}
      if (filename && localFiles.some(f => normalize(f) === normalize(filename))) status = 'local-file-found';
    }
    return {...item, youtubeId: id, status};
  });
}
