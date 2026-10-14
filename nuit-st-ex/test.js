// Tests du moteur : node nuit-st-ex/test.js
//
// Les réponses des énigmes ne sont pas écrites ici, pour ne rien divulgâcher
// aux élèves qui liraient le dépôt. Pour tester la partie complète, passer la
// solution en variable d'environnement :
//   SOLUTION="réponse-labo|réponse-armoire|réponse-coffre" node nuit-st-ex/test.js
"use strict";
const assert = require("assert");
const crypto = require("crypto");
const {
  Partie, LIEUX, OBJETS, PAGES, INDICES, LOCAUX_SPECIAUX, DELAI_POURSUITE, TOTAL_LOCAUX,
  analyser, empreinte, texteLocal, lier,
} = require("./moteur.js");

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
const types = (blocs) => blocs.map((b) => b.type);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Empreinte de la phrase de récompense (pas la phrase elle-même).
const EMPREINTE_PHRASE = "ce20d929689ba655460239b73dffb2cc2df7c169fd6bea8185827ad6a4a07fb4";
const EMPREINTES_CODES = [
  "68e29784d1a114fda63d38f9458caa7a591f5186766ac67440b6a736182222ee",
  "08490295488a1189099751ebeddb5992313dd2a831e07a92e66d196ddc261777",
  "45297c633d331e6ac35169ebaaf75bc7fafd206ebb59ba4efd80566936e46eb0",
];

// Une partie déjà commencée, placée dans un lieu (et ce lieu marqué comme visité).
function partieA(lieu) {
  const p = new Partie();
  p.demarrer();
  p.lieu = lieu;
  p.visites.add(lieu);
  return p;
}

test("ouverture, chapitre I, puis description de la classe", () => {
  const p = new Partie();
  const blocs = p.demarrer();
  assert.strictEqual(blocs[0].type, "ouverture");
  assert.ok(texte(blocs).includes("Le local A-217"));
  assert.ok(texte(blocs).includes("Le repaire de M. Plante"));
  assert.ok(blocs.some((b) => b.type === "chapitre" && b.texte === "Le réveil"));
  assert.deepStrictEqual(p.inventaire, ["telephone_mort"]);
  assert.ok(p.pointSur, "un moment sûr dès le départ");
});

test("textes épicènes : ni « seul », ni « endormi », ni « réveillé » adressés au joueur", () => {
  const p = new Partie();
  const tout = texte(p.demarrer()) + texte(jouer(p, ["o", "s", "e", "o", "bas"]));
  assert.ok(!/\b(endormi|réveillé|prêt|sûr)\b|\b(es|pas) seul\b/.test(tout), tout);
});

test("sha256 maison identique à celui de Node", () => {
  for (const s of ["", "abc", "École secondaire Antoine-de-Saint-Exupéry", "x".repeat(200)]) {
    assert.strictEqual(empreinte(s), sha(s));
  }
});

test("analyse : accents, articles, abréviations, numéros de locaux, pronoms, fautes de frappe", () => {
  assert.ok(analyser("Utiliser la clé sur les chaînes").objets.includes("cle_principale"));
  assert.deepStrictEqual(analyser("prendre la clé dorée").objets, ["cle_doree"]);
  assert.deepStrictEqual(analyser("utiliser la clé principale").objets, ["cle_principale"]);
  assert.strictEqual(analyser("n").direction, "NORD");
  assert.strictEqual(analyser("aller vers l'ouest").direction, "OUEST");
  assert.strictEqual(analyser("descendre").direction, "BAS");
  assert.strictEqual(analyser("B 243").verbe, "ENTRER");
  assert.strictEqual(analyser("b243").verbe, "ENTRER");
  assert.strictEqual(analyser("b").direction, "BAS");
  assert.strictEqual(analyser("je prends le calepin").verbe, "PRENDRE");
  assert.strictEqual(analyser("pogne le tuyau").verbe, "PRENDRE");
  assert.strictEqual(analyser("check le tableau").verbe, "REGARDER");
  assert.deepStrictEqual(analyser("prendre agneda").objets, ["agenda"]);
  assert.strictEqual(analyser("rgarder").verbe, "REGARDER");
});

test("« clé » tout court : la clé qui est là", () => {
  const p = partieA(27);
  p.executer("entrer c224");
  p.executer("prendre clé");
  assert.ok(p.possede("cle_doree"));
  const q = partieA(2);
  assert.ok(texte(q.executer("prendre clé")).includes("Il n'y a pas de clé ici"));
  assert.ok(!texte(q.executer("prendre clé")).includes("principale"));
  const r = partieA(10);
  r.inventaire.push("cle_doree", "cle_principale");
  r.codes = { 5: "a", 16: "b", 11: "c" };
  assert.strictEqual(r.executer("utiliser clé")[0].type, "victoire");
});

test("la carte : chaque sortie a son retour, chaque objet existe", () => {
  const inverse = { NORD: "SUD", SUD: "NORD", EST: "OUEST", OUEST: "EST", HAUT: "BAS", BAS: "HAUT" };
  for (const id in LIEUX) {
    for (const [d, dest] of Object.entries(LIEUX[id].sorties)) {
      assert.ok(LIEUX[dest], `${id} ${d} -> ${dest} inexistant`);
      assert.strictEqual(LIEUX[dest].sorties[inverse[d]], Number(id), `${id} ${d} -> ${dest}`);
    }
    for (const o of LIEUX[id].objets || []) assert.ok(OBJETS[o], o);
    for (const [mot, dest] of Object.entries(LIEUX[id].alias || {})) {
      assert.ok(Object.values(LIEUX[id].sorties).includes(dest), `alias ${mot} de ${id}`);
    }
  }
});

test("aucun local n'est listé dans deux lieux ; aucun texte ne se répète dans un même lieu avant d'épuiser sa liste", () => {
  const vus = {};
  for (const id in LIEUX) {
    const textes = {};
    for (const l of LIEUX[id].locaux || []) {
      assert.ok(!vus[l], `${l} dans ${vus[l]} et ${id}`);
      vus[l] = id;
      const t = texteLocal(l);
      assert.ok(t.length > 20, l);
      textes[t] = (textes[t] || 0) + 1;
    }
    const max = Math.max(0, ...Object.values(textes));
    assert.ok(max <= 3, `lieu ${id} : un texte revient ${max} fois`);
  }
  assert.strictEqual(Object.keys(vus).length, TOTAL_LOCAUX);
  assert.ok(TOTAL_LOCAUX > 250, "il manque des locaux : " + TOTAL_LOCAUX);
});

test("les 8 pages du carnet sont dans de vrais locaux, une par zone", () => {
  assert.strictEqual(PAGES.length, 8);
  const lieux = new Set();
  for (const page of PAGES) {
    const id = Object.keys(LIEUX).find((x) => (LIEUX[x].locaux || []).includes(page.local));
    assert.ok(id, page.local);
    lieux.add(id);
    assert.ok(LOCAUX_SPECIAUX[page.local].page);
  }
  assert.strictEqual(lieux.size, 8);
});

test("texto du tour 5, une seule fois, peu importe l'action", () => {
  const p = new Partie();
  p.demarrer();
  const r = [1, 2, 3, 4, 5, 6].map((i) => p.executer(i % 2 ? "regarder" : "inventaire"));
  assert.ok(!r.slice(0, 4).some((b) => b.some((x) => x.type === "texto")));
  assert.ok(r[4].some((x) => x.type === "texto" && x.de === "Numéro inconnu"));
  assert.ok(texte(r[4]).includes("Quelque chose est là, avec toi."));
  assert.ok(!r[5].some((x) => x.type === "texto"));
});

test("AIDE, INDICE, OBJECTIFS et NOTES ne comptent pas comme un tour", () => {
  const p = new Partie();
  jouer(p, ["aide", "indice", "objectifs", "aide", "aide"]);
  assert.strictEqual(p.tour, 0);
  assert.strictEqual(p.actions, 0);
});

test("entrer dans les locaux : vides, fausses pistes, objets inutiles, F209", () => {
  const p = new Partie();
  jouer(p, ["o"]);
  let r = p.executer("entrer A215");
  assert.ok(texte(r).includes("CODE = 0000"));
  r = p.executer("a 201");
  assert.ok(texte(r).includes("Tu entres dans le local A201"));
  assert.ok(texte(p.executer("entrer 203")).includes("Tu entres dans le local A203"));
  p.lieu = 3;
  assert.ok(texte(p.executer("entrer B268")).includes("« La vulnérabilité c'est précieux. »"));
  p.lieu = 2;
  r = p.executer("entrer C224");
  assert.ok(texte(r).includes("ne donne pas ici"));
  p.executer("entrer a217");
  assert.strictEqual(p.lieu, 1);
  p.lieu = 27;
  // Un objet dans un local n'est pas ramassé tout seul : sans PRENDRE, le local reste « à revoir ».
  assert.ok(texte(p.executer("entrer c224")).includes("clé dorée"));
  assert.ok(!p.possede("cle_doree"));
  p.executer("entrer c201");
  assert.ok(texte(p.executer("prendre clé dorée")).includes("Il n'y a pas")); // on a quitté C224
  let locaux = p.decrireLieu().find((x) => x.type === "locaux");
  assert.ok(locaux.locaux.find((l) => l.nom === "C224").aRevoir);
  assert.ok(!locaux.locaux.find((l) => l.nom === "C201").aRevoir && locaux.locaux.find((l) => l.nom === "C201").visite);
  assert.ok(!locaux.locaux.find((l) => l.nom === "C202").visite);
  assert.strictEqual(locaux.vus, 2);
  assert.strictEqual(locaux.aRevoir, 1);
  assert.ok(locaux.texte.includes("C224 ✓ (à revoir)") && locaux.texte.includes("C201 ✓ ·") && locaux.texte.includes("(2/22 visités)"));
  const q = Partie.restaurer(JSON.parse(JSON.stringify(p.exporter())));
  assert.strictEqual(q.decrireLieu().find((x) => x.type === "locaux").aRevoir, 1);
  p.executer("entrer c224");
  assert.ok(texte(p.executer("prendre clé dorée")).includes("Tu ressors"));
  assert.ok(p.possede("cle_doree"));
  assert.ok(texte(p.executer("entrer c224")).includes("Le pupitre du fond est vide"));
  locaux = p.decrireLieu().find((x) => x.type === "locaux");
  assert.strictEqual(locaux.aRevoir, 0);
  assert.ok(texte(p.executer("utiliser clé dorée")).includes("aucune serrure"));
  p.executer("entrer c224");
  p.executer("o"); // un déplacement referme le local
  assert.strictEqual(p.localOuvert, null);
  for (const nom of ["A120", "B272A", "Gym 3", "C130"]) assert.ok(texteLocal(nom).length > 20);
  p.lieu = 10;
  for (const cmd of ["réception", "Magasin", "entrer dans la réception", "aller au magasin"]) {
    assert.ok(texte(p.executer(cmd)).includes("Tu entres dans le local"), cmd);
  }
  p.lieu = 12;
  for (const cmd of ["gym 2", "Salle d'entraînement", "salle d entrainement", "entrer gymnase 4"]) {
    assert.ok(texte(p.executer(cmd)).includes("Tu entres dans le local"), cmd);
  }
  assert.ok(texte(p.executer("salle d'entraînement")).includes("miroirs"));
  p.lieu = 16;
  assert.ok(texte(p.executer("entrer f209")).includes("Ils suivent le bruit"));
  p.lieu = 4;
  assert.ok(texte(p.executer("entrer b226")).includes("Tu reviens sur le balcon"));
});

test("pièges en deux temps : on voit d'abord, la deuxième fois est un choix", () => {
  const cas = [[14, "sud"], [15, "sud"], [20, "est"], [20, "sud"], [19, "tirer alarme"], [3, "briser la fenêtre"], [20, "entrer H105"], [15, "sortir dehors"], [1, "crier"]];
  for (const [lieu, cmd] of cas) {
    const p = partieA(lieu);
    const r1 = p.executer(cmd);
    assert.ok(!p.termine, `${lieu} ${cmd} (1re fois)`);
    assert.ok(r1.some((b) => b.type === "danger") && texte(r1).includes("⚠"), `${lieu} ${cmd} : avertissement`);
    const r2 = p.executer(cmd);
    assert.ok(p.termine, `${lieu} ${cmd} (2e fois)`);
    assert.ok(r2.some((b) => b.type === "finmort"));
    assert.ok(r2.some((b) => b.type === "indicemort"));
  }
  const p = partieA(20);
  p.executer("aller porte de secours");
  assert.ok(p.sortiesVisibles().includes("→ Porte de secours (boulevard Robert) ⚠"));
  assert.ok(p.sorties().find((s) => s.nom.startsWith("Porte de secours")).averti);
});

test("OUVRIR FENÊTRE ne tue pas ; SORTIR veut dire quitter la pièce", () => {
  const p = partieA(1);
  assert.ok(texte(p.executer("ouvrir la fenêtre")).includes("scellées"));
  assert.ok(!p.termine);
  jouer(p, ["o", "s"]);
  p.executer("sortir");
  assert.strictEqual(p.lieu, 2);
  const q = partieA(20);
  q.chemin = [12];
  q.executer("sortir");
  assert.strictEqual(q.lieu, 12);
  assert.ok(!q.termine);
});

test("mort puis reprise au dernier moment sûr : le monde revient, ce qu'on a appris reste", () => {
  const p = new Partie();
  p.demarrer();
  jouer(p, ["prendre calepin", "noter à retenir", "o", "s", "e"]);
  p.codes[5] = "x"; // fait comme si le dépôt était ouvert…
  p.marquerPointSur("Laboratoires");
  jouer(p, ["prendre agenda", "o", "bas", "s", "entrer b176"]);
  assert.ok(p.locauxFouilles.includes("B176"));
  jouer(p, ["crier", "crier"]);
  assert.ok(p.termine && !p.gagne);
  assert.ok(texte(p.executer("regarder")).includes("Continuer"));
  const r = p.executer("continuer");
  assert.strictEqual(r[0].type, "reprise");
  assert.ok(!p.termine);
  assert.strictEqual(p.lieu, 5);
  assert.strictEqual(p.morts, 1);
  assert.deepStrictEqual(p.notes, ["à retenir"]);
  assert.ok(p.locauxFouilles.includes("B176"), "les locaux visités restent cochés");
  assert.ok(p.approches.includes("cri"), "le danger déjà vu reste connu");
  assert.ok(p.codes[5]);
  // Une partie de compte interrompue par une mort reprend au moment sûr à la connexion.
  jouer(p, ["crier"]);
  const q = Partie.restaurer(JSON.parse(JSON.stringify(p.exporter())));
  assert.ok(q.termine);
  const rq = q.reprendre();
  assert.ok(!q.termine && q.morts === 2 && rq.some((b) => b.type === "reprise"));
});

test("porte du secrétariat verrouillée tant que le cadenas tient ; le post-it se lit par la vitre", () => {
  const p = new Partie();
  const r = jouer(p, ["o", "s", "bas", "nord", "est"]);
  assert.strictEqual(p.lieu, 10);
  assert.ok(texte(r).includes("verrouillée"));
  const l = p.executer("lire post-it");
  assert.ok(texte(l).includes("la réponse au problème au tableau de Plante"));
  assert.ok(p.faits.includes("postit"));
});

test("les énigmes refusent un mauvais code ; la mauvaise forme est gratuite ; le coffre fait du bruit", () => {
  for (const lieu of [5, 16, 11]) {
    const p = partieA(lieu);
    const r = p.executer("composer 1200");
    assert.ok(!p.codes[lieu]);
    assert.ok(!texte(r).includes("déclic") && !texte(r).includes("cliquetis"));
  }
  const labo = partieA(5);
  const avant = labo.actions;
  assert.ok(texte(labo.executer("composer mercure")).includes("symbole"));
  assert.ok(texte(labo.executer("composer 12")).includes("lettres"));
  assert.strictEqual(labo.actions, avant, "un essai de la mauvaise forme ne coûte rien");
  assert.ok(texte(labo.executer("composer au")).includes("reste fermé"), "AU est un essai, pas un petit mot");
  const p = partieA(11);
  p.poursuite = 5;
  p.executer("composer 0000");
  assert.strictEqual(p.poursuite, 3); // une action normale + une action perdue au bip
  const q = partieA(16);
  assert.ok(texte(q.executer("composer 1234")).includes("trois molettes"));
});

test("les vestiaires sont trop noirs sans le bâton lumineux, et la lampe est morte", () => {
  const p = new Partie();
  let r = jouer(p, ["o", "s", "bas", "e", "e", "n"]);
  assert.ok(texte(r).includes("trop noir"));
  assert.ok(texte(r).includes("quelque chose de lourd et métallique"));
  assert.ok(!texte(r).includes("tuyau"));
  r = p.executer("prendre tuyau");
  assert.ok(texte(r).includes("Sans lumière"));
  p.inventaire.push("lampe_morte");
  assert.ok(texte(p.executer("allumer lampe")).includes("piles sont mortes"));
  p.inventaire.push("baton_lumineux");
  assert.ok(texte(p.decrireLieu()).includes("ALLUMER BÂTON"));
  r = p.executer("plier bâton");
  assert.ok(texte(r).includes("lueur verte"));
  assert.ok(texte(r).includes("tuyau de métal"));
  assert.ok(r.some((b) => b.type === "chapitre" && b.texte === "La lueur verte"));
  assert.ok(texte(r).includes("bancs renversés"), "la description suit la lumière");
  p.executer("prendre tuyau");
  assert.ok(p.possede("tuyau_metal"));
});

test("les indices se lisent là où ils sont, et les lectures clés se recopient dans le calepin", () => {
  const p = new Partie();
  p.executer("prendre calepin");
  assert.ok(texte(p.executer("lire tableau")).includes("intérêt composé"));
  assert.ok(p.indicesTrouves.length === 1);
  p.lieu = 2;
  assert.ok(texte(p.executer("lire inscription")).includes("La plupart des portes de classe ne mènent nulle part. Ne perds pas ton temps."));
  assert.ok(texte(p.decrireLieu()).includes("Ne perds pas ton temps."));
  p.lieu = 8;
  const mur = texte(p.executer("lire mur"));
  assert.ok(mur.includes("LA RÉPONSE EST AU TABLEAU DE PLANTE"));
  assert.ok(!mur.includes("DEMANDE À PLANTE"));
  p.lieu = 16;
  assert.ok(texte(p.executer("lire tableau")).includes("Ils suivent le bruit"));
  assert.ok(texte(p.executer("lire armoire")).includes("sièges de la caverne"));
  p.lieu = 5;
  assert.ok(texte(p.executer("lire fiche")).includes("métal"));
  assert.ok(texte(p.executer("lire tableau périodique")).includes("Mercure"));
  p.lieu = 11;
  assert.ok(texte(p.executer("lire post-it")).includes("Plante"));
  p.lieu = 24;
  assert.ok(texte(p.executer("lire journal")).includes("ÉPIDÉMIE"));
  p.lieu = 25;
  assert.ok(texte(p.executer("lire imprimante")).includes("14 h 52"));
  const notes = p.executer("notes")[0].texte;
  assert.ok(notes.includes("Indices recopiés") && notes.includes("10 %") && notes.includes("métal liquide"));
  assert.ok(!notes.includes("446"), "le nombre de sièges reste à noter soi-même");
});

test("chaque bouton « Lire » et chaque mot touchable des descriptions donnent une vraie réponse", () => {
  for (const id in LIEUX) {
    const lieu = LIEUX[id];
    const p = partieA(Number(id));
    p.flags.lumiere = true;
    for (const l of lieu.lectures || []) {
      if (!l.bouton || (l.si && !l.si(p))) continue;
      const r = p.executer("lire " + l.bouton);
      assert.ok(texte(r).includes(l.texte.slice(0, 30)), `lieu ${id}, lire ${l.bouton}`);
    }
    const textes = [lieu.description, typeof lieu.court === "string" ? lieu.court : lieu.court && lieu.court(p)];
    if (lieu.variante) textes.push(lieu.variante(p));
    for (const t of textes.filter(Boolean)) {
      for (const seg of lier(t).segments) {
        if (typeof seg === "string") continue;
        const q = partieA(Number(id));
        q.flags.lumiere = true;
        const r = q.executer(seg.c);
        assert.ok(!r.every((b) => b.type === "systeme"), `lieu ${id} : « ${seg.c} » → ${texte(r)}`);
        assert.ok(!q.termine, `lieu ${id} : « ${seg.c} » ne doit pas tuer`);
      }
    }
  }
});

test("des boutons d'action selon la situation", () => {
  const p = new Partie();
  p.demarrer();
  const libelles = () => p.contexte().actions.map((a) => a.texte);
  assert.ok(libelles().includes("Prendre : agenda") && libelles().includes("Lire : tableau"));
  p.lieu = 5;
  const code = p.contexte().actions.find((a) => a.genre === "code");
  assert.ok(code && code.saisie === "composer ");
  p.inventaire.push("tuyau_metal", "lame_lourde");
  const combiner = p.contexte().actions.find((a) => a.texte === "Combiner");
  assert.ok(combiner);
  assert.ok(texte(p.executer(combiner.commande)).includes("rien pour les faire tenir"));
  p.lieu = 10;
  p.inventaire.push("arme_artisanale");
  assert.ok(libelles().includes("Frapper le cadenas") && libelles().includes("Lire : post-it"));
});

test("combiner : deux pièces sur trois suffisent ; sans ruban, ça ne tient pas", () => {
  const p = new Partie();
  p.inventaire.push("tuyau_metal", "lame_lourde");
  const r = p.executer("combiner tuyau avec lame");
  assert.ok(texte(r).includes("rien pour les faire tenir ensemble"));
  assert.ok(!p.flags.arme_fabriquee);
  assert.ok(p.faits.includes("sans_ruban"));
  p.inventaire.push("ruban_adhesif");
  const r2 = p.executer("combiner ruban et lame");
  assert.ok(p.flags.arme_fabriquee);
  assert.ok(r2.some((b) => b.type === "sauvegarde"));
});

test("frapper le cadenas sans avoir mangé, puis après : chapitre IV et moment sûr juste avant", () => {
  const p = partieA(10);
  p.inventaire.push("arme_artisanale");
  let r = p.executer("frapper cadenas");
  assert.ok(texte(r).includes("Tu es trop faible"));
  assert.ok(!p.flags.cadenas_brise);
  p.flags.a_mange = true;
  r = p.executer("fracasser cadenas");
  assert.ok(texte(r).includes("la charnière explose"));
  assert.ok(texte(r).includes("quelque chose a entendu"));
  assert.ok(r.some((b) => b.type === "chapitre" && b.texte === "Le vacarme"));
  assert.ok(!JSON.parse(p.pointSur).flags.cadenas_brise, "le moment sûr est AVANT le fracas");
});

test("la poursuite : seuls les gestes qui prennent du temps comptent ; traîner est fatal", () => {
  const p = partieA(10);
  p.inventaire.push("arme_artisanale");
  p.flags.a_mange = true;
  p.tour = 10;
  p.executer("frapper cadenas");
  for (const c of ["regarder", "inventaire", "carte", "lire post-it", "écouter", "aller nulle part", "xyzzy", "aide", "objectifs"]) p.executer(c);
  assert.strictEqual(p.poursuite, DELAI_POURSUITE, "regarder, lire, consulter, une faute : gratuit");
  const r = [];
  for (let i = 0; i < DELAI_POURSUITE; i++) r.push(p.executer("attendre"));
  assert.ok(r[0].some((b) => b.type === "menace" && b.restant === DELAI_POURSUITE - 1 && b.total === DELAI_POURSUITE));
  assert.ok(texte(r[2]).includes("Des pas"));
  assert.ok(texte(r[5]).includes("se rapprochent"));
  assert.ok(p.termine);
  assert.ok(r[DELAI_POURSUITE - 1].some((b) => b.type === "finmort"));
  // Reprise : devant le cadenas intact, avec l'arme et la force.
  p.executer("continuer");
  assert.ok(!p.flags.cadenas_brise && p.possede("arme_artisanale") && p.flags.a_mange && p.poursuite === 0);
});

test("la silhouette de la cafétéria : attendre, lancer, ou mourir", () => {
  const arrivee = () => {
    const p = partieA(19);
    p.actions = 20;
    const r = p.executer("e");
    assert.ok(r.some((b) => b.type === "danger"), "la silhouette apparaît");
    assert.strictEqual(p.silhouette, "cafeteria");
    return p;
  };
  let p = arrivee();
  assert.ok(p.sorties().find((s) => s.nom === "Cuisines").garde);
  assert.ok(p.contexte().actions.some((a) => a.commande === "attendre"));
  p.executer("attendre");
  assert.strictEqual(p.silhouette, "cafeteria");
  assert.ok(texte(p.executer("attendre")).includes("chambre froide"));
  assert.strictEqual(p.silhouette, "chambre_froide");
  p.executer("manger barre");
  assert.ok(p.flags.a_mange);
  p.executer("n");
  assert.ok(texte(p.executer("prendre lame")).includes("le frottement s'arrête net"));

  p = arrivee();
  p.inventaire.push("lampe_morte");
  assert.ok(texte(p.executer("lancer lampe")).includes("la chambre froide s'est refermée"));
  assert.ok(!p.possede("lampe_morte"));

  p = arrivee();
  p.executer("prendre barre");
  assert.ok(!p.termine && !p.possede("barre_tendre"));
  p.executer("prendre barre");
  assert.ok(p.termine);

  p = arrivee();
  p.executer("aller cuisines");
  assert.ok(!p.termine && p.lieu === 7);
  p.executer("o"); // on recule sans danger
  assert.ok(p.lieu === 19 && !p.termine);
  p.executer("e");
  assert.ok(p.silhouetteIci(), "elle est toujours là");
  p.executer("aller cuisines");
  assert.ok(p.termine);

  p = arrivee();
  const cri = p.executer("crier");
  assert.ok(!p.termine && texte(cri).includes("⚠"), "crier devant elle : d'abord un avertissement");
  assert.ok(texte(p.executer("crier")).includes("Cette fois, tu cries"));
  p.executer("continuer");
  assert.ok(p.silhouetteIci(), "reprise devant la silhouette, pas au réveil");
});

test("le gardien de la sortie : frapper, ou lancer un leurre", () => {
  const gardien = () => {
    const p = partieA(11);
    p.flags.cadenas_brise = true;
    p.flags.a_mange = true;
    p.poursuite = 8;
    p.codes = { 5: "a", 16: "b", 11: "c" };
    p.inventaire.push("arme_artisanale", "cle_principale");
    const r = p.executer("ouest");
    assert.ok(r.some((b) => b.type === "danger") && p.gardien);
    return p;
  };
  let p = gardien();
  const restant = p.poursuite;
  assert.ok(texte(p.executer("utiliser clé")).includes("Tu ne passeras pas"));
  assert.ok(!p.termine && p.poursuite === restant, "buter sur elle ne coûte rien");
  assert.ok(texte(p.executer("frapper")).includes("s'effondre"));
  assert.strictEqual(p.executer("utiliser clé")[0].type, "victoire");
  p = gardien();
  p.executer("lancer téléphone");
  assert.ok(!p.gardien && !p.possede("telephone_mort"));
});

test("indices gradués : jamais un code, jamais le nombre de sièges ; le niveau suivant se mérite", () => {
  for (const etape of INDICES) {
    for (const t of etape.niveaux) {
      assert.ok(!t.includes("446"), t);
      for (const mot of t.split(/[^A-Za-z0-9]+/)) assert.ok(!EMPREINTES_CODES.includes(empreinte(mot.toUpperCase())), "code dans : " + t);
    }
  }
  const p = new Partie();
  p.demarrer();
  assert.ok(texte(p.executer("indice")).startsWith("Indice 1/3"));
  assert.ok(texte(p.executer("indice")).includes("se débloque dans 12 actions"));
  assert.strictEqual(p.indicesUtilises, 1);
  for (let i = 0; i < 12; i++) p.executer("attendre");
  assert.ok(texte(p.executer("indice")).includes("se débloque dans 12 actions"), "attendre sur place ne compte pas");
  p.actionsIndice += 12;
  assert.ok(texte(p.executer("indice")).startsWith("Indice 2/3"));
  assert.strictEqual(p.indicesUtilises, 2);
});

test("objectifs : on les découvre en jouant", () => {
  const p = new Partie();
  p.demarrer();
  assert.deepStrictEqual(p.executer("objectifs")[0].lignes.map((l) => l.texte), ["Sortir de l'école."]);
  const r = jouer(p, ["o", "s", "e"]);
  assert.ok(r.some((b) => b.type === "objectif" && b.texte.includes("dépôt de sciences")));
  p.lieu = 8;
  const mur = p.executer("lire mur");
  assert.ok(mur.some((b) => b.type === "objectif" && b.texte.includes("coffre du secrétariat")));
  const o = p.executer("objectifs")[0];
  assert.ok(o.lignes.length >= 4 && o.resume.includes("Serrures ouvertes : 0/3"));
});

test("l'agenda montre le plan des lieux visités ; chaque lieu se touche pour y aller", () => {
  const p = new Partie();
  p.executer("o");
  assert.ok(texte(p.executer("carte")).includes("Ton agenda en contient un"));
  jouer(p, ["e", "prendre agenda", "o", "s", "bas"]);
  const plan = p.executer("carte").find((b) => b.type === "carte");
  assert.deepStrictEqual(plan.lieux.map((l) => l.id).sort((a, b) => a - b), [1, 2, 3, 6]);
  assert.strictEqual(plan.lieux.find((l) => l.actuel).id, 6);
  assert.deepStrictEqual(plan.liens, [[1, 2], [2, 3]]);
  assert.ok(p.executer("lire agenda").some((b) => b.type === "carte"));
  const classe = plan.lieux.find((l) => l.id === 1);
  p.executer("aller " + classe.destination);
  assert.strictEqual(p.lieu, 1);
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

test("calepin : noter, relire, effacer ; gratuit ; sauvegardé ; l'exemple ne divulgue rien", () => {
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
  const exemple = texte(p.executer("noter"));
  assert.ok(exemple.includes("Noter quoi") && !exemple.includes("446"));
});

test("les pages du carnet de R. se ramassent en entrant, et se relisent", () => {
  const p = partieA(2);
  const r = p.executer("entrer a209");
  assert.ok(r.some((b) => b.type === "page" && b.numero === 8));
  assert.deepStrictEqual(p.pages, [8]);
  assert.ok(texte(p.executer("entrer a209")).includes("plus rien ici"));
  assert.ok(p.executer("notes")[0].texte.includes("Carnet de R. (1/8)"));
});

test("la phrase d'arrivée dépend d'où l'on vient ; la description est courte aux visites suivantes", () => {
  const p = new Partie();
  assert.ok(texte(jouer(p, ["o", "s", "bas"])).includes("Tu as descendu les marches"));
  assert.ok(!texte(jouer(p, ["e", "o"])).includes("descendu")); // depuis la place publique 1
  assert.ok(!texte(p.executer("regarder")).includes("descendu"));
  assert.ok(texte(p.executer("regarder")).includes("faisceaux de lumière lunaire"), "REGARDER redonne la version longue");
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
  const court = jouer(new Partie(), ["o", "e", "o"]).find((b) => b.type === "texte").texte;
  assert.ok(court.length < 120, "rappel court : " + court);
});

test("contexte des boutons : objets restants et locaux, sans REGARDER", () => {
  const p = new Partie();
  assert.deepStrictEqual(p.contexte().objets.map((o) => o.id), ["agenda", "calepin"]);
  p.executer("prendre agenda");
  assert.deepStrictEqual(p.contexte().objets.map((o) => o.id), ["calepin"]); // le calepin reste proposé
  assert.deepStrictEqual(p.contexte().sorties.map((x) => x.nom), ["Corridor de l'Aile A"]);
  p.executer("o");
  p.executer("entrer a215");
  const ctx = p.contexte();
  assert.strictEqual(ctx.locaux.length, 14);
  assert.ok(ctx.locaux.find((l) => l.nom === "A215").visite);
  p.lieu = 22;
  p.executer("entrer b145");
  assert.deepStrictEqual(p.contexte().objets.map((o) => o.id), ["lampe_morte"]); // objet du local ouvert
  p.executer("entrer b142");
  assert.deepStrictEqual(p.contexte().objets, []);
  assert.ok(p.contexte().locaux.find((l) => l.nom === "B145").aRevoir);
  p.lieu = 13;
  assert.deepStrictEqual(p.contexte().objets, []); // vestiaires dans le noir : rien à prendre
});

test("déplacements par nom, RETOUR en pile, voyage rapide, et plus de points cardinaux dans les textes", () => {
  const p = new Partie();
  assert.deepStrictEqual(p.sortiesVisibles(), ["→ Corridor de l'Aile A"]);
  p.executer("aller corridor aile A");
  assert.strictEqual(p.lieu, 2);
  p.executer("aller au carrefour de l'étage");
  assert.strictEqual(p.lieu, 3);
  assert.deepStrictEqual(p.sortiesVisibles(), ["→ Corridor de l'Aile A", "→ Balcon de l'auditorium", "→ Laboratoires", "→ Centre pédagogique", "↓ Carrefour principal"]);
  p.executer("laboratoires");
  assert.strictEqual(p.lieu, 5);
  p.executer("passerelle");
  assert.strictEqual(p.lieu, 17);
  p.executer("retour");
  assert.strictEqual(p.lieu, 5);
  p.executer("retour");
  assert.strictEqual(p.lieu, 3);
  p.executer("retour");
  assert.strictEqual(p.lieu, 2, "RETOUR remonte le chemin, il ne fait pas de ping-pong");
  p.executer("aller classe de m. plante");
  p.executer("aller étage de l'aile h");
  assert.strictEqual(p.lieu, 17, "voyage rapide vers un lieu déjà visité");
  assert.ok(texte(p.executer("aller cafétéria")).includes("Tu ne sais pas encore comment te rendre"));
  p.executer("aller carrefour de l'étage");
  p.executer("descendre l'escalier");
  assert.strictEqual(p.lieu, 6);
  p.executer("place publique 1");
  assert.strictEqual(p.lieu, 22);
  p.lieu = 6;
  assert.ok(texte(p.executer("aller place publique")).includes("Lequel ?"));
  p.executer("entrer bibliothèque"); // pas un local de ce couloir : c'est une destination
  assert.strictEqual(p.lieu, 6); // la bibliothèque ne donne pas sur le carrefour
  p.lieu = 10;
  p.executer("entrer dans la bibliothèque");
  assert.strictEqual(p.lieu, 23);
  p.lieu = 10;
  assert.ok(texte(p.executer("aller secrétariat")).includes("verrouillée"));
  assert.ok(p.sortiesVisibles().includes("→ Secrétariat (verrouillée)"));
  p.lieu = 20;
  assert.ok(p.sortiesVisibles().includes("→ Porte de secours (boulevard Robert)"));
  p.executer("aller porte de secours");
  p.executer("aller porte de secours");
  assert.ok(p.termine);
  for (const id in LIEUX) {
    assert.ok(!/\b(NORD|SUD|EST|OUEST)\b|\((HAUT|BAS)\)/.test(LIEUX[id].description), "direction dans " + LIEUX[id].nom);
  }
  // Pendant la poursuite, pas de voyage rapide.
  const q = partieA(11);
  q.visites.add(1);
  q.poursuite = 5;
  assert.ok(texte(q.executer("aller classe de m. plante")).includes("Pas le temps"));
});

test("sauvegarde et reprise ; une sauvegarde de l'ancienne version se reprend aussi", () => {
  const p = new Partie();
  jouer(p, ["prendre agenda", "o", "s"]);
  const q = Partie.restaurer(JSON.parse(JSON.stringify(p.exporter())));
  assert.strictEqual(q.lieu, 3);
  assert.ok(q.possede("agenda"));
  assert.ok(q.visites.has(2));
  assert.ok(texte(q.reprendre()).includes("Carrefour"));
  const ancienne = {
    lieu: 3, inventaire: ["telephone_mort", "agenda"], flags: { a_mange: false, arme_fabriquee: false, cadenas_brise: false, lumiere: false },
    codes: {}, notes: ["vieux"], locauxFouilles: ["A215"], visites: [1, 2, 3], poursuite: 0, precedent: 2, tour: 3,
    evenementVu: false, termine: false, gagne: false,
    objetsParLieu: Object.fromEntries(Object.keys(LIEUX).map((id) => [id, (LIEUX[id].objets || []).filter((o) => o !== "agenda")])),
  };
  const v = Partie.restaurer(ancienne);
  assert.ok(texte(v.reprendre()).includes("Carrefour"));
  assert.ok(v.pointSur, "un moment sûr est créé à la reprise");
  v.executer("retour");
  assert.strictEqual(v.lieu, 2);
});

test("statistiques de fin", () => {
  const p = partieA(2);
  p.executer("entrer a209");
  const s = p.statistiques();
  assert.strictEqual(s.locaux, 1);
  assert.strictEqual(s.pages, 1);
  assert.strictEqual(s.totalLocaux, TOTAL_LOCAUX);
  assert.strictEqual(s.totalPages, 8);
});

test("retours du 2e playtest : calepin, silhouette, objets jamais vus, texto, reprise, objectifs, synonymes", () => {
  // Le tableau lu AVANT de prendre le calepin est recopié quand on le prend.
  let p = new Partie();
  p.demarrer();
  p.executer("lire tableau");
  assert.ok(texte(p.executer("prendre calepin")).includes("Tu recopies en vitesse le problème du tableau"));
  assert.ok(p.executer("notes")[0].texte.includes("1000 $"));
  // La silhouette est là dès la première entrée, même en arrivant vite.
  p = partieA(19);
  p.actions = 0;
  p.executer("e");
  assert.ok(p.silhouetteIci());
  // Un objet jamais vu n'est pas nommé.
  p = partieA(13);
  assert.ok(texte(p.executer("prendre barre")).includes("Tu ne vois pas ça ici"));
  assert.ok(!texte(p.executer("prendre manche")).includes("tuyau"));
  assert.ok(!texte(p.executer("combiner ruban vadrouille")).includes("TUYAU"));
  assert.ok(texte(p.executer("prendre vadrouille")).includes("plastique creux"));
  // Le texto arrive dès le corridor, pas aux Laboratoires.
  p = new Partie();
  p.demarrer();
  const r = jouer(p, ["prendre agenda", "o"]);
  assert.ok(r.some((b) => b.type === "texto"));
  // La reprise dit où l'on est, et ce qui est retourné à sa place.
  p = partieA(5);
  p.marquerPointSur("Laboratoires");
  p.inventaire.push("lampe_morte");
  jouer(p, ["crier", "crier"]);
  const rep = texte(p.executer("continuer"));
  assert.ok(rep.includes("Laboratoires, un peu plus tôt") && rep.includes("retourné à sa place : lampe de poche"));
  // Ramasser un objet crée un moment sûr : on ne le perd plus.
  p = partieA(21);
  p.executer("prendre lame");
  jouer(p, ["crier", "crier", "continuer"]);
  assert.ok(p.possede("lame_lourde"));
  // L'objectif de l'arme reste coché après COMBINER.
  p = new Partie();
  p.inventaire.push("tuyau_metal", "lame_lourde", "ruban_adhesif");
  p.executer("combiner");
  assert.ok(p.executer("objectifs")[0].lignes.some((l) => l.fait && l.texte.includes("arme")));
  // Synonymes et « aile c » exact.
  p = partieA(3);
  p.executer("labos");
  assert.strictEqual(p.lieu, 5);
  p = partieA(7);
  p.silhouette = "chambre_froide";
  p.visites.add(28);
  assert.ok(texte(p.executer("aller aile c")).length > 0 && p.lieu === 19, "« aile c » mène à l'Aile C, pas à l'Aile C est");
  // QUITTER ne déplace pas ; la porte de la chambre froide ne s'ouvre pas.
  p = partieA(2);
  p.executer("quitter");
  assert.strictEqual(p.lieu, 2);
  p = partieA(21);
  p.silhouette = "chambre_froide";
  assert.ok(texte(p.executer("ouvrir chambre froide")).includes("frottement s'arrête"));
  // Un indice qui répète ce qu'on sait déjà commence plus loin.
  p = partieA(16);
  p.executer("lire gravure");
  p.codes[5] = "x";
  assert.ok(texte(p.executer("indice")).startsWith("Indice 2/3"));
  // Épargner le gardien se voit à la fin.
  p = partieA(10);
  p.codes = { 5: "a", 16: "b", 11: "c" };
  p.flags.cadenas_brise = true;
  p.gardien = true;
  p.scenes.push("gardien");
  p.poursuite = 5;
  p.inventaire.push("cle_principale", "cle_doree", "arme_artisanale");
  p.pages = [1, 2, 3, 4, 5, 6, 7, 8];
  p.executer("lancer clé dorée");
  const fin = p.executer("utiliser clé principale");
  assert.ok(texte(fin).includes("sans le toucher") && p.statistiques().epargne);
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
  p.demarrer();
  jouer(p, ["prendre agenda", "o", "s"]);
  s.sauvegarder(a.jeton, p.exporter(), false);
  const b = s.connecter("NUIT_NOIRE", "secret42");
  assert.strictEqual(b.pseudo, "Nuit_Noire");
  const q = Partie.restaurer(b.sauvegarde);
  assert.strictEqual(q.lieu, 3);
  assert.ok(q.possede("agenda"));

  // Mort : le compteur monte, et la partie reprendra au dernier moment sûr.
  jouer(q, ["crier", "crier"]);
  s.sauvegarder(b.jeton, q.exporter(), true);
  assert.strictEqual(ss.feuilles.Parties.lignes[1][3], 1);
  const c = Partie.restaurer(s.connecter("Nuit_Noire", "secret42").sauvegarde);
  c.reprendre();
  assert.ok(!c.termine && c.morts === 1);
  s.sauvegarder(b.jeton, null, false); // nouvelle partie : la sauvegarde est effacée
  assert.strictEqual(s.connecter("Nuit_Noire", "secret42").sauvegarde, null);
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
  assert.throws(() => s.enregistrerVictoire(a.jeton, ["A", "B", "C"], { indices: 0 }), /ne correspondent pas/);
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
  assert.deepStrictEqual(dansMoteur, EMPREINTES_CODES);
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

testSolution("serveur : palmarès par temps, indices et code de vérification, victoires trop rapides écartées", (reponses) => {
  const { s, ss, avancer } = serveurSimule();
  const jouerPendant = (jeton, minutes) => {
    for (let i = 0; i < minutes * 2; i++) { avancer(30); s.sauvegarder(jeton, { lieu: 1 }, false); }
  };
  const lente = s.creerCompte("Lente", "secret42");
  const rapide = s.creerCompte("Rapide", "secret42");
  const tricheur = s.creerCompte("Eclair", "secret42");
  jouerPendant(lente.jeton, 90);
  const v = s.enregistrerVictoire(lente.jeton, reponses, { indices: 3 });
  assert.strictEqual(v.rang, 1);
  assert.ok(/^[0-9A-F]{4}$/.test(v.code));
  jouerPendant(rapide.jeton, 40);
  const r = s.enregistrerVictoire(rapide.jeton, reponses, { indices: 0 });
  assert.strictEqual(r.rang, 2);
  assert.ok(Math.abs(r.temps - 40 * 60) <= 31);
  avancer(5);
  assert.strictEqual(s.enregistrerVictoire(tricheur.jeton, reponses).rang, 3);
  assert.strictEqual(ss.feuilles.Gagnants.lignes[3][6], "À vérifier (trop rapide)");
  const encore = s.enregistrerVictoire(lente.jeton, reponses, { indices: 9 });
  assert.ok(encore.deja && encore.rang === 1 && encore.code === v.code);
  const p = s.palmares();
  assert.deepStrictEqual(p.map((g) => g.pseudo), ["Rapide", "Lente"]);
  assert.deepStrictEqual(p.map((g) => g.indices), [0, 3]);
  assert.ok(typeof p[0].date === "string");
});

testSolution("partie complète jusqu'à la victoire et la phrase", ([labo, armoire, coffre]) => {
  const p = new Partie();
  p.demarrer();
  jouer(p, [
    "prendre agenda", "lire tableau",
    "o", "s", "e", "composer " + labo, "prendre ruban", "o", "bas",   // labos
    "o", "s", "e",                                                    // cafétéria : la silhouette
  ]);
  assert.ok(p.silhouetteIci());
  jouer(p, [
    "attendre", "attendre", "manger barre", "n", "prendre lame", "s", "o", // cuisines
    "s", "haut", "composer " + armoire, "prendre bâton", "bas", "n", "n", "e", // Aile F
    "e", "e", "n", "allumer bâton", "prendre tuyau", "s",            // vestiaires
    "combiner tuyau avec lame", "o", "o", "n",
  ]);
  assert.strictEqual(p.lieu, 10);
  assert.ok(p.flags.arme_fabriquee && p.flags.a_mange && p.possede("agenda"));
  jouer(p, ["frapper cadenas", "est", "composer " + coffre, "prendre clé", "lire enveloppe", "ouest"]);
  assert.ok(p.gardien);
  const r = jouer(p, ["frapper", "utiliser clé sur chaînes"]);
  assert.ok(p.termine && p.gagne);
  assert.ok(texte(r).includes("FÉLICITATIONS, TU AS SURVÉCU À LA NUIT."));
  assert.ok(texte(r).includes("Bien joué."));
  const phrase = r.find((b) => b.type === "phrase").texte.replace(/^« | »$/g, "");
  assert.strictEqual(sha(phrase), EMPREINTE_PHRASE);
  assert.deepStrictEqual(p.reponses().map((x) => sha(x)), EMPREINTES_CODES);
  assert.strictEqual(p.statistiques().serrures, 3);
});

testSolution("OUVRIR PORTE avec la clé déclenche aussi la victoire", ([labo, armoire, coffre]) => {
  const p = new Partie();
  p.codes = { 5: labo, 16: armoire, 11: coffre };
  p.lieu = 10;
  p.inventaire.push("cle_principale");
  const r = p.executer("ouvrir porte");
  assert.ok(p.termine);
  assert.strictEqual(r[1].texte, "COUPURE AU NOIR.");
});

console.log(`\n${n} tests réussis` + (sautes ? `, ${sautes} sautés (SOLUTION absente).` : "."));
