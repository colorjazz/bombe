/*
 * La Nuit à St-Ex — moteur d'aventure textuelle (parser).
 *
 * Aucun texte narratif n'est généré à la volée : toutes les descriptions et
 * réponses sont écrites ici. Seuls de courts messages « système » (commande
 * inconnue, objet absent, etc.) sont propres au moteur.
 *
 * Utilisable dans le navigateur (window.NuitStEx) et dans Node (require).
 */
(function (global) {
  "use strict";

  // ==========================================
  // TEXTES DU SCRIPT
  // ==========================================
  const OUVERTURE = [
    "La surface rugueuse et froide du pupitre contre ta joue te sort d'un sommeil de plomb. Tu clignes des yeux. Ta nuque est raide. L'obscurité est presque totale. Tu te redresses en titubant, le cœur battant à tout rompre. Tu reconnais la pièce. Le local A-217. La classe de M. Plante.",
    "Tu t'es endormi en classe, mais personne ne t'a réveillé. M. Plante n'est plus là. L'école Polyvalente Antoine-de-Saint-Exupéry est plongée dans un silence sépulcral, brisé seulement par ta propre respiration saccadée. À travers la fenêtre, le ciel de la nuit est figé. Plus de lumières de la ville, plus de bourdonnement de ventilation, plus de bruit de circulation routière. Le monde tel que tu le connaissais s'est éteint pendant que tu dormais. Tu es seul. Du moins, tu l'espères.",
  ];

  const EVENEMENT_TOUR_5 =
    "Une vibration soudaine et violente contre ta cuisse te fait sursauter. Ton téléphone s'illumine. La lumière crue blesse tes pupilles dilatées. Batterie : 1%. Un unique message texte non lu apparaît à l'écran : « Ne fais pas de bruit. Surtout, ne les laisse pas t'en... ». L'écran meurt subitement. Le noir total reprend ses droits. Tu n'es pas seul.";

  const TOUR_EVENEMENT = 5;

  const TEXTE_MURAL =
    "ILS ONT COUPÉ L'EAU. ILS ONT COUPÉ LE COURANT. LE SILENCE EST LEUR ARME. LA CLÉ DE LA SORTIE EST AU SECRÉTARIAT. NE SORS PAS SANS TE DÉFENDRE.";

  const TEXTE_MANGER =
    "Tu déchires l'emballage frénétiquement et avales la barre. C'est sec, mais le sucre réveille tes muscles engourdis. Tu regagnes un peu de force.";

  const TEXTE_FRAPPER_FAIBLE =
    "Tu frappes, mais la faim et le froid paralysent tes muscles. Tes mains tremblent. Tu es trop faible. Il te faut trouver de l'énergie avant d'essayer à nouveau.";

  const TEXTE_FRAPPER_REUSSI =
    "Dans un hurlement viscéral qui déchire le silence, tu abats ton arme de fortune sur le cadenas. Le métal hurle et la charnière explose. La porte du secrétariat s'entrouvre.";

  const TEXTE_COMBINER_SANS_RUBAN =
    "Tu as les deux pièces, mais rien pour les faire tenir ensemble. Si tu frappes avec ça, la lame va s'envoler.";

  const TEXTE_COMBINER_REUSSI =
    "Avec des mains tremblantes, tu utilises le ruban adhésif industriel pour fixer la lame lourde au bout du tuyau de métal. C'est grossier, c'est barbare, mais tu as maintenant une arme redoutable.";

  const TEXTE_TABLEAU =
    "Ils suivent le bruit. Ils ne voient pas dans le noir, mais ils entendent tout. Le courant ne reviendra pas. Si tu lis ceci, marche doucement.";

  const TEXTE_ALLUMER =
    "Tu plies le bâton entre tes doigts. Un craquement sec, puis une lueur verte, chimique, maladive, éclabousse tes mains. C'est faible. C'est assez.";

  const TEXTE_NOIR_ABSOLU =
    "Tu tâtonnes dans le noir absolu. Tes doigts ne rencontrent que du métal glacé et des arêtes coupantes. Sans lumière, tu ne trouveras rien ici.";

  const TEXTE_ALERTE =
    "Puis le silence revient. Mais ce n'est plus le même silence. Quelque part dans les profondeurs de l'école, quelque chose a entendu.";

  const TEXTE_PAS_LOINTAINS =
    "Des pas. Lointains, irréguliers. Ils traînent sur les tuiles, quelque part du côté de l'auditorium.";

  const TEXTE_PAS_PROCHES =
    "Les pas se rapprochent. Tu entends maintenant une respiration rauque, mouillée, qui n'a rien d'humain. Il te reste très peu de temps.";

  const TEXTE_MORT = [
    "Tu n'as pas le temps de te retourner. Une main glacée se referme sur ta nuque. Le sol se dérobe. Le noir t'avale tout entier, et le silence se referme sur toi comme une eau profonde.",
    "COUPURE AU NOIR.",
    "LA NUIT T'A PRIS. TAPE REJOUER POUR RECOMMENCER.",
  ];

  // Tours laissés au joueur entre le fracas du cadenas et l'arrivée de la chose.
  const DELAI_POURSUITE = 6;

  const TEXTE_VICTOIRE = [
    "Le métal de la serrure grince sous tes doigts gelés. Les lourdes chaînes glissent lourdement sur les tuiles. Tu pousses les portes vitrées de toutes tes forces. L'air glacial te frappe de plein fouet. Les rues du quartier Ahuntsic sont méconnaissables. Sous un ciel criblé d'aurores boréales malades, les carcasses de voitures s'étendent à perte de vue. Derrière toi, dans les entrailles sombres de l'école, un cri guttural déchire soudain le silence. Tu te mets à courir vers l'inconnu.",
    "COUPURE AU NOIR. GÉNÉRIQUE.",
    "FÉLICITATIONS, TU AS SURVÉCU À LA NUIT.",
  ];

  // ==========================================
  // OBJETS
  // ==========================================
  const OBJETS = {
    telephone_mort: {
      nom: "téléphone",
      enPlace: "ton téléphone",
      description: "Ton téléphone. Batterie à 1%. Inutile comme source de lumière.",
      mots: ["TELEPHONE", "CELLULAIRE", "CELL", "PORTABLE", "MOBILE"],
      prenable: false,
    },
    ruban_adhesif: {
      nom: "ruban adhésif",
      enPlace: "du ruban adhésif (industriel et épais)",
      description: "Du ruban adhésif, industriel et épais.",
      mots: ["RUBAN", "ADHESIF", "TAPE", "DUCT"],
      prenable: true,
    },
    barre_tendre: {
      nom: "barre tendre",
      enPlace: "une barre tendre (oubliée sur une table)",
      description: "Une barre tendre, oubliée sur une table.",
      mots: ["BARRE", "TENDRE"],
      prenable: true,
    },
    tuyau_metal: {
      nom: "tuyau de métal",
      enPlace: "un tuyau de métal (arraché au mur des douches)",
      description: "Un tuyau de métal arraché au mur des douches, lourd et solide.",
      mots: ["TUYAU", "METAL"],
      prenable: true,
    },
    lame_lourde: {
      nom: "lame lourde",
      enPlace: "une lame lourde (un couperet de boucher, tombé au pied du comptoir)",
      description: "Une lame lourde : un couperet de boucher, épais et tranchant.",
      mots: ["LAME", "COUPERET", "HACHOIR", "COUTEAU"],
      prenable: true,
    },
    cle_principale: {
      nom: "clé principale",
      enPlace: "la clé principale",
      description: "La clé principale. La clé de la sortie.",
      mots: ["CLE", "CLEF", "CLES"],
      prenable: true,
    },
    agenda: {
      nom: "agenda",
      enPlace: "ton agenda (ouvert sur ton pupitre)",
      description: "Ton agenda scolaire, la couverture cornée. À l'intérieur, le plan de l'école. Tape CARTE pour le consulter.",
      mots: ["AGENDA", "CARTE", "PLAN"],
      prenable: true,
    },
    baton_lumineux: {
      nom: "bâton lumineux",
      enPlace: "un bâton lumineux (tombé de la trousse de premiers soins)",
      description: "Un bâton lumineux chimique, comme ceux des trousses d'urgence. Il suffit de le plier pour l'allumer.",
      mots: ["BATON", "LUMINEUX", "LUMIERE", "LAMPE"],
      prenable: true,
    },
    arme_artisanale: {
      nom: "arme artisanale",
      enPlace: "une arme artisanale",
      description:
        "Ton arme de fortune : la lame lourde fixée au bout du tuyau de métal avec le ruban adhésif industriel. C'est grossier, c'est barbare, mais redoutable.",
      mots: ["ARME", "ARMES"],
      prenable: true,
    },
  };

  // ==========================================
  // LIEUX
  // ==========================================
  const LIEUX = {
    1: {
      nom: "La Classe de M. Plante",
      zone: "2e étage · Bloc A",
      description:
        "Le repaire de M. Plante. Rassurant le jour, absolument terrifiant cette nuit. La faible lueur de la lune découpe la forme de son bureau à l'avant. Dans les ombres, les frises chronologiques et les graphiques d'éducation financière affichés aux murs ressemblent à de longues cicatrices sombres. L'air est mort. (Sortie : OUEST).",
      sorties: { OUEST: 2 },
      objets: ["agenda"],
    },
    2: {
      nom: "Couloir A-211",
      zone: "2e étage · Bloc A",
      description:
        "Le long corridor du Bloc A au deuxième étage. Les casiers métalliques forment une haie d'honneur sinistre qui s'étire dans l'obscurité, se perdant dans le noir absolu. À l'EST, la porte du local A-217. Au SUD, le couloir s'ouvre sur un espace plus vaste.",
      sorties: { EST: 1, SUD: 3 },
      objets: [],
    },
    3: {
      nom: "Carrefour de l'Étage",
      zone: "2e étage · Bloc B",
      description:
        "Tu es au cœur du deuxième étage. L'air y est lourd, suffocant. Au centre, la gueule béante de l'escalier principal plonge vers le rez-de-chaussée (BAS). Au SUD, l'obscurité de la partie haute de l'auditorium. À l'EST, le couloir s'enfonce vers les laboratoires de sciences. Au NORD, le retour vers ton couloir.",
      sorties: { NORD: 2, SUD: 4, EST: 5, BAS: 6 },
      objets: [],
    },
    4: {
      nom: "Partie Haute de l'Auditorium",
      zone: "2e étage · Bloc B",
      description:
        "Tu te tiens sur le balcon de la partie haute de l'auditorium. Tu surplombes la grande salle noire en contrebas. Tu as l'impression vertigineuse que, tout en bas dans cette mer de 446 sièges, quelque chose vient de bouger. Une simple illusion d'optique dans les ténèbres ? Tu n'as pas le courage d'attendre pour vérifier. L'unique issue est derrière toi.",
      sorties: { NORD: 3 },
      objets: [],
    },
    5: {
      nom: "Laboratoires de Sciences",
      zone: "2e étage · Bloc B",
      description:
        "La section « Biol. Chim. Phys. ». La lueur de la lune éclaire violemment les paillasses. Une odeur clinique et âcre de vieux produits chimiques pique le nez. La porte du Dépôt de Sciences est ouverte. Plus loin à l'EST, une passerelle vitrée file vers le Bloc H. À l'OUEST, le retour vers le carrefour.",
      sorties: { OUEST: 3, EST: 17 },
      objets: ["ruban_adhesif"],
    },
    6: {
      nom: "Carrefour Principal",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "Tu as descendu les marches. De minces faisceaux de lumière lunaire traversent la poussière en suspension. Les ombres des piliers s'étirent au sol telles des griffes. L'escalier remonte vers l'étage (HAUT). Autour de toi, quatre abysses : le couloir administratif au NORD, l'entrée de l'auditorium au SUD, la place publique 2 à l'OUEST, et la place publique 1 à l'EST.",
      sorties: { HAUT: 3, NORD: 10, SUD: 8, OUEST: 18, EST: 22 },
      objets: [],
    },
    7: {
      nom: "La Cafétéria",
      zone: "Rez-de-chaussée · Bloc C",
      description:
        "Une mer de 600 chaises renversées, formant un chaos géométrique terrifiant. L'immense salle du Bloc C est baignée dans une lueur bleutée maladive. Les comptoirs des cuisines au loin ressemblent à des autels abandonnés. Ton estomac se noue douloureusement. (Sorties : OUEST vers l'Aile C, NORD vers les cuisines).",
      sorties: { OUEST: 19, NORD: 21 },
      objets: ["barre_tendre"],
    },
    8: {
      nom: "L'Auditorium",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "La caverne. Une noirceur d'encre engloutit les rangées. Tes pas résonnent avec un écho démesuré qui te donne la nausée. Sur le mur de la scène de l'auditorium de 446 places, tu devines de larges lettres tracées à la hâte.",
      sorties: { NORD: 6 },
      objets: [],
    },
    10: {
      nom: "Couloir Administratif et Sortie",
      zone: "Rez-de-chaussée · Bloc A",
      description:
        "L'angoisse devient palpable. C'est le Bloc A, la Direction. Devant toi, les portes principales menant vers l'extérieur sont scellées par d'épaisses chaînes industrielles. À l'EST, la porte du Secrétariat est verrouillée par un lourd cadenas rouillé. Revenir au SUD est ta seule échappatoire immédiate.",
      sorties: { SUD: 6, EST: 11 },
      objets: [],
    },
    11: {
      nom: "Le Secrétariat",
      zone: "Rez-de-chaussée · Bloc A",
      description:
        "La panique s'est arrêtée ici. Les dossiers jonchent le sol du secrétariat comme des cadavres de papier. Le tiroir du bureau de la direction a été arraché à moitié.",
      sorties: { OUEST: 10 },
      objets: ["cle_principale"],
    },
    12: {
      nom: "Couloir des Gymnases",
      zone: "Rez-de-chaussée · Gymnases",
      description:
        "Un long couloir rectiligne file vers les gymnases. L'air sent le caoutchouc froid et la sueur ancienne. Les bruits de tes pas sont étouffés, comme si les murs de béton absorbaient le son. NORD : les vestiaires. SUD : le gymnase 1. EST : le Bloc H. OUEST : retour vers la place publique 1.",
      sorties: { OUEST: 22, NORD: 13, SUD: 14, EST: 20 },
      objets: [],
    },
    13: {
      nom: "Les Vestiaires",
      zone: "Rez-de-chaussée · Gymnases",
      description:
        "Aveuglant d'obscurité. Aucune fenêtre ne perce les vestiaires. Une odeur d'eau croupie monte des douches et, quelque part, une goutte tombe, régulière comme un métronome. Seule la sensation du carrelage glacé sous tes semelles te guide. C'est le ventre d'une bête morte. (Sortie : SUD).",
      sorties: { SUD: 12 },
      objets: ["tuyau_metal"],
      sombre: true,
    },
    14: {
      nom: "Le Gymnase 1",
      zone: "Rez-de-chaussée · Gymnases",
      description:
        "Le gymnase est si vaste que l'obscurité n'y a pas de fond. La lune tombe en colonnes obliques par les hautes fenêtres et découpe sur le plancher verni les lignes des terrains, comme le tracé d'un rituel oublié. Un seul ballon repose au centre, parfaitement immobile, comme si quelqu'un l'y avait déposé avec soin. (Sortie : NORD).",
      sorties: { NORD: 12 },
      objets: [],
    },
    15: {
      nom: "Couloir du Bloc F",
      zone: "Rez-de-chaussée · Bloc F",
      description:
        "Le couloir C103 te mène jusqu'au Bloc F, une aile basse et étroite accrochée au flanc de l'école. Les portes des classes F101 à F110 sont toutes fermées. Derrière leurs petites fenêtres, les pupitres alignés attendent des élèves qui ne viendront plus. Au bout du couloir, la cage d'escalier en demi-lune monte vers l'étage (HAUT). Au NORD, le retour vers l'Aile C.",
      sorties: { NORD: 19, HAUT: 16 },
      objets: [],
    },
    16: {
      nom: "L'Étage du Bloc F",
      zone: "2e étage · Bloc F",
      description:
        "Le couloir F200 est si étroit que tu pourrais toucher les deux murs en écartant les bras. Une odeur d'antiseptique flotte près du local F212. L'armoire de premiers soins pend, ouverte, son contenu éparpillé au sol comme si quelqu'un l'avait fouillée en pleine panique. Dans la classe F209, des mots tracés à la craie accrochent la lueur de la lune au tableau. L'escalier redescend (BAS).",
      sorties: { BAS: 15 },
      objets: ["baton_lumineux"],
    },
    17: {
      nom: "L'Étage du Bloc H",
      zone: "2e étage · Bloc H",
      description:
        "La passerelle débouche sur le Bloc H. Par les grandes fenêtres du couloir, le boulevard Robert s'étire, désert, sous un ciel qui ne ressemble à aucun ciel. Des voitures sont arrêtées en plein milieu de la chaussée, portières ouvertes, comme abandonnées en pleine course. Rien ne bouge. L'escalier du bout du couloir descend vers le rez-de-chaussée du Bloc H (BAS). À l'OUEST, le retour vers les laboratoires.",
      sorties: { OUEST: 5, BAS: 20 },
      objets: [],
    },
    18: {
      nom: "La Place Publique 2",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "La place publique 2 s'étend à flanc d'auditorium, immense et plate. Le jour, c'est le cœur bruyant de l'école ; cette nuit, c'est une plaine morte. Les rangées de casiers métalliques s'alignent en biais, à perte de vue. Quelques portes pendent, ouvertes, comme des bouches qui auraient voulu crier. Au SUD, le couloir de l'Aile C. À l'EST, le retour vers le carrefour principal.",
      sorties: { EST: 6, SUD: 19 },
      objets: [],
    },
    19: {
      nom: "L'Aile C",
      zone: "Rez-de-chaussée · Bloc C",
      description:
        "Un couloir étroit longe le flanc de la cafétéria. Les néons éteints pendent du plafond comme des ossements. Par les portes vitrées, à l'EST, tu devines la grande salle de la cafétéria. Au SUD, le couloir C103 s'enfonce vers le Bloc F. Au NORD, la place publique.",
      sorties: { NORD: 18, EST: 7, SUD: 15 },
      objets: [],
    },
    20: {
      nom: "Couloir du Bloc H",
      zone: "Rez-de-chaussée · Bloc H",
      description:
        "Le Bloc H. Derrière une grille baissée, le café étudiant H115 garde ses chaises retournées sur les tables, pattes en l'air, comme des insectes morts. Plus loin, les portes doubles du gymnase 6 sont entrouvertes sur un noir épais que tu préfères ne pas sonder. L'escalier monte vers l'étage du Bloc H (HAUT). À l'OUEST, le retour vers les gymnases.",
      sorties: { OUEST: 12, HAUT: 17 },
      objets: [],
    },
    21: {
      nom: "Les Cuisines",
      zone: "Rez-de-chaussée · Bloc C",
      description:
        "Les cuisines de la cafétéria. Inox, carrelage, crochets vides. Les chambres froides sont ouvertes et ne soufflent plus rien ; l'odeur de nourriture tournée te prend à la gorge. Sur le grand comptoir de découpe, les ustensiles ont été balayés au sol dans un éclat de panique. (La sortie est au SUD).",
      sorties: { SUD: 7 },
      objets: ["lame_lourde"],
    },
    22: {
      nom: "La Place Publique 1",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "Le reflet exact de l'autre place publique, de l'autre côté de l'auditorium. Les mêmes casiers en biais, le même vide immense. Sur le sol, un sac à dos éventré a vomi ses cahiers ; les pages tournent toutes seules, lentement, dans un courant d'air que tu ne sens pas. À l'EST, un long couloir mène aux gymnases. À l'OUEST, le carrefour principal.",
      sorties: { OUEST: 6, EST: 12 },
      objets: [],
    },
  };

  // Position de chaque lieu sur le plan de l'agenda : [étage, colonne, rangée, nom court].
  // Nord en haut ; une case par lieu.
  const PLAN = {
    1: ["etage", 3, 0, "A-217"],
    2: ["etage", 2, 0, "Couloir A-211"],
    3: ["etage", 2, 1, "Carrefour"],
    4: ["etage", 2, 2, "Balcon"],
    5: ["etage", 3, 1, "Labos"],
    17: ["etage", 4, 1, "Bloc H"],
    16: ["etage", 1, 3, "Bloc F"],
    10: ["rdc", 2, 0, "Direction"],
    11: ["rdc", 3, 0, "Secrétariat"],
    6: ["rdc", 2, 1, "Carrefour"],
    18: ["rdc", 1, 1, "Place pub. 2"],
    22: ["rdc", 3, 1, "Place pub. 1"],
    12: ["rdc", 4, 1, "Gymnases"],
    13: ["rdc", 4, 0, "Vestiaires"],
    14: ["rdc", 4, 2, "Gymnase 1"],
    20: ["rdc", 5, 1, "Bloc H"],
    8: ["rdc", 2, 2, "Auditorium"],
    21: ["rdc", 2, 3, "Cuisines"],
    7: ["rdc", 2, 4, "Cafétéria"],
    19: ["rdc", 1, 4, "Aile C"],
    15: ["rdc", 1, 5, "Bloc F"],
  };

  const LIEU_DEPART = 1;
  const LIEU_SORTIE = 10;
  const LIEU_SECRETARIAT = 11;
  const LIEU_AUDITORIUM = 8;
  const LIEU_TABLEAU = 16;

  // ==========================================
  // VOCABULAIRE DU PARSER
  // ==========================================
  const DIRECTIONS = {
    NORD: "NORD", N: "NORD",
    SUD: "SUD", S: "SUD",
    EST: "EST", E: "EST",
    OUEST: "OUEST", O: "OUEST", W: "OUEST",
    HAUT: "HAUT", H: "HAUT", MONTER: "HAUT", MONTE: "HAUT",
    BAS: "BAS", B: "BAS", DESCENDRE: "BAS", DESCENDS: "BAS",
  };
  const ORDRE_DIRECTIONS = ["NORD", "SUD", "EST", "OUEST", "HAUT", "BAS"];

  const VERBES = {
    ALLER: "ALLER", VA: "ALLER", VAS: "ALLER", AVANCER: "ALLER", MARCHER: "ALLER", AVANCE: "ALLER",
    PRENDRE: "PRENDRE", PRENDS: "PRENDRE", RAMASSER: "PRENDRE", RAMASSE: "PRENDRE", P: "PRENDRE",
    REGARDER: "REGARDER", REGARDE: "REGARDER", R: "REGARDER", EXAMINER: "REGARDER", EXAMINE: "REGARDER",
    OBSERVER: "REGARDER", OBSERVE: "REGARDER", X: "REGARDER", FOUILLER: "REGARDER", FOUILLE: "REGARDER",
    LIRE: "LIRE", LIS: "LIRE",
    COMBINER: "COMBINER", COMBINE: "COMBINER", ASSEMBLER: "COMBINER", ASSEMBLE: "COMBINER",
    FABRIQUER: "COMBINER", FABRIQUE: "COMBINER", FIXER: "COMBINER", FIXE: "COMBINER",
    MANGER: "MANGER", MANGE: "MANGER", AVALER: "MANGER", AVALE: "MANGER",
    FRAPPER: "FRAPPER", FRAPPE: "FRAPPER", FRACASSER: "FRAPPER", FRACASSE: "FRAPPER",
    BRISER: "FRAPPER", BRISE: "FRAPPER", CASSER: "FRAPPER", CASSE: "FRAPPER",
    UTILISER: "UTILISER", UTILISE: "UTILISER", U: "UTILISER",
    OUVRIR: "OUVRIR", OUVRE: "OUVRIR", DEVERROUILLER: "OUVRIR", DEVERROUILLE: "OUVRIR",
    CARTE: "CARTE", PLAN: "CARTE", M: "CARTE",
    ALLUMER: "ALLUMER", ALLUME: "ALLUMER", PLIER: "ALLUMER", PLIE: "ALLUMER", CRAQUER: "ALLUMER", CRAQUE: "ALLUMER",
    INVENTAIRE: "INVENTAIRE", INV: "INVENTAIRE", I: "INVENTAIRE",
    AIDE: "AIDE", "?": "AIDE", HELP: "AIDE",
  };

  const MOTS_VIDES = new Set([
    "LE", "LA", "LES", "L", "UN", "UNE", "DES", "DE", "DU", "D", "AU", "AUX",
    "A", "VERS", "SUR", "AVEC", "ET", "EN", "MON", "MA", "MES", "TON", "TA", "TES", "CE", "CETTE",
  ]);

  // Décors : mots reconnus mais qui ne sont pas des objets d'inventaire.
  const DECORS = {
    MUR: "MUR", MURS: "MUR", LETTRES: "MUR", INSCRIPTION: "MUR", INSCRIPTIONS: "MUR", SCENE: "MUR",
    CADENAS: "CADENAS",
    CHAINE: "CHAINES", CHAINES: "CHAINES", SERRURE: "CHAINES",
    PORTE: "PORTE", PORTES: "PORTE", SORTIE: "PORTE",
    SECRETARIAT: "SECRETARIAT",
    TABLEAU: "TABLEAU", CRAIE: "TABLEAU", MOTS: "TABLEAU",
  };

  function normaliser(texte) {
    return texte
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9?]+/g, " ")
      .trim();
  }

  function analyser(commande) {
    const mots = normaliser(commande).split(" ").filter(Boolean);
    if (mots.length === 0) return null;
    let verbe = null;
    let direction = null;
    const premier = mots[0];
    if (DIRECTIONS[premier] && mots.length === 1) {
      verbe = "ALLER";
      direction = DIRECTIONS[premier];
    } else if (VERBES[premier]) {
      verbe = VERBES[premier];
    } else if (DIRECTIONS[premier]) {
      verbe = "ALLER";
      direction = DIRECTIONS[premier];
    }
    const reste = mots.slice(1).filter((m) => !MOTS_VIDES.has(m));
    if (verbe === "ALLER" && !direction) {
      const d = reste.find((m) => DIRECTIONS[m]);
      if (d) direction = DIRECTIONS[d];
    }
    const objets = [];
    const decors = [];
    for (const m of reste) {
      for (const id in OBJETS) {
        if (OBJETS[id].mots.includes(m) && !objets.includes(id)) objets.push(id);
      }
      if (DECORS[m] && !decors.includes(DECORS[m])) decors.push(DECORS[m]);
    }
    return { verbe, direction, objets, decors, mots: reste, brut: commande };
  }

  // ==========================================
  // PARTIE
  // ==========================================
  class Partie {
    constructor() {
      this.lieu = LIEU_DEPART;
      this.inventaire = ["telephone_mort"];
      this.objetsParLieu = {};
      for (const id in LIEUX) this.objetsParLieu[id] = LIEUX[id].objets.slice();
      this.flags = { a_mange: false, arme_fabriquee: false, cadenas_brise: false, lumiere: false };
      this.visites = new Set([LIEU_DEPART]);
      this.poursuite = 0; // tours restants avant que la chose n'arrive (0 = pas de poursuite)
      this.tour = 0;
      this.evenementVu = false;
      this.termine = false;
    }

    // Sortie : liste de blocs { type, texte } que l'interface affiche.
    demarrer() {
      return [
        ...OUVERTURE.map((t) => ({ type: "ouverture", texte: t })),
        ...this.decrireLieu(),
      ];
    }

    dansLeNoir() {
      return Boolean(LIEUX[this.lieu].sombre) && !this.flags.lumiere;
    }

    possede(id) {
      return this.inventaire.includes(id);
    }

    retirer(id) {
      this.inventaire = this.inventaire.filter((x) => x !== id);
    }

    sortiesVisibles() {
      const sorties = LIEUX[this.lieu].sorties;
      return ORDRE_DIRECTIONS.filter((d) => d in sorties).map((d) => {
        if (this.lieu === LIEU_SORTIE && sorties[d] === LIEU_SECRETARIAT && !this.flags.cadenas_brise) {
          return d + " (verrouillée)";
        }
        return d;
      });
    }

    decrireLieu() {
      const lieu = LIEUX[this.lieu];
      const blocs = [
        { type: "lieu", texte: lieu.nom, zone: lieu.zone },
        { type: "texte", texte: lieu.description },
      ];
      const ici = this.objetsParLieu[this.lieu];
      if (this.dansLeNoir()) {
        blocs.push({ type: "objets", texte: "Il fait trop noir pour distinguer quoi que ce soit." });
      } else if (ici.length) {
        blocs.push({
          type: "objets",
          texte: "Tu distingues ici : " + ici.map((id) => OBJETS[id].enPlace).join(", ") + ".",
        });
      }
      blocs.push({ type: "sorties", texte: "Sorties : " + this.sortiesVisibles().join(" · ") });
      return blocs;
    }

    executer(commande) {
      if (this.termine) {
        return [{ type: "systeme", texte: "La nuit est terminée. Tape REJOUER pour recommencer." }];
      }
      const c = analyser(commande);
      if (!c) return [];

      if (c.verbe === "AIDE") return this.aide();

      this.tour += 1;
      const enPoursuite = this.poursuite > 0;
      const blocs = this.traiter(c);

      if (enPoursuite && !this.termine) {
        this.poursuite -= 1;
        if (this.poursuite === 0) return blocs.concat(this.mort());
        if (this.poursuite === 3) blocs.push({ type: "evenement", texte: TEXTE_PAS_LOINTAINS });
        if (this.poursuite === 1) blocs.push({ type: "evenement", texte: TEXTE_PAS_PROCHES });
      }

      if (this.tour === TOUR_EVENEMENT && !this.evenementVu && !this.termine) {
        this.evenementVu = true;
        blocs.push({ type: "evenement", texte: EVENEMENT_TOUR_5 });
      }
      return blocs;
    }

    traiter(c) {
      switch (c.verbe) {
        case "ALLER": return this.aller(c);
        case "PRENDRE": return this.prendre(c);
        case "REGARDER": return this.regarder(c);
        case "LIRE": return this.lire(c);
        case "COMBINER": return this.combiner(c);
        case "MANGER": return this.manger(c);
        case "FRAPPER": return this.frapper(c);
        case "UTILISER": return this.utiliser(c);
        case "OUVRIR": return this.ouvrir(c);
        case "ALLUMER": return this.allumer(c);
        case "CARTE": return this.carte();
        case "INVENTAIRE": return this.afficherInventaire();
        default:
          return [sys("Je ne comprends pas. Tape AIDE pour la liste des commandes.")];
      }
    }

    aide() {
      return [
        sys(
          "Déplacements : NORD, SUD, EST, OUEST, HAUT, BAS (ou N, S, E, O, H, B). " +
            "Actions : PRENDRE, REGARDER, LIRE, COMBINER, MANGER, FRAPPER, UTILISER, OUVRIR, ALLUMER. " +
            "INVENTAIRE (ou I) pour voir ce que tu portes. CARTE pour consulter le plan de ton agenda."
        ),
      ];
    }

    aller(c) {
      if (!c.direction) return [sys("Aller où ? (NORD, SUD, EST, OUEST, HAUT, BAS)")];
      const dest = LIEUX[this.lieu].sorties[c.direction];
      if (dest === undefined) return [sys("Tu ne peux pas aller par là.")];
      if (this.lieu === LIEU_SORTIE && dest === LIEU_SECRETARIAT && !this.flags.cadenas_brise) {
        return [{ type: "texte", texte: "La porte du Secrétariat est verrouillée par un lourd cadenas rouillé." }];
      }
      this.lieu = dest;
      this.visites.add(dest);
      return this.decrireLieu();
    }

    prendre(c) {
      if (c.objets.length === 0) return [sys("Prendre quoi ?")];
      const blocs = [];
      for (const id of c.objets) {
        const ici = this.objetsParLieu[this.lieu];
        if (this.dansLeNoir() && ici.includes(id)) {
          blocs.push({ type: "texte", texte: TEXTE_NOIR_ABSOLU });
          continue;
        }
        if (this.possede(id)) {
          blocs.push(sys("Tu as déjà " + OBJETS[id].nom + "."));
        } else if (ici.includes(id)) {
          this.objetsParLieu[this.lieu] = ici.filter((x) => x !== id);
          this.inventaire.push(id);
          blocs.push(sys("Pris : " + OBJETS[id].nom + "."));
        } else {
          blocs.push(sys("Il n'y a pas de " + OBJETS[id].nom + " ici."));
        }
      }
      return blocs;
    }

    regarder(c) {
      if (c.objets.length === 0 && c.decors.length === 0) return this.decrireLieu();
      if (c.objets.length) {
        const id = c.objets[0];
        if (id === "agenda" && this.possede(id) && c.mots.some((m) => m === "CARTE" || m === "PLAN")) return this.carte();
        if (this.possede(id) || this.objetsParLieu[this.lieu].includes(id)) {
          return [{ type: "texte", texte: OBJETS[id].description }];
        }
        return [sys("Il n'y a pas de " + OBJETS[id].nom + " ici.")];
      }
      const decor = c.decors[0];
      if (decor === "MUR" && this.lieu === LIEU_AUDITORIUM) return this.lire(c);
      if (decor === "TABLEAU" && this.lieu === LIEU_TABLEAU) return this.lire(c);
      if (this.lieu === LIEU_SORTIE) {
        if (decor === "CADENAS" || decor === "SECRETARIAT") {
          return [{
            type: "texte",
            texte: this.flags.cadenas_brise
              ? "La porte du secrétariat s'entrouvre."
              : "À l'EST, la porte du Secrétariat est verrouillée par un lourd cadenas rouillé.",
          }];
        }
        if (decor === "CHAINES" || decor === "PORTE") {
          return [{ type: "texte", texte: "Devant toi, les portes principales menant vers l'extérieur sont scellées par d'épaisses chaînes industrielles." }];
        }
      }
      return [sys("Tu ne vois rien de particulier.")];
    }

    lire(c) {
      if (c.objets.includes("agenda")) return this.carte();
      if (this.lieu === LIEU_AUDITORIUM && (c.decors.includes("MUR") || c.objets.length === 0)) {
        return [{ type: "mural", texte: TEXTE_MURAL }];
      }
      if (this.lieu === LIEU_TABLEAU && (c.decors.includes("TABLEAU") || c.objets.length === 0)) {
        return [{ type: "mural", texte: TEXTE_TABLEAU }];
      }
      return [sys("Il n'y a rien à lire ici.")];
    }

    combiner(c) {
      if (this.flags.arme_fabriquee) return [sys("Ton arme est déjà assemblée.")];
      const veutArme =
        (c.objets.includes("tuyau_metal") && c.objets.includes("lame_lourde")) ||
        c.objets.includes("arme_artisanale");
      if (!veutArme) return [sys("Combiner quoi avec quoi ?")];
      if (!this.possede("tuyau_metal") || !this.possede("lame_lourde")) {
        return [sys("Il te manque une des pièces.")];
      }
      if (!this.possede("ruban_adhesif")) {
        return [{ type: "texte", texte: TEXTE_COMBINER_SANS_RUBAN }];
      }
      this.retirer("tuyau_metal");
      this.retirer("lame_lourde");
      this.retirer("ruban_adhesif");
      this.inventaire.push("arme_artisanale");
      this.flags.arme_fabriquee = true;
      return [{ type: "texte", texte: TEXTE_COMBINER_REUSSI }];
    }

    manger(c) {
      if (c.objets.length === 0) return [sys("Manger quoi ?")];
      if (!c.objets.includes("barre_tendre")) return [sys("Ça ne se mange pas.")];
      const ici = this.objetsParLieu[this.lieu];
      if (this.possede("barre_tendre")) {
        this.retirer("barre_tendre");
      } else if (ici.includes("barre_tendre")) {
        this.objetsParLieu[this.lieu] = ici.filter((x) => x !== "barre_tendre");
      } else {
        return [sys("Tu n'as rien à manger.")];
      }
      this.flags.a_mange = true;
      return [{ type: "texte", texte: TEXTE_MANGER }];
    }

    frapper(c) {
      if (c.objets.includes("baton_lumineux")) return this.allumer(c);
      const cible = c.decors.includes("CADENAS") || c.decors.includes("SECRETARIAT") ||
        (c.objets.includes("arme_artisanale") && this.lieu === LIEU_SORTIE);
      if (!cible) {
        if (c.mots.length === 0 && this.lieu !== LIEU_SORTIE) return [sys("Frapper quoi ?")];
        if (c.mots.length === 0 && this.lieu === LIEU_SORTIE) return this.frapperCadenas();
        return [sys("Frapper ça ne servirait à rien.")];
      }
      if (this.lieu !== LIEU_SORTIE) return [sys("Il n'y a pas de cadenas ici.")];
      return this.frapperCadenas();
    }

    frapperCadenas() {
      if (this.flags.cadenas_brise) return [sys("Le cadenas est déjà brisé.")];
      if (!this.possede("arme_artisanale")) {
        return [sys("Tu n'as rien d'assez solide pour briser ce cadenas.")];
      }
      if (!this.flags.a_mange) return [{ type: "texte", texte: TEXTE_FRAPPER_FAIBLE }];
      this.flags.cadenas_brise = true;
      this.poursuite = DELAI_POURSUITE;
      return [
        { type: "choc", texte: TEXTE_FRAPPER_REUSSI },
        { type: "evenement", texte: TEXTE_ALERTE },
      ];
    }

    utiliser(c) {
      if (c.objets.length === 0) return [sys("Utiliser quoi ?")];
      const id = c.objets[0];
      if (!this.possede(id)) {
        if (id === "barre_tendre" && this.objetsParLieu[this.lieu].includes(id)) return this.manger(c);
        return [sys("Tu n'as pas " + OBJETS[id].nom + ".")];
      }
      switch (id) {
        case "cle_principale":
          if (this.lieu === LIEU_SORTIE) return this.victoire();
          return [sys("Il n'y a rien à ouvrir ici.")];
        case "arme_artisanale":
          if (this.lieu === LIEU_SORTIE) return this.frapperCadenas();
          return [sys("Il n'y a rien à frapper ici.")];
        case "barre_tendre":
          return this.manger(c);
        case "baton_lumineux":
          return this.allumer(c);
        case "agenda":
          return this.carte();
        case "telephone_mort":
          return [{ type: "texte", texte: this.evenementVu ? "L'écran est mort." : OBJETS.telephone_mort.description }];
        case "tuyau_metal":
        case "lame_lourde":
        case "ruban_adhesif":
          return [sys("Seul, ça ne sert à rien. Essaie de COMBINER.")];
        default:
          return [sys("Rien ne se passe.")];
      }
    }

    ouvrir(c) {
      if (this.lieu === LIEU_SORTIE) {
        if (c.decors.includes("SECRETARIAT") || c.decors.includes("CADENAS")) {
          return this.flags.cadenas_brise
            ? [sys("La porte du secrétariat est déjà ouverte.")]
            : [{ type: "texte", texte: "La porte du Secrétariat est verrouillée par un lourd cadenas rouillé." }];
        }
        if (this.possede("cle_principale")) return this.victoire();
        return [{ type: "texte", texte: "Les portes principales menant vers l'extérieur sont scellées par d'épaisses chaînes industrielles." }];
      }
      return [sys("Il n'y a rien à ouvrir ici.")];
    }

    carte() {
      if (!this.possede("agenda")) return [sys("Tu n'as pas de plan de l'école. Ton agenda en contient un.")];
      if (this.dansLeNoir()) return [sys("Il fait trop noir pour lire quoi que ce soit.")];
      const lieux = [...this.visites].filter((id) => PLAN[id]).map((id) => {
        const [etage, x, y, nom] = PLAN[id];
        const s = LIEUX[id].sorties;
        const vertical = ["HAUT", "BAS"].some((d) => s[d] !== undefined && this.visites.has(s[d]));
        return { id, etage, x, y, nom, actuel: id === this.lieu, vertical };
      });
      const liens = [];
      for (const id of this.visites) {
        for (const [d, dest] of Object.entries(LIEUX[id].sorties)) {
          if (d === "HAUT" || d === "BAS" || !this.visites.has(dest) || id > dest) continue;
          if (PLAN[id] && PLAN[dest] && PLAN[id][0] === PLAN[dest][0]) liens.push([id, dest]);
        }
      }
      return [
        { type: "texte", texte: "Tu ouvres ton agenda sur le plan de l'école. Tu n'y repères que les endroits où tu es déjà passé." },
        { type: "carte", texte: "Plan de l'école (lieux visités).", etageActuel: PLAN[this.lieu][0], lieux, liens },
      ];
    }

    allumer(c) {
      if (c.objets.length && !c.objets.includes("baton_lumineux")) return [sys("Ça ne s'allume pas.")];
      if (!this.possede("baton_lumineux")) return [sys("Tu n'as rien pour faire de la lumière.")];
      if (this.flags.lumiere) return [sys("Le bâton luit déjà dans ta main.")];
      this.flags.lumiere = true;
      const blocs = [{ type: "texte", texte: TEXTE_ALLUMER }];
      if (LIEUX[this.lieu].sombre) blocs.push(...this.decrireLieu());
      return blocs;
    }

    afficherInventaire() {
      return [sys("Tu portes : " + this.inventaire.map((id) => OBJETS[id].nom).join(", ") + ".")];
    }

    mort() {
      this.termine = true;
      return [
        { type: "mort", texte: TEXTE_MORT[0] },
        { type: "coupure", texte: TEXTE_MORT[1] },
        { type: "finmort", texte: TEXTE_MORT[2] },
      ];
    }

    victoire() {
      this.termine = true;
      return [
        { type: "victoire", texte: TEXTE_VICTOIRE[0] },
        { type: "coupure", texte: TEXTE_VICTOIRE[1] },
        { type: "fin", texte: TEXTE_VICTOIRE[2] },
      ];
    }

    etat() {
      return {
        lieu: this.lieu,
        inventaire: this.inventaire.slice(),
        flags: Object.assign({}, this.flags),
        tour: this.tour,
        termine: this.termine,
        poursuite: this.poursuite,
      };
    }
  }

  function sys(texte) {
    return { type: "systeme", texte };
  }

  const api = { Partie, LIEUX, OBJETS, analyser, normaliser };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.NuitStEx = api;
})(typeof window !== "undefined" ? window : globalThis);
