// Génère les cartes visuelles (PNG 1080 × 1080) d'un fichier publications.json.
// Usage : node marketing/visuels/rendre.mjs marketing/semaines/<date>/publications.json
// Chaque publication qui a un champ "carte" produit <dossier du JSON>/<carte.fichier>.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const echap = (s = "") =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const flamme = `<svg viewBox="0 0 24 32" width="44" height="58" aria-hidden="true">
  <defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ff6a1a"/><stop offset="1" stop-color="#ffb547"/></linearGradient></defs>
  <path fill="url(#g)" d="M12 1c1 6 8 9 8 18a8 8 0 0 1-16 0c0-4 2-6 3-8 0 3 1 5 3 5-1-6 1-11 2-15z"/>
  <path fill="#fff4e6" opacity=".85" d="M12 17c.6 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 .5 2 1.5 2-.5-2 0-4 .5-6z"/>
</svg>`;

function corps(carte) {
  const g = carte.gabarit || "titre";
  if (g === "liste") {
    const items = (carte.points || []).map((p, i) =>
      `<li><span class="num">${i + 1}</span><span>${echap(p)}</span></li>`).join("");
    return `<h1 class="petit">${echap(carte.titre)}</h1><ol>${items}</ol>`;
  }
  if (g === "copie") {
    // carte.lignes : [{texte, ok}] ; carte.eleve, carte.note : exemples fictifs seulement
    const lignes = (carte.lignes || []).map((l) =>
      `<div class="ligne ${l.ok === false ? "perdu" : ""}">${echap(l.texte)}</div>`).join("");
    return `<h1 class="petit">${echap(carte.titre)}</h1>
      <div class="copie"><div class="entete"><span>${echap(carte.eleve || "Léa Tremblay · groupe 541")}</span>
      <b>${echap(carte.note || "22 / 25")}</b></div>${lignes}
      <div class="fictif">Exemple fictif</div></div>`;
  }
  return `<h1>${echap(carte.titre)}</h1>${carte.sous_titre ? `<p class="sous">${echap(carte.sous_titre)}</p>` : ""}`;
}

function page(carte) {
  return `<!doctype html><html lang="fr-CA"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1080px;height:1080px;font-family:Inter,sans-serif;color:#fff4e6;
    background:radial-gradient(circle at 85% 110%,rgba(255,106,26,.55),transparent 55%),
               radial-gradient(circle at 10% -10%,rgba(255,181,71,.18),transparent 45%),#1a1411;
    padding:90px;display:flex;flex-direction:column}
  .marque{display:flex;align-items:center;gap:18px;font-weight:800;font-size:34px;letter-spacing:.5px}
  .contenu{flex:1;display:flex;flex-direction:column;justify-content:center}
  .surtitre{color:#ffb547;font-weight:700;font-size:30px;text-transform:uppercase;letter-spacing:3px;margin-bottom:28px}
  h1{font-family:"Inter Display",Inter,sans-serif;font-weight:800;font-size:92px;line-height:1.04;letter-spacing:-1.5px}
  h1.petit{font-size:64px;margin-bottom:40px}
  .sous{font-size:38px;line-height:1.35;color:#f3d9bf;margin-top:36px;max-width:860px}
  ol{list-style:none;display:flex;flex-direction:column;gap:26px}
  li{display:flex;gap:26px;align-items:flex-start;font-size:40px;line-height:1.25;font-weight:500}
  .num{flex:none;width:62px;height:62px;border-radius:50%;background:#ff6a1a;color:#1a1411;font-weight:800;
    display:flex;align-items:center;justify-content:center;font-size:34px}
  .copie{background:#fff4e6;color:#1a1411;border-radius:22px;padding:40px 44px;font-size:32px;position:relative;
    box-shadow:0 30px 60px rgba(0,0,0,.45)}
  .entete{display:flex;justify-content:space-between;font-weight:700;font-size:36px;padding-bottom:20px;
    border-bottom:3px solid #e9d3bb;margin-bottom:16px}
  .entete b{color:#c2410c}
  .ligne{padding:12px 0;font-family:"JetBrains Mono",monospace;font-size:27px}
  .ligne::before{content:"✓  ";color:#15803d;font-weight:800}
  .ligne.perdu{color:#b91c1c}.ligne.perdu::before{content:"✗  ";color:#b91c1c}
  .fictif{position:absolute;top:-18px;right:30px;background:#ffb547;color:#1a1411;font-size:22px;font-weight:700;
    padding:6px 16px;border-radius:999px}
  .pied{display:flex;justify-content:space-between;align-items:center;font-size:30px;color:#f3d9bf}
  .pied b{color:#fff4e6;font-weight:800}
  .offre{background:#ff6a1a;color:#1a1411;font-weight:800;padding:14px 26px;border-radius:999px}
  </style></head><body>
  <div class="marque">${flamme}<span>Brûle la pile</span></div>
  <div class="contenu">${carte.surtitre ? `<div class="surtitre">${echap(carte.surtitre)}</div>` : ""}${corps(carte)}</div>
  <div class="pied"><b>brulelapile.ca</b><span class="offre">${echap(carte.offre || "30 pages gratuites")}</span></div>
  </body></html>`;
}

const fichier = process.argv[2];
if (!fichier) {
  console.error("Usage : node rendre.mjs <publications.json>");
  process.exit(1);
}
const publications = JSON.parse(readFileSync(fichier, "utf8"));
const dossier = dirname(fichier);
const navigateur = await chromium.launch();
const onglet = await navigateur.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
let n = 0;
for (const pub of publications) {
  if (!pub.carte || !pub.carte.fichier) continue;
  await onglet.setContent(page(pub.carte), { waitUntil: "load" });
  await onglet.evaluate(() => document.fonts.ready);
  const sortie = join(dossier, pub.carte.fichier);
  await onglet.screenshot({ path: sortie, type: "png" });
  console.log("✓", sortie);
  n++;
}
await navigateur.close();
console.log(`${n} visuel(s) généré(s).`);
