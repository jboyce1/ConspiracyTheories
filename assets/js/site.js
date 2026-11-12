document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.course-nav');
  const title = nav.querySelector('h1');
  const links = document.createElement('div'); links.id = 'course-links';
  while (title.nextSibling) links.append(title.nextSibling);
  const toggle = document.createElement('button');
  toggle.className = 'menu-toggle'; toggle.textContent = 'Course menu';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', links.id);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded)); nav.classList.toggle('menu-open', !expanded);
  });
  nav.append(toggle, links); nav.classList.add('enhanced');
  const content = document.querySelector('.main-content');
  const toc = document.querySelector('#toc');
  const seen = new Set();
  const headings = [...content.querySelectorAll('h1,h2,h3')].filter(h => h.textContent.trim());
  headings.forEach((h, i) => {
    let id = h.id || h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${i}`;
    if (seen.has(id)) id += `-${i}`;
    seen.add(id); h.id = id;
    if (h.tagName === 'H3') return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + id; a.textContent = h.textContent;
    li.append(a); toc.append(li);
  });
  content.querySelectorAll('table').forEach(table => {
    const wrap = document.createElement('div'); wrap.className = 'table-wrap';
    wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Scrollable lesson table');
    table.replaceWith(wrap); wrap.append(table);
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const a = [...toc.querySelectorAll('a')].find(a => a.hash === '#' + entry.target.id);
      if (a) a.classList.toggle('active', entry.isIntersecting);
    });
  }, {rootMargin: '0px 0px -65% 0px'});
  headings.forEach(h => observer.observe(h));
});
