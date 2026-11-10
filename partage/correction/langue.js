// Module partagé entre la 1.0 (correcteur/) et la 2.0 (salle-des-profs/).
// Code déplacé tel quel depuis correcteur/src/worker.js. Toute modification ici touche les deux versions.
import { HttpError } from './erreurs.js';
import { cleanBox } from './copies.js';

// ---------- Correction de la langue ----------

export const LANG_CATEGORIES = {
  // Classement de la grammaire enseignée au Québec : apostrophe et trait d'union sont des signes orthographiques.
  orthographe: "orthographe (mot mal écrit, accent, majuscule, apostrophe et élision, trait d'union, homophones comme a/à, ou/où, ces/ses, mot invariable comme « plusieurs », abréviation comme « 2ème » → « 2e »)",
  accord: "accords (accord du verbe avec le sujet, toujours ici, même si la forme du verbe est fautive ; genre, nombre, participe passé, adjectif, déterminant)",
  conjugaison: "conjugaison (forme du verbe mal construite, temps, mode, auxiliaire ; l'accord du verbe avec son sujet va dans « accords »)",
  ponctuation: 'ponctuation (virgule, point, deux-points, point-virgule, guillemets)',
  syntaxe: 'syntaxe (construction de phrase, préposition, négation, pronom)',
  vocabulaire: 'vocabulaire (mot impropre, anglicisme, registre familier)',
};

export const LANG_CATEGORIES_EN = {
  orthographe: 'spelling (misspelled word, capitalization)',
  accord: 'agreement (subject-verb, singular/plural, pronoun-antecedent)',
  conjugaison: 'verb forms and tenses',
  ponctuation: 'punctuation (comma, period, apostrophe, hyphen)',
  syntaxe: 'sentence structure (fragments, run-ons, word order, prepositions)',
  vocabulaire: 'word choice (wrong word, homophones, informal register)',
};

export const LEVELS_EN = {
  primaire: 'elementary school student: flag important errors, very simple explanations',
  secondaire: 'high school student: precise explanations with the rule',
  secondaire1: 'middle school student: simple explanations with the rule',
  secondaire3: 'high school student: precise explanations with the rule',
  cegep: 'college student or adult: high standard, precise explanations',
};

export const LEVELS = {
  primaire: 'élève du primaire : relève les fautes importantes, explications très simples',
  secondaire: 'élève du secondaire : explications précises avec la règle',
  secondaire1: 'élève de secondaire 1-2 : explications simples avec la règle',
  secondaire3: 'élève de secondaire 3-5 : explications précises avec la règle',
  cegep: 'étudiant de cégep ou adulte : exigence élevée, explications précises',
};

// Le repérage des positions est nettement plus précis avec l'accès natif de Gemini qu'avec l'accès compatible OpenAI.
export const NATIVE_LANG_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      mot_fautif: { type: 'STRING', description: 'Le mot ou groupe de mots exact contenant la faute.' },
      correction: { type: 'STRING', description: 'La correction proposée : une seule forme, jamais deux au choix.' },
      explication: { type: 'STRING', description: 'Une courte explication de la règle (ex: Accord du participe passé).' },
      categorie: { type: 'STRING', enum: Object.keys(LANG_CATEGORIES) },
      ligne: { type: 'STRING', description: 'La ligne manuscrite complète où se trouve la faute, recopiée exactement telle qu’écrite (de son premier à son dernier mot).' },
      lecture_douteuse: { type: 'BOOLEAN', description: "true seulement si une lettre de ce mot est réellement ambiguë sur l'image ; false pour un mot nettement écrit, même fautif." },
      box: { type: 'ARRAY', items: { type: 'INTEGER' }, description: 'Bounding box [ymin, xmin, ymax, xmax] normalisée de 0 à 1000. Laisse vide si introuvable.' },
    },
    required: ['mot_fautif', 'correction', 'explication', 'categorie'],
  },
};

// Primaire : la notion de la Progression des apprentissages à laquelle se rattache chaque faute (voir public/pda.js).
export const NOT_YET = 'hors_annee';

export const langSchema = (pda, ortho) => {
  const items = structuredClone(NATIVE_LANG_SCHEMA.items);
  // « hors_annee » : une faute d'une notion pas encore vue a sa case (sans elle, l'IA la rangeait ailleurs, ex. l'imparfait
  // en « orthographe d'usage ») ; langErrors la retire ensuite, comme toute notion absente des réglages.
  if (pda) { items.properties.notion = { type: 'STRING', enum: [...pda.notions.map((n) => n.id), ...(pda.ignored?.length ? [NOT_YET] : [])] }; items.required.push('notion'); }
  if (ortho) { items.properties.sous_type = { type: 'STRING', enum: Object.keys(ORTHO_TYPES) }; items.required.push('sous_type'); }
  return { ...NATIVE_LANG_SCHEMA, items };
};

// Réglages primaire envoyés par l'appli : { year: 1-6, notions: [{ id, label, cat, state: 'count' | 'grey' }] }.
// Les notions ignorées ne sont pas envoyées : l'IA ne les relève pas.
export function readPda(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const year = Number(raw.year);
  const level = raw.level === 'secondaire' ? 'secondaire' : 'primaire';
  const notions = (Array.isArray(raw.notions) ? raw.notions : []).slice(0, 80)
    .filter((n) => /^[a-z0-9_]{1,30}$/.test(n?.id) && LANG_CATEGORIES[n.cat] && ['count', 'grey'].includes(n.state))
    .map((n) => ({ id: n.id, cat: n.cat, state: n.state, label: String(n.label || '').slice(0, 160) }));
  if (!(year >= 1 && year <= (level === 'secondaire' ? 5 : 6)) || !notions.length) throw new HttpError(400, 'Réglages de la Progression invalides');
  // Notions pas encore vues : nommées à l'IA pour qu'elle ne les range pas ailleurs (ex. l'imparfait en « orthographe d'usage »).
  const ignored = (Array.isArray(raw.ignored) ? raw.ignored : []).slice(0, 80).map((t) => String(t || '').slice(0, 160)).filter(Boolean);
  return { level, year, notions, ignored };
}

export const countWords = (text) => (String(text || '').match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []).length; // comme public/pda.js

export const overlaps = (a, b) => a && b && Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.5 * Math.min(a[3] - a[1], b[3] - b[1]);

// Fautes renvoyées par l'IA → fautes affichées : catégories demandées, pas de « correction » identique au texte
// (ex. « européen → européen ») ni hésitante (« capitule / capitulation »).
// Primaire : seules les fautes rattachées à une notion demandée restent ; celles d'une notion « en apprentissage » sont grises.
export function langErrors(fautes, cats, pda) {
  const notion = (f) => pda?.notions.find((n) => n.id === f.notion);
  if (pda) fautes = (fautes || []).filter(notion).map((f) => ({ ...f, categorie: notion(f).cat }));
  return (fautes || []).filter((f) => LANG_CATEGORIES[f.categorie] && cats.includes(f.categorie)
    && String(f.correction || '').trim().normalize('NFC') !== String(f.texte || '').trim().normalize('NFC')
    && !/\S\s*\/\s*\S/.test(String(f.correction || ''))).map((f) => ({
    text: String(f.texte || '').slice(0, 200), correction: String(f.correction || '').slice(0, 200),
    category: f.categorie, explanation: String(f.explication || '').slice(0, 400), box: cleanBox(f.box),
    line: String(f.ligne || '').slice(0, 400), // recopier la ligne fait partie de la consigne avec laquelle les cadres ont été mesurés
    doubtful: !!f.lecture_douteuse, // lecture incertaine : affichée « à vérifier », non comptée dans la note
    ...(pda ? { notion: f.notion, grey: notion(f).state === 'grey' } : {}),
    ...(ORTHO_TYPES[f.sous_type]?.cat === f.categorie ? { subtype: f.sous_type } : {}),
  })).filter((e, i, all) => !all.slice(0, i).some((o) => sameError(o, e)));
}

// Même faute relevée deux fois par l'IA (même mot, même correction, au même endroit) : une seule est gardée.
// Une faute vraiment répétée ailleurs dans le texte (autre cadre, autre ligne) reste.
export function sameError(a, b) {
  const n = (t) => String(t || '').trim().toLowerCase().normalize('NFC');
  if (n(a.text) !== n(b.text) || n(a.correction) !== n(b.correction)) return false;
  if (a.box && b.box) {
    const [t, l, bo, r] = [Math.max(a.box[0], b.box[0]), Math.max(a.box[1], b.box[1]), Math.min(a.box[2], b.box[2]), Math.min(a.box[3], b.box[3])];
    const inter = Math.max(0, bo - t) * Math.max(0, r - l), area = (x) => (x[2] - x[0]) * (x[3] - x[1]);
    return inter > 0.5 * Math.min(area(a.box), area(b.box));
  }
  return !!a.line && n(a.line) === n(b.line);
}

// Vérification systématique, catégorie par catégorie : sans elle, l'IA relevait surtout les accords et oubliait la
// ponctuation, les phrases mal construites et les lettres manquantes (copie réelle de secondaire 3-5 : 0 sur 5).
export const CHECKS = {
  orthographe: "orthographe : chaque mot, lettre par lettre (lettre manquante ou en trop : « moin » → « moins » ; accents ; homophones comme a/à, ou/où, ce/se, leur/leurs ; majuscule des noms propres)",
  accord: 'accords : déterminant, nom et adjectif ; verbe avec son sujet, même éloigné ; participe passé ; adjectif attribut',
  conjugaison: 'conjugaison : terminaisons, auxiliaires, infinitif ou participe (-er / -é)',
  ponctuation: "ponctuation : virgule après un complément de phrase ou un organisateur placé en début de phrase (« Par exemple, », « En effet, », « Lorsque…, ») ; virgule devant « mais » ; point à la fin de chaque phrase et majuscule au début de la suivante",
  syntaxe: "syntaxe : phrase sans verbe principal (phrase incomplète) ; sujet repris inutilement par un pronom (« un élève qui termine tard il risque » → « un élève qui termine tard risque ») ; « des » devant un adjectif suivi du nom (« des mauvais résultats » → « de mauvais résultats ») ; préposition fautive ; négation incomplète",
  vocabulaire: 'vocabulaire : mot impropre, anglicisme, registre familier',
};

export const CHECKS_EN = {
  orthographe: 'spelling: every word, letter by letter (missing or extra letters, homophones such as their/there, its/it’s, capital letters for proper nouns)',
  accord: 'agreement: subject-verb (even with a distant subject), pronoun-antecedent, singular/plural',
  conjugaison: 'verb forms: endings, tenses, irregular past forms',
  ponctuation: 'punctuation: comma after an introductory word or phrase, comma before a coordinating conjunction joining two clauses, end punctuation and capital letter at the start of each sentence',
  syntaxe: 'sentence structure: fragments without a main verb, run-on sentences and comma splices, repeated subjects, wrong prepositions',
  vocabulaire: 'word choice: wrong word, informal register',
};

export const checklist = (cats) => `   Relis la copie phrase par phrase, puis mot par mot, et vérifie systématiquement chaque catégorie demandée :\n${cats.map((c) => `   - ${CHECKS[c]} ;`).join('\n')}\n   Pour une faute qui touche une phrase entière (phrase incomplète, sujet répété, virgule manquante), encadre les mots où elle se voit le mieux et donne la phrase corrigée.`;

export const checklistEn = (cats) => `   Read the paper sentence by sentence, then word by word, and systematically check each requested category:\n${cats.map((c) => `   - ${CHECKS_EN[c]};`).join('\n')}\n   For an error that affects a whole sentence (fragment, repeated subject, missing comma), box the words where it shows best and give the corrected wording.`;

// Orthographe rectifiée (1990), acceptée par le ministère : « brulé » était compté comme faute.
export const RECTIF = "   L'orthographe rectifiée (1990) est acceptée au Québec : n'indique jamais comme faute un mot écrit selon l'orthographe rectifiée ou selon l'orthographe traditionnelle (« brulé » ou « brûlé », « connaitre » ou « connaître », « ile » ou « île », « évènement » ou « événement »).";

// Primaire : on ne relève que les fautes des notions vues à cette année, selon la Progression des apprentissages.
// Même consigne de repérage que langSystem (les cadres ont été mesurés avec elle).
export function pdaSystem(pda) {
  if (pda.level === 'secondaire') return pdaSecSystem(pda);
  const year = `${pda.year}${pda.year === 1 ? 're' : 'e'} année du primaire`;
  return `Tu es une enseignante de français au primaire, au Québec. Voici l'image d'un texte manuscrit (ou dactylographié) écrit par un élève de ${year}.
Ta mission :
1. Lis le texte attentivement.
2. Relève UNIQUEMENT les fautes qui relèvent d'une des notions suivantes, prévues à cette année par la Progression des apprentissages du ministère :
${pda.notions.map((n) => `   - ${n.id} : ${n.label}`).join('\n')}
   Si une faute relève de plusieurs notions, choisis toujours la plus simple, celle qu'on apprend le plus tôt (ex. : « les poisson » → accord du déterminant avec le nom, pas l'accord dans tout le groupe du nom).
   Pour « o_mots » (orthographe d'usage) : relève TOUT mot courant mal orthographié (lettre manquante, en trop ou inversée, accent oublié, mot écrit au son, trait d'union oublié : « dor » → « dort », « glassé » → « glacée », « au dessus » → « au-dessus », « a » → « à »). C'est la faute la plus importante à repérer au primaire : relis chaque mot un par un. Ignore seulement un mot rare ou savant qu'un élève de ${year} n'a pas à connaître.
   Toute faute qui ne relève d'aucune de ces notions doit être IGNORÉE (ne la renvoie pas). Pas de choix de style ; si un mot est illisible, ignore-le.
${pda.ignored?.length ? `   Notions PAS ENCORE VUES à cette année : ${pda.ignored.join(' ; ')}. Une faute qui relève d'une de ces notions (par exemple un verbe mal conjugué à un temps pas encore vu) n'est PAS une faute d'orthographe d'usage : si tu la renvoies, mets notion = « ${NOT_YET} ».\n` : ''}
${RECTIF}
   Une lettre bien formée n'est jamais une faute. Si une lettre est ambiguë (q ou d, accent douteux, lettre doublée ou non), relève la faute seulement si elle est probable, avec lecture_douteuse = true. Ignore les marques de l'enseignant (crochets, X, soulignés, encre de couleur).
3. Pour CHAQUE faute trouvée, déduis ses coordonnées (bounding box) sur l'image en encadrant le MOT COMPLET ou l'EXPRESSION COMPLÈTE qui contient la faute.
   Les coordonnées 'box' doivent être un tableau de 4 nombres [ymin, xmin, ymax, xmax] normalisés entre 0 et 1000.
   (ymin = haut, xmin = gauche, ymax = bas, xmax = droite).
Pour chaque faute, recopie aussi dans « ligne » la ligne manuscrite complète où elle se trouve, exactement telle qu'écrite, indique sa « notion » (l'identifiant ci-dessus) et sa catégorie, et donne une explication très courte et très simple, écrite pour un enfant de ${year} (ex. : « Il y a plusieurs chiens : on ajoute un s. »), sans mots savants de grammaire.
Renvoie EXCLUSIVEMENT un tableau JSON. Si aucune faute n'est trouvée, renvoie un tableau vide [].`;
}

// Secondaire : même principe ; tout ce qui est vu au primaire est acquis, et la relecture est systématique, catégorie
// par catégorie (sans elle, la ponctuation et la syntaxe étaient oubliées sur une vraie copie de secondaire 3-5).
export function pdaSecSystem(pda) {
  const year = `${pda.year}${pda.year === 1 ? 're' : 'e'} secondaire`;
  const cats = [...new Set(pda.notions.map((n) => n.cat))];
  return `Tu es une enseignante de français au secondaire, au Québec. Voici l'image d'un texte manuscrit (ou dactylographié) écrit par un élève de ${year}.
Ta mission :
1. Lis le texte attentivement.
2. Relève UNIQUEMENT les fautes qui relèvent d'une des notions suivantes, attendues en ${year} selon la Progression des apprentissages du ministère :
${pda.notions.map((n) => `   - ${n.id} : ${n.label}`).join('\n')}
   Toute faute qui ne relève d'aucune de ces notions doit être IGNORÉE (ne la renvoie pas). Pas de choix de style ; si un mot est illisible, ignore-le.
${pda.ignored?.length ? `   Notions PAS ENCORE VUES en ${year} : ${pda.ignored.join(' ; ')}. Une faute qui en relève n'est rangée dans aucune autre notion : si tu la renvoies, mets notion = « ${NOT_YET} ».\n` : ''}${checklist(cats)}
${RECTIF}
   Une lettre bien formée n'est jamais une faute. Si une lettre est ambiguë (q ou d, accent douteux, lettre doublée ou non), relève la faute seulement si elle est probable, avec lecture_douteuse = true. Ignore les marques de l'enseignant (crochets, X, soulignés, encre de couleur).
3. Pour CHAQUE faute trouvée, déduis ses coordonnées (bounding box) sur l'image en encadrant le MOT COMPLET ou l'EXPRESSION COMPLÈTE qui contient la faute.
   Les coordonnées 'box' doivent être un tableau de 4 nombres [ymin, xmin, ymax, xmax] normalisés entre 0 et 1000.
   (ymin = haut, xmin = gauche, ymax = bas, xmax = droite).
Pour chaque faute, recopie aussi dans « ligne » la ligne manuscrite complète où elle se trouve, exactement telle qu'écrite, indique sa « notion » (l'identifiant ci-dessus) et sa catégorie, et donne une explication courte avec la règle, pour un élève de ${year} (ex. : « Après un organisateur en début de phrase, on met une virgule. »).
Renvoie EXCLUSIVEMENT un tableau JSON. Si aucune faute n'est trouvée, renvoie un tableau vide [].`;
}

// Orthopédagogie : chaque faute reçoit aussi un sous-type, qui sert à établir le profil du scripteur. Typologie inspirée
// du Référentiel d'intervention en écriture (MEQ, 2017) et des travaux sur l'orthographe (unités phonologiques,
// morphologiques, visuo-orthographiques, lexicales), complétée des homophones grammaticaux et de la segmentation.
// Le sous-type précise la catégorie ; il ne la remplace pas (les cadres et la note restent ceux de la catégorie).
export const ORTHO_TYPES = {
  // U : orthographe d'usage
  phonologique: { cat: 'orthographe', def: "le mot écrit ne se prononce plus comme le mot attendu : son oublié, ajouté, inversé, confusion sourde/sonore f/v, p/b, t/d, c/g (« tadé » → « tardé », « vlotter » → « flotter »)" },
  morphologique: { cat: 'orthographe', def: "lettre muette ou partie du mot qu'on trouve par un mot de la même famille, préfixe ou suffixe (« gran » → « grand », grande ; « den » → « dent », dentiste)" },
  visuo_orthographique: { cat: 'orthographe', def: "le mot se prononce bien, mais le choix des lettres est faux (mémoire visuelle du mot) : an/en, o/au/eau, s/ss/c/ç, g/gu/ge, consonne double, m devant b et p, accent (« drapo » → « drapeau », « tonbé » → « tombé »)" },
  homophone_lexical: { cat: 'orthographe', def: "un autre mot de même prononciation a été écrit (« ver » → « verre », « dans » → « dent »)" },
  segmentation: { cat: 'orthographe', def: "mots soudés ou coupés au mauvais endroit, apostrophe oubliée (« lami » → « l'ami », « a voir » → « avoir », « parterre » → « par terre »)" },
  majuscule_signes: { cat: 'orthographe', def: "majuscule d'un nom propre, trait d'union, abréviation" },
  // G : orthographe grammaticale
  homophone_grammatical: { cat: 'orthographe', def: "a/à, et/est, son/sont, on/ont, ce/se, ces/ses, c'est/s'est, ou/où, la/l'a/là, leur/leurs, peu/peut, mes/mais, ni/n'y, sans/s'en" },
  accord_gn: { cat: 'accord', def: "accord dans le groupe du nom : déterminant, nom, adjectif (genre ou nombre) (« les dents propre » → « propres »)" },
  accord_attribut: { cat: 'accord', def: "accord de l'adjectif attribut du sujet (« elles sont content » → « contentes »)" },
  accord_sv_simple: { cat: 'accord', def: "accord du verbe avec un sujet placé juste avant lui (« les dents grince » → « grincent »)" },
  accord_sv_complexe: { cat: 'accord', def: "accord du verbe avec un sujet inversé, éloigné, coordonné, ou séparé par un pronom écran (« les amis de mon frère vient » → « viennent », « il les mange »)" },
  pp_etre: { cat: 'accord', def: "participe passé employé avec être (« elles sont parti » → « parties »)" },
  pp_avoir: { cat: 'accord', def: "participe passé employé avec avoir (accord avec le complément direct placé avant)" },
  pp_seul: { cat: 'accord', def: "participe passé employé sans auxiliaire (« les feuilles tombé » → « tombées »)" },
  morphologie_verbale: { cat: 'conjugaison', def: "conjugaison : radical, terminaison de personne ou de temps, auxiliaire fautifs, sans erreur d'accord (« il viens » → « il vient », « il couriait » → « il courait »)" },
  homophone_verbal: { cat: 'conjugaison', def: "confusion entre formes du verbe qui se prononcent pareil : -é, -er, -ez, -ait, -ais, -ai (« il a manger » → « mangé »)" },
  // P : ponctuation
  delimitation: { cat: 'ponctuation', def: "majuscule de début de phrase ou point final oubliés, phrases juxtaposées sans ponctuation (phrases-fleuves) ou coupées au mauvais endroit" },
  virgule_detachement: { cat: 'ponctuation', def: "virgule oubliée après un complément de phrase ou un organisateur placé en tête de phrase (« Le lendemain nous » → « Le lendemain, nous »)" },
  virgule: { cat: 'ponctuation', def: "autre virgule oubliée ou fautive : énumération, coordonnant (mais, car), complément du nom détaché" },
  ponctuation_autre: { cat: 'ponctuation', def: "deux-points, guillemets, tiret de dialogue, point d'interrogation ou d'exclamation" },
  // S : syntaxe
  structure_phrase: { cat: 'syntaxe', def: "phrase de base : constituant obligatoire manquant (sujet, verbe), mot oublié, ordre des mots, construction calquée sur l'oral, sujet répété" },
  subordination: { cat: 'syntaxe', def: "subordonnée mal construite : subordonnant ou pronom relatif fautif (« que » pour « dont »), « que » surutilisé" },
  negation: { cat: 'syntaxe', def: "« ne » oublié dans la négation" },
  pronom_preposition: { cat: 'syntaxe', def: "pronom fautif ou ambigu, préposition fautive" },
  // V : vocabulaire
  vocabulaire: { cat: 'vocabulaire', def: "mot impropre, répétition, anglicisme, registre familier" },
};
