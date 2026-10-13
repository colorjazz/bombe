/**
 * La Nuit à St-Ex — serveur Google Apps Script.
 *
 * Sert le jeu (Index.html) et garde, dans le classeur Google Sheets auquel ce
 * script est rattaché :
 *   - Comptes  : pseudo, sel, empreinte du mot de passe (jamais le mot de passe lui-même)
 *   - Parties  : la sauvegarde de chaque compte, ses morts et son temps de jeu actif
 *   - Gagnants : l'ordre d'arrivée, la date et l'heure, le temps de jeu et les morts
 *
 * Le temps de jeu est mesuré ici, par le serveur, à partir des sauvegardes :
 * un écart de plus de PAUSE_MAX entre deux contacts compte comme une pause.
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
var PAUSE_MAX = 5 * 60; // secondes sans contact au-delà desquelles on ne compte plus le temps
// Une victoire plus rapide ou avec moins de sauvegardes que ça est marquée « À vérifier »
// et n'apparaît pas dans le palmarès public.
var TEMPS_MINIMUM = 10 * 60;
var SAUVEGARDES_MINIMUM = 15;

var ENTETES = {
  Comptes: ["Pseudo", "Sel", "Empreinte du mot de passe", "Créé le"],
  Parties: ["Pseudo", "Sauvegarde", "Dernier contact", "Morts", "Temps de jeu (s)", "Sauvegardes"],
  Gagnants: ["Rang d'arrivée", "Pseudo", "Date et heure", "Temps de jeu", "Temps (s)", "Morts", "Vérification"],
};

function maintenant_() {
  return new Date();
}

// Noms acceptés pour le fichier HTML du jeu (le bon est « Index »).
var NOMS_PAGE = ["Index", "index", "Index.html", "index.html"];

function doGet(e) {
  // Le site Netlify vérifie que le serveur répond avant d'afficher les comptes.
  if (e && e.parameter && e.parameter.ping) return json_({ ok: true });
  for (var i = 0; i < NOMS_PAGE.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(NOMS_PAGE[i])
        .setTitle("La Nuit à St-Ex")
        .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
    } catch (e) {
      // fichier absent sous ce nom : on essaie le suivant
    }
  }
  return HtmlService.createHtmlOutput(
    "<div style='font-family:sans-serif;max-width:40rem;margin:2rem auto;line-height:1.6'>" +
      "<h2>La page du jeu est introuvable</h2>" +
      "<p>Dans l'éditeur Apps Script, il faut un fichier <b>HTML</b> (créé avec + → HTML) " +
      "qui s'affiche <b>Index.html</b> dans la liste de gauche. Tape seulement « Index » en le créant : " +
      "Google ajoute « .html » tout seul.</p>" +
      "<p>Si le fichier existe déjà : Déployer → Gérer les déploiements → crayon (Modifier) → " +
      "Version : <b>Nouvelle version</b> → Déployer. Un déploiement ne voit pas les fichiers ajoutés après lui.</p>" +
      "</div>"
  ).setTitle("La Nuit à St-Ex");
}

// Appels venant du site Netlify (ou de toute page hors Apps Script) :
// POST, corps JSON { action, args }, réponse JSON { ok, resultat } ou { ok: false, erreur }.
var ACTIONS = {
  creerCompte: function (a) { return creerCompte(a[0], a[1]); },
  connecter: function (a) { return connecter(a[0], a[1]); },
  sauvegarder: function (a) { return sauvegarder(a[0], a[1], a[2]); },
  palmares: function () { return palmares(); },
  enregistrerVictoire: function (a) { return enregistrerVictoire(a[0], a[1]); },
};

function doPost(e) {
  try {
    var requete = JSON.parse(e.postData.contents);
    var action = ACTIONS[requete.action];
    if (!action) throw new Error("action inconnue.");
    return json_({ ok: true, resultat: action(requete.args || []) });
  } catch (err) {
    return json_({ ok: false, erreur: err.message });
  }
}

function json_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

/** À lancer une fois depuis l'éditeur : crée les onglets et retient le classeur. */
function installer() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("CLASSEUR", ss.getId());
  for (var nom in ENTETES) onglet_(ss, nom, ENTETES[nom]);
}

// Crée l'onglet au besoin et (ré)écrit ses en-têtes : relancer installer() après une mise à jour est sans danger.
function onglet_(ss, nom, entetes) {
  var feuille = ss.getSheetByName(nom) || ss.insertSheet(nom);
  if (feuille.getLastRow() === 0) feuille.appendRow(entetes);
  else feuille.getRange(1, 1, 1, entetes.length).setValues([entetes]);
  feuille.setFrozenRows(1);
  feuille.getRange(1, 1, 1, entetes.length).setFontWeight("bold");
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
    comptes.appendRow([pseudo, sel, empreinteMotDePasse_(sel, mdp), maintenant_()]);
    contact_(pseudo, false);
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
  return verrouiller_(function () {
    var partie = contact_(ligne[0], false);
    return ouvrirSession_(ligne[0], partie.sauvegarde ? JSON.parse(partie.sauvegarde) : null);
  });
}

// Note un contact du joueur dans l'onglet Parties et renvoie sa ligne.
// Si compter est vrai, le temps écoulé depuis le dernier contact s'ajoute au temps de jeu
// (sauf au-delà de PAUSE_MAX : c'était une pause ou un autre jour).
function contact_(pseudo, compter) {
  var parties = feuille_("Parties");
  var n = ligne_(parties, pseudo);
  var maintenant = maintenant_();
  if (!n) {
    parties.appendRow([pseudo, "", maintenant, 0, 0, 0]);
    n = parties.getLastRow();
  }
  var v = parties.getRange(n, 1, 1, 6).getValues()[0];
  var partie = {
    ligne: n,
    sauvegarde: v[1],
    morts: Number(v[3]) || 0,
    temps: Number(v[4]) || 0,
    sauvegardes: Number(v[5]) || 0,
  };
  var dernier = v[2] instanceof Date ? v[2].getTime() : new Date(v[2]).getTime();
  var ecart = (maintenant.getTime() - dernier) / 1000;
  if (compter && ecart > 0 && ecart <= PAUSE_MAX) partie.temps += Math.round(ecart);
  parties.getRange(n, 3).setValues([[maintenant]]);
  parties.getRange(n, 5).setValues([[partie.temps]]);
  return partie;
}

/** etat = sauvegarde de la partie, ou null pour l'effacer (mort, nouvelle partie). */
function sauvegarder(jeton, etat, mort) {
  var pseudo = pseudoDeSession_(jeton);
  return verrouiller_(function () {
    var partie = contact_(pseudo, true);
    var valeur = etat ? JSON.stringify(etat) : "";
    var parties = feuille_("Parties");
    parties.getRange(partie.ligne, 2).setValues([[valeur]]);
    parties.getRange(partie.ligne, 4).setValues([[partie.morts + (mort ? 1 : 0)]]);
    parties.getRange(partie.ligne, 6).setValues([[partie.sauvegardes + 1]]);
    return true;
  });
}

function formaterTemps_(secondes) {
  var h = Math.floor(secondes / 3600);
  var m = Math.floor((secondes % 3600) / 60);
  var s = secondes % 60;
  var deux = function (x) { return ("0" + x).slice(-2); };
  return h > 0 ? h + " h " + deux(m) + " min" : m + " min " + deux(s) + " s";
}

function enregistrerVictoire(jeton, reponses) {
  var pseudo = pseudoDeSession_(jeton);
  var valide = reponses && reponses.length === EMPREINTES_CODES.length &&
    EMPREINTES_CODES.every(function (e, i) { return sha256Hex_(String(reponses[i])) === e; });
  if (!valide) throw new Error("les réponses ne correspondent pas.");
  return verrouiller_(function () {
    var gagnants = feuille_("Gagnants");
    var deja = gagnants.getRange(1, 1, gagnants.getLastRow(), 5).getValues();
    for (var i = 1; i < deja.length; i++) {
      if (String(deja[i][1]).toLowerCase() === pseudo.toLowerCase()) {
        return { rang: deja[i][0], deja: true, temps: Number(deja[i][4]) || 0 };
      }
    }
    var partie = contact_(pseudo, true);
    var suspect = partie.temps < TEMPS_MINIMUM || partie.sauvegardes < SAUVEGARDES_MINIMUM;
    var rang = deja.length; // en-tête compris : 1er gagnant = rang 1
    gagnants.appendRow([
      rang, pseudo, maintenant_(), formaterTemps_(partie.temps), partie.temps, partie.morts,
      suspect ? "À vérifier (trop rapide)" : "OK",
    ]);
    feuille_("Parties").getRange(partie.ligne, 2).setValues([[""]]);
    return { rang: rang, deja: false, temps: partie.temps };
  });
}

/** Palmarès public : les victoires vérifiées, du temps de jeu le plus court au plus long. */
function palmares() {
  var gagnants = feuille_("Gagnants");
  if (gagnants.getLastRow() < 2) return [];
  return gagnants.getRange(2, 1, gagnants.getLastRow() - 1, 7).getValues()
    .filter(function (l) { return l[6] === "OK"; })
    .map(function (l) {
      var date = l[2] instanceof Date ? l[2] : new Date(l[2]);
      return { arrivee: l[0], pseudo: String(l[1]), temps: Number(l[4]) || 0, morts: Number(l[5]) || 0, date: date.toISOString() };
    })
    .sort(function (a, b) { return a.temps - b.temps || a.arrivee - b.arrivee; })
    .slice(0, 50);
}
