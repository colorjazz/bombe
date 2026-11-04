// Génère un Reel vertical (MP4 1080 × 1920) où une conversation par texto s'écrit message par message.
// Usage : node marketing/visuels/reel.mjs <reel.json>
// reel.json : {"fichier": "x.mp4", "accroche": "Dimanche, 10 h.", "contact": "Pile de correction",
//              "messages": [{"de": "pile"|"prof", "texte": "..."}], "fin": {"titre": "...", "sous_titre": "..."}}
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const echap = (s = "") =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const style = `*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1920px;font-family:Inter,sans-serif;color:#fff4e6;overflow:hidden;
  background:radial-gradient(circle at 80% 105%,rgba(255,106,26,.55),transparent 50%),#1a1411;
  padding:110px 70px 90px;display:flex;flex-direction:column;gap:44px}
.accroche{font-family:"Inter Display",Inter;font-weight:800;font-size:76px;line-height:1.05;text-align:center}
.tel{flex:1;min-height:0;background:#0f0b09;border:4px solid #3a2c24;border-radius:60px;padding:44px 44px;
  display:flex;flex-direction:column;gap:22px;overflow:hidden}
.fil{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:22px;overflow:hidden}
.contact{display:flex;align-items:center;gap:20px;font-weight:700;font-size:40px;padding-bottom:26px;border-bottom:2px solid #2b211b}
.avatar{width:80px;height:80px;border-radius:50%;background:#ff6a1a;display:flex;align-items:center;justify-content:center;font-size:42px}
.bulle{max-width:80%;padding:24px 32px;border-radius:40px;font-size:42px;line-height:1.28}
.elle{background:#2b211b;align-self:flex-start;border-bottom-left-radius:10px}
.moi{background:#ff6a1a;color:#1a1411;align-self:flex-end;border-bottom-right-radius:10px;font-weight:600}
.dots{letter-spacing:8px;font-size:52px;color:#b59a7f;padding:12px 34px}
.marque{text-align:center;font-weight:800;font-size:40px;color:#ffb547}
.fin{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:44px}
.fin h1{font-family:"Inter Display",Inter;font-size:110px;line-height:1.02;font-weight:800}
.fin p{font-size:50px;color:#f3d9bf;line-height:1.3}
.fin .offre{background:#ff6a1a;color:#1a1411;font-weight:800;font-size:54px;padding:24px 50px;border-radius:999px}`;

function ecran(spec, n, ecrit) {
  const bulles = spec.messages.slice(0, n).map((m) =>
    `<div class="bulle ${m.de === "prof" ? "moi" : "elle"}">${echap(m.texte)}</div>`).join("");
  const dots = ecrit ? `<div class="bulle elle dots">•••</div>` : "";
  return `<!doctype html><html lang="fr-CA"><head><meta charset="utf-8"><style>${style}</style></head><body>
    <div class="accroche">${echap(spec.accroche || "")}</div>
    <div class="tel"><div class="contact"><span class="avatar">📚</span>${echap(spec.contact || "Pile de correction")}</div><div class="fil">${bulles}${dots}</div></div>
    <div class="marque">🔥 Brûle la pile</div></body></html>`;
}

function finale(spec) {
  const f = spec.fin || {};
  return `<!doctype html><html lang="fr-CA"><head><meta charset="utf-8"><style>${style}</style></head><body>
    <div class="fin"><div class="marque" style="font-size:56px">🔥 Brûle la pile</div>
    <h1>${echap(f.titre || "Votre dimanche vous attend.")}</h1><p>${echap(f.sous_titre || "")}</p>
    <div class="offre">30 pages gratuites</div><p><b>brulelapile.ca</b></p></div></body></html>`;
}

const fichier = process.argv[2];
if (!fichier) { console.error("Usage : node reel.mjs <reel.json>"); process.exit(1); }
const spec = JSON.parse(readFileSync(fichier, "utf8"));
const tmp = mkdtempSync(join(tmpdir(), "reel-"));
const images = []; // [chemin, durée en secondes]
const navigateur = await chromium.launch();
const onglet = await navigateur.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
async function capture(html, duree) {
  await onglet.setContent(html, { waitUntil: "load" });
  await onglet.evaluate(() => document.fonts.ready);
  const chemin = join(tmp, `f${String(images.length).padStart(3, "0")}.png`);
  await onglet.screenshot({ path: chemin });
  images.push([chemin, duree]);
}
await capture(ecran(spec, 0, false), 1.2);
for (let i = 0; i < spec.messages.length; i++) {
  const m = spec.messages[i];
  if (m.de !== "prof") await capture(ecran(spec, i, true), 0.6);
  const lecture = Math.min(2.4, 0.8 + m.texte.length * 0.025); // temps de lecture selon la longueur
  await capture(ecran(spec, i + 1, false), lecture);
}
await capture(ecran(spec, spec.messages.length, false), 1.0);
await capture(finale(spec), 2.6);
await navigateur.close();

const liste = join(tmp, "liste.txt");
writeFileSync(liste, images.map(([c, d]) => `file '${c}'\nduration ${d}`).join("\n") + `\nfile '${images.at(-1)[0]}'\n`);
const sortie = join(dirname(fichier), spec.fichier);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", liste,
  "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
  "-c:a", "aac", "-shortest", "-movflags", "+faststart", sortie]);
rmSync(tmp, { recursive: true, force: true });
const total = images.reduce((s, [, d]) => s + d, 0);
console.log(`✓ ${sortie} (${total.toFixed(1)} s)`);
