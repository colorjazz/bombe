// Génère des copies manuscrites dont on connaît la position exacte de chaque mot (vérité terrain pour mesurer les surlignages).
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = process.argv[2];
const W = 1275, H = 1650; // photo de feuille lettre, ~150 ppp
const pages = [
  { font: 'Caveat', size: 44, rot: -0.6, title: 'Rédaction — Un souvenir marquant', name: 'Yasmine Benali',
    text: `L'été dernier, mes parents ont décider de partir en camping au lac Saint-Jean. Nous somme arrivés tard le soir et il pleuvait beaucoup. Mon frère et moi avons monter la tente pendant que ma mère préparait le souper. Les moustiques étaient partout, ils nous piquait sans arrêt. Le lendemain, le soleil c'est levé et le lac était magnifique. J'ai apprit que les plus beaux moments arrive souvent après les difficultés.` },
  { font: 'Indie Flower', size: 40, rot: 0.8, title: 'Texte argumentatif — Les écrans à l\'école', name: 'Kevin Nguyen',
    text: `Je pense que les cellulaires devrait être interdit en classe. Premièrement, les élèves sont souvent distrait par les notifications. Deuxièmement, plusieurs étudiants utilise leur téléphone pour tricher pendant les examens. Par contre, les tablettes peuvent être utile pour faire des recherches. En conclusion, il faut trouver un équilibre entre la technologie et la concentration des jeunes qui apprenent.` },
  { font: 'Kalam', size: 34, rot: -1.1, title: 'Compte rendu de lecture', name: 'Léa Tremblay',
    text: `Le roman raconte l'histoire d'une jeune fille qui se retrouve seule dans une ville inconnue. Elle rencontre des personnages qui l'aideront a trouver sa place. Les descriptions sont tellement réaliste qu'on a l'impression d'être là. Selon moi, l'auteur a bien réussit à créer une atmosphère mystérieuse. Cependant, la fin m'a déçu parce que plusieurs questions reste sans réponse. Je le recommanderais quand même aux élèves de mon âge.` },
  { font: 'Shadows Into Light', size: 42, rot: 0.4, title: 'Science — La photosynthèse', name: 'Moussa Diallo',
    text: `La photosynthèse permet aux plantes de fabriqué leur propre nourriture. Les feuilles captent la lumière du soleil grâce a la chlorophylle. Ensuite, la plante absorbe le gaz carbonique et l'eau qui viens des racines. Elle produit du glucose et libère de l'oxygène dans l'air. Sans ce processus, les animaux et les humains ne pourrait pas respirer. C'est pourquoi les forêts sont très important pour notre planète.` },
];
const css = (p) => `<link href="https://fonts.googleapis.com/css2?family=${p.font.replace(/ /g, '+')}&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#ece9e0;overflow:hidden}
.sheet{position:absolute;inset:30px;background:#f8f6ef;transform:rotate(${p.rot}deg);padding:70px 90px;
background-image:repeating-linear-gradient(transparent 0 ${Math.round(p.size * 1.55) - 2}px,#c5d3e6 ${Math.round(p.size * 1.55) - 2}px ${Math.round(p.size * 1.55)}px);background-position:0 200px;box-shadow:0 4px 18px rgba(0,0,0,.25)}
h2{font:bold 26px Arial;color:#222}.meta{font:20px Arial;color:#444;margin:10px 0 40px}
.t{font:${p.size}px/${(p.size * 1.55).toFixed(0)}px '${p.font}',cursive;color:#1e3a8a;word-spacing:.08em}.t span{display:inline}</style>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport: { width: W, height: H } });
const truth = [];
for (const [i, p] of pages.entries()) {
  const words = p.text.split(' ').map((w) => `<span>${w}</span>`).join(' ');
  await pg.setContent(`${css(p)}<div class="sheet"><h2>${p.title}</h2><div class="meta">Nom : <span class="t" style="font-size:${p.size * 0.8}px">${p.name}</span> · Groupe 542</div><div class="t">${words}</div></div>`);
  await pg.waitForTimeout(900);
  await pg.evaluate(() => document.fonts.ready);
  const boxes = await pg.$$eval('.sheet > .t span', (els, [W, H]) => els.map((e) => { const r = e.getBoundingClientRect();
    return { w: e.textContent, box: [r.top / H * 1000, r.left / W * 1000, r.bottom / H * 1000, r.right / W * 1000].map((v) => Math.round(v * 10) / 10) }; }), [W, H]);
  const file = `page${i + 1}.jpg`;
  await pg.screenshot({ path: `${dir}/${file}`, type: 'jpeg', quality: 88 });
  truth.push({ file, words: boxes });
}
fs.writeFileSync(`${dir}/truth.json`, JSON.stringify(truth));
await b.close();
console.log('ok', truth.map((t) => t.words.length));
