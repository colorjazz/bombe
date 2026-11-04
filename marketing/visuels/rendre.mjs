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
  if (g === "libre") {
    // carte.html : le contenu HTML de la carte, écrit par l'agent (styles dans carte.css).
    // Pour inventer n'importe quel objet détourné sans gabarit fixe.
    return carte.html || "";
  }
  if (g === "bulletin") {
    // carte.rangees : [[critère, résultat, commentaire]] ; carte.commentaire : commentaire général
    const rangees = (carte.rangees || []).map(([c, r, m]) =>
      `<tr><td>${echap(c)}</td><td class="res">${echap(r)}</td><td>${echap(m)}</td></tr>`).join("");
    return `<div class="feuille bulletin"><div class="bt">${echap(carte.titre)}</div>
      <div class="bi"><span>Élève : <b>${echap(carte.eleve || "La Pile")}</b></span><span>${echap(carte.groupe || "Table de cuisine")}</span></div>
      <table><tr><th>Critère</th><th>Résultat</th><th>Commentaire</th></tr>${rangees}</table>
      <div class="bc"><b>Commentaire général :</b> ${echap(carte.commentaire)}</div></div>`;
  }
  if (g === "recu") {
    // carte.lignes : [[libellé, montant]] ; carte.total
    const lignes = (carte.lignes || []).map(([l, m]) =>
      `<div class="rl"><span>${echap(l)}</span><span class="pts"></span><b>${echap(m)}</b></div>`).join("");
    return `<div class="feuille recu"><div class="rt">${echap(carte.titre)}</div><div class="rs">${echap(carte.sous_titre || "")}</div>
      <div class="rsep"></div>${lignes}<div class="rsep"></div>
      <div class="rl total"><span>TOTAL</span><span class="pts"></span><b>${echap(carte.total)}</b></div>
      <div class="rmerci">${echap(carte.merci || "Merci, revenez à la prochaine étape !")}</div></div>`;
  }
  if (g === "texto") {
    // carte.messages : [{de: "pile"|"prof", texte}]
    const bulles = (carte.messages || []).map((m) =>
      `<div class="bulle ${m.de === "prof" ? "moi" : "elle"}">${echap(m.texte)}</div>`).join("");
    return `<div class="tel"><div class="contact"><span class="avatar">📚</span>${echap(carte.contact || "La pile")}</div>${bulles}</div>`;
  }
  if (g === "emploi") {
    // carte.rangees : [[libellé, valeur]] ; carte.chute : la ligne finale
    const rangees = (carte.rangees || []).map(([l, v]) =>
      `<div class="er"><b>${echap(l)}</b><span>${echap(v)}</span></div>`).join("");
    return `<div class="feuille emploi"><div class="et">${echap(carte.titre || "OFFRE D'EMPLOI")}</div>
      <div class="ep">${echap(carte.poste)}</div>${rangees}<div class="ec">${echap(carte.chute)}</div></div>`;
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
  .feuille{background:#fff4e6;color:#1a1411;border-radius:18px;padding:40px 46px;box-shadow:0 30px 60px rgba(0,0,0,.45)}
  .bulletin .bt{font-weight:800;font-size:44px;text-align:center;letter-spacing:1px;text-transform:uppercase}
  .bulletin .bi{display:flex;justify-content:space-between;font-size:27px;margin:18px 0 20px;padding-bottom:16px;border-bottom:3px solid #1a1411}
  .bulletin table{width:100%;border-collapse:collapse;font-size:25px}
  .bulletin th{text-align:left;font-size:20px;text-transform:uppercase;letter-spacing:1.5px;color:#7c5a3c;padding:6px 10px}
  .bulletin td{padding:14px 10px;border-top:2px solid #e9d3bb;vertical-align:top;line-height:1.25}
  .bulletin td:first-child{font-weight:700;width:24%}.bulletin .res{color:#c2410c;font-weight:800;width:24%}
  .bulletin .bc{margin-top:20px;font-size:27px;line-height:1.35;background:#ffe7cc;padding:18px 22px;border-radius:12px}
  .recu{font-family:"JetBrains Mono",monospace;width:760px;align-self:center;border-radius:6px;font-size:28px}
  .recu .rt{text-align:center;font-weight:800;font-size:38px}.recu .rs{text-align:center;color:#7c5a3c;margin-top:8px;font-size:24px}
  .recu .rsep{border-top:3px dashed #1a1411;margin:22px 0}
  .recu .rl{display:flex;align-items:baseline;gap:12px;padding:9px 0}.recu .pts{flex:1;border-bottom:3px dotted #b59a7f}
  .recu .total{font-size:40px;font-weight:800}.recu .total b{color:#c2410c}
  .recu .rmerci{text-align:center;margin-top:22px;font-size:24px;color:#7c5a3c}
  .tel{margin-top:10px;background:#0f0b09;border:3px solid #3a2c24;border-radius:44px;padding:26px 36px;display:flex;flex-direction:column;gap:12px;width:820px;align-self:center}
  .contact{display:flex;align-items:center;gap:16px;font-weight:700;font-size:30px;padding-bottom:18px;border-bottom:2px solid #2b211b;margin-bottom:6px}
  .avatar{width:58px;height:58px;border-radius:50%;background:#ff6a1a;display:flex;align-items:center;justify-content:center;font-size:30px}
  .bulle{max-width:78%;padding:16px 24px;border-radius:30px;font-size:29px;line-height:1.28}
  .elle{background:#2b211b;color:#fff4e6;align-self:flex-start;border-bottom-left-radius:8px}
  .moi{background:#ff6a1a;color:#1a1411;align-self:flex-end;border-bottom-right-radius:8px;font-weight:600}
  .emploi{border:6px double #1a1411}
  .emploi .et{font-weight:900;font-size:66px;text-align:center;letter-spacing:2px}
  .emploi .ep{text-align:center;font-size:34px;font-weight:700;color:#c2410c;margin:8px 0 22px}
  .emploi .er{display:flex;gap:20px;font-size:29px;padding:12px 0;border-top:2px solid #e9d3bb;line-height:1.3}
  .emploi .er b{width:210px;flex:none}
  .emploi .ec{margin-top:20px;text-align:center;font-size:34px;font-weight:800;background:#1a1411;color:#ffb547;padding:16px;border-radius:12px}
  ${carte.css || ""}
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
