/*
 * La Nuit à St-Ex — moteur d'aventure textuelle (parser).
 *
 * Aucun texte narratif n'est généré : toutes les descriptions et réponses
 * proviennent du document de conception. Seuls de courts messages
 * « système » (commande inconnue, objet absent, etc.) sont propres au moteur.
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
      enPlace: "un tuyau de métal (lourd et solide)",
      description: "Un tuyau de métal, lourd et solide.",
      mots: ["TUYAU", "METAL"],
      prenable: true,
    },
    lame_lourde: {
      nom: "lame lourde",
      enPlace: "une lame lourde (une lame de cisailles tranchante)",
      description: "Une lame lourde : une lame de cisailles tranchante.",
      mots: ["LAME", "CISAILLES", "CISAILLE"],
      prenable: true,
    },
    cle_principale: {
      nom: "clé principale",
      enPlace: "la clé principale",
      description: "La clé principale. La clé de la sortie.",
      mots: ["CLE", "CLEF", "CLES"],
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
      objets: [],
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
        "La section « Biol. Chim. Phys. ». La lueur de la lune éclaire violemment les paillasses. Une odeur clinique et âcre de vieux produits chimiques pique le nez. La porte du Dépôt de Sciences est ouverte.",
      sorties: { OUEST: 3 },
      objets: ["ruban_adhesif"],
    },
    6: {
      nom: "Carrefour Principal",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "Tu as descendu les marches. De minces faisceaux de lumière lunaire traversent la poussière en suspension. Les ombres des piliers s'étirent au sol telles des griffes. L'escalier remonte vers l'étage (HAUT). Autour de toi, trois abysses : le couloir administratif au NORD, l'entrée de l'auditorium au SUD, et les ateliers à l'EST.",
      sorties: { HAUT: 3, NORD: 10, SUD: 8, EST: 12 },
      objets: [],
    },
    7: {
      nom: "La Cafétéria",
      zone: "Rez-de-chaussée · Bloc C",
      description:
        "Une mer de 600 chaises renversées, formant un chaos géométrique terrifiant. L'immense salle du Bloc C est baignée dans une lueur bleutée maladive. Les comptoirs des cuisines au loin ressemblent à des autels abandonnés. Ton estomac se noue douloureusement. (La sortie est au NORD).",
      sorties: { NORD: 8 },
      objets: ["barre_tendre"],
    },
    8: {
      nom: "L'Auditorium",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "La caverne. Une noirceur d'encre engloutit les rangées. Tes pas résonnent avec un écho démesuré qui te donne la nausée. Sur le mur de la scène de l'auditorium de 446 places, tu devines de larges lettres tracées à la hâte.",
      sorties: { NORD: 6, SUD: 7 },
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
      nom: "Carrefour des Ateliers",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "L'air sent la graisse froide et la rouille. C'est le couloir des ateliers. Les bruits de tes pas sont étouffés, comme si les murs de béton absorbaient le son. NORD : L'Atelier de Mécanique. SUD : La Chaufferie. OUEST : Retour vers le carrefour central.",
      sorties: { OUEST: 6, NORD: 13, SUD: 14 },
      objets: [],
    },
    13: {
      nom: "L'Atelier de Mécanique",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "Aveuglant d'obscurité. Aucune fenêtre ne perce l'atelier d'automobile et de mécanique. Seule la sensation du métal glacé des ponts élévateurs t'entoure. C'est le ventre d'une bête morte.",
      sorties: { SUD: 12 },
      objets: ["tuyau_metal"],
    },
    14: {
      nom: "La Chaufferie",
      zone: "Rez-de-chaussée · Bloc B",
      description:
        "Une salle des machines oppressante. Les gigantesques chaudières sont d'immenses silhouettes fantomatiques. Un silence si lourd qu'il te fait bourdonner les tympans.",
      sorties: { NORD: 12 },
      objets: ["lame_lourde"],
    },
  };

  const LIEU_DEPART = 1;
  const LIEU_SORTIE = 10;
  const LIEU_SECRETARIAT = 11;
  const LIEU_AUDITORIUM = 8;

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
      this.flags = { a_mange: false, arme_fabriquee: false, cadenas_brise: false };
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
      if (ici.length) {
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
      const blocs = this.traiter(c);

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
        case "INVENTAIRE": return this.afficherInventaire();
        default:
          return [sys("Je ne comprends pas. Tape AIDE pour la liste des commandes.")];
      }
    }

    aide() {
      return [
        sys(
          "Déplacements : NORD, SUD, EST, OUEST, HAUT, BAS (ou N, S, E, O, H, B). " +
            "Actions : PRENDRE, REGARDER, LIRE, COMBINER, MANGER, FRAPPER, UTILISER, OUVRIR. " +
            "INVENTAIRE (ou I) pour voir ce que tu portes."
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
      return this.decrireLieu();
    }

    prendre(c) {
      if (c.objets.length === 0) return [sys("Prendre quoi ?")];
      const blocs = [];
      for (const id of c.objets) {
        const ici = this.objetsParLieu[this.lieu];
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
        if (this.possede(id) || this.objetsParLieu[this.lieu].includes(id)) {
          return [{ type: "texte", texte: OBJETS[id].description }];
        }
        return [sys("Il n'y a pas de " + OBJETS[id].nom + " ici.")];
      }
      const decor = c.decors[0];
      if (decor === "MUR" && this.lieu === LIEU_AUDITORIUM) return this.lire(c);
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
      if (this.lieu === LIEU_AUDITORIUM && (c.decors.includes("MUR") || c.objets.length === 0)) {
        return [{ type: "mural", texte: TEXTE_MURAL }];
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
      return [{ type: "choc", texte: TEXTE_FRAPPER_REUSSI }];
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

    afficherInventaire() {
      return [sys("Tu portes : " + this.inventaire.map((id) => OBJETS[id].nom).join(", ") + ".")];
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
