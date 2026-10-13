// Tests du moteur : node nuit-st-ex/test.js
"use strict";
const assert = require("assert");
const { Partie, LIEUX, analyser } = require("./moteur.js");

let n = 0;
function test(nom, fn) {
  fn();
  n += 1;
  console.log("ok - " + nom);
}

function jouer(partie, commandes) {
  let dernier = [];
  for (const c of commandes) dernier = partie.executer(c);
  return dernier;
}

const texte = (blocs) => blocs.map((b) => b.texte).join("\n");

// Mène une partie neuve jusque devant le cadenas, armé et rassasié (lieu 10).
const VERS_LE_CADENAS = [
  "prendre agenda",
  "o", "s", "e", "prendre ruban", "o", "bas",                  // labos -> carrefour principal
  "o", "s", "e", "manger barre", "n", "prendre lame", "s", "o", // place publique 2 -> cafétéria -> cuisines
  "s", "haut", "prendre bâton", "bas", "n", "n", "e",          // Bloc F
  "e", "e", "n", "allumer bâton", "prendre tuyau", "s",        // place publique 1 -> vestiaires
  "combiner tuyau avec lame", "o", "o", "n",
];

test("ouverture puis description de la classe", () => {
  const p = new Partie();
  const blocs = p.demarrer();
  assert.strictEqual(blocs[0].type, "ouverture");
  assert.ok(texte(blocs).includes("Le local A-217"));
  assert.ok(texte(blocs).includes("Le repaire de M. Plante"));
  assert.deepStrictEqual(p.inventaire, ["telephone_mort"]);
});

test("analyse : accents, articles, abréviations", () => {
  assert.deepStrictEqual(analyser("Utiliser la clé sur les chaînes").objets, ["cle_principale"]);
  assert.strictEqual(analyser("n").direction, "NORD");
  assert.strictEqual(analyser("aller vers l'ouest").direction, "OUEST");
  assert.strictEqual(analyser("descendre").direction, "BAS");
});

test("la carte : chaque sortie a son retour", () => {
  const inverse = { NORD: "SUD", SUD: "NORD", EST: "OUEST", OUEST: "EST", HAUT: "BAS", BAS: "HAUT" };
  for (const id in LIEUX) {
    for (const [d, dest] of Object.entries(LIEUX[id].sorties)) {
      assert.ok(LIEUX[dest], `${id} ${d} -> ${dest} inexistant`);
      assert.strictEqual(LIEUX[dest].sorties[inverse[d]], Number(id), `${id} ${d} -> ${dest}`);
    }
  }
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

test("porte du secrétariat verrouillée tant que le cadenas tient", () => {
  const p = new Partie();
  const r = jouer(p, ["o", "s", "bas", "nord", "est"]);
  assert.strictEqual(p.lieu, 10);
  assert.ok(texte(r).includes("verrouillée"));
});

test("les vestiaires sont trop noirs sans le bâton lumineux", () => {
  const p = new Partie();
  let r = jouer(p, ["o", "s", "bas", "e", "e", "n"]);
  assert.ok(texte(r).includes("trop noir"));
  assert.ok(!texte(r).includes("tuyau"));
  r = p.executer("prendre tuyau");
  assert.ok(texte(r).includes("Sans lumière"));
  assert.ok(!p.possede("tuyau_metal"));
  p.inventaire.push("baton_lumineux");
  r = p.executer("plier bâton");
  assert.ok(texte(r).includes("lueur verte"));
  assert.ok(texte(r).includes("tuyau de métal"));
  p.executer("prendre tuyau");
  assert.ok(p.possede("tuyau_metal"));
});

test("le tableau du Bloc F et le mur de l'auditorium se lisent", () => {
  const p = new Partie();
  assert.ok(texte(p.executer("lire mur")).includes("rien à lire"));
  p.lieu = 8;
  assert.ok(texte(p.executer("lire mur")).includes("LE SILENCE EST LEUR ARME"));
  p.lieu = 16;
  assert.ok(texte(p.executer("lire tableau")).includes("Ils suivent le bruit"));
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
  assert.ok(p.flags.cadenas_brise);
});

test("partie complète jusqu'à la victoire", () => {
  const p = new Partie();
  p.demarrer();
  jouer(p, VERS_LE_CADENAS);
  assert.strictEqual(p.lieu, 10);
  assert.ok(p.flags.arme_fabriquee && p.flags.a_mange);
  const r = jouer(p, ["frapper cadenas", "est", "prendre clé", "ouest", "utiliser clé sur chaînes"]);
  assert.ok(p.termine);
  assert.ok(texte(r).includes("FÉLICITATIONS, TU AS SURVÉCU À LA NUIT."));
  assert.ok(texte(p.executer("nord")).includes("REJOUER"));
});

test("après le fracas, traîner trop longtemps est fatal", () => {
  const p = new Partie();
  p.lieu = 10;
  p.inventaire.push("arme_artisanale");
  p.flags.a_mange = true;
  p.tour = 10;
  p.executer("frapper cadenas");
  const r = [1, 2, 3, 4, 5, 6].map(() => p.executer("regarder"));
  assert.ok(texte(r[2]).includes("Des pas"));
  assert.ok(texte(r[4]).includes("se rapprochent"));
  assert.ok(p.termine);
  assert.strictEqual(r[5][r[5].length - 1].type, "finmort");
});

test("l'agenda montre le plan des lieux visités", () => {
  const p = new Partie();
  assert.ok(texte(p.executer("carte")).includes("Ton agenda en contient un"));
  jouer(p, ["prendre agenda", "o", "s", "bas"]);
  const r = p.executer("carte");
  const plan = r.find((b) => b.type === "carte");
  assert.deepStrictEqual(plan.lieux.map((l) => l.id).sort((a, b) => a - b), [1, 2, 3, 6]);
  assert.strictEqual(plan.lieux.find((l) => l.actuel).id, 6);
  assert.strictEqual(plan.etageActuel, "rdc");
  assert.deepStrictEqual(plan.liens, [[1, 2], [2, 3]]);
  assert.ok(plan.lieux.find((l) => l.id === 3).vertical);
  assert.ok(p.executer("lire agenda").some((b) => b.type === "carte"));
});

test("OUVRIR PORTE avec la clé déclenche aussi la victoire", () => {
  const p = new Partie();
  p.lieu = 10;
  p.inventaire.push("cle_principale");
  const r = p.executer("ouvrir porte");
  assert.ok(p.termine);
  assert.strictEqual(r[1].texte, "COUPURE AU NOIR. GÉNÉRIQUE.");
});

console.log(`\n${n} tests réussis.`);
