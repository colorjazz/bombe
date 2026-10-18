// Applique le recalage de public/boxes.js (dans un vrai navigateur, comme dans l'appli) aux réponses enregistrées.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [dir, optJson, out] = process.argv.slice(2);
const opt = JSON.parse(optJson || '{}');
const truth = JSON.parse(fs.readFileSync(`${dir}/truth.json`, 'utf8'));
const runs = JSON.parse(fs.readFileSync(`${dir}/runs.json`, 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.addScriptTag({ content: fs.readFileSync(new URL('../../public/boxes.js', import.meta.url), 'utf8').replace(/^export function/m, 'function') });
const images = truth.map((t) => `data:image/jpeg;base64,${fs.readFileSync(`${dir}/${t.file}`).toString('base64')}`);
const snapped = await p.evaluate(async ({ images, runs, opt }) => {
  const datas = await Promise.all(images.map((src) => new Promise((res) => { const i = new Image(); i.onload = () => {
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
    res(g.getImageData(0, 0, i.width, i.height)); }; i.src = src; })));
  return runs.map((r) => ({ ...r, errors: r.errors.map((e) => (e.box ? { ...e, box: snapToInk(datas[r.page], e.box, e.text, e.line) } : e)) }));
}, { images, runs, opt });
await b.close();
fs.writeFileSync(out || `${dir}/runs-snap.json`, JSON.stringify(snapped));
