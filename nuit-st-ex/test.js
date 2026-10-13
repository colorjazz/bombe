// Tests du moteur : node nuit-st-ex/test.js
//
// Les réponses des énigmes ne sont pas écrites ici, pour ne rien divulgâcher
// aux élèves qui liraient le dépôt. Pour tester la partie complète, passer la
// solution en variable d'environnement :
//   SOLUTION="réponse-labo|réponse-armoire|réponse-coffre" node nuit-st-ex/test.js
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const { Partie, LIEUX, OBJETS, analyser, empreinte, texteLocal } = require("./moteur.js");

let n = 0;
let sautes = 0;
function test(nom, fn) {
  fn();
  n += 1;
  console.log("ok - " + nom);
}
function testSolution(nom, fn) {
  if (!process.env.SOLUTION) {
    sautes += 1;
    console.log("-- sauté (SOLUTION absente) - " + nom);
    return;
  }
  test(nom, () => fn(process.env.SOLUTION.split("|")));
}

function jouer(partie, commandes) {
  let dernier = [];
  for (const c of commandes) dernier = partie.executer(c);
  return dernier;
}

const texte = (blocs) => blocs.map((b) => b.texte).join("\n");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Empreinte de la phrase de récompense (pas la phrase elle-même).
const EMPREINTE_PHRASE = "ce20d929689ba655460239b73dffb2cc2df7c169fd6bea8185827ad6a4a07fb4";

test("ouverture puis description de la classe", () => {
  const p = new Partie();
  const blocs = p.demarrer();
  assert.strictEqual(blocs[0].type, "ouverture");
  assert.ok(texte(blocs).includes("Le local A-217"));
  assert.ok(texte(blocs).includes("Le repaire de M. Plante"));
  assert.deepStrictEqual(p.inventaire, ["telephone_mort"]);
});

test("sha256 maison identique à celui de Node", () => {
  for (const s of ["", "abc", "Polyvalente Antoine-de-Saint-Exupéry", "x".repeat(200)]) {
    assert.strictEqual(empreinte(s), sha(s));
  }
});

test("analyse : accents, articles, abréviations, numéros de locaux", () => {
  assert.deepStrictEqual(analyser("Utiliser la clé sur les chaînes").objets, ["cle_principale"]);
  assert.deepStrictEqual(analyser("prendre la clé dorée").objets, ["cle_doree"]);
  assert.strictEqual(analyser("n").direction, "NORD");
  assert.strictEqual(analyser("aller vers l'ouest").direction, "OUEST");
  assert.strictEqual(analyser("descendre").direction, "BAS");
  assert.strictEqual(analyser("B 243").verbe, "ENTRER");
  assert.strictEqual(analyser("b243").verbe, "ENTRER");
  assert.strictEqual(analyser("b").direction, "BAS");
});

test("la carte : chaque sortie a son retour, chaque objet existe", () => {
  const inverse = { NORD: "SUD", SUD: "NORD", EST: "OUEST", OUEST: "EST", HAUT: "BAS", BAS: "HAUT" };
  for (const id in LIEUX) {
    for (const [d, dest] of Object.entries(LIEUX[id].sorties)) {
      assert.ok(LIEUX[dest], `${id} ${d} -> ${dest} inexistant`);
      assert.strictEqual(LIEUX[dest].sorties[inverse[d]], Number(id), `${id} ${d} -> ${dest}`);
    }
    for (const o of LIEUX[id].objets || []) assert.ok(OBJETS[o], o);
  }
});

test("aucun local n'est listé dans deux lieux", () => {
  const vus = {};
  for (const id in LIEUX) {
    for (const l of LIEUX[id].locaux || []) {
      assert.ok(!vus[l], `${l} dans ${vus[l]} et ${id}`);
      vus[l] = id;
    }
  }
  assert.ok(Object.keys(vus).length > 250, "il manque des locaux : " + Object.keys(vus).length);
});

test("événement du tour 5, une seule fois, peu importe l'action", () => {
  const p = new Partie();
  p.demarrer();
  const r = [1, 2, 3, 4, 5, 6].map((i) => p.executer(i % 2 ? "regarder" : "inventaire"));
  assert.ok(!r.slice(0, 4).some((b) => b.some((x) => x.type === "evenement")));
  assert.ok(texte(r[4]).includes("Tu n'es pas seul."));
  assert.ok(!r[5].some((x) => x.type === "evenement"));
});

test("AIDE ne compte pas comme un tour", () => {
  const p = new Partie();
  jouer(p, ["aide", "aide", "aide", "aide", "aide"]);
  assert.strictEqual(p.tour, 0);
});

test("entrer dans les locaux : vides, fausses pistes, objets inutiles", () => {
  const p = new Partie();
  jouer(p, ["o"]);
  let r = p.executer("entrer A215");
  assert.ok(texte(r).includes("CODE = 0000"));
  r = p.executer("a 201");
  assert.ok(texte(r).includes("Tu entres dans le local A201"));
  r = p.executer("entrer C224");
  assert.ok(texte(r).includes("ne donne pas ici"));
  p.executer("entrer a217");
  assert.strictEqual(p.lieu, 1);
  p.lieu = 27;
  p.executer("entrer c224");
  assert.ok(p.possede("cle_doree"));
  assert.ok(texte(p.executer("entrer c224")).includes("déjà fouillé"));
  assert.ok(texte(p.executer("utiliser clé dorée")).includes("aucune serrure"));
  for (const nom of ["A120", "B272A", "Gym 3", "C130"]) assert.ok(texteLocal(nom).length > 20);
});

test("pièges : portes de secours, alarme, fenêtre, gymnase 6", () => {
  const cas = [[14, "sud"], [15, "sud"], [20, "est"], [20, "sud"], [19, "tirer alarme"], [3, "briser la fenêtre"], [20, "entrer H105"], [15, "sortir"]];
  for (const [lieu, cmd] of cas) {
    const p = new Partie();
    p.lieu = lieu;
    const r = p.executer(cmd);
    assert.ok(p.termine, `${lieu} ${cmd}`);
    assert.strictEqual(r[r.length - 1].type, "finmort");
  }
});

test("porte du secrétariat verrouillée tant que le cadenas tient", () => {
  const p = new Partie();
  const r = jouer(p, ["o", "s", "bas", "nord", "est"]);
  assert.strictEqual(p.lieu, 10);
  assert.ok(texte(r).includes("verrouillée"));
});

test("les énigmes refusent un mauvais code, et le coffre fait du bruit", () => {
  for (const lieu of [5, 16, 11]) {
    const p = new Partie();
    p.lieu = lieu;
    const r = p.executer("composer 1200");
    assert.ok(!p.codes[lieu]);
    assert.ok(!texte(r).includes("déclic") && !texte(r).includes("cliquetis"));
  }
  const p = new Partie();
  p.lieu = 11;
  p.poursuite = 5;
  p.executer("composer 0000");
  assert.strictEqual(p.poursuite, 3); // un tour normal + un tour perdu au bip
});

test("les vestiaires sont trop noirs sans le bâton lumineux, et la lampe est morte", () => {
  const p = new Partie();
  let r = jouer(p, ["o", "s", "bas", "e", "e", "n"]);
  assert.ok(texte(r).includes("trop noir"));
  assert.ok(!texte(r).includes("tuyau"));
  r = p.executer("prendre tuyau");
  assert.ok(texte(r).includes("Sans lumière"));
  p.inventaire.push("lampe_morte");
  assert.ok(texte(p.executer("allumer lampe")).includes("piles sont mortes"));
  p.inventaire.push("baton_lumineux");
  r = p.executer("plier bâton");
  assert.ok(texte(r).includes("lueur verte"));
  assert.ok(texte(r).includes("tuyau de métal"));
  p.executer("prendre tuyau");
  assert.ok(p.possede("tuyau_metal"));
});

test("les indices se lisent là où ils sont", () => {
  const p = new Partie();
  assert.ok(texte(p.executer("lire tableau")).includes("intérêt composé"));
  p.lieu = 8;
  assert.ok(texte(p.executer("lire mur")).includes("DEMANDE À PLANTE"));
  p.lieu = 16;
  assert.ok(texte(p.executer("lire tableau")).includes("Ils suivent le bruit"));
  assert.ok(texte(p.executer("lire armoire")).includes("sièges de la caverne"));
  p.lieu = 5;
  assert.ok(texte(p.executer("lire fiche")).includes("métal"));
  assert.ok(texte(p.executer("lire tableau périodique")).includes("Mercure"));
  p.lieu = 11;
  assert.ok(texte(p.executer("lire post-it")).includes("Plante"));
  p.lieu = 24;
  assert.ok(texte(p.executer("lire journal")).includes("ÉCLOSION"));
});

test("combiner sans ruban", () => {
  const p = new Partie();
  p.inventaire.push("tuyau_metal", "lame_lourde");
  const r = p.executer("combiner tuyau avec lame");
  assert.ok(texte(r).includes("rien pour les faire tenir ensemble"));
  assert.ok(!p.flags.arme_fabriquee);
});

test("frapper le cadenas sans avoir mangé, puis après", () => {
  const p = new Partie();
  p.lieu = 10;
  p.inventaire.push("arme_artisanale");
  let r = p.executer("frapper cadenas");
  assert.ok(texte(r).includes("Tu es trop faible"));
  assert.ok(!p.flags.cadenas_brise);
  p.flags.a_mange = true;
  r = p.executer("fracasser cadenas");
  assert.ok(texte(r).includes("la charnière explose"));
  assert.ok(texte(r).includes("quelque chose a entendu"));
});

test("après le fracas, traîner trop longtemps est fatal", () => {
  const p = new Partie();
  p.lieu = 10;
  p.inventaire.push("arme_artisanale");
  p.flags.a_mange = true;
  p.tour = 10;
  p.executer("frapper cadenas");
  const r = [1, 2, 3, 4, 5, 6, 7, 8].map(() => p.executer("regarder"));
  assert.ok(texte(r[3]).includes("Des pas"));
  assert.ok(texte(r[5]).includes("se rapprochent"));
  assert.ok(p.termine);
  assert.strictEqual(r[7][r[7].length - 1].type, "finmort");
});

test("l'agenda montre le plan des lieux visités", () => {
  const p = new Partie();
  assert.ok(texte(p.executer("carte")).includes("Ton agenda en contient un"));
  jouer(p, ["prendre agenda", "o", "s", "bas"]);
  const plan = p.executer("carte").find((b) => b.type === "carte");
  assert.deepStrictEqual(plan.lieux.map((l) => l.id).sort((a, b) => a - b), [1, 2, 3, 6]);
  assert.strictEqual(plan.lieux.find((l) => l.actuel).id, 6);
  assert.deepStrictEqual(plan.liens, [[1, 2], [2, 3]]);
  assert.ok(p.executer("lire agenda").some((b) => b.type === "carte"));
});

test("sauvegarde et reprise", () => {
  const p = new Partie();
  jouer(p, ["prendre agenda", "o", "s"]);
  const q = Partie.restaurer(JSON.parse(JSON.stringify(p.exporter())));
  assert.strictEqual(q.lieu, 3);
  assert.ok(q.possede("agenda"));
  assert.ok(q.visites.has(2));
  assert.ok(texte(q.reprendre()).includes("Carrefour"));
});

testSolution("partie complète jusqu'à la victoire et la phrase", ([labo, armoire, coffre]) => {
  const p = new Partie();
  p.demarrer();
  jouer(p, [
    "prendre agenda", "lire tableau",
    "o", "s", "e", "composer " + labo, "prendre ruban", "o", "bas",   // labos
    "o", "s", "e", "manger barre", "n", "prendre lame", "s", "o",    // cafétéria, cuisines
    "s", "haut", "composer " + armoire, "prendre bâton", "bas", "n", "n", "e", // Bloc F
    "e", "e", "n", "allumer bâton", "prendre tuyau", "s",            // vestiaires
    "combiner tuyau avec lame", "o", "o", "n",
  ]);
  assert.strictEqual(p.lieu, 10);
  assert.ok(p.flags.arme_fabriquee && p.flags.a_mange && p.possede("agenda"));
  const r = jouer(p, ["frapper cadenas", "est", "composer " + coffre, "prendre clé", "ouest", "utiliser clé sur chaînes"]);
  assert.ok(p.termine);
  assert.ok(texte(r).includes("FÉLICITATIONS, TU AS SURVÉCU À LA NUIT."));
  const phrase = r.find((b) => b.type === "phrase").texte.replace(/^« | »$/g, "");
  assert.strictEqual(sha(phrase), EMPREINTE_PHRASE);
});

testSolution("OUVRIR PORTE avec la clé déclenche aussi la victoire", ([labo, armoire, coffre]) => {
  const p = new Partie();
  p.codes = { 5: labo, 16: armoire, 11: coffre };
  p.lieu = 10;
  p.inventaire.push("cle_principale");
  const r = p.executer("ouvrir porte");
  assert.ok(p.termine);
  assert.strictEqual(r[1].texte, "COUPURE AU NOIR. GÉNÉRIQUE.");
});

console.log(`\n${n} tests réussis` + (sautes ? `, ${sautes} sautés (SOLUTION absente).` : "."));
