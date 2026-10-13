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
  p.lieu = 10;
  for (const cmd of ["réception", "Magasin", "entrer dans la réception", "aller au magasin"]) {
    assert.ok(texte(p.executer(cmd)).includes("Tu entres dans le local"), cmd);
  }
  p.lieu = 12;
  for (const cmd of ["gym 2", "Salle d'entraînement", "salle d entrainement"]) {
    assert.ok(texte(p.executer(cmd)).includes("Tu entres dans le local"), cmd);
  }
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
  p.executer("o");
  assert.ok(texte(p.executer("carte")).includes("Ton agenda en contient un"));
  jouer(p, ["e", "prendre agenda", "o", "s", "bas"]);
  const plan = p.executer("carte").find((b) => b.type === "carte");
  assert.deepStrictEqual(plan.lieux.map((l) => l.id).sort((a, b) => a - b), [1, 2, 3, 6]);
  assert.strictEqual(plan.lieux.find((l) => l.actuel).id, 6);
  assert.deepStrictEqual(plan.liens, [[1, 2], [2, 3]]);
  assert.ok(p.executer("lire agenda").some((b) => b.type === "carte"));
});

test("CARTE fonctionne aussi quand l'agenda est encore sur le pupitre", () => {
  for (const cmd of ["carte", "plan", "lire agenda", "regarder carte", "utiliser agenda", "ouvrir agenda", "regarder le plan"]) {
    const p = new Partie();
    const r = p.executer(cmd);
    assert.ok(r.some((b) => b.type === "carte"), cmd);
    assert.ok(p.possede("agenda"), cmd);
    assert.ok(!p.objetsParLieu[1].includes("agenda"), cmd);
  }
  const p = new Partie();
  p.executer("o");
  assert.ok(texte(p.executer("carte")).includes("Ton agenda en contient un")); // oublié sur le pupitre
});

test("calepin : noter, relire, effacer ; gratuit pendant la poursuite ; sauvegardé", () => {
  const p = new Partie();
  assert.ok(texte(p.executer("noter 446 sièges")).includes("rien pour écrire"));
  assert.ok(texte(p.decrireLieu()).includes("calepin"));
  p.executer("prendre calepin");
  assert.ok(p.possede("calepin"));
  const tour = p.tour;
  assert.ok(texte(p.executer("noter Auditorium : 446 sièges !")).includes("Noté"));
  p.executer("Écrire : problème de Plante, intérêts composés");
  p.executer("prendre note coffre = ???");
  assert.strictEqual(p.tour, tour); // écrire ne coûte pas de tour
  const r = p.executer("notes");
  assert.strictEqual(r[0].type, "notes");
  assert.strictEqual(r[0].texte, "1. Auditorium : 446 sièges !\n2. problème de Plante, intérêts composés\n3. coffre = ???");
  assert.strictEqual(p.executer("lire calepin")[0].type, "notes");
  assert.strictEqual(p.executer("utiliser calepin")[0].type, "notes");
  const q = Partie.restaurer(JSON.parse(JSON.stringify(p.exporter())));
  assert.strictEqual(q.notes.length, 3);
  p.executer("effacer notes");
  assert.ok(texte(p.executer("notes")).includes("vide"));
  assert.ok(texte(p.executer("noter")).includes("Noter quoi"));
});

test("la phrase d'arrivée dépend d'où l'on vient", () => {
  const p = new Partie();
  assert.ok(texte(jouer(p, ["o", "s", "bas"])).includes("Tu as descendu les marches"));
  assert.ok(!texte(jouer(p, ["e", "o"])).includes("descendu")); // depuis la place publique 1
  assert.ok(!texte(p.executer("regarder")).includes("descendu"));
  p.lieu = 19;
  assert.ok(texte(p.executer("s")).includes("Le couloir C103"));
  p.lieu = 16;
  const r = texte(p.executer("bas"));
  assert.ok(r.includes("Tu redescends") && !r.includes("C103 te mène"));
  p.lieu = 20;
  const h = p.executer("haut")[1].texte;
  assert.ok(h.startsWith("L'étage de l'Aile H.") && !h.includes("passerelle débouche"));
  p.lieu = 5;
  assert.ok(p.executer("e")[1].texte.startsWith("La passerelle débouche"));
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

// ==========================================
// Serveur Apps Script, avec un faux Google Sheets en mémoire
// ==========================================
function serveurSimule() {
  const vm = require("vm");
  const fs = require("fs");
  const path = require("path");
  const classeurs = {};
  function nouvelleFeuille() {
    const lignes = [];
    const plage = (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((lignes[r - 1 + i] || [])[c - 1 + j] ?? ""))),
      getValue: () => ((lignes[r - 1] || [])[c - 1] ?? ""),
      setValues: (v) => v.forEach((ligne, i) => ligne.forEach((x, j) => { (lignes[r - 1 + i] ||= [])[c - 1 + j] = x; })),
      setFontWeight: () => {},
    });
    return { lignes, appendRow: (r) => lignes.push(r.slice()), getLastRow: () => lignes.length, getRange: plage, setFrozenRows: () => {} };
  }
  const ss = { feuilles: {}, getId: () => "classeur-1", getSheetByName(n) { return this.feuilles[n] || null; }, insertSheet(n) { return (this.feuilles[n] = nouvelleFeuille()); } };
  classeurs["classeur-1"] = ss;
  const proprietes = {};
  const cache = {};
  const contexte = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: (id) => classeurs[id] },
    PropertiesService: { getScriptProperties: () => ({ setProperty: (k, v) => { proprietes[k] = v; }, getProperty: (k) => proprietes[k] }) },
    CacheService: { getScriptCache: () => ({ put: (k, v) => { cache[k] = v; }, get: (k) => cache[k] ?? null }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_, t) => Array.from(crypto.createHash("sha256").update(t, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
    },
    HtmlService: {},
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ texte: t, setMimeType() { return this; } }),
    },
  };
  vm.createContext(contexte);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "apps-script", "Code.gs"), "utf8"), contexte);
  contexte.installer();
  // Horloge simulée : avancer(secondes) fait passer le temps côté serveur.
  let horloge = Date.parse("2026-10-14T13:00:00Z");
  contexte.maintenant_ = () => new Date(horloge);
  const avancer = (secondes) => { horloge += secondes * 1000; };
  return { s: contexte, ss, cache, avancer };
}

test("serveur : création de compte, connexion, sauvegarde, mot de passe jamais stocké", () => {
  const { s, ss } = serveurSimule();
  const a = s.creerCompte("Nuit_Noire", "secret42");
  assert.ok(a.jeton && a.sauvegarde === null);
  assert.throws(() => s.creerCompte("nuit_noire", "autre"), /déjà pris/);
  assert.throws(() => s.creerCompte("ab", "secret42"), /3 à 20/);
  assert.throws(() => s.creerCompte("Bonjour", "123"), /au moins 4/);
  assert.throws(() => s.connecter("Nuit_Noire", "mauvais"), /incorrect/);
  assert.throws(() => s.connecter("Personne", "secret42"), /incorrect/);
  assert.ok(!JSON.stringify(ss.feuilles.Comptes.lignes).includes("secret42"));

  const p = new Partie();
  jouer(p, ["prendre agenda", "o", "s"]);
  s.sauvegarder(a.jeton, p.exporter(), false);
  const b = s.connecter("NUIT_NOIRE", "secret42");
  assert.strictEqual(b.pseudo, "Nuit_Noire");
  const q = Partie.restaurer(b.sauvegarde);
  assert.strictEqual(q.lieu, 3);
  assert.ok(q.possede("agenda"));

  s.sauvegarder(b.jeton, null, true); // mort : la sauvegarde est effacée, le compteur monte
  assert.strictEqual(s.connecter("Nuit_Noire", "secret42").sauvegarde, null);
  assert.strictEqual(ss.feuilles.Parties.lignes[1][3], 1);
  assert.throws(() => s.sauvegarder("jeton-bidon", null, false), /session a expiré/);
});

test("serveur : appels HTTP du site Netlify (doPost, ping)", () => {
  const { s } = serveurSimule();
  const post = (corps) => JSON.parse(s.doPost({ postData: { contents: JSON.stringify(corps) } }).texte);
  const cree = post({ action: "creerCompte", args: ["Netlify", "secret42"] });
  assert.ok(cree.ok && cree.resultat.jeton);
  assert.deepStrictEqual(post({ action: "creerCompte", args: ["Netlify", "secret42"] }), { ok: false, erreur: "Ce pseudo est déjà pris. Choisis-en un autre." });
  assert.ok(post({ action: "connecter", args: ["Netlify", "secret42"] }).ok);
  assert.ok(post({ action: "sauvegarder", args: [cree.resultat.jeton, { lieu: 3 }, false] }).ok);
  assert.deepStrictEqual(post({ action: "connecter", args: ["netlify", "secret42"] }).resultat.sauvegarde, { lieu: 3 });
  assert.strictEqual(post({ action: "installer" }).ok, false);
  assert.strictEqual(JSON.parse(s.doGet({ parameter: { ping: "1" } }).texte).ok, true);
});

test("serveur : une victoire n'est acceptée qu'avec les bonnes réponses", () => {
  const { s } = serveurSimule();
  const a = s.creerCompte("Tricheur", "secret42");
  assert.throws(() => s.enregistrerVictoire(a.jeton, ["A", "B", "C"]), /ne correspondent pas/);
  assert.throws(() => s.enregistrerVictoire(a.jeton, null), /ne correspondent pas/);
});

test("Code.gs et moteur.js ont les mêmes empreintes ; apps-script/Index.html est à jour", () => {
  const fs = require("fs");
  const path = require("path");
  const moteur = fs.readFileSync(path.join(__dirname, "moteur.js"), "utf8");
  const code = fs.readFileSync(path.join(__dirname, "apps-script", "Code.gs"), "utf8");
  const dansMoteur = [...moteur.matchAll(/empreinte: "([0-9a-f]{64})"/g)].map((m) => m[1]);
  const dansCode = [...code.matchAll(/"([0-9a-f]{64})"/g)].map((m) => m[1]);
  assert.deepStrictEqual(dansCode, dansMoteur);
  const { construire } = require("./construire-apps-script.js");
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "apps-script", "Index.html"), "utf8"), construire(),
    "apps-script/Index.html est périmé : lancer node nuit-st-ex/construire-apps-script.js");
});

test("serveur : le temps de jeu ne compte que le jeu actif", () => {
  const { s, ss, avancer } = serveurSimule();
  const a = s.creerCompte("Chrono", "secret42");
  for (let i = 0; i < 10; i++) { avancer(30); s.sauvegarder(a.jeton, { lieu: 1 }, false); } // 5 min de jeu
  avancer(3 * 3600); // pause : la fin du cours
  const b = s.connecter("Chrono", "secret42");
  avancer(60);
  s.sauvegarder(b.jeton, { lieu: 2 }, false); // +1 min
  const ligne = ss.feuilles.Parties.lignes[1];
  assert.strictEqual(ligne[4], 360);
  assert.strictEqual(ligne[5], 11);
});

testSolution("serveur : palmarès par temps, victoires trop rapides écartées", (reponses) => {
  const { s, ss, avancer } = serveurSimule();
  const jouerPendant = (jeton, minutes) => {
    for (let i = 0; i < minutes * 2; i++) { avancer(30); s.sauvegarder(jeton, { lieu: 1 }, false); }
  };
  const lente = s.creerCompte("Lente", "secret42");
  const rapide = s.creerCompte("Rapide", "secret42");
  const tricheur = s.creerCompte("Eclair", "secret42");
  jouerPendant(lente.jeton, 90);
  assert.strictEqual(s.enregistrerVictoire(lente.jeton, reponses).rang, 1);
  jouerPendant(rapide.jeton, 40);
  const r = s.enregistrerVictoire(rapide.jeton, reponses);
  assert.strictEqual(r.rang, 2);
  assert.ok(Math.abs(r.temps - 40 * 60) <= 31);
  avancer(5);
  assert.strictEqual(s.enregistrerVictoire(tricheur.jeton, reponses).rang, 3);
  assert.strictEqual(ss.feuilles.Gagnants.lignes[3][6], "À vérifier (trop rapide)");
  const encore = s.enregistrerVictoire(lente.jeton, reponses);
  assert.ok(encore.deja && encore.rang === 1);
  const p = s.palmares();
  assert.deepStrictEqual(p.map((g) => g.pseudo), ["Rapide", "Lente"]);
  assert.ok(typeof p[0].date === "string");
});

testSolution("partie complète jusqu'à la victoire et la phrase", ([labo, armoire, coffre]) => {
  const p = new Partie();
  p.demarrer();
  jouer(p, [
    "prendre agenda", "lire tableau",
    "o", "s", "e", "composer " + labo, "prendre ruban", "o", "bas",   // labos
    "o", "s", "e", "manger barre", "n", "prendre lame", "s", "o",    // cafétéria, cuisines
    "s", "haut", "composer " + armoire, "prendre bâton", "bas", "n", "n", "e", // Aile F
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
