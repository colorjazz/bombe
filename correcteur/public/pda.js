// Primaire : fautes qui comptent selon la Progression des apprentissages au primaire (PDA, français, MEQ 2009).
// Une lettre par année, de la 1re à la 6e (symboles des tableaux de la PDA) :
//   .  case vide : notion pas encore vue → faute ignorée
//   a  → l'élève apprend avec l'intervention de l'enseignante → faute montrée en gris, non comptée
//   *  ★ l'élève le fait seul à la fin de l'année → comptée à l'étape 3, en gris avant
//   r  case bleue : l'élève réutilise la notion → faute comptée
// Relevé à la main dans le document (pages 15-16, 22-23, 39, 43) : à faire valider par une enseignante du primaire.

export const PDA_NOTIONS = [
  { id: 'o_mots', cat: 'orthographe', label: 'Mots courants à connaître à son année (liste orthographique)', years: 'rrrrrr' },
  { id: 'o_muettes', cat: 'orthographe', label: 'Lettres muettes du genre et du nombre (noire, chats)', years: 'aa*rrr' },
  { id: 'o_e_final', cat: 'orthographe', label: 'e final qui fait prononcer la consonne (porte, petite)', years: '.a*rrr' },
  { id: 'o_position', cat: 'orthographe', label: 'Règles de position (c/ç, g/gu/ge, m devant b et p)', years: 'aa*rrr' },
  { id: 'o_maj_personnes', cat: 'orthographe', label: 'Majuscule aux noms de personnes et d’animaux', years: 'a*rrrr' },
  { id: 'o_maj_lieux', cat: 'orthographe', label: 'Majuscule aux noms de lieux', years: '.aa*rr' },
  { id: 'o_apos_1', cat: 'orthographe', label: 'Apostrophe : l’, j’ (le, la, je devant une voyelle)', years: 'a*rrrr' },
  { id: 'o_apos_2', cat: 'orthographe', label: 'Apostrophe : d’, m’, t’, s’, c’', years: '..a*rr' },
  { id: 'o_trait', cat: 'orthographe', label: 'Trait d’union dans les questions (sont-elles, va-t-il)', years: '...aa*' },
  { id: 'p_point', cat: 'ponctuation', label: 'Majuscule au début et point à la fin de la phrase', years: 'a*rrrr' },
  { id: 'p_inter', cat: 'ponctuation', label: 'Point d’interrogation et point d’exclamation', years: 'aa*rrr' },
  { id: 'p_virgule', cat: 'ponctuation', label: 'Virgule dans une énumération', years: '...a*r' },
  { id: 'p_tiret', cat: 'ponctuation', label: 'Tiret de dialogue', years: '...a*r' },
  { id: 'p_guillemets', cat: 'ponctuation', label: 'Deux-points et guillemets', years: '....a*' },
  { id: 's_ne_pas', cat: 'syntaxe', label: 'Négation ne… pas (le « ne » oublié)', years: 'aa*rrr' },
  { id: 's_ne_jamais', cat: 'syntaxe', label: 'Négation ne… jamais, ne… plus, ne… rien', years: '..a*rr' },
  { id: 'a_det', cat: 'accord', label: 'Accord du déterminant avec le nom (les chiens)', years: 'a*rrrr' },
  { id: 'a_adj', cat: 'accord', label: 'Accord de l’adjectif avec le nom', years: '.aa*rr' },
  { id: 'a_gn', cat: 'accord', label: 'Accords dans un groupe du nom avec adjectif (les petits chats noirs)', years: '...a*r' },
  { id: 'a_v_pronom', cat: 'accord', label: 'Verbe accordé avec le pronom juste devant (ils mangent)', years: '..a*rr' },
  { id: 'a_v_gn', cat: 'accord', label: 'Verbe accordé avec un sujet dét. + nom ou nom propre', years: '..a*rr' },
  { id: 'a_v_loin', cat: 'accord', label: 'Verbe accordé avec un sujet éloigné ou long (dét. + nom + expansions)', years: '...aa*' },
  { id: 'a_v_coord', cat: 'accord', label: 'Verbe accordé avec des sujets coordonnés (Léa et Tom)', years: '....a*' },
  { id: 'a_v_autres', cat: 'accord', label: 'Verbe accordé avec un autre pronom (cela, qui) ou séparé (il les mange)', years: '....a*' },
  { id: 'a_attribut', cat: 'accord', label: 'Adjectif après être (elles sont contentes)', years: '..aa*r' },
  { id: 'a_pp_etre', cat: 'accord', label: 'Participe passé avec être (elles sont parties)', years: '....a*' },
  { id: 'c_frequents', cat: 'conjugaison', label: 'Verbes fréquents au présent (aimer, aller, avoir, dire, être, faire)', years: 'a*rrrr' },
  { id: 'c_present', cat: 'conjugaison', label: 'Présent de l’indicatif (verbes à l’étude)', years: '..a*rr' },
  { id: 'c_imparfait', cat: 'conjugaison', label: 'Imparfait', years: '..a*rr' },
  { id: 'c_futur', cat: 'conjugaison', label: 'Futur simple et conditionnel présent', years: '..a*rr' },
  { id: 'c_infinitif', cat: 'conjugaison', label: 'Infinitif et participe présent (-er, -ant)', years: '..a*rr' },
  { id: 'c_compose', cat: 'conjugaison', label: 'Passé composé et participe passé (-é, -i, -u)', years: '....a*' },
  { id: 'c_imperatif', cat: 'conjugaison', label: 'Impératif présent et subjonctif présent', years: '....a*' },
  { id: 'c_passe_simple', cat: 'conjugaison', label: 'Passé simple (3e personne)', years: '....aa' },
];

// État par défaut d'une notion pour une année (1-6) et une étape (1-3) : 'count' | 'grey' | 'ignore'.
export function pdaDefault(notion, year, step) {
  const s = notion.years[year - 1];
  if (s === 'r') return 'count';
  if (s === '*') return step >= 3 ? 'count' : 'grey';
  if (s === 'a') return 'grey';
  return 'ignore';
}

// Mots d'une transcription : les mots joints par une apostrophe comptent pour deux (l'arbre), les nombres comptent.
export const countWords = (text) => (String(text || '').match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []).length;

// Cote selon le pourcentage de fautes : seuils A, B, C, D (le reste est E).
export function cote(pct, limits) {
  const k = limits.findIndex((l) => pct <= l);
  return 'ABCDE'[k < 0 ? 4 : k];
}
