// Génère les copies de copies.mjs en écriture manuscrite (polices Google), avec la position de chaque mot et la liste
// des fautes : node gen.mjs <dossier>  →  pageN.jpg (2550 × 3300, photo de téléphone) + truth.json
import { chromium } from 'playwright';
import fs from 'node:fs';
import { PAGES, parse } from './copies.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage : node gen.mjs <dossier>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const W = 1275, H = 1650; // feuille lettre ; deviceScaleFactor 2 → 2550 × 3300 pixels
const css = (p) => `<link href="https://fonts.googleapis.com/css2?family=${p.font.replace(/ /g, '+')}&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#ece9e0;overflow:hidden}
.sheet{position:absolute;inset:30px;background:#f8f6ef;transform:rotate(${p.rot}deg);padding:70px 90px;
background-image:repeating-linear-gradient(transparent 0 ${Math.round(p.size * 1.55) - 2}px,#c5d3e6 ${Math.round(p.size * 1.55) - 2}px ${Math.round(p.size * 1.55)}px);background-position:0 200px;box-shadow:0 4px 18px rgba(0,0,0,.25)}
h2{font:bold 26px Arial;color:#222}.meta{font:20px Arial;color:#444;margin:10px 0 40px}
.t{font:${p.size}px/${(p.size * 1.55).toFixed(0)}px '${p.font}',cursive;color:#1e3a8a;word-spacing:.08em}.t span{display:inline}</style>`;

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const truth = [];
for (const [i, p] of PAGES.entries()) {
  const { words, faults } = parse(p.text);
  const html = words.map((w) => `<span>${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
  await pg.setContent(`${css(p)}<div class="sheet"><h2>${p.title}</h2><div class="meta">Nom : <span class="t" style="font-size:${p.size * 0.8}px">${p.name}</span> · ${p.year}e secondaire</div><div class="t">${html}</div></div>`);
  await pg.waitForTimeout(900);
  await pg.evaluate(() => document.fonts.ready);
  const boxes = await pg.$$eval('.sheet > .t span', (els, [W, H]) => els.map((e) => { const r = e.getBoundingClientRect();
    return { w: e.textContent, box: [r.top / H * 1000, r.left / W * 1000, r.bottom / H * 1000, r.right / W * 1000].map((v) => Math.round(v * 10) / 10) }; }), [W, H]);
  if (boxes.some((x) => x.box[2] > 985)) console.error(`page ${i + 1} : le texte déborde de la feuille`);
  const file = `page${i + 1}.jpg`;
  await pg.screenshot({ path: `${dir}/${file}`, type: 'jpeg', quality: 90 });
  truth.push({ file, year: p.year, words: boxes, faults });
}
fs.writeFileSync(`${dir}/truth.json`, JSON.stringify(truth));
await b.close();
console.log('ok', truth.map((t) => `${t.words.length} mots, ${t.faults.length} fautes`).join(' · '));
