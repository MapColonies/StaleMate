// Renders the title and closing cards as 1920×1080 PNGs: the title in the app's light theme, where the video starts,
// and the closing card in its dark theme, where the video ends.
// Usage: node src/cards.mjs <out dir>
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const [outDir] = process.argv.slice(2);

const logo = (badge, glyph) => `<svg viewBox="0 0 32 32" width="132" height="132">
  <rect width="32" height="32" rx="7" fill="${badge}"/>
  <g fill="none" stroke="${glyph}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="16" r="9.5"/><path d="M16 10.5V16l3.5 2"/>
  </g>
</svg>`;

const card = ({ background, ink, muted, badge, glyph, title, line }) => `<!doctype html>
<html><body style="margin:0;width:1920px;height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:36px;background:${background};font-family:Ubuntu,sans-serif">
  ${logo(badge, glyph)}
  <div style="font-size:104px;font-weight:700;color:${ink};letter-spacing:-1px">${title}</div>
  <div style="font-size:44px;color:${muted}">${line}</div>
</body></html>`;

const CARDS = {
  title: card({
    background: '#f8fafc',
    ink: '#0f172a',
    muted: '#64748b',
    badge: '#0f172a',
    glyph: '#f8fafc',
    title: 'StaleMate',
    line: 'A quick tour',
  }),
  closing: card({
    background: '#0f172a',
    ink: '#f8fafc',
    muted: '#94a3b8',
    badge: '#e2e8f0',
    glyph: '#0f172a',
    title: 'stalemate.mapcolonies.net',
    line: 'Pick yourself, and never miss a review again.',
  }),
};

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [name, html] of Object.entries(CARDS)) {
    await page.setContent(html);
    await page.screenshot({ path: `${outDir}/${name}.png` });
  }
} finally {
  await browser.close();
}
