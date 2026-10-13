// Tests du moteur : node nuit-st-ex/test.js
"use strict";
const assert = require("assert");
const { Partie, analyser } = require("./moteur.js");

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

test("événement du tour 5, une seule fois, peu importe l'action", () => {
  const p = new Partie();
  p.demarrer();
  const r = [1, 2, 3, 4, 5, 6].map((i) => p.executer(i % 2 ? "regarder" : "inventaire"));
  assert.ok(!r.slice(0, 4).some((b) => b.some((x) => x.type === "evenement")));
  assert.ok(r[4].some((x) => x.type === "evenement"));
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

test("combiner sans ruban", () => {
  const p = new Partie();
  const r = jouer(p, [
    "o", "s", "bas", "e", "n", "prendre tuyau", "s", "s", "prendre lame",
    "combiner tuyau avec lame",
  ]);
  assert.ok(texte(r).includes("rien pour les faire tenir ensemble"));
  assert.ok(!p.flags.arme_fabriquee);
});

test("frapper le cadenas sans avoir mangé, puis après", () => {
  const p = new Partie();
  jouer(p, [
    "o", "s", "e", "prendre ruban", "o", "bas",
    "e", "n", "prendre tuyau", "s", "s", "prendre lame", "n",
    "combiner tuyau avec lame", "o", "n",
  ]);
  assert.ok(p.flags.arme_fabriquee);
  assert.deepStrictEqual(p.inventaire.sort(), ["arme_artisanale", "telephone_mort"]);
  let r = p.executer("frapper cadenas");
  assert.ok(texte(r).includes("Tu es trop faible"));
  assert.ok(!p.flags.cadenas_brise);
  jouer(p, ["s", "s", "s", "prendre barre", "manger barre tendre", "n", "n", "n"]);
  assert.ok(p.flags.a_mange);
  r = p.executer("fracasser cadenas");
  assert.ok(texte(r).includes("la charnière explose"));
  assert.ok(p.flags.cadenas_brise);
});

test("partie complète jusqu'à la victoire", () => {
  const p = new Partie();
  p.demarrer();
  const r = jouer(p, [
    "ouest", "sud", "est", "prendre ruban adhésif", "ouest", "bas",
    "sud", "lire mur", "sud", "manger barre", "nord", "nord",
    "est", "nord", "prendre tuyau", "sud", "sud", "prendre lame", "nord",
    "combiner tuyau avec lame", "ouest", "nord",
    "frapper cadenas", "est", "prendre clé", "ouest",
    "utiliser clé sur chaînes",
  ]);
  assert.ok(p.termine);
  assert.ok(texte(r).includes("FÉLICITATIONS, TU AS SURVÉCU À LA NUIT."));
  assert.ok(texte(p.executer("nord")).includes("REJOUER"));
});

test("OUVRIR PORTE avec la clé déclenche aussi la victoire", () => {
  const p = new Partie();
  p.lieu = 10;
  p.inventaire.push("cle_principale");
  const r = p.executer("ouvrir porte");
  assert.ok(p.termine);
  assert.strictEqual(r[1].texte, "COUPURE AU NOIR. GÉNÉRIQUE.");
});

test("LIRE MUR seulement dans l'auditorium", () => {
  const p = new Partie();
  assert.ok(texte(p.executer("lire mur")).includes("rien à lire"));
  p.lieu = 8;
  assert.ok(texte(p.executer("lire mur")).includes("LE SILENCE EST LEUR ARME"));
});

test("la carte suit les plans : chaque sortie a son retour", () => {
  const { LIEUX } = require("./moteur.js");
  const inverse = { NORD: "SUD", SUD: "NORD", EST: "OUEST", OUEST: "EST", HAUT: "BAS", BAS: "HAUT" };
  for (const id in LIEUX) {
    for (const [d, dest] of Object.entries(LIEUX[id].sorties)) {
      assert.strictEqual(LIEUX[dest].sorties[inverse[d]], Number(id), `${id} ${d} -> ${dest}`);
    }
  }
});

console.log(`\n${n} tests réussis.`);
