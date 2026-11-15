// Vérité de terrain de vraies photos de copies : node reelles.mjs <dossier> [année]
// Pour chaque photoN.jpg du dossier, photoN.txt contient le texte de l'élève tel qu'écrit, fautes marquées comme dans
// copies.mjs ([écrit|correction|catégorie|type], type « option » pour une faute discutable). → <dossier>/truth.json
// Les vraies copies (photos et textes) restent hors du dépôt : élèves réels.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from './copies.mjs';

const dir = process.argv[2];
const year = Number(process.argv[3] || 3);
const truth = fs.readdirSync(dir).filter((f) => /^photo\d+\.txt$/.test(f)).sort().map((f) => {
  const { words, faults } = parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\n/g, ' '));
  return { file: f.replace('.txt', '.jpg'), year, words: words.map((w) => ({ w })), faults };
});
fs.writeFileSync(path.join(dir, 'truth.json'), JSON.stringify(truth));
console.log(truth.map((t) => `${t.file} : ${t.words.length} mots, ${t.faults.filter((x) => !x.optional).length} fautes (+ ${t.faults.filter((x) => x.optional).length} discutables)`).join('\n'));
