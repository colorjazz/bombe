// Génère des copies manuscrites dont on connaît la position exacte de chaque mot (vérité terrain pour mesurer les surlignages).
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = process.argv[2];
const W = 1275, H = 1650; // photo de feuille lettre, ~150 ppp
const pages = [
  { font: 'Patrick Hand', size: 40, rot: 1.6, title: 'Rédaction — Mon sport préféré', name: 'Camille Roy',
    text: `Depuis que je suis petite, je joue au hockey avec mes amies. Les entraînements ont lieux trois fois par semaine à l'aréna. L'hiver dernier, notre équipe a gagner le tournoi régional contre des filles plus vieilles. Notre entraîneur nous a toujours dit que le travail d'équipe est plus important que le talent. Je souhaite continué ce sport le plus longtemps possible.` },
  { font: 'Reenie Beanie', size: 50, rot: -1.8, title: 'Lettre ouverte au maire', name: 'Arjun Patel',
    text: `Monsieur le maire, je vous écris parce que le parc près de chez moi est en mauvais état. Les balançoires sont brisé depuis l'automne et personne ne les a réparer. Les enfants du quartier n'ont plus d'endroit sécuritaire pour jouer. Je vous demande d'agir rapidement, car plusieurs familles attende une réponse depuis des mois.` },
  { font: 'Homemade Apple', size: 30, rot: 0.9, title: 'Résumé — Le cycle de l\'eau', name: 'Mei Lin Wong',
    text: `Le soleil réchauffe l'eau des océans, qui s'évapore dans l'atmosphère. La vapeur se refroidi en altitude et forme des nuages. Quand les gouttelettes deviennent trop lourdes, elles tombe sous forme de pluie ou de neige. L'eau retourne ensuite dans les rivières et les lacs, puis le cycle recommence sans arrêt.` },
  { font: 'Gochi Hand', size: 40, rot: -0.7, title: 'Critique de film', name: 'Daniel Okafor',
    text: `J'ai vu le film avec ma classe la semaine passé. L'histoire se déroule dans un futur où les robots remplace les humains au travail. Les effets spéciaux étaient vraiment impressionnant, mais le scénario manquait d'originalité. Je donnerais au film une note de sept sur dix parce que les acteurs jouait très bien.` },
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
  const words = p.text.split(' ').map((w, k) => `<span style="display:inline-block;margin-right:${(Math.sin(k * 7.1) * 0.5 + 0.5) * 0.35}em;transform:translateY(${Math.sin(k * 0.9) * 3}px) rotate(${Math.sin(k * 3.3) * 1.5}deg)">${w}</span>`).join(' ');
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
