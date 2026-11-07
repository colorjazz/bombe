// Copies d'exemple (fictives) et leurs corrections, pour le bouton « Voir un exemple corrigé » de l'appli :
// aucune IA, aucune page décomptée. Lancer : node tools/exemple/gen.mjs public/exemple
// La position de chaque réponse et de chaque faute est mesurée ici, pour que les annotations tombent au bon endroit.
import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = process.argv[2] || 'public/exemple';
const FONT = 'data:font/ttf;base64,' + fs.readFileSync(new URL('./Caveat-600.ttf', import.meta.url)).toString('base64');
const W = 1100, H = 1424;
const css = (rot) => `<style>@font-face{font-family:H;src:url(${FONT})}*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#d9d4c7;overflow:hidden}
.s{position:absolute;inset:30px;background:#f8f6ef;transform:rotate(${rot}deg);padding:62px 78px;box-shadow:0 4px 18px rgba(0,0,0,.25);
background-image:repeating-linear-gradient(transparent 0 58px,#c5d3e6 58px 60px);background-position:0 200px}
h2{font:bold 27px Arial;color:#222}.meta{font:20px Arial;color:#444;margin:10px 0 30px}.q{font:bold 20px Arial;color:#222;margin:22px 0 4px}
.h{font:39px/60px H;color:#1e3a8a}</style>`;
const Q = ['1. Nommez une cause du krach de 1929. (3 pts)', '2. Expliquez une conséquence de la crise au Canada. (3 pts)', '3. En quelle année Hitler devient-il chancelier ? (1 pt)', '4. Définissez « décolonisation » et donnez un exemple. (3 pts)'];
const QN = ['Q1 Cause du krach', 'Q2 Conséquence au Canada', 'Q3 Hitler chancelier', 'Q4 Décolonisation'], MAX = [3, 3, 1, 3];
const HIST = [
  { name: 'Zoé Lavoie', rot: -0.6, rep: ['La spéculation : les gens achetaient des actions à crédit.', 'Beaucoup de gens ont perdu leur emploi.', 'En 1939', 'Quand une colonie devient indépendante, par exemple l’Inde.'],
    pts: [[3, 'Spéculation et achat d’actions à crédit : cause bien identifiée.'], [2, 'Conséquence nommée (pertes d’emploi), mais pas expliquée.'], [0, 'Écrit 1939, attendu 1933.'], [2, 'Définition juste ; l’exemple de l’Inde n’est pas daté (1947).']],
    comment: 'Bonne compréhension des causes de la crise. Développe davantage tes conséquences et revois la chronologie : Hitler devient chancelier en 1933.' },
  { name: 'Samuel Côté', rot: 0.5, rep: ['Les banques ont prêté trop d’argent et la bourse a chuté en 1929.', 'Les familles n’avaient plus de quoi manger : soupes populaires.', '1933', 'C’est la fin des empires coloniaux.'],
    pts: [[3, 'Cause bien expliquée : prêts excessifs et chute de la bourse.'], [3, 'Soupes populaires : conséquence précise et concrète.'], [1, 'Bonne réponse : 1933.'], [1, 'Définition trop vague, et aucun exemple.']],
    comment: 'Très bonnes explications sur la crise ! Pour la décolonisation, appuie ta définition sur un exemple précis (pays et année).' },
  { name: 'Noah Bouchard', rot: -0.3, rep: ['La surproduction et la spéculation à la bourse de New York.', 'Les fermiers de l’Ouest ont perdu leurs terres (sécheresse).', '1933', 'Un pays qui se libère de la métropole, comme l’Algérie en 1962.'],
    pts: [[3, 'Deux causes justes : surproduction et spéculation.'], [3, 'Sécheresse dans l’Ouest : très bon exemple canadien.'], [1, 'Bonne réponse : 1933.'], [3, 'Définition et exemple (Algérie, 1962) exacts.']],
    comment: 'Excellent travail, complet et précis. Bravo !' },
];
const LANG = [
  { name: 'Léa', rot: -0.4, t: 'Samedi, ma famille et moi sommes [allé|allés|accord|Avec « être », le participe passé s’accorde avec le sujet : ma famille et moi, donc allés.] à la ferme. Il y avait des [vache|vaches|accord|« des » veut dire plusieurs : on ajoute un s.] et des poules. Mon frère a donné du maïs aux cochons. C’était [amuzant|amusant|orthographe|Entre deux voyelles, le son « z » s’écrit souvent avec un s.] !' },
  { name: 'Félix', rot: 0.5, t: 'Hier, je suis allé au parc avec mon chien. Il a couru très vite et il a trouvé un [baton|bâton|orthographe|Le mot « bâton » prend un accent circonflexe sur le a.]. Nous avons [jouer|joué|conjugaison|Après « avons », on écrit le participe passé : joué.] longtemps. Je suis rentré [fatiguer|fatigué|accord|Après « je suis », on écrit l’adjectif : fatigué.].' },
  { name: 'Rosalie', rot: -0.2, t: 'Ma saison préférée est l’automne. Les feuilles [devienne|deviennent|accord|Le sujet « les feuilles » est au pluriel : le verbe se termine par -nt.] rouges et jaunes. J’aime sauter dans les tas de [feuille|feuilles|accord|« les tas de » : il y a plusieurs feuilles, on ajoute un s.] avec mes amis.' },
];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: H } });
const frac = (r) => [r.top / H, r.left / W, r.bottom / H, r.right / W].map((v) => Math.round(v * 1000) / 1000);
const out = { content: [], lang: [] };
for (const [i, c] of HIST.entries()) {
  await p.setContent(`${css(c.rot)}<div class="s"><h2>Histoire du Québec et du Canada — Examen</h2><div class="meta">4e secondaire · Nom : <span class="h" style="font-size:32px">${c.name}</span> · Groupe 541</div>${Q.map((q, k) => `<div class="q">${q}</div><div class="h"><span class="a">${c.rep[k]}</span></div>`).join('')}</div>`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(100);
  const boxes = await p.$$eval('.a', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, bottom: r.bottom, right: r.right }; }));
  const file = `histoire-${i + 1}.jpg`; await p.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 82 });
  out.content.push({ img: file, name: c.name, group: '541', comment: c.comment, total: 10,
    questions: c.pts.map(([pts, j], k) => ({ question: QN[k], points: pts, max: MAX[k], justification: j, page: 1, box: frac(boxes[k]) })) });
}
for (const [i, c] of LANG.entries()) {
  const html = c.t.replace(/\[([^|\]]+)\|[^\]]+\]/g, (m, w) => `<span class="f">${w}</span>`);
  const errs = [...c.t.matchAll(/\[([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/g)].map((m) => ({ text: m[1], correction: m[2], category: m[3], explanation: m[4] }));
  await p.setContent(`${css(c.rot)}<div class="s"><h2>Écriture — Raconte ta fin de semaine</h2><div class="meta">3e année · Nom : <span class="h" style="font-size:32px">${c.name}</span></div><div class="h" style="margin-top:16px">${html}</div></div>`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(100);
  const boxes = await p.$$eval('.f', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top - 4, left: r.left - 4, bottom: r.bottom + 2, right: r.right + 4 }; }));
  const words = (c.t.replace(/\[([^|\]]+)\|[^\]]+\]/g, '$1').match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []).length;
  const file = `francais-${i + 1}.jpg`; await p.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 82 });
  out.lang.push({ img: file, name: c.name, words, errors: errs.map((e, k) => ({ ...e, box: frac(boxes[k]).map((v) => Math.round(v * 1000)) })) });
}
fs.writeFileSync(`${OUT}/demo.json`, JSON.stringify(out, null, 1));
await b.close(); console.log('ok', out.content.length, out.lang.length);
