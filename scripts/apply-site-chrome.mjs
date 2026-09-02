/**
 * Apply shared site nav from partials/site-nav.html into all public pages.
 * Also used as documentation of which pages own which CTA anchors.
 *
 * Usage: node scripts/apply-site-chrome.mjs
 *
 * Pages keep their own content; this only rewrites the marked chrome blocks:
 *   <!-- SITE_NAV_START --> ... <!-- SITE_NAV_END -->
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const partial = fs.readFileSync(path.join(root, 'partials/site-nav.html'), 'utf8')
  .replace(/^<!--[\s\S]*?-->\n/, '');

const pages = [
  { file: 'index.html', cta: '#contact', logo: 'assets/logo.png', overHero: true },
  { file: 'ai/index.html', cta: '#start', logo: '/assets/logo.png', overHero: false },
  { file: 'nonprofitai/index.html', cta: '#start', logo: '/assets/logo.png', overHero: false },
  { file: 'serviceai/index.html', cta: '#contact', logo: '/assets/logo.png', overHero: true },
  { file: 'serviceai/garage-door/index.html', cta: '#contact', logo: '/assets/logo.png', overHero: true },
  { file: 'privacy/index.html', cta: '/#contact', logo: '/assets/logo.png', overHero: false },
];

const START = '<!-- SITE_NAV_START -->';
const END = '<!-- SITE_NAV_END -->';

for (const page of pages) {
  const fp = path.join(root, page.file);
  let html = fs.readFileSync(fp, 'utf8');
  let nav = partial
    .replaceAll('{{CTA_HREF}}', page.cta)
    .replaceAll('{{LOGO_SRC}}', page.logo);
  if (page.overHero) {
    nav = nav.replace('class="site-hdr"', 'class="site-hdr site-hdr--over-hero"');
  }
  const block = `${START}\n${nav.trim()}\n${END}`;
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  } else {
    console.warn('No SITE_NAV markers in', page.file, '— skip rewrite');
    continue;
  }
  fs.writeFileSync(fp, html);
  console.log('updated', page.file);
}
