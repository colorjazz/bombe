/**
 * La Nuit à St-Ex — serveur Google Apps Script.
 *
 * Sert le jeu (Index.html) et garde, dans le classeur Google Sheets auquel ce
 * script est rattaché :
 *   - Comptes  : pseudo, sel, empreinte du mot de passe (jamais le mot de passe lui-même)
 *   - Parties  : la sauvegarde de chaque compte et son nombre de morts
 *   - Gagnants : l'ordre d'arrivée, avec la date et l'heure exactes
 *
 * Mise en place : voir nuit-st-ex/README.md, section « Version de l'école ».
 */

// Empreintes SHA-256 des trois réponses (mêmes valeurs que dans moteur.js).
// Elles servent à vérifier qu'une victoire envoyée au serveur est réelle.
var EMPREINTES_CODES = [
  "68e29784d1a114fda63d38f9458caa7a591f5186766ac67440b6a736182222ee",
  "08490295488a1189099751ebeddb5992313dd2a831e07a92e66d196ddc261777",
  "45297c633d331e6ac35169ebaaf75bc7fafd206ebb59ba4efd80566936e46eb0",
];

var DUREE_SESSION = 6 * 60 * 60; // secondes (maximum permis par CacheService)

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("La Nuit à St-Ex")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}

/** À lancer une fois depuis l'éditeur : crée les onglets et retient le classeur. */
function installer() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("CLASSEUR", ss.getId());
  onglet_(ss, "Comptes", ["Pseudo", "Sel", "Empreinte du mot de passe", "Créé le"]);
  onglet_(ss, "Parties", ["Pseudo", "Sauvegarde", "Mise à jour", "Morts"]);
  onglet_(ss, "Gagnants", ["Rang", "Pseudo", "Date et heure"]);
}

function onglet_(ss, nom, entetes) {
  var feuille = ss.getSheetByName(nom) || ss.insertSheet(nom);
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(entetes);
    feuille.setFrozenRows(1);
    feuille.getRange(1, 1, 1, entetes.length).setFontWeight("bold");
  }
  return feuille;
}

function feuille_(nom) {
  var id = PropertiesService.getScriptProperties().getProperty("CLASSEUR");
  if (!id) throw new Error("Le jeu n'est pas encore installé. Demande à ton enseignant.");
  return SpreadsheetApp.openById(id).getSheetByName(nom);
}

// Numéro de ligne (1 = en-tête) du pseudo dans la feuille, ou 0. Insensible à la casse.
function ligne_(feuille, pseudo) {
  var valeurs = feuille.getRange(1, 1, Math.max(feuille.getLastRow(), 1), 1).getValues();
  var cle = pseudo.toLowerCase();
  for (var i = 1; i < valeurs.length; i++) {
    if (String(valeurs[i][0]).toLowerCase() === cle) return i + 1;
  }
  return 0;
}

function sha256Hex_(texte) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texte, Utilities.Charset.UTF_8)
    .map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); })
    .join("");
}

function empreinteMotDePasse_(sel, mdp) {
  return sha256Hex_(sel + ":" + mdp);
}

function verrouiller_(fn) {
  var verrou = LockService.getScriptLock();
  verrou.waitLock(15000);
  try {
    return fn();
  } finally {
    verrou.releaseLock();
  }
}

function validerPseudo_(pseudo) {
  pseudo = String(pseudo || "").trim();
  if (!/^[A-Za-z0-9À-ÿ_-]{3,20}$/.test(pseudo)) {
    throw new Error("Le pseudo doit avoir de 3 à 20 caractères : lettres, chiffres, - ou _.");
  }
  return pseudo;
}

function validerMotDePasse_(mdp) {
  mdp = String(mdp || "");
  if (mdp.length < 4) throw new Error("Le mot de passe doit avoir au moins 4 caractères.");
  if (mdp.length > 100) throw new Error("Le mot de passe est trop long.");
  return mdp;
}

function ouvrirSession_(pseudo, sauvegarde) {
  var jeton = Utilities.getUuid();
  CacheService.getScriptCache().put("session:" + jeton, pseudo, DUREE_SESSION);
  return { pseudo: pseudo, jeton: jeton, sauvegarde: sauvegarde };
}

function pseudoDeSession_(jeton) {
  var cache = CacheService.getScriptCache();
  var pseudo = cache.get("session:" + jeton);
  if (!pseudo) throw new Error("ta session a expiré. Quitte et reconnecte-toi.");
  cache.put("session:" + jeton, pseudo, DUREE_SESSION);
  return pseudo;
}

// ==========================================
// Fonctions appelées par le jeu (google.script.run)
// ==========================================

function creerCompte(pseudo, mdp) {
  pseudo = validerPseudo_(pseudo);
  mdp = validerMotDePasse_(mdp);
  return verrouiller_(function () {
    var comptes = feuille_("Comptes");
    if (ligne_(comptes, pseudo)) throw new Error("Ce pseudo est déjà pris. Choisis-en un autre.");
    var sel = Utilities.getUuid();
    comptes.appendRow([pseudo, sel, empreinteMotDePasse_(sel, mdp), new Date()]);
    return ouvrirSession_(pseudo, null);
  });
}

function connecter(pseudo, mdp) {
  pseudo = String(pseudo || "").trim();
  mdp = String(mdp || "");
  var comptes = feuille_("Comptes");
  var n = ligne_(comptes, pseudo);
  var ligne = n ? comptes.getRange(n, 1, 1, 3).getValues()[0] : null;
  if (!ligne || empreinteMotDePasse_(ligne[1], mdp) !== ligne[2]) {
    Utilities.sleep(800); // ralentit les essais au hasard
    throw new Error("Pseudo ou mot de passe incorrect.");
  }
  var parties = feuille_("Parties");
  var p = ligne_(parties, ligne[0]);
  var brut = p ? parties.getRange(p, 2).getValue() : "";
  return ouvrirSession_(ligne[0], brut ? JSON.parse(brut) : null);
}

/** etat = sauvegarde de la partie, ou null pour l'effacer (mort, nouvelle partie). */
function sauvegarder(jeton, etat, mort) {
  var pseudo = pseudoDeSession_(jeton);
  return verrouiller_(function () {
    var parties = feuille_("Parties");
    var n = ligne_(parties, pseudo);
    var valeur = etat ? JSON.stringify(etat) : "";
    if (!n) {
      parties.appendRow([pseudo, valeur, new Date(), mort ? 1 : 0]);
    } else {
      var morts = Number(parties.getRange(n, 4).getValue()) || 0;
      parties.getRange(n, 2, 1, 3).setValues([[valeur, new Date(), morts + (mort ? 1 : 0)]]);
    }
    return true;
  });
}

function enregistrerVictoire(jeton, reponses) {
  var pseudo = pseudoDeSession_(jeton);
  var valide = reponses && reponses.length === EMPREINTES_CODES.length &&
    EMPREINTES_CODES.every(function (e, i) { return sha256Hex_(String(reponses[i])) === e; });
  if (!valide) throw new Error("les réponses ne correspondent pas.");
  return verrouiller_(function () {
    var gagnants = feuille_("Gagnants");
    var deja = gagnants.getRange(1, 1, gagnants.getLastRow(), 2).getValues();
    for (var i = 1; i < deja.length; i++) {
      if (String(deja[i][1]).toLowerCase() === pseudo.toLowerCase()) return { rang: deja[i][0], deja: true };
    }
    var rang = deja.length; // en-tête compris : 1er gagnant = rang 1
    gagnants.appendRow([rang, pseudo, new Date()]);
    var parties = feuille_("Parties");
    var p = ligne_(parties, pseudo);
    if (p) parties.getRange(p, 2, 1, 2).setValues([["", new Date()]]);
    return { rang: rang, deja: false };
  });
}
