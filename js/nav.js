// The top bar shared by every page. Developer links appear only in a browser
// where developer mode was switched on by opening any page with ?dev in the
// address (and off again with ?dev=off). This hides the links, it is not
// security: the pages themselves only ever touch the visitor's own browser data.

const DEV_KEY = 'aslDev';

function devEnabled() {
  try {
    const flag = new URLSearchParams(location.search).get('dev');
    if (flag === 'off') localStorage.removeItem(DEV_KEY);
    else if (flag !== null) localStorage.setItem(DEV_KEY, '1');
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}

const LINKS = [
  { href: 'index.html', label: 'Practice' },
  { href: 'contribute.html', label: 'Contribute' },
];
const DEV_LINKS = [
  { href: 'record.html', label: 'Record' },
  { href: 'train.html', label: 'Train' },
];

function link({ href, label }, current) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  if (current === href) a.setAttribute('aria-current', 'page');
  return a;
}

const bar = document.getElementById('topbar');
if (bar) {
  const current = location.pathname.split('/').pop() || 'index.html';
  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = 'index.html';
  brand.textContent = 'Fingerspelling Trainer';

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Main');
  for (const l of LINKS) nav.append(link(l, current));

  if (devEnabled()) {
    const sep = document.createElement('span');
    sep.className = 'nav-sep';
    sep.setAttribute('aria-hidden', 'true');
    nav.append(sep);
    for (const l of DEV_LINKS) nav.append(link(l, current));
  }
  bar.append(brand, nav);
}
