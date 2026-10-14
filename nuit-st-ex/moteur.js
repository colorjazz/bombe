/*
 * La Nuit à St-Ex — moteur d'aventure textuelle (parser).
 *
 * Aucun texte narratif n'est généré à la volée : toutes les descriptions et
 * réponses sont écrites ici. Seuls de courts messages « système » (commande
 * inconnue, objet absent, etc.) sont propres au moteur.
 *
 * Les réponses des énigmes ne figurent pas en clair dans ce fichier : seules
 * leurs empreintes SHA-256 y sont. La phrase de récompense est chiffrée avec
 * une clé tirée de ces réponses ; elle ne se déchiffre qu'en gagnant.
 *
 * Utilisable dans le navigateur (window.NuitStEx) et dans Node (require).
 */
(function (global) {
  "use strict";

  // ==========================================
  // SHA-256 (synchrone, pour le navigateur comme pour Node)
  // ==========================================
  const SHA = (() => {
    const k = [];
    const h = [];
    const premier = (n) => {
      for (let f = 2; f * f <= n; f++) if (n % f === 0) return false;
      return true;
    };
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    for (let n = 2; k.length < 64; n++) {
      if (!premier(n)) continue;
      if (h.length < 8) h.push(frac(Math.pow(n, 1 / 2)));
      k.push(frac(Math.pow(n, 1 / 3)));
    }
    return { k, h };
  })();

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  function sha256(octets) {
    const { k } = SHA;
    const h = SHA.h.slice();
    const bits = octets.length * 8;
    const m = octets.concat([0x80]);
    while (m.length % 64 !== 56) m.push(0);
    for (let i = 7; i >= 0; i--) m.push(Math.floor(bits / Math.pow(2, 8 * i)) & 0xff);
    const w = new Array(64);
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) {
        w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    const sortie = [];
    for (const x of h) sortie.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
    return sortie;
  }

  const utf8 = (s) => Array.from(new TextEncoder().encode(s));
  const hex = (octets) => octets.map((x) => x.toString(16).padStart(2, "0")).join("");
  const empreinte = (s) => hex(sha256(utf8(s)));

  // Chiffrement symétrique par flux : octet i XOR sha256(cle + ":" + bloc).
  function chiffrer(octets, cle) {
    const sortie = [];
    for (let i = 0; i < octets.length; i++) {
      const bloc = sha256(utf8(cle + ":" + Math.floor(i / 32)));
      sortie.push(octets[i] ^ bloc[i % 32]);
    }
    return sortie;
  }

  function dechiffrer(hexa, cle) {
    const octets = hexa.match(/../g).map((x) => parseInt(x, 16));
    return new TextDecoder().decode(new Uint8Array(chiffrer(octets, cle)));
  }

  // ==========================================
  // TEXTES
  // ==========================================
  // Les textes s'adressent à « tu » sans jamais supposer si le joueur est un garçon ou une fille.
  const OUVERTURE = [
    "La surface rugueuse et froide du pupitre contre ta joue te sort d'un sommeil de plomb. Tu clignes des yeux. Ta nuque est raide. L'obscurité est presque totale. Tu te redresses d'un coup, le cœur battant à tout rompre. Tu reconnais la pièce. Le local A-217. La classe de M. Plante.",
    "Le sommeil t'a eu en plein cours, un sommeil si lourd que rien n'a pu t'en tirer. M. Plante n'est plus là. L'école secondaire Antoine-de-Saint-Exupéry est plongée dans un silence de mort, brisé seulement par ta propre respiration, courte et rapide. À travers la fenêtre, le ciel de la nuit est figé. Plus de lumières de la ville, plus de bourdonnement de ventilation, plus de bruit de circulation. Le monde que tu connaissais s'est éteint pendant que tu dormais. Personne d'autre ici. Du moins, tu l'espères.",
  ];

  // Le texto du tour 5, en trois temps : la vibration, le message, le noir.
  const TEXTO_AVANT =
    "Une vibration soudaine et violente contre ta cuisse te fait sursauter. Ton téléphone s'illumine. La lumière crue te brûle les yeux. Batterie : 1 %. Un seul message non lu :";
  const TEXTO = { de: "Numéro inconnu", message: "Ne fais pas de bruit. Surtout, ne les laisse pas t'en..." };
  const TEXTO_APRES =
    "L'écran meurt d'un coup. Le noir total revient. Tu n'as pas rêvé. Quelque chose est là, avec toi.";
  const TOUR_EVENEMENT = 5;

  const TEXTE_TELEPHONE_MORT =
    "L'écran reste noir. Tu appuies sur le bouton, longtemps. Rien. Le message tourne en boucle dans ta tête : « Ne fais pas de bruit. Surtout, ne les laisse pas t'en... » T'entendre. Ne les laisse pas t'entendre.";

  const TEXTE_MANGER =
    "Tu déchires l'emballage et tu avales la barre en trois bouchées. C'est sec, mais le sucre réveille tes muscles engourdis. Tu regagnes un peu de force.";

  const TEXTE_FRAPPER_FAIBLE =
    "Tu frappes, mais la faim et le froid paralysent tes muscles. Tes mains tremblent. Tu es trop faible. Il te faut trouver de l'énergie avant d'essayer à nouveau.";

  const TEXTE_FRAPPER_REUSSI =
    "Avec un cri qui vient du fond du ventre, tu abats ton arme de fortune sur le cadenas. Le métal hurle et la charnière explose. La porte du secrétariat s'entrouvre.";

  const TEXTE_COMBINER_SANS_RUBAN =
    "Tu as les deux pièces, mais rien pour les faire tenir ensemble. Si tu frappes avec ça, la lame va s'envoler.";

  const TEXTE_COMBINER_REUSSI =
    "Les mains tremblantes, tu utilises le ruban adhésif industriel pour fixer la lame lourde au bout du tuyau de métal. C'est grossier, c'est barbare, mais tu as maintenant une arme redoutable.";

  const TEXTE_ALLUMER =
    "Tu plies le bâton entre tes doigts. Un craquement sec, puis une lueur verte, chimique, maladive, éclabousse tes mains. C'est faible. C'est assez.";

  const TEXTE_TATONNER =
    "Tu tâtonnes sur le carrelage glacé. Tes doigts frôlent un long morceau de métal, mais impossible de savoir ce que c'est, ni s'il y a autre chose. Il te faudrait de la lumière.";
  const TEXTE_NOIR_ABSOLU =
    "Tu tâtonnes dans le noir absolu. Tes doigts ne rencontrent que du carrelage glacé et des arêtes coupantes. Sans lumière, tu ne trouveras rien ici.";

  const TEXTE_ALERTE =
    "Puis le silence revient. Mais ce n'est plus le même silence. Quelque part dans les profondeurs de l'école, quelque chose a entendu.";

  const TEXTE_PAS_LOINTAINS =
    "Des pas. Lointains, irréguliers. Ils traînent sur les tuiles, quelque part du côté de l'auditorium.";

  const TEXTE_PAS_PROCHES =
    "Les pas se rapprochent. Tu entends maintenant une respiration rauque, mouillée, qui n'a rien d'humain. Il te reste très peu de temps.";

  // Actions laissées au joueur entre le fracas du cadenas et l'arrivée de la chose.
  // Regarder, lire et consulter ne comptent pas : seuls les gestes qui prennent du temps.
  const DELAI_POURSUITE = 9;

  // Une ligne par action après le fracas, selon les actions qui restent (jamais sautée).
  const COMPTE_A_REBOURS = {
    8: "Rien. Seulement ton cœur, qui cogne jusque dans tes oreilles.",
    7: "Très loin, dans les profondeurs de l'école, un choc sourd. Puis un autre. Une porte qu'on enfonce.",
    6: TEXTE_PAS_LOINTAINS,
    5: "D'autres pas répondent aux premiers. Ils viennent de plusieurs directions à la fois.",
    4: "Plus rien. Ils se sont arrêtés. Ils écoutent. Puis les pas reprennent, plus vite.",
    3: TEXTE_PAS_PROCHES,
    2: "Une ombre passe devant la lueur de la lune, au bout du couloir. Puis une deuxième.",
    1: "Ils sont là. Juste là. Ne te retourne pas.",
  };

  const MORT_POURSUITE =
    "Tu n'as pas le temps de te retourner. Une main glacée se referme sur ta nuque. Le sol se dérobe. Le noir t'avale d'un seul coup, et le silence se referme sur toi comme une eau profonde.";

  const MORT_PORTE_SECOURS =
    "Tu pèses de tout ton poids sur la barre de la porte de secours. Elle cède, et l'alarme incendie se déclenche : un hurlement électronique qui remplit chaque couloir, chaque classe, chaque recoin. Dehors, des dizaines de silhouettes se retournent d'un même mouvement. Puis elles courent. Elles ne courent pas comme des gens.";

  const MORT_ALARME =
    "Tu abaisses la poignée rouge de l'avertisseur. La sonnerie incendie éclate dans toute l'école, stridente, interminable. Tu viens d'allumer un phare dans la nuit. Ils arrivent de partout à la fois.";

  const MORT_FENETRE =
    "Le verre explose dans un fracas cristallin. L'écho roule dans tout le bâtiment, d'un bout à l'autre. Une seconde de silence. Puis, de partout à la fois, des pas qui accourent.";

  const MORT_GYM6 =
    "Tu pousses les portes doubles du gymnase 6. Elles grincent, à peine. Dans le noir, les respirations s'arrêtent toutes en même temps. Puis, lentement, des centaines de têtes se tournent vers toi.";

  const MORT_RENCONTRE =
    "La tête se redresse d'un coup. Puis elle pivote vers toi, lentement, beaucoup plus loin qu'un cou ne devrait pouvoir tourner. La silhouette enjambe les chaises sans en toucher une seule. Tu n'as même pas le temps de reculer.";

  const MORT_CUISINES =
    "Tu avances entre les chaises, un pas, puis un autre. À mi-chemin, ton pied accroche une patte de chaise. Un raclement minuscule. La silhouette se retourne d'un seul mouvement. Elle n'a plus de visage, seulement une bouche. Tu n'as même pas le temps de lever les bras.";

  const MORT_CRI =
    "Cette fois, tu cries. Ta voix rebondit de mur en mur, d'un bout à l'autre de l'école, beaucoup plus fort que tu ne l'aurais cru. Puis le silence revient. Il ne dure pas. Des portes s'ouvrent, partout à la fois, et quelque chose dévale les escaliers.";

  // Après chaque mort, ce qu'on en retient : on apprend, on a envie de recommencer.
  const INDICES_MORT = new Map([
    [MORT_POURSUITE, "Après le coup sur le cadenas, tu n'as que quelques gestes. Regarder, lire et consulter ne coûtent rien ; marcher, prendre et composer, oui. Connais le code du coffre AVANT de frapper."],
    [MORT_PORTE_SECOURS, "L'alarme les appelle tous. Les portes de secours, c'est la mort."],
    [MORT_ALARME, "L'alarme les appelle tous. Ne touche jamais aux avertisseurs."],
    [MORT_FENETRE, "Ici, le moindre fracas s'entend d'un bout à l'autre de l'école."],
    [MORT_GYM6, "Certaines portes entrouvertes doivent le rester."],
    [MORT_RENCONTRE, "Ils ne voient pas dans le noir, mais ils entendent tout. Quand l'un d'eux est là : ne bouge plus, ATTENDS. Ou fais du bruit ailleurs."],
    [MORT_CUISINES, "Ils ne voient pas dans le noir, mais ils entendent tout. Quand l'un d'eux est là : ne bouge plus, ATTENDS. Ou fais du bruit ailleurs."],
    [MORT_CRI, "Ils ne voient pas dans le noir. Mais ils entendent tout."],
  ]);

  const TEXTE_FIN_MORT = ["COUPURE AU NOIR.", "LA NUIT A GAGNÉ."];
  const TEXTE_REPRISE = (lieu) =>
    `Tu rouvres les yeux d'un coup, le souffle court. ${lieu}, un peu plus tôt. Ce n'était qu'un cauchemar. Pour l'instant.`;

  // Pièges en deux temps : la première fois, on voit et on recule. Ensuite, c'est un choix.
  const AVERTISSEMENTS = {
    secours: [
      "Tu poses les mains sur la barre de la porte de secours. Un autocollant rouge, à hauteur des yeux : « PORTE SOUS ALARME ». Derrière la vitre grillagée, des silhouettes immobiles, toutes tournées vers l'école. Tu retires tes mains très lentement.",
      "⚠ Cette porte déclenche l'alarme. Si tu la pousses, c'est fini.",
    ],
    gym6: [
      "Tu t'approches des portes doubles entrouvertes, juste assez pour glisser un œil dans l'entrebâillement. D'abord, tu ne vois rien. Puis tes yeux s'habituent. Le noir, à l'intérieur, n'est pas vide. Il est plein. Plein de corps debout, immobiles, serrés les uns contre les autres. Des centaines. Aucun ne bouge. Tu recules d'un pas, puis d'un autre, sans respirer.",
      "⚠ Tu sais maintenant ce qu'il y a là-dedans. Si tu entres, tu ne ressortiras pas.",
    ],
    alarme: [
      "Ta main se pose sur la poignée rouge : « EN CAS D'INCENDIE, ABAISSER ». Tu imagines la sirène dans toute l'école, cette nuit. Ta main tremble. Tu la retires.",
      "⚠ Si tu l'abaisses, toute l'école l'entendra.",
    ],
    fenetre: [
      "Tu lèves le bras vers la vitre. Briser du verre, ici, cette nuit, ce serait hurler « JE SUIS LÀ ». Ton bras retombe.",
      "⚠ Si tu frappes la vitre, ils accourront.",
    ],
    cri: [
      "Tu ouvres la bouche pour appeler à l'aide. Au dernier moment, quelque chose t'en empêche : un instinct très ancien, venu du fond de ton ventre. Le cri meurt dans ta gorge.",
      "⚠ Ici, la nuit, on ne crie pas.",
    ],
    rencontre_barre: [
      "Tes doigts se referment sur la barre tendre. L'emballage crisse. La tête de la silhouette pivote d'un coup vers toi. Tu te figes, la main en l'air, puis tu la retires très lentement. Une seconde. Deux. La tête revient vers les cuisines.",
      "⚠ Le moindre bruit, et elle sera sur toi.",
    ],
    rencontre_cuisines: [
      "Tu fais un pas vers la porte battante. Il faudrait passer à un mètre d'elle, entre les chaises renversées. Ton cœur cogne si fort que tu as peur qu'elle l'entende. Tu recules.",
      "⚠ Pour atteindre les cuisines, il faudrait la frôler.",
    ],
    rencontre_cri: [
      "Le cri monte dans ta gorge. Tu plaques ta main sur ta bouche juste à temps. Au fond de la salle, la tête de la silhouette se redresse, lentement.",
      "⚠ Un son de plus, et elle sera sur toi.",
    ],
    rencontre_frapper: [
      "À mains nues ? Contre ça ? Tes poings tremblent rien qu'à y penser.",
      "⚠ Sans arme, tu n'as aucune chance.",
    ],
  };
  const TEXTE_FENETRE_SCELLEE =
    "Les fenêtres de l'école ne s'ouvrent pas : elles sont scellées. Pour passer par là, il faudrait briser la vitre. Et faire du bruit.";

  // La rencontre de la cafétéria : une silhouette qu'on peut éviter.
  const TEXTE_RENCONTRE =
    "Tu t'arrêtes net. Au fond de la cafétéria, entre les chaises renversées, quelqu'un est debout. De dos. Immobile. Ses bras pendent le long de son corps. Sa tête est penchée sur le côté, comme celle d'un chien qui écoute. La silhouette se tient tout près de la porte battante des cuisines. Elle n'a pas remarqué ta présence. Pas encore.";
  const TEXTE_SILHOUETTE_PRESENTE =
    "Au fond, près de la porte des cuisines, la silhouette est toujours là, immobile entre les chaises. Elle écoute.";
  const TEXTE_SILHOUETTE_REGARD =
    "Un chandail de l'équipe de basket, déchiré à l'épaule. Des cheveux collés. Elle ne bouge que pour pencher la tête vers les sons. Elle ne voit pas. Elle écoute.";
  const TEXTE_RENCONTRE_ATTENTE =
    "Tu ne respires plus. Tu comptes dans ta tête. La silhouette oscille doucement. Sa tête pivote vers toi… puis revient vers les cuisines.";
  const TEXTE_RENCONTRE_PASSEE =
    "Les secondes s'étirent. Puis, lentement, la silhouette se remet en marche en traînant les pieds. Elle pousse la porte battante des cuisines et disparaît. Au fond, une lourde porte d'acier claque : la chambre froide. Puis plus rien. Tu recommences à respirer.";
  const TEXTE_RENCONTRE_LANCER = (nom) =>
    `Tu lances ${nom} de toutes tes forces par-dessus les chaises, vers la porte battante des cuisines. Ça claque contre l'inox, loin derrière. La silhouette pivote d'un bloc et se rue vers le bruit, beaucoup plus vite que tu ne l'aurais cru. La porte battante se balance. Au fond des cuisines, une lourde porte d'acier claque : la chambre froide s'est refermée sur elle. Puis plus rien.`;
  const TEXTE_RENCONTRE_RECUL =
    "Tu recules d'un pas, puis d'un autre, en posant les pieds comme sur de la glace mince. La silhouette ne se retourne pas.";
  const TEXTE_COUPERET =
    "Tu soulèves le couperet du bout des doigts, sans le laisser racler le carrelage. Derrière la porte de la chambre froide, le frottement s'arrête net. Tu ne bouges plus. Au bout d'une éternité, il reprend.";

  // Le gardien de la sortie : la dernière épreuve, pendant la poursuite.
  const TEXTE_GARDIEN =
    "Tu t'arrêtes net. Entre toi et les portes principales, dans un rayon de lune, une silhouette. De dos. Une chemise de travail grise. À sa ceinture, un gros trousseau de clés tinte doucement chaque fois que sa tête oscille, de gauche à droite, comme une antenne qui cherche un signal. Elle ne bouge pas. Elle attend.";
  const TEXTE_GARDIEN_PRESENT =
    "Entre toi et les portes principales, la silhouette à la chemise grise oscille toujours, son trousseau de clés tintant à la ceinture.";
  const TEXTE_GARDIEN_BLOQUE =
    "Tu fais un pas vers les portes. La silhouette se fige, la tête dressée. Tu ne passeras pas tant qu'elle sera là.";
  const TEXTE_GARDIEN_FRAPPE =
    "Tu ne réfléchis plus. Tu traverses le couloir en trois enjambées et tu frappes, de toutes tes forces, une seule fois. La silhouette s'effondre sans un cri. Son trousseau de clés glisse sur les tuiles. Le bruit de sa chute roule dans tout le couloir. Tes mains tremblent tellement que tu manques d'échapper la clé. Les portes. Maintenant.";
  const TEXTE_GARDIEN_LANCER = (nom) =>
    `Tu lances ${nom} de toutes tes forces vers les portes vitrées de la bibliothèque. Ça claque contre la vitre. La silhouette pivote et se rue vers le bruit, son trousseau de clés cliquetant à la ceinture. Le passage est libre. Les portes. Maintenant.`;
  // Objets qu'on peut lancer pour faire du bruit ailleurs.
  const LEURRES = ["cle_doree", "lampe_morte", "telephone_mort"];

  const TEXTE_VICTOIRE = [
    "Le métal de la serrure grince sous tes doigts gelés. Les lourdes chaînes glissent et s'écrasent sur les tuiles. Tu pousses les portes vitrées de toutes tes forces. L'air glacial te frappe de plein fouet. Le boulevard Robert est méconnaissable. Sous un ciel criblé d'aurores boréales malades, des carcasses de voitures s'étendent à perte de vue. Derrière toi, au fond de l'école, un cri déchire soudain le silence. Tu te mets à courir vers l'inconnu.",
    "COUPURE AU NOIR.",
    "FÉLICITATIONS, TU AS SURVÉCU À LA NUIT.",
  ];

  const EPILOGUE = [
    "ÉPILOGUE.",
    "Local A-217. Personne. La lune a glissé jusqu'au tableau. Sous le problème du jour, quelqu'un a fini par écrire la réponse à la craie, de cette écriture penchée que tu connais par cœur. Juste en dessous, deux mots de plus, soulignés trois fois : « Bien joué. » Sur ton pupitre, là où ta joue reposait, un bout de craie. Encore tiède.",
  ];
  const EPILOGUE_CARNET = (epargne) =>
    "Dans ta course, une pensée te traverse : la chemise grise, le trousseau de clés. R., le concierge. Il était monté te chercher. " +
    (epargne ? "Tu l'as laissé derrière toi, sans le toucher." : "Tu revois ton arme s'abattre. Tu cours plus vite.");

  const TEXTE_RECOMPENSE =
    "Retiens bien cette phrase et va la dire en personne à M. Plante. La première personne qui la lui dit gagne un sac de bonbons :";

  // Phrase de récompense, chiffrée avec les trois réponses (voir CODES).
  const PHRASE_CHIFFREE = "b77ded5f75eb7bf44491d9055037536788bc5f6b72ecdbaef3a60c7a139e1a";

  const CHAPITRES = {
    1: ["I", "Le réveil"],
    2: ["II", "Les murs parlent"],
    3: ["III", "La lueur verte"],
    4: ["IV", "Le vacarme"],
  };

  // ==========================================
  // OBJETS
  // ==========================================
  // le : « Tu as déjà le calepin. » ; pas : « Tu n'as pas de calepin. »
  const OBJETS = {
    telephone_mort: {
      nom: "téléphone", le: "ton téléphone", pas: "de téléphone",
      enPlace: "ton téléphone",
      description: "Ton téléphone. Batterie à 1 %. Inutile comme source de lumière.",
      mots: ["TELEPHONE", "CELLULAIRE", "CELL", "PORTABLE", "MOBILE", "PHONE"],
    },
    agenda: {
      nom: "agenda", le: "ton agenda", pas: "d'agenda",
      enPlace: "ton agenda (ouvert sur ton pupitre)",
      description: "Ton agenda scolaire, la couverture cornée. À l'intérieur, le plan de l'école. Tape CARTE pour le consulter.",
      mots: ["AGENDA", "CARTE", "PLAN"],
    },
    ruban_adhesif: {
      nom: "ruban adhésif", le: "le ruban adhésif", pas: "de ruban adhésif",
      enPlace: "du ruban adhésif (industriel et épais)",
      description: "Du ruban adhésif, industriel et épais.",
      mots: ["RUBAN", "ADHESIF", "TAPE", "DUCT", "SCOTCH"],
    },
    barre_tendre: {
      nom: "barre tendre", le: "la barre tendre", pas: "de barre tendre",
      enPlace: "une barre tendre (oubliée sur une table)",
      description: "Une barre tendre, oubliée sur une table. Aux pépites de chocolat.",
      mots: ["BARRE", "TENDRE", "COLLATION"],
    },
    tuyau_metal: {
      nom: "tuyau de métal", le: "le tuyau de métal", pas: "de tuyau de métal",
      enPlace: "un tuyau de métal (arraché au mur des douches)",
      description: "Un tuyau de métal arraché au mur des douches, lourd et solide. Un bon manche.",
      mots: ["TUYAU", "METAL", "MANCHE"],
    },
    lame_lourde: {
      nom: "lame lourde", le: "la lame lourde", pas: "de lame lourde",
      enPlace: "une lame lourde (un couperet de boucher, tombé au pied du comptoir)",
      description: "Une lame lourde : un couperet de boucher, épais et tranchant. Sans manche digne de ce nom.",
      mots: ["LAME", "COUPERET", "HACHOIR", "COUTEAU"],
    },
    cle_principale: {
      nom: "clé principale", le: "la clé principale", pas: "de clé principale",
      enPlace: "la clé principale",
      description: "La clé principale. Lourde, en laiton. La clé des chaînes de la sortie.",
      mots: ["CLE", "CLEF", "CLES", "PRINCIPALE"],
    },
    calepin: {
      nom: "calepin", le: "le calepin", pas: "de calepin",
      enPlace: "un calepin et un crayon (sur le bureau de M. Plante)",
      description: "Un petit calepin à spirale, avec un crayon glissé dedans. Tape NOTER suivi de ce que tu veux écrire, et NOTES pour relire.",
      mots: ["CALEPIN", "CARNET", "CRAYON"],
      pris: "Pris : calepin (et son crayon).",
    },
    baton_lumineux: {
      nom: "bâton lumineux", le: "le bâton lumineux", pas: "de bâton lumineux",
      enPlace: "un bâton lumineux",
      description: "Un bâton lumineux chimique, comme ceux des trousses d'urgence. Il suffit de le plier pour l'allumer.",
      mots: ["BATON", "LUMINEUX", "LUMIERE"],
    },
    arme_artisanale: {
      nom: "arme artisanale", le: "ton arme", pas: "d'arme",
      enPlace: "une arme artisanale",
      description:
        "Ton arme de fortune : la lame lourde fixée au bout du tuyau de métal avec le ruban adhésif industriel. C'est grossier, c'est barbare, mais redoutable.",
      mots: ["ARME", "ARMES"],
    },
    // Fausses pistes, qui servent quand même : on peut les lancer pour faire du bruit ailleurs.
    cle_doree: {
      nom: "clé dorée", le: "la clé dorée", pas: "de clé dorée",
      enPlace: "une petite clé dorée",
      description: "Une petite clé dorée, accrochée à un porte-clés en forme d'étoile. Elle n'ouvre rien que tu connaisses. Mais elle ferait du bruit, en tombant loin d'ici.",
      mots: ["DOREE", "ETOILE", "CLE", "CLEF", "CLES"],
    },
    lampe_morte: {
      nom: "lampe de poche", le: "la lampe de poche", pas: "de lampe de poche",
      enPlace: "une lampe de poche",
      description: "Une lampe de poche en plastique jaune. Tu appuies sur le bouton : rien. Les piles sont mortes. Elle est lourde, au moins.",
      mots: ["LAMPE", "POCHE"],
    },
  };

  // ==========================================
  // LIEUX
  // ==========================================
  // description : texte complet (première visite, REGARDER). court : rappel d'une ligne aux visites suivantes.
  // variante(p) : description complète qui remplace l'autre selon ce qui s'est passé.
  // [mot] dans une description : mot touchable (REGARDER mot) ; [mot|commande] : commande précise.
  // sorties : déplacements possibles. pieges : directions mortelles (portes de secours, etc.).
  // locaux : numéros des plans visitables depuis ce lieu (ENTRER B243).
  // lectures : ce qui se lit ou se regarde ici. bouton : libellé d'un bouton « Lire ». indice : ligne recopiée
  // dans le calepin. fait : découverte notée (objectifs). si(p) : seulement dans cet état. prendre : réponse à PRENDRE.
  const LIEUX = {
    1: {
      nom: "La classe de M. Plante",
      zone: "Aile A · 2e étage",
      description:
        "Le repaire de M. Plante. Rassurant le jour, absolument terrifiant cette nuit. La faible lueur de la lune découpe la forme de son [bureau] à l'avant. Dans les ombres, les [frises chronologiques|regarder frises] et les graphiques d'éducation financière affichés aux murs ressemblent à de longues cicatrices sombres. Au [tableau], l'écriture penchée de M. Plante : le problème du jour, que personne n'a fini de recopier. L'air est mort.",
      court: "La classe de M. Plante. Au [tableau], le problème du jour attend toujours sa réponse.",
      sorties: { OUEST: 2 },
      objets: ["agenda", "calepin"],
      lectures: [
        {
          mots: ["TABLEAU", "PROBLEME"],
          type: "craie",
          bouton: "tableau",
          fait: "tableau",
          indice: "Tableau de M. Plante : 1 000 $ placés à 10 % d'intérêt composé par année. Combien après 2 ans ?",
          texte:
            "« Problème du jour — Tu places 1 000 $ dans un compte à intérêt composé de 10 % par année. Combien auras-tu au bout de 2 ans ? Attention : l'intérêt de la 2e année se calcule sur le nouveau montant ! Réponse au prochain cours. » Personne n'a écrit la réponse.",
        },
        {
          mots: ["FRISE", "FRISES", "GRAPHIQUE", "GRAPHIQUES", "AFFICHE", "AFFICHES", "MURS"],
          texte: "Une frise chronologique de la Nouvelle-France, des graphiques sur le budget d'un étudiant. Des dates, des pourcentages. Rien qui parle de cette nuit.",
        },
        {
          mots: ["BUREAU", "MANTEAU", "TASSE", "CHAISE"],
          texte: "Le bureau de M. Plante. Sa tasse « Meilleur prof » est encore à moitié pleine, une pellicule froide à la surface. Son manteau est resté sur le dossier de sa chaise. Il est parti sans son manteau. Il est parti très vite.",
        },
        {
          mots: ["PUPITRE", "PUPITRES", "SAC", "SACS", "CHAISES"],
          texte: "Ton pupitre, au fond. Autour, les chaises ont été repoussées en désordre. Des sacs d'école pendent encore aux dossiers, des coffres à crayons sont restés ouverts. Personne n'a pris le temps de ramasser ses affaires. Et toi, tu es encore là.",
        },
        {
          mots: ["FENETRE", "FENETRES", "VILLE", "DEHORS", "CIEL"],
          texte: "Par la fenêtre, la cour, puis le quartier. Pas une lumière. Pas un lampadaire. Comme si quelqu'un avait éteint Montréal d'un seul coup d'interrupteur.",
        },
      ],
    },
    2: {
      nom: "Corridor de l'Aile A",
      zone: "Aile A · 2e étage",
      description:
        "Le long corridor de l'Aile A, au deuxième étage. Les [casiers] métalliques forment une haie sinistre qui s'étire dans l'obscurité et se perd dans le noir absolu. Sur une porte de casier, quelqu'un a gravé à la pointe d'un compas : « La plupart des portes de classe ne mènent nulle part. Ne perds pas ton temps. » D'un côté, la porte du local A-217. De l'autre, le couloir s'ouvre sur un espace plus vaste : le carrefour de l'étage.",
      court: "Le corridor de l'Aile A. Les casiers, et l'[inscription] gravée au compas.",
      sorties: { EST: 1, SUD: 3 },
      lectures: [
        {
          mots: ["INSCRIPTION", "CASIER", "CASIERS", "GRAVURE", "PORTE", "COMPAS"],
          texte: "Gravé sur la porte du casier : « La plupart des portes de classe ne mènent nulle part. Ne perds pas ton temps. »",
        },
      ],
      locaux: ["A201", "A203", "A204", "A205", "A208", "A209", "A210", "A213", "A214", "A215", "A218", "A222", "A225", "A226"],
    },
    3: {
      nom: "Carrefour de l'étage",
      zone: "Aile B · 2e étage",
      description:
        "Tu es au cœur du deuxième étage. L'air y est lourd, étouffant. Au centre, la bouche noire de l'[escalier] principal plonge vers le 1er étage. Devant toi, l'obscurité de la partie haute de l'auditorium. Un couloir s'enfonce vers les laboratoires de sciences, un autre vers le centre pédagogique. Derrière toi, le retour vers le corridor de l'Aile A.",
      court: "Le carrefour de l'étage. L'[escalier] principal plonge vers le 1er étage.",
      sorties: { NORD: 2, SUD: 4, EST: 5, OUEST: 25, BAS: 6 },
      locaux: ["B203", "B203A", "B204", "B259", "B260", "B261", "B263", "B265", "B267", "B268", "B270", "B272", "B272A"],
      lectures: [
        { mots: ["ESCALIER", "MARCHES", "RAMPE"], texte: "L'escalier principal plonge dans le noir comme dans un puits. Tu ne vois pas le bas. Tu sens seulement l'air froid qui remonte." },
      ],
    },
    4: {
      nom: "Partie haute de l'auditorium",
      zone: "Aile B · 2e étage",
      description:
        "Tu te tiens sur le balcon de la partie haute de l'auditorium. Sous toi, la grande caverne noire de la salle. Tu as l'impression que, tout en bas, dans cette [mer de 446 sièges|regarder sièges], quelque chose vient de bouger. Une illusion, dans le noir ? Tu n'as pas le courage d'attendre pour vérifier. L'unique issue est derrière toi.",
      court: "Le balcon de l'auditorium, au-dessus de la mer de [sièges].",
      sorties: { NORD: 3 },
      locaux: ["B226", "B232"],
      ressortir: "Tu reviens sur le balcon.",
      lectures: [
        { mots: ["SIEGES", "SIEGE", "SALLE", "BALCON", "RAMBARDE", "BAS", "MER"], texte: "Tu te penches au-dessus de la rambarde. 446 sièges, rangée après rangée, jusqu'à la scène. Tous vides. Presque tous. Au milieu de la douzième rangée, un siège est abaissé." },
      ],
    },
    5: {
      nom: "Laboratoires de sciences",
      zone: "Aile B · 2e étage",
      description:
        "La section « Biol. Chim. Phys. ». La lueur de la lune éclaire les [grandes tables noires|regarder tables] des labos. Une odeur de vieux produits chimiques pique le nez. La porte du dépôt de sciences (B247) est fermée par un cadenas à deux lettres ; une [fiche plastifiée|lire fiche] y est collée. Au mur, un immense [tableau périodique|lire tableau périodique]. Plus loin, une passerelle vitrée file vers l'Aile H. Derrière toi, le retour vers le carrefour.",
      variante: (p) => p.codes[5]
        ? "La section « Biol. Chim. Phys. ». La lueur de la lune éclaire les [grandes tables noires|regarder tables] des labos. Une odeur de vieux produits chimiques pique le nez. La porte du dépôt de sciences (B247) est entrouverte, son cadenas à lettres pendu, ouvert. Au mur, l'immense [tableau périodique|lire tableau périodique]. Plus loin, une passerelle vitrée file vers l'Aile H. Derrière toi, le retour vers le carrefour."
        : null,
      court: (p) => p.codes[5]
        ? "Les laboratoires. Le dépôt B247 est ouvert."
        : "Les laboratoires. Le dépôt B247, sa [fiche plastifiée|lire fiche], et le [tableau périodique|lire tableau périodique] au mur.",
      sorties: { OUEST: 3, EST: 17 },
      alias: { PASSERELLE: 17 },
      locaux: ["B242", "B243", "B244", "B245", "B246", "B248", "B249", "B250", "B251", "B252", "B253", "B255"],
      lectures: [
        {
          mots: ["FICHE", "PORTE", "DEPOT", "CADENAS"],
          bouton: "fiche",
          fait: "fiche",
          indice: "Dépôt B247 (2 lettres) : le symbole chimique du seul métal liquide à la température de la pièce.",
          texte:
            "Fiche plastifiée sur la porte du dépôt : « Cadenas à lettres. Rappel au personnel : la combinaison est le symbole chimique du seul métal qui reste liquide à la température de la pièce. » En dessous, quelqu'un a ajouté au feutre : « Vive la sécurité… »",
        },
        {
          mots: ["TABLEAU", "PERIODIQUE", "ELEMENTS", "MUR"],
          bouton: "tableau périodique",
          texte:
            "Le tableau périodique, en couleurs délavées. Tes yeux accrochent les cases encore lisibles : 1 H Hydrogène · 2 He Hélium · 3 Li Lithium · 6 C Carbone · 7 N Azote · 8 O Oxygène · 9 F Fluor · 11 Na Sodium · 12 Mg Magnésium · 13 Al Aluminium · 14 Si Silicium · 15 P Phosphore · 16 S Soufre · 17 Cl Chlore · 19 K Potassium · 20 Ca Calcium · 22 Ti Titane · 24 Cr Chrome · 26 Fe Fer · 27 Co Cobalt · 28 Ni Nickel · 29 Cu Cuivre · 30 Zn Zinc · 31 Ga Gallium · 35 Br Brome · 47 Ag Argent · 50 Sn Étain · 53 I Iode · 55 Cs Césium · 74 W Tungstène · 78 Pt Platine · 79 Au Or · 80 Hg Mercure · 82 Pb Plomb · 86 Rn Radon · 92 U Uranium. Dans la marge, quelqu'un a écrit : « Br = liquide aussi, mais pas un métal ! »",
        },
        { mots: ["TABLES", "TABLE", "PAILLASSE", "PAILLASSES", "LABO", "LABOS", "BECHER"], texte: "De grandes tables noires, résistantes aux acides. Des éviers, des robinets à gaz. Sur l'une d'elles, un bécher renversé a laissé une auréole blanche." },
      ],
    },
    6: {
      nom: "Carrefour principal",
      zone: "Aile B · 1er étage",
      description:
        "De minces faisceaux de lumière lunaire traversent la poussière en suspension. Les ombres des [piliers] s'étirent au sol comme des griffes. L'escalier remonte vers l'étage. Autour de toi, quatre trous noirs : le couloir administratif, l'entrée de l'auditorium, et les deux places publiques, de part et d'autre.",
      court: "Le carrefour principal, entre ses [piliers].",
      sorties: { HAUT: 3, NORD: 10, SUD: 8, OUEST: 18, EST: 22 },
      arrivees: { 3: "Tu as descendu les marches." },
      locaux: ["B100", "B101", "B103", "B104", "B105"],
      lectures: [
        { mots: ["PILIERS", "PILIER", "OMBRES", "AFFICHES"], texte: "Des piliers de béton couverts d'affiches : le bal des finissants, les auditions de l'harmonie, une collecte de denrées. Sur l'un d'eux, à hauteur d'yeux, une main a laissé une longue trace sombre en glissant vers le bas." },
        { mots: ["CHAUSSURE", "LACET", "SOULIER"], si: (p) => p.scenes.includes("descente"), texte: "Une chaussure de course, pointure d'élève de secondaire. Le lacet est encore noué. Tu ne te demandes pas où est l'autre. Tu te l'interdis." },
      ],
    },
    7: {
      nom: "La cafétéria",
      zone: "Aile C · 1er étage",
      description:
        "Une mer de 600 [chaises] renversées, un chaos géométrique terrifiant. L'immense salle de l'Aile C baigne dans une lueur bleutée et malade. Au loin, les comptoirs des cuisines ressemblent à des autels abandonnés. Ton estomac se noue douloureusement. Deux couloirs longent la salle, un de chaque côté, et une porte battante mène aux cuisines.",
      variante: (p) => p.flags.a_mange
        ? "Une mer de 600 [chaises] renversées, un chaos géométrique terrifiant. L'immense salle de l'Aile C baigne dans une lueur bleutée et malade. Au loin, les comptoirs des cuisines ressemblent à des autels abandonnés. Deux couloirs longent la salle, un de chaque côté, et une porte battante mène aux cuisines."
        : null,
      court: "La cafétéria et ses 600 [chaises] renversées.",
      sorties: { OUEST: 19, EST: 28, NORD: 21 },
      alias: { PORTEBATTANTE: 21, CUISINE: 21 },
      objets: ["barre_tendre"],
      lectures: [
        { mots: ["CHAISES", "CHAISE", "TABLES", "SALLE"], texte: "Six cents chaises renversées, comme si une foule s'était levée d'un seul coup. Au milieu de ce chaos, une seule chaise est debout, bien droite, tournée vers les fenêtres. Comme si quelqu'un s'était assis là pour regarder dehors. Longtemps." },
        { mots: ["COMPTOIRS", "COMPTOIR", "AUTELS"], texte: "Les comptoirs de service, vitres embuées de poussière. Les bacs sont vides. Une louche pend encore à son crochet." },
      ],
    },
    8: {
      nom: "L'auditorium",
      zone: "Aile B · 1er étage",
      description:
        "La caverne. Une noirceur d'encre avale les [rangées]. Tes pas résonnent avec un écho démesuré qui te donne la nausée. Sur le [mur de la scène|lire mur] de l'auditorium de 446 places, tu devines de larges lettres tracées à la hâte. Des portes mènent aux coulisses.",
      court: "L'auditorium, noir comme une caverne. Des lettres sur le [mur de la scène|lire mur].",
      sorties: { NORD: 6 },
      locaux: ["B176", "B177", "B178", "B179", "B180", "B181", "B182"],
      ressortir: "Tu reviens dans la salle.",
      lectures: [
        {
          mots: ["MUR", "LETTRES", "INSCRIPTION", "SCENE"],
          type: "mural",
          bouton: "mur",
          fait: "mural",
          indice: "Mur de l'auditorium : la clé de la sortie est dans le coffre du secrétariat ; le code, c'est la réponse au tableau de M. Plante. Ne pas sortir sans arme.",
          texte:
            "ILS ONT COUPÉ L'EAU. ILS ONT COUPÉ LE COURANT. LE SILENCE EST LEUR ARME. LA CLÉ DE LA SORTIE EST AU SECRÉTARIAT, DANS LE COFFRE. LE CODE ? LA RÉPONSE EST AU TABLEAU DE PLANTE. NE SORS PAS SANS TE DÉFENDRE. NE TOUCHE JAMAIS AUX PORTES DE SECOURS.",
        },
        { mots: ["RANGEES", "RANGEE", "SIEGES", "SIEGE", "FAUTEUILS", "PLACES"], texte: "Des rangées de fauteuils qui se perdent dans le noir. 446 places, d'après la plaque à l'entrée. Ce soir, aucune n'est occupée. Du moins, c'est ce que tu te répètes." },
      ],
    },
    10: {
      nom: "Couloir administratif et sortie",
      zone: "Aile A · 1er étage",
      description:
        "Ton ventre se serre. C'est l'Aile A, celle de la direction. Devant toi, les portes principales menant vers l'extérieur sont scellées par d'épaisses [chaînes] industrielles. Sur le côté, la porte du secrétariat est verrouillée par un lourd [cadenas] rouillé ; par sa [vitre grillagée|lire post-it], tu devines un coffre-fort et un post-it jaune. En face, les portes vitrées de la bibliothèque. Derrière le comptoir de la [réception|regarder comptoir], des dizaines de bureaux s'alignent.",
      variante: (p) => !p.flags.cadenas_brise ? null : p.poursuite > 0
        ? "Le couloir de la direction. Les [chaînes] sur les portes principales. La porte du secrétariat, défoncée. Au bout du couloir, le noir. Vite."
        : "Le couloir de la direction. Devant toi, les portes principales, toujours scellées par d'épaisses [chaînes] industrielles. Sur le côté, la porte du Secrétariat bâille, son cadenas éventré pendu à la charnière. En face, les portes vitrées de la bibliothèque. Derrière le comptoir de la [réception|regarder comptoir], des dizaines de bureaux s'alignent.",
      court: (p) => p.flags.cadenas_brise
        ? (p.poursuite > 0 ? "Le couloir de la direction. Les [chaînes] sur les portes principales. Vite." : "Le couloir de la direction. Les [chaînes] des portes principales. Le secrétariat, ouvert.")
        : "Le couloir de la direction. Les [chaînes] des portes principales. Le [cadenas] rouillé du secrétariat, et le [post-it|lire post-it] derrière sa vitre.",
      sorties: { SUD: 6, EST: 11, OUEST: 23 },
      lectures: [
        {
          mots: ["POST", "POSTIT", "IT", "VITRE", "GRILLAGEE", "SECRETARIAT", "COFFRE"],
          bouton: "post-it",
          fait: "postit",
          indice: "Coffre du secrétariat (4 chiffres) : la réponse au problème du tableau de M. Plante.",
          texte:
            "Tu colles ton front à la vitre grillagée de la porte du secrétariat. Contre le mur, un petit coffre-fort gris à clavier. Un post-it jaune y est collé, écrit gros, au stylo rouge : « Nouveau code du coffre = la réponse au problème écrit au tableau de Plante. Arrêtez de me le demander ! — La direction »",
        },
        { mots: ["CHAINES", "CHAINE", "SERRURE", "PORTES"], texte: "D'épaisses chaînes industrielles, passées dans les poignées des portes et fermées par une serrure massive. Sans la clé principale, personne ne sort." },
        { mots: ["CADENAS"], si: (p) => !p.flags.cadenas_brise, texte: "Un lourd cadenas rouillé, gros comme ton poing. Pas de code : il faudrait quelque chose de solide pour le faire sauter. Et ça ferait du bruit. Beaucoup de bruit." },
        { mots: ["CADENAS"], si: (p) => p.flags.cadenas_brise, texte: "Le cadenas pend, éventré, au bout de sa charnière tordue." },
        { mots: ["COMPTOIR", "RECEPTION", "BUREAUX"], texte: "Derrière le comptoir, des dizaines de bureaux en rangées. Des écrans éteints, des chaises à roulettes repoussées en désordre, un téléphone décroché qui pend au bout de son fil." },
      ],
      locaux: [
        "A101", "A103", "A104", "A106", "A107", "A108", "A109", "A110", "A111", "A112", "A113", "A114", "A115",
        "A116", "A117", "A118", "A119", "A120", "A121", "A122", "A123", "A124", "A125", "A126", "A127", "A128",
        "A129", "A130", "A131", "A132", "A133", "A134", "A135", "A136", "A136A", "A137", "Réception", "Magasin",
      ],
    },
    11: {
      nom: "Le secrétariat",
      zone: "Aile A · 1er étage",
      description:
        "La panique s'est arrêtée ici. Les [dossiers] couvrent le sol du secrétariat comme des feuilles mortes. Le [tiroir] du bureau de la direction a été arraché à moitié. Contre le mur, un petit [coffre-fort|regarder coffre] gris, fermé, avec un clavier à quatre chiffres. Un [post-it] jaune est collé sur sa porte.",
      variante: (p) => p.poursuite > 0
        ? "Le secrétariat. Les [dossiers] au sol. Le [coffre] gris contre le mur" + (p.codes[11] ? ", grand ouvert." : ", son clavier à quatre chiffres, et son [post-it] jaune.")
        : null,
      court: (p) => "Le secrétariat. Le [coffre] gris contre le mur" + (p.codes[11] ? ", grand ouvert." : ", son clavier à quatre chiffres, et son [post-it] jaune."),
      sorties: { OUEST: 10 },
      lectures: [
        {
          mots: ["POST", "POSTIT", "IT", "NOTE"],
          bouton: "post-it",
          fait: "postit",
          indice: "Coffre du secrétariat (4 chiffres) : la réponse au problème du tableau de M. Plante.",
          texte: "Sur le post-it, au stylo rouge : « Nouveau code du coffre = la réponse au problème écrit au tableau de Plante. Arrêtez de me le demander ! — La direction »",
        },
        { mots: ["COFFRE", "CLAVIER", "FORT"], si: (p) => !p.codes[11], texte: "Un petit coffre-fort gris, boulonné au mur. Un clavier à quatre chiffres. Le post-it jaune, collé sur la porte." },
        { mots: ["COFFRE", "CLAVIER", "FORT"], si: (p) => Boolean(p.codes[11]), texte: "Le coffre est grand ouvert. Une pile d'enveloppes de la direction, et l'enveloppe à ton nom." },
        {
          mots: ["ENVELOPPE", "ENVELOPPES", "LETTRE", "MOT"],
          si: (p) => Boolean(p.codes[11]),
          type: "lettre",
          bouton: "enveloppe",
          fait: "enveloppe",
          texte:
            "L'écriture penchée de M. Plante : « Je n'ai pas réussi à te réveiller à temps. Ils arrivaient, il fallait sortir en silence. Pardonne-moi. Le texto, c'était moi, juste avant que mon téléphone meure. Le code du coffre, c'était mon problème du jour : je savais que tu le trouverais. Quand tu seras dehors, viens me voir. J'ai quelque chose pour toi. — M. P. »",
        },
        { mots: ["DOSSIERS", "DOSSIER", "PAPIERS", "FEUILLE", "LISTE", "EVACUATION", "SOL"], texte: "Tu écartes les dossiers du bout du pied. Sur le dessus de la pile, une feuille : « Évacuation — groupe 217 — M. Plante ». Des noms, cochés un par un, de cette écriture penchée. Trente cases cochées. Une seule case vide. Tu n'as pas besoin de lire le nom à côté." },
        { mots: ["TIROIR", "BUREAU"], texte: "Le tiroir est vide, à moitié arraché. Un trombone, une gomme à effacer, et une photo de la direction en vacances, souriante, sur une plage. Quelqu'un a fouillé avant toi." },
      ],
    },
    12: {
      nom: "Couloir des gymnases",
      zone: "Gymnases · 1er étage",
      description:
        "Un long couloir tout droit file vers les gymnases. L'air sent le caoutchouc froid et la vieille sueur. Tes pas sont étouffés, comme si les murs de béton avalaient le son. Le couloir mène aux vestiaires et au gymnase 1, puis continue jusqu'à l'Aile H. Au mur, un [babillard] couvert d'horaires de matchs.",
      court: "Le couloir des gymnases. Les vestiaires, le gymnase 1, et plus loin l'Aile H.",
      sorties: { OUEST: 22, NORD: 13, SUD: 14, EST: 20 },
      locaux: ["Gym 2", "Gym 3", "Gym 4", "Gym 5", "Salle d'entraînement", "B134", "B138", "B139", "B140"],
      lectures: [
        { mots: ["BABILLARD", "HORAIRES", "HORAIRE", "AFFICHES", "MATCHS"], texte: "Les horaires des matchs de basket et de volleyball. Le prochain devait avoir lieu demain. Une feuille d'inscription pour le tournoi du midi, avec trois noms. Le quatrième s'arrête au milieu." },
      ],
    },
    13: {
      nom: "Les vestiaires",
      zone: "Gymnases · 1er étage",
      description:
        "Le noir complet. Aucune fenêtre ne perce les vestiaires. Une odeur d'eau pourrie monte des douches et, quelque part, une goutte tombe, régulière comme un métronome. Seule la sensation du carrelage glacé sous tes semelles te guide. C'est le ventre d'une bête morte.",
      variante: (p) => p.flags.lumiere
        ? "Dans la lueur verte du bâton, les vestiaires sortent du noir : des bancs renversés, des [casiers] béants, et le mur des douches, éventré, d'où pend un bout de tuyau arraché. Une goutte tombe, régulière comme un métronome."
        : null,
      court: (p) => p.flags.lumiere ? "Les vestiaires, dans la lueur verte du bâton." : "Les vestiaires. Le noir complet.",
      sorties: { SUD: 12 },
      objets: ["tuyau_metal"],
      sombre: true,
      noirIndice: "Il fait trop noir pour distinguer quoi que ce soit. Ton pied heurte quelque chose de lourd et métallique, qui roule sur le carrelage avec un bruit sourd. Il te faudrait de la lumière.",
      lectures: [
        { mots: ["CASIER", "CASIERS", "TRACES", "PAS", "FLAQUE"], si: (p) => p.flags.lumiere, texte: "Les traces mouillées s'arrêtent devant le casier du fond. Sa porte est fermée. Dessous, une flaque s'élargit, très lentement. Tu ne l'ouvres pas. Tu ne l'ouvriras jamais." },
        { mots: ["DOUCHES", "DOUCHE", "MUR", "TUYAUTERIE"], si: (p) => p.flags.lumiere, texte: "Le mur des douches est éventré. Il manque un bout de tuyau, arraché net. Quelqu'un avait besoin d'une arme, avant toi." },
      ],
    },
    14: {
      nom: "Le gymnase 1",
      zone: "Gymnases · 1er étage",
      description:
        "Le gymnase est si vaste que l'obscurité n'y a pas de fond. La lune tombe en colonnes obliques par les hautes fenêtres et découpe sur le plancher verni les lignes des terrains, comme le tracé d'un rituel oublié. Un seul [ballon] repose au centre, parfaitement immobile, comme si quelqu'un l'y avait déposé avec soin. Au fond, les [portes de secours|regarder porte] donnent sur la cour.",
      variante: (p) => p.scenes.includes("ballon")
        ? "Le gymnase est si vaste que l'obscurité n'y a pas de fond. La lune tombe en colonnes obliques par les hautes fenêtres. Le [ballon] qui reposait au centre a disparu. Sur le plancher verni, une longue trace dans la poussière file jusqu'au fond, jusqu'aux [portes de secours|regarder porte] qui donnent sur la cour."
        : null,
      court: "Le gymnase 1, immense et vide. Au fond, les [portes de secours|regarder porte].",
      sorties: { NORD: 12 },
      pieges: { SUD: MORT_PORTE_SECOURS },
      lectures: [
        { mots: ["BALLON"], si: (p) => !p.scenes.includes("ballon"), prendre: "Tu n'oses pas y toucher. S'il roulait, tout le gymnase l'entendrait.", texte: "Un ballon de basket, posé pile sur le point central. Pas une poussière autour. Tu ne t'approches pas. Tu as l'impression très nette que c'est exactement ce qu'on attend de toi." },
        { mots: ["BALLON", "TRACE"], si: (p) => p.scenes.includes("ballon"), texte: "Le ballon n'est plus là. Une longue trace dans la poussière file vers les portes de secours. Tu ne la suis pas." },
        { mots: ["PORTE", "PORTES", "SECOURS", "BARRE"], texte: "Une porte de secours, avec sa barre horizontale. Un autocollant rouge : « PORTE SOUS ALARME ». Derrière la vitre grillagée, la cour." },
      ],
    },
    15: {
      nom: "Couloir de l'Aile F",
      zone: "Aile F · 1er étage",
      description:
        "L'Aile F, basse et étroite, accrochée au flanc de l'école. Les portes des classes F101 à F118 sont closes, mais pas verrouillées. Derrière leurs petites fenêtres, les pupitres alignés attendent des élèves qui ne viendront plus. Au bout du couloir, la cage d'escalier en demi-lune monte vers l'étage. Tout près, une [porte de secours|regarder porte] donne sur la cour.",
      court: "Le couloir de l'Aile F. La cage d'escalier en demi-lune monte vers l'étage.",
      sorties: { NORD: 19, HAUT: 16 },
      alias: { C103: 19 },
      arrivees: { 19: "Le couloir C103 te mène jusqu'au bout de l'école.", 16: "Tu redescends l'escalier en demi-lune." },
      pieges: { SUD: MORT_PORTE_SECOURS },
      locaux: ["F101", "F102", "F103", "F104", "F105", "F106", "F108", "F109", "F110", "F111", "F112", "F113", "F114", "F115", "F116", "F117", "F118"],
      lectures: [
        { mots: ["PORTE", "PORTES", "SECOURS", "BARRE"], texte: "Une porte de secours, avec sa barre horizontale. Un autocollant rouge : « PORTE SOUS ALARME ». Derrière la vitre grillagée, la cour." },
      ],
    },
    16: {
      nom: "L'étage de l'Aile F",
      zone: "Aile F · 2e étage",
      description:
        "Le couloir F200 est si étroit que tu pourrais toucher les deux murs en écartant les bras. Une odeur d'antiseptique flotte près du local F212, où une [armoire] de premiers soins est fermée par un cadenas à trois chiffres. Quelque chose est gravé sur le métal. Dans la classe F209, des [mots tracés à la craie|lire tableau] accrochent la lueur de la lune au tableau. L'escalier redescend, et le couloir rejoint l'étage de l'Aile C.",
      variante: (p) => p.codes[16]
        ? "Le couloir F200 est si étroit que tu pourrais toucher les deux murs en écartant les bras. Près du local F212, l'[armoire] de premiers soins bâille, porte ouverte, son cadenas défait. Dans la classe F209, des [mots tracés à la craie|lire tableau] accrochent la lueur de la lune au tableau. L'escalier redescend, et le couloir rejoint l'étage de l'Aile C."
        : null,
      court: (p) => p.codes[16]
        ? "L'étage de l'Aile F. L'armoire F212, ouverte. Les [mots à la craie|lire tableau] dans F209."
        : "L'étage de l'Aile F. L'[armoire] F212 et son cadenas à trois chiffres. Les [mots à la craie|lire tableau] dans F209.",
      sorties: { BAS: 15, EST: 27 },
      alias: { F200: 27 },
      locaux: ["F201", "F202", "F203", "F204", "F205", "F206", "F207", "F208", "F209", "F210", "F211", "F212A"],
      lectures: [
        {
          mots: ["ARMOIRE", "GRAVURE", "ENIGME", "CADENAS", "METAL", "F212"],
          bouton: "gravure",
          fait: "gravure",
          indice: "Armoire F212 (3 chiffres) : « Les sièges de la caverne, moins la classe où tout a commencé. »",
          texte: "Gravé à la pointe d'un compas sur la porte de l'armoire, de la même écriture penchée qu'au tableau de M. Plante : « Les sièges de la caverne, moins la classe où tout a commencé. »",
        },
        {
          mots: ["TABLEAU", "CRAIE", "MOTS", "F209"],
          type: "craie",
          bouton: "tableau de F209",
          fait: "f209",
          texte:
            "Ils suivent le bruit. Ils ne voient pas dans le noir, mais ils entendent tout. Le courant ne reviendra pas. Ne touche pas aux portes de secours : l'alarme les appelle. Si tu lis ceci, marche doucement.",
        },
        { mots: ["COUVERTURE", "COMPRESSES", "PANSEMENTS", "TROUSSE"], si: (p) => Boolean(p.codes[16]), prendre: "Tu n'en as pas besoin. Pas encore.", texte: "Une couverture de survie, des compresses, des pansements. Tu n'as pas froid à ce point, et rien ne saigne." },
      ],
    },
    17: {
      nom: "L'étage de l'Aile H",
      zone: "Aile H · 2e étage",
      description:
        "Par les grandes fenêtres du couloir, le boulevard Robert s'étire, désert, sous un ciel qui ne ressemble à aucun ciel. Des [voitures] sont arrêtées en plein milieu de la chaussée, portières ouvertes, comme abandonnées en pleine course. Rien ne bouge. L'escalier du bout du couloir descend vers le 1er étage de l'Aile H. La passerelle ramène vers les laboratoires.",
      court: "L'étage de l'Aile H. Le boulevard Robert, désert, derrière les [fenêtres|regarder voitures].",
      sorties: { OUEST: 5, BAS: 20 },
      alias: { PASSERELLE: 5 },
      arrivees: { 5: "La passerelle débouche sur l'étage de l'Aile H.", defaut: "L'étage de l'Aile H." },
      locaux: [
        "H201", "H202", "H203", "H204", "H205", "H206", "H207", "H208", "H209", "H211", "H212", "H213", "H215",
        "H216", "H217", "H218", "H221", "H222", "H223", "H224", "H225", "H226", "H228", "H229", "H230", "H231",
      ],
      lectures: [
        { mots: ["VOITURES", "VOITURE", "BOULEVARD", "RUE", "CIEL", "FENETRE", "FENETRES", "AUTOBUS", "ROBERT"], texte: "Des voitures arrêtées en plein milieu du boulevard, phares éteints, portières ouvertes. Un autobus est couché en travers des voies. Au-dessus, le ciel ondule de lueurs vertes et violettes : des aurores boréales, beaucoup trop au sud, beaucoup trop basses. Aucun avion. Aucune lumière. La ville entière retient son souffle." },
      ],
    },
    18: {
      nom: "La place publique 2",
      zone: "Aile B · 1er étage",
      description:
        "La place publique 2 s'étend à flanc d'auditorium, immense et plate. Le jour, c'est le cœur bruyant de l'école ; cette nuit, c'est une plaine morte. Les rangées de [casiers] métalliques s'alignent en biais, à perte de vue. Quelques portes pendent, ouvertes, comme des bouches qui auraient voulu crier. Un couloir part vers l'Aile C.",
      court: "La place publique 2, immense et déserte. Les [casiers] en biais, à perte de vue.",
      sorties: { EST: 6, SUD: 19 },
      locaux: ["B106", "B108", "B110", "B111", "B112", "B114", "B115", "B116", "B117", "B118", "B119", "B121", "B122", "B123", "B124", "B125", "B126", "B127"],
      ressortir: "Tu reviens sur la place publique.",
      lectures: [
        { mots: ["CASIERS", "CASIER", "PORTES"], texte: "Des casiers en biais, à perte de vue. Certains ont été forcés. Dans l'un d'eux, un petit miroir aimanté. Tu évites de regarder dedans." },
      ],
    },
    19: {
      nom: "L'Aile C",
      zone: "Aile C · 1er étage",
      description:
        "Un couloir étroit longe le flanc ouest de la cafétéria. Les néons éteints pendent du plafond comme des ossements. Par les portes vitrées, tu devines la grande salle de la cafétéria. Au mur, un [avertisseur d'alarme incendie|regarder avertisseur] rouge. Plus loin, le couloir C103 s'enfonce vers l'Aile F.",
      court: "L'Aile C, le long de la cafétéria. L'[avertisseur] d'incendie rouge, au mur.",
      sorties: { NORD: 18, EST: 7, SUD: 15 },
      alias: { C103: 15 },
      locaux: ["C100", "C101", "C102", "C103", "C104", "C105", "C106", "C107", "C108", "C109", "C110", "C111", "C112", "C113", "C114"],
      lectures: [
        { mots: ["ALARME", "AVERTISSEUR", "POIGNEE"], texte: "Un avertisseur rouge : « EN CAS D'INCENDIE, ABAISSER ». Quelqu'un a collé dessus, en travers, une bande de ruban adhésif. Au feutre noir, sur le ruban : « JAMAIS. »" },
        { mots: ["NEONS", "NEON", "PLAFOND"], texte: "Les néons éteints pendent au bout de leurs fils. L'un d'eux se balance doucement, sans un souffle d'air." },
      ],
    },
    20: {
      nom: "Couloir de l'Aile H",
      zone: "Aile H · 1er étage",
      description:
        "L'Aile H. Derrière une [grille] baissée, le café étudiant H115 garde ses chaises retournées sur les tables, pattes en l'air, comme des insectes morts. Les portes doubles du [gymnase 6|regarder gymnase] sont entrouvertes. De l'intérieur vient un bruit de respirations, lentes, régulières… beaucoup trop nombreuses. Une [porte de secours|regarder porte] donne sur le boulevard Robert. L'escalier monte vers l'étage de l'Aile H.",
      court: "Le couloir de l'Aile H. Les portes entrouvertes du [gymnase 6|regarder gymnase], et ce bruit de respirations.",
      sorties: { OUEST: 12, HAUT: 17 },
      pieges: { SUD: MORT_GYM6, EST: MORT_PORTE_SECOURS },
      locaux: ["H101", "H102", "H103", "H104", "H106", "H107", "H108", "H109", "H111", "H113", "H114", "H116", "H117", "H119", "H120", "H121"],
      lectures: [
        { mots: ["GYMNASE", "GYM", "DOUBLES", "PORTES", "RESPIRATIONS"], texte: "Les portes doubles du gymnase 6 sont entrouvertes d'un doigt. Par l'interstice, rien. Seulement le noir, une odeur chaude, lourde, que tu ne connais pas, et ce bruit de respirations. Des dizaines. Des centaines." },
        { mots: ["PORTE", "SECOURS", "BARRE"], texte: "Une porte de secours, avec sa barre horizontale. Un autocollant rouge : « PORTE SOUS ALARME ». Derrière la vitre grillagée, le boulevard Robert." },
        { mots: ["GRILLE", "CAFE", "H115", "MENU"], texte: "La grille du café étudiant est baissée et cadenassée. Derrière, les chaises retournées sur les tables. Un menu à la craie : « Muffin + chocolat chaud : 3 $ ». Tu donnerais n'importe quoi pour un chocolat chaud." },
      ],
    },
    21: {
      nom: "Les cuisines",
      zone: "Aile C · 1er étage",
      description:
        "Les cuisines de la cafétéria. Inox, carrelage, crochets vides. Les chambres froides sont ouvertes et ne soufflent plus rien ; l'odeur de nourriture tournée te prend à la gorge. Sur le grand [comptoir] de découpe, les ustensiles ont été balayés au sol dans un éclat de panique.",
      variante: (p) => p.silhouette === "chambre_froide"
        ? "Les cuisines de la cafétéria. Inox, carrelage, crochets vides. Au fond, la porte d'une [chambre froide|regarder chambre froide] est fermée. De l'autre côté, un frottement lent, régulier. Quelque chose tourne en rond, là-dedans. Sur le grand [comptoir] de découpe, les ustensiles ont été balayés au sol. Ne traîne pas."
        : null,
      court: (p) => p.silhouette === "chambre_froide"
        ? "Les cuisines. Derrière la porte de la [chambre froide|regarder chambre froide], le frottement continue."
        : "Les cuisines. Inox, carrelage, crochets vides.",
      sorties: { SUD: 7 },
      objets: ["lame_lourde"],
      lectures: [
        { mots: ["COMPTOIR", "USTENSILES", "DECOUPE"], texte: "Des louches, des fouets, des plaques de cuisson, balayés au sol. Quelqu'un a cherché quelque chose, ici, très vite." },
        { mots: ["CHAMBRE", "FROIDE", "FROIDES", "FRIGO", "PORTE"], si: (p) => p.silhouette === "chambre_froide", texte: "Une lourde porte d'acier, fermée. De l'autre côté, un frottement lent, régulier. Puis un choc sourd contre la porte, juste à la hauteur de ton visage. Tu recules." },
        { mots: ["CHAMBRE", "FROIDE", "FROIDES", "FRIGO"], si: (p) => p.silhouette !== "chambre_froide", texte: "Les chambres froides sont ouvertes et ne soufflent plus rien. Des caisses de lait gonflées. L'odeur te prend à la gorge." },
      ],
    },
    22: {
      nom: "La place publique 1",
      zone: "Aile B · 1er étage",
      description:
        "Une immense place, bordée de casiers en biais, plate comme un terrain vague. Sur le sol, un [sac à dos|regarder sac] éventré a vomi ses cahiers ; les pages tournent toutes seules, lentement, dans un courant d'air que tu ne sens pas. D'ici, on rejoint le local de la vie étudiante, le long couloir des gymnases et le couloir est de l'Aile C.",
      court: "La place publique 1. Le [sac à dos|regarder sac] éventré, ses pages qui tournent toutes seules.",
      sorties: { OUEST: 6, EST: 12, NORD: 24, SUD: 28 },
      ressortir: "Tu reviens sur la place publique.",
      locaux: [
        "B142", "B143", "B144", "B145", "B146", "B147", "B148", "B149", "B152", "B153", "B154", "B155", "B156",
        "B157", "B158", "B159", "B160", "B161", "B162", "B163", "B165", "B166", "B167",
      ],
      lectures: [
        { mots: ["SAC", "CAHIERS", "CAHIER", "PAGES", "DOS"], texte: "Un sac à dos éventré. Des cahiers Canada, un coffre à crayons, une carte OPUS au nom d'un élève de deuxième secondaire. Les pages tournent toutes seules, lentement. Tu remets la carte dans le sac. Tu ne sais pas pourquoi, ça te semble important." },
      ],
    },
    23: {
      nom: "La bibliothèque",
      zone: "Aile A · 1er étage",
      description:
        "La bibliothèque A102. Des rayonnages jusqu'au plafond, et pas un son. Les livres ont l'air d'attendre. Sur le [chariot des retours|regarder chariot], quelqu'un a laissé un [roman|lire livre] ouvert, à l'envers sur sa couverture : Le Petit Prince. Une phrase est soulignée au crayon, trois fois.",
      court: "La bibliothèque. Le Petit Prince, ouvert sur le [chariot des retours|lire livre].",
      sorties: { EST: 10 },
      lectures: [
        {
          mots: ["LIVRE", "ROMAN", "PHRASE", "PRINCE", "PETIT"],
          bouton: "livre",
          texte:
            "« On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux. » Dans la marge, au crayon : « 4 – 1 – 2 ? ». Puis, d'une autre main : « Non. »",
        },
        { mots: ["CHARIOT", "RETOURS", "RAYONNAGES", "LIVRES"], texte: "Le chariot des retours déborde. Des romans, des bandes dessinées, un atlas. Une fiche de retard au nom de quelqu'un de ta classe. Ce livre ne sera jamais rendu." },
      ],
    },
    24: {
      nom: "La vie étudiante",
      zone: "Aile B · 1er étage",
      description:
        "Le local de la vie étudiante, B169. Des [affiches] du spectacle de fin d'année, des banderoles de l'équipe de basket, un [divan] défoncé. Sur la table basse, un [journal] du matin, plié en deux.",
      court: "La vie étudiante. Le [journal] plié sur la table basse.",
      sorties: { SUD: 22 },
      lectures: [
        {
          mots: ["JOURNAL", "QUOTIDIEN", "UNE", "TITRE"],
          bouton: "journal",
          texte:
            "Le journal du quartier, édition de ce matin. En une : « ÉPIDÉMIE DANS L'EST DE MONTRÉAL. » Plus bas : « Les autorités demandent à la population de rester à l'intérieur. Les personnes infectées seraient attirées par le bruit. Ne sortez sous aucun prétexte. » Le reste de la page a été arraché.",
        },
        { mots: ["DIVAN", "SOFA", "COUSSINS"], texte: "Tu passes la main entre les coussins : des miettes, un vieux crayon, une pièce de vingt-cinq sous. Rien qui t'aide." },
        { mots: ["AFFICHES", "AFFICHE", "BANDEROLES", "SPECTACLE"], texte: "L'affiche du spectacle de fin d'année : « Une nuit à St-Ex », comédie musicale. Le titre te glace le sang." },
      ],
    },
    25: {
      nom: "Le centre pédagogique",
      zone: "Aile B · 2e étage",
      description:
        "Le centre pédagogique. Des rangées d'[ordinateurs] aux écrans noirs, comme des yeux crevés. Une [imprimante] a dévidé une longue langue de papier blanc jusqu'au sol. Tout autour, des salles de travail et des classes.",
      court: "Le centre pédagogique. L'[imprimante] et sa longue langue de papier.",
      sorties: { EST: 3, SUD: 26 },
      locaux: ["B207", "B208", "B209", "B211", "B212", "B213", "B214", "B215", "B217", "B218"],
      lectures: [
        {
          mots: ["IMPRIMANTE", "PAPIER", "FEUILLE", "MESSAGE", "LANGUE"],
          bouton: "imprimante",
          texte: "Tu tires sur la langue de papier. C'est le dernier document imprimé avant la panne : « MESSAGE AUX PARENTS — 14 h 52. En raison d'une situation d'urgence dans le secteur, l'école procède à une évacuation. AUCUNE ALARME NE SERA DÉCLENCHÉE. Les élèves quittent le bâtiment en silence par les portes principales, avec leurs enseignants. Les portes seront ensuite verrouillées. Le courant sera coupé dans tout le secteur vers 15 h. » La suite s'imprime de plus en plus pâle. Puis plus rien.",
        },
        { mots: ["ORDINATEURS", "ORDINATEUR", "ECRANS", "ECRAN"], texte: "Des rangées d'écrans noirs. Dans le reflet de l'un d'eux, ta silhouette. Et, derrière toi, la porte. Ouverte. Tu te retournes : personne." },
      ],
    },
    26: {
      nom: "Couloir sud de l'étage",
      zone: "Aile B · 2e étage",
      description:
        "Le couloir sud de l'étage longe l'arrière de l'auditorium. Deux cages d'escalier y descendent, mais leurs portes sont bloquées par des pupitres empilés à la hâte : une [barricade], dressée de ce côté-ci. Quelqu'un n'a pas voulu que quelque chose monte. Une passerelle mène à l'étage de l'Aile C.",
      court: "Le couloir sud de l'étage. La [barricade] de pupitres devant les escaliers.",
      sorties: { NORD: 25, SUD: 27 },
      alias: { PASSERELLE: 27 },
      locaux: ["B219", "B221", "B222", "B223", "B224", "B227", "B229", "B230", "B231", "B233", "B234", "B236", "B237", "B238", "B239", "B240"],
      lectures: [
        { mots: ["BARRICADE", "PUPITRES", "PUPITRE", "ESCALIER", "ESCALIERS"], texte: "Des pupitres, des chaises, un classeur métallique, empilés jusqu'au plafond contre les portes de l'escalier. Sur le pupitre du dessus, gravé au compas : « ILS MONTENT PAS LES ESCALIERS BLOQUÉS ». Pas de « ne ». Ta prof de français aurait encerclé ça en rouge. Tu as envie de rire. Tu n'y arrives pas." },
      ],
    },
    27: {
      nom: "L'étage de l'Aile C",
      zone: "Aile C · 2e étage",
      description:
        "L'étage de l'Aile C. Un dédale de couloirs et de classes. Les portes se ressemblent toutes. Tu pourrais te perdre ici, et quelque chose te dit que d'autres s'y sont perdus avant toi. Les [escaliers] de l'aile sont encombrés de chaises emmêlées, impossibles à franchir. Le couloir F200 mène à l'étage de l'Aile F.",
      court: "L'étage de l'Aile C, un dédale de classes. Le couloir F200 mène à l'Aile F.",
      sorties: { NORD: 26, OUEST: 16 },
      alias: { F200: 16, PASSERELLE: 26 },
      locaux: [
        "C201", "C202", "C203", "C204", "C205", "C209", "C212", "C213", "C214", "C216", "C219", "C221", "C224",
        "C229", "C230", "C233", "C234", "C237", "C238", "C240", "C241", "C242",
      ],
      lectures: [
        { mots: ["ESCALIERS", "ESCALIER", "CHAISES"], texte: "Des chaises emmêlées jusqu'au plafond. Quelqu'un a pris le temps de les entremêler. Personne ne passera par là. Ni dans un sens, ni dans l'autre." },
      ],
    },
    28: {
      nom: "L'Aile C est",
      zone: "Aile C · 1er étage",
      description:
        "Le couloir est de la cafétéria. Des casiers défoncés, un [distributeur] de collations éventré, vidé jusqu'à la dernière croustille : quelqu'un est passé avant toi. Une odeur de friture froide flotte jusqu'ici.",
      court: "L'Aile C est. Le [distributeur] éventré.",
      sorties: { OUEST: 7, NORD: 22 },
      locaux: ["C117", "C120", "C123", "C126", "C127", "C130", "C132", "C133", "C134", "C135", "C142", "C144", "C145", "B129", "B130", "B132"],
      lectures: [
        { mots: ["DISTRIBUTEUR", "DISTRIBUTRICE", "MACHINE", "COLLATIONS"], texte: "La vitre du distributeur a été défoncée, les spirales sont vides. Par terre, des emballages déchirés. Pas à pleines mains : à pleines dents." },
      ],
    },
  };

  // Position de chaque lieu sur le plan de l'agenda : [étage, colonne, rangée, nom court].
  // Nord en haut ; une case par lieu.
  const PLAN = {
    2: ["etage", 2, 0, "Corridor A"],
    1: ["etage", 3, 0, "A-217"],
    25: ["etage", 1, 1, "Centre péd."],
    3: ["etage", 2, 1, "Carrefour ét."],
    5: ["etage", 3, 1, "Labos"],
    17: ["etage", 4, 1, "Aile H · 2e"],
    26: ["etage", 1, 2, "Couloir sud"],
    4: ["etage", 2, 2, "Balcon"],
    16: ["etage", 0, 3, "Aile F · 2e"],
    27: ["etage", 1, 3, "Aile C · 2e"],
    23: ["rdc", 1, -1, "Bibliothèque"],
    10: ["rdc", 2, -1, "Direction"],
    11: ["rdc", 3, -1, "Secrétariat"],
    24: ["rdc", 3, 0, "Vie étudiante"],
    13: ["rdc", 4, 0, "Vestiaires"],
    18: ["rdc", 1, 1, "Place pub. 2"],
    6: ["rdc", 2, 1, "Carrefour pr."],
    22: ["rdc", 3, 1, "Place pub. 1"],
    12: ["rdc", 4, 1, "Gymnases"],
    20: ["rdc", 5, 1, "Aile H · 1er"],
    8: ["rdc", 2, 2, "Auditorium"],
    14: ["rdc", 4, 2, "Gymnase 1"],
    21: ["rdc", 2, 3, "Cuisines"],
    19: ["rdc", 1, 4, "Aile C · 1er"],
    7: ["rdc", 2, 4, "Cafétéria"],
    28: ["rdc", 3, 4, "Aile C est"],
    15: ["rdc", 1, 5, "Aile F · 1er"],
  };

  // Nom de chaque lieu sur les boutons de sortie et pour ALLER <destination>.
  const DESTINATIONS = {
    1: "Classe de M. Plante", 2: "Corridor de l'Aile A", 3: "Carrefour de l'étage", 4: "Balcon de l'auditorium",
    5: "Laboratoires", 6: "Carrefour principal", 7: "Cafétéria", 8: "Auditorium",
    10: "Couloir administratif", 11: "Secrétariat", 12: "Couloir des gymnases", 13: "Vestiaires",
    14: "Gymnase 1", 15: "Couloir de l'Aile F", 16: "Étage de l'Aile F", 17: "Étage de l'Aile H",
    18: "Place publique 2", 19: "Aile C", 20: "Couloir de l'Aile H", 21: "Cuisines",
    22: "Place publique 1", 23: "Bibliothèque", 24: "Vie étudiante", 25: "Centre pédagogique",
    26: "Couloir sud de l'étage", 27: "Étage de l'Aile C", 28: "Aile C est",
  };
  // Nom des sorties piégées (portes de secours, gymnase 6), par lieu et direction.
  const NOMS_PIEGES = {
    14: { SUD: "Porte de secours (cour)" },
    15: { SUD: "Porte de secours (cour)" },
    20: { SUD: "Gymnase 6", EST: "Porte de secours (boulevard Robert)" },
  };

  const LIEU_DEPART = 1;
  const LIEU_SORTIE = 10;
  const LIEU_SECRETARIAT = 11;
  const LIEU_CAFETERIA = 7;
  const LIEU_CUISINES = 21;

  // ==========================================
  // ÉNIGMES À CODE
  // ==========================================
  // La réponse n'est jamais stockée : seulement son empreinte SHA-256.
  // longueur/genre : un essai de la mauvaise forme ne compte pas comme un essai (aucun bip, aucun temps perdu).
  const CODES = {
    5: {
      empreinte: "68e29784d1a114fda63d38f9458caa7a591f5186766ac67440b6a736182222ee",
      revele: "ruban_adhesif",
      longueur: 2,
      genre: "lettres",
      forme: "Le cadenas n'a que deux molettes, avec des lettres. Il faut un symbole, pas un nom.",
      echec: "Tu fais tourner les deux molettes. Le cadenas reste fermé.",
      succes: "Les molettes s'alignent. Le cadenas à lettres s'ouvre avec un déclic. Dans le dépôt, entre les bocaux étiquetés, un rouleau de ruban adhésif industriel.",
    },
    16: {
      empreinte: "08490295488a1189099751ebeddb5992313dd2a831e07a92e66d196ddc261777",
      revele: "baton_lumineux",
      longueur: 3,
      genre: "chiffres",
      forme: "Le cadenas de l'armoire a trois molettes, avec des chiffres.",
      echec: "Tu fais tourner les trois chiffres. Le cadenas ne bouge pas.",
      succes: "Trois chiffres, un déclic. La porte de l'armoire s'ouvre en grinçant. Compresses, pansements, une couverture de survie… et, au fond, un bâton lumineux encore dans son emballage.",
    },
    11: {
      empreinte: "45297c633d331e6ac35169ebaaf75bc7fafd206ebb59ba4efd80566936e46eb0",
      revele: "cle_principale",
      longueur: 4,
      genre: "chiffres",
      forme: "Le clavier attend quatre chiffres.",
      echec: "Le coffre émet un bip strident, qui résonne beaucoup trop fort dans le silence. Mauvais code.",
      bruyant: true,
      succes: "Le clavier émet quatre petits bips, puis un cliquetis. La porte du coffre s'ouvre. À l'intérieur, sur une pile d'enveloppes, la clé principale. Et, posée dessus, une enveloppe à ton nom, de l'écriture penchée de M. Plante.",
    },
  };
  // Ordre des réponses dans la clé de déchiffrement de la phrase.
  const ORDRE_CODES = [5, 16, 11];

  // ==========================================
  // LE CARNET DE R. (8 pages cachées dans les locaux)
  // ==========================================
  // Une page par grande zone. Elles racontent l'après-midi de l'évacuation, et certaines aident.
  const PAGES = [
    { local: "A120", texte: "14 h 40. La direction nous réunit à la salle du personnel. Une épidémie dans l'Est, et ça se répand vite. Les gens malades deviennent… autre chose. Ils sont attirés par le bruit. Ordre d'évacuer tout le monde SANS ALARME, en silence. Moi, je reste pour fermer. — R., concierge" },
    { local: "B117", texte: "14 h 55. Les élèves sortent en rangs, sans un mot. Je n'ai jamais entendu l'école aussi silencieuse. M. Plante revient en courant : il manque quelqu'un dans son groupe. Il remonte. Il redescend seul, blanc comme un drap. « Trop tard, ils sont dans la cour. Je reviendrai. » — R." },
    { local: "F113", texte: "15 h 10. Plus de courant. Plus d'eau. J'ai trouvé un bâton lumineux dans une trousse de premiers soins. Il en reste un dans l'armoire de l'Aile F, en haut. Le cadenas a trois chiffres, et c'est encore une devinette de M. Plante. Évidemment. — R." },
    { local: "B139", texte: "15 h 40. Ils sont entrés par le gymnase 6. Des dizaines. Ils se sont arrêtés au milieu du terrain et ils ne bougent plus. Debout. Ils écoutent. J'ai poussé les portes sans aller jusqu'au bout : le loquet aurait claqué. Personne ne doit ouvrir ces portes. — R." },
    { local: "B233", texte: "16 h 20. Au 2e, j'ai bloqué les escaliers du sud avec des pupitres. Ils ne grimpent pas par-dessus. Ils ne montent pas les escaliers bloqués. Je ne sais pas pourquoi. Je ne m'en plains pas. — R." },
    { local: "H213", texte: "17 h 05. La direction avait changé le code du coffre ce matin. Pour que les profs s'en souviennent, elle l'a caché dans le problème au tableau de M. Plante. Les profs de maths trouvaient ça drôle. Moi, j'étais nul en maths. La clé des grandes portes est dans ce coffre. — R." },
    { local: "C108", texte: "18 h 30. Il y en a un qui tourne en rond dans la cafétéria. J'ai compris une chose : si tu ne bouges plus, il finit par s'en aller. Et s'il entend un bruit ailleurs, il y court. N'importe quel bruit. — R." },
    { local: "A209", texte: "22 h. Je n'en reviens pas. Quelqu'un dort au 2e, dans l'Aile A. J'entends respirer derrière la porte de A-217. Des pas dans l'escalier, derrière moi. Je me cache ici le temps qu'ils passent. Si tu lis ceci, c'est que je ne suis pas arrivé à temps. Marche doucement. Et ne sors JAMAIS par les portes de secours. — R." },
  ];

  // ==========================================
  // LOCAUX (tous les numéros des plans)
  // ==========================================
  // Textes des locaux ordinaires. Dans un même lieu, aucun texte ne revient avant que la liste soit épuisée.
  const LOCAUX_CLASSE = [
    "Une classe vide. Les chaises sont montées sur les pupitres, pattes en l'air. Rien.",
    "Des pupitres en rangées parfaites. Un sac à dos oublié sous l'un d'eux ne contient que des cahiers. Rien d'utile.",
    "La classe sent la craie et la poussière. Le tableau a été effacé à la hâte ; des traînées blanches tourbillonnent encore sur le vert.",
    "Une salle de classe ordinaire, si ordinaire que c'en est inquiétant. L'horloge murale est arrêtée à 15 h 07.",
    "Les stores sont baissés. Dans la pénombre, un projecteur te fixe de son œil mort. Il n'y a rien ici.",
    "Une chaise renversée au milieu de la pièce. Personne ne l'a relevée. Tu ne la relèves pas non plus.",
    "Sur un pupitre, une boîte à lunch ouverte. Le sandwich à l'intérieur a verdi. Ton estomac se retourne.",
    "Des affiches de grammaire tapissent les murs. « Le participe passé employé avec avoir… » La phrase s'arrête là, arrachée.",
    "La classe est plongée dans le noir. Tu restes sur le seuil et tu tends l'oreille. Rien ne bouge. Tu fais demi-tour.",
    "Un globe terrestre trône sur le bureau du prof. Quelqu'un l'a fait tourner. Il tourne encore, très lentement.",
    "Des copies d'examen couvrent le sol, piétinées. Les notes en rouge n'ont plus aucune importance.",
    "Une classe de mathématiques. Au tableau, une équation que personne ne résoudra. Rien d'autre.",
    "Les fenêtres donnent sur la cour. Tu ne t'en approches pas. Tu fais demi-tour à reculons.",
    "Des cellulaires confisqués dorment dans un bac en plastique sur le bureau. Tous morts. Comme le tien.",
    "Une classe d'univers social. Sur la carte du monde, quelqu'un a planté une punaise rouge sur Montréal. Une seule.",
    "Au fond de la classe, un aquarium. L'eau est trouble, la pompe s'est tue. Tu ne vois pas les poissons. Tu ne cherches pas plus loin.",
    "Les pupitres sont poussés contre les murs, comme pour une pièce de théâtre. Au centre, rien. Seulement un cercle de craie au sol.",
    "Une classe d'anglais. Au tableau : « Homework: read chapter 4 ». Plus personne ne lira le chapitre 4.",
    "Sur le bureau du prof, une pile de bulletins pas encore distribués. Le tien n'y est pas. Tu vérifies quand même.",
    "Une ligne du temps fait le tour des murs, des Premières Nations à aujourd'hui. Elle s'arrête à aujourd'hui.",
    "Une classe de musique. Des étuis d'instruments empilés. Un tambour, au milieu, que tu contournes comme s'il pouvait sonner tout seul.",
    "Sur un pupitre, un cœur gravé au compas, deux initiales. Tu passes ton doigt dessus sans savoir pourquoi.",
    "Des chaises en rond, une boîte de mouchoirs au milieu. Une classe de culture et citoyenneté, peut-être. Rien d'autre.",
    "Un local d'arts plastiques. Des pots de gouache sèchent, couvercles ouverts. Sur un chevalet, une toile blanche. Encore blanche.",
    "La porte grince. Tu te figes. Rien ne répond. Des pupitres, un tableau, du silence. Rien.",
    "Quelqu'un a renversé un sac de croustilles sur un pupitre. L'odeur de vinaigre flotte encore. Ton ventre gronde.",
    "Sur le tableau blanc, au feutre : « ON SE REVOIT LUNDI ». Lundi ne viendra peut-être pas.",
    "Une classe de français. Une affiche : « Lire, c'est voyager ». Tu aimerais bien voyager loin d'ici.",
  ];

  const LOCAUX_BUREAU = [
    "Un petit bureau. Un fauteuil, un ordinateur éteint, une plante qui a soif. Rien.",
    "Des classeurs métalliques. Tu en ouvres un : des dossiers d'élèves, des noms, des notes. Rien qui t'aide.",
    "Un bureau en désordre. Une photo de famille, face contre la table. Tu ne la retournes pas.",
    "Un téléphone fixe sur le bureau. Tu décroches. Aucune tonalité. Seulement un souffle, très loin. Tu raccroches vite.",
    "Une salle de réunion. Douze chaises autour d'une table vide. Sur le tableau blanc : « Plan d'urgence — À DISCUTER ». Rien d'autre.",
    "Un bureau minuscule, à peine plus grand qu'un placard. Il sent le café froid.",
    "Un bureau d'aide aux élèves. Une affiche au mur : « Parle-nous, on est là ». Il n'y a plus personne pour écouter.",
    "Le bureau de l'orientation. Des dépliants de cégeps en éventail. L'avenir te paraît très loin, cette nuit.",
    "Un bureau vide, sauf un calendrier. La date d'aujourd'hui est encerclée en rouge. Rien n'est écrit dedans.",
    "Une déchiqueteuse pleine à ras bord. Quelqu'un a détruit beaucoup de papiers, très vite.",
    "Une petite salle d'attente. Quatre chaises, des revues de l'an dernier. Personne n'attend plus rien.",
    "Une boîte de beignes vide traîne sur le bureau. Juste des miettes de sucre. Ton estomac proteste.",
    "Le bureau des loisirs, couvert d'affiches de tournois. Un sifflet pend à un clou. Tu ne le touches surtout pas.",
    "Une salle de photocopies. Les machines sont mortes, leurs bacs ouverts. Le papier recouvre le sol.",
  ];

  const LOCAUX_PETIT = [
    "Un local de rangement. Des boîtes de carton, des chaises empilées. Rien.",
    "Un placard technique. Des tuyaux, des compteurs, des fils. Tout est mort.",
    "Des toilettes. Un robinet goutte. L'eau est coupée, pourtant. Tu ne veux pas savoir d'où vient cette goutte.",
    "Un local à photocopies. Une feuille est coincée dans la machine. Tu la tires : elle est blanche.",
    "Un réduit sans fenêtre. Tu n'y vois rien. Tu refermes la porte.",
    "Un local d'entretien. Une vadrouille, un seau d'eau grise, une odeur d'eau de Javel.",
    "Un local électrique. Tous les disjoncteurs sont en bas. Tu en remontes un. Rien. Le courant est coupé plus loin.",
    "Une petite salle remplie de boîtes de manuels neufs. Ils sentent l'encre. Personne ne les ouvrira.",
    "Des toilettes. Le miroir est fissuré en étoile. Tu évites ton reflet.",
    "Un local d'entreposage. Des tables pliantes, des chaises empilées, une boule disco poussiéreuse : le bal de l'an dernier.",
  ];

  // Un texte ordinaire déjà lu ailleurs : une ligne courte, pour ne pas relire la même chose.
  const LOCAUX_DEJA_VUS = [
    "Encore une classe vide. Tu ne t'attardes pas.",
    "Les mêmes pupitres, le même silence. Rien pour toi ici.",
    "Tu jettes un œil, rien de plus. Rien ne bouge. Rien d'utile.",
    "Une pièce comme les autres. Rien ne retient ton regard.",
    "Rien. Tu commences à connaître ce silence par cœur.",
    "Vide. Tu refermes la porte doucement.",
  ];

  const LOCAUX_GYM = [
    "Un gymnase plongé dans le noir. Des filets de volleyball pendent, à moitié décrochés. Ton souffle résonne sous le plafond trop haut. Rien.",
    "Un gymnase vide. Les gradins repliés contre le mur forment une falaise sombre. Tu ne t'attardes pas.",
    "Les paniers de basket pendent dans le noir, très haut. Un filet bouge un peu. Il n'y a pas de vent.",
    "Un gymnase. Des tapis bleus empilés au fond, l'odeur du caoutchouc. Rien.",
  ];

  // Locaux particuliers : fausses pistes, ambiance, pièges, objets, pages du carnet.
  const LOCAUX_SPECIAUX = {
    A215: { texte: "Au tableau, en grosses lettres : CODE = 0000. Barré. Réécrit. Barré encore. Quelqu'un a perdu patience ici." },
    A226: { texte: "Une classe d'histoire. Sur le bureau, une pile de copies corrigées. Sur la première, un problème d'intérêts : l'élève a répondu 1200 $, et M. Plante a écrit en rouge « Presque ! Relis l'énoncé. »" },
    B261: { texte: "Sur le bureau, un post-it : « Le code, c'est ma date de fête. — K. » Tu ne connais aucun K." },
    B268: { texte: "Une classe silencieuse. Les pupitres sont placés en cercle, comme pour une discussion qui n'a jamais eu lieu. Au tableau, d'une écriture calme et soignée : « La vulnérabilité c'est précieux. » Personne ne l'a effacé." },
    B270: { texte: "La cabine d'ascenseur est coincée entre deux étages. Par l'interstice, tu ne vois que du noir." },
    B243: { texte: "Un laboratoire de chimie. Sur une table noire, un vieux thermomètre de verre, cassé net. La petite bille argentée qui coulait dedans a disparu." },
    B251: { texte: "Un laboratoire de biologie. Dans un bocal, une grenouille dans le formol te regarde. Elle a l'air de savoir quelque chose." },
    B226: { texte: "La régie de l'auditorium. Des consoles d'éclairage, des centaines de boutons. Tu n'oses en toucher aucun." },
    B232: { texte: "Une petite loge derrière le balcon. Des costumes, un miroir entouré d'ampoules mortes. Dans le miroir, le balcon, derrière toi. Vide." },
    B177: { texte: "La scène. Un seul projecteur pend de travers au-dessus de toi. Au sol, du ruban phosphorescent marque l'emplacement des acteurs. Des croix. Partout. Beaucoup trop de croix." },
    B176: { texte: "Les coulisses. Un costume de lapin géant pend à un cintre. Ses grands yeux de plastique te fixent. Rien d'autre." },
    B145: { texte: "Un local de rangement. Sur une étagère, une lampe de poche en plastique jaune.", objet: "lampe_morte", objetSorti: "Un local de rangement. Des boîtes, des chaises empilées. L'étagère où était la lampe est vide." },
    C224: { texte: "Une classe déserte. Dans le pupitre du fond, une petite clé dorée accrochée à un porte-clés en forme d'étoile.", objet: "cle_doree", objetSorti: "Une classe déserte. Le pupitre du fond est vide." },
    C144: { texte: "La conciergerie. Seaux, vadrouilles, produits. Sur une tablette, une boîte de piles AA : elles ont toutes coulé, gonflées, inutilisables. Au mur, un horaire de ménage signé « R. »" },
    C112: { texte: "Une salle de classe. Le babillard est couvert de dessins d'enfants du camp de jour de l'été. Un soleil, une maison, une famille. Une silhouette noire, derrière la maison." },
    F110: { texte: "La fenêtre de la classe donne sur la cour. Dehors, des silhouettes. Des dizaines, immobiles, toutes tournées vers l'école. Elles attendent. Tu recules sans un bruit." },
    F209: { texte: "La classe F209. Au tableau, à la craie, d'une écriture qui tremble : « Ils suivent le bruit. Ils ne voient pas dans le noir, mais ils entendent tout. Le courant ne reviendra pas. Ne touche pas aux portes de secours : l'alarme les appelle. Si tu lis ceci, marche doucement. »", fait: "f209" },
    H208: { texte: "Une classe d'arts. Des dizaines de dessins sont punaisés aux murs. Sur chacun, le même personnage : une silhouette sans visage, debout dans un couloir. En bas de chaque feuille, la même date. Aujourd'hui." },
    H105: { piege: "gym6" },
    RECEPTION: { texte: "Le comptoir de la réception. Une tasse de café figé. Le registre des visiteurs est ouvert : la dernière signature s'arrête au milieu du nom, et la ligne d'encre file jusqu'au bord de la page." },
    MAGASIN: { texte: "Le magasin scolaire. Des cartables, des calculatrices, des chandails à l'effigie de l'école. Tout est en ordre. C'est presque pire." },
    SALLEDENTRAINEMENT: { texte: "La salle d'entraînement. Des machines à poids, des tapis roulants immobiles. Dans les miroirs, ta silhouette. Une seule. Tu vérifies deux fois." },
  };
  PAGES.forEach((page, i) => {
    const prefixe = {
      A120: "La salle du personnel. Des tasses abandonnées, une boîte de biscuits ouverte.",
      B117: "Une classe aux stores baissés. Sur le bureau du prof, sous une agrafeuse, une feuille pliée en quatre.",
      F113: "Une classe vide. Sur le rebord de la fenêtre, une page arrachée, coincée sous un bâton de colle.",
      B139: "Un local de rangement plein de ballons dégonflés. Sur la porte, à l'intérieur, une page scotchée.",
      B233: "Une classe dont les pupitres manquent : ils sont dans la barricade, au bout du couloir. Par terre, une page.",
      H213: "Une classe d'informatique. Dans le bac de l'imprimante morte, une page écrite à la main.",
      C108: "Une classe. Sur le pupitre du premier rang, une page arrachée d'un carnet, pliée en deux.",
      A209: "Une classe vide. Glissée sous la porte, de l'intérieur, une page arrachée d'un carnet.",
    }[page.local];
    LOCAUX_SPECIAUX[page.local] = { texte: prefixe, page: i + 1 };
  });

  // Index global : numéro de local -> lieu qui y donne accès.
  const compact = (s) => normaliser(s).replace(/ /g, "");
  const INDEX_LOCAUX = {};
  for (const id in LIEUX) {
    for (const nom of LIEUX[id].locaux || []) INDEX_LOCAUX[compact(nom)] = { nom, lieu: Number(id) };
  }
  INDEX_LOCAUX.A217 = { nom: "A217", lieu: 2, vers: 1 };
  INDEX_LOCAUX.B247 = { nom: "B247", lieu: 5, depot: true };
  INDEX_LOCAUX.F212 = { nom: "F212", lieu: 16, armoire: true };
  INDEX_LOCAUX.B169 = { nom: "B169", lieu: 22, vers: 24 };
  INDEX_LOCAUX.A102 = { nom: "A102", lieu: 10, vers: 23 };
  INDEX_LOCAUX.H105 = { nom: "H105", lieu: 20 };
  INDEX_LOCAUX.H115 = { nom: "H115", lieu: 20 };
  const TOTAL_LOCAUX = Object.values(LIEUX).reduce((n, l) => n + (l.locaux || []).length, 0);

  function objetsLocauxDepart() {
    const depart = {};
    for (const cle in LOCAUX_SPECIAUX) if (LOCAUX_SPECIAUX[cle].objet) depart[cle] = [LOCAUX_SPECIAUX[cle].objet];
    return depart;
  }

  function hachage(s) {
    let h = 7;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  // Texte de chaque local ordinaire, calculé une fois : dans un lieu, les textes d'une même catégorie
  // se suivent sans se répéter, à partir d'un point de départ propre à ce lieu.
  function categorieLocal(cle) {
    if (cle.startsWith("GYM")) return "gym";
    if (/[0-9][A-Z]$/.test(cle)) return "petit";
    if (/^A1/.test(cle)) return "bureau";
    if (/^B1[0-9]{2}$/.test(cle) && hachage(cle) % 3 === 0) return "petit";
    return "classe";
  }
  const LISTES_LOCAUX = { gym: LOCAUX_GYM, petit: LOCAUX_PETIT, bureau: LOCAUX_BUREAU, classe: LOCAUX_CLASSE };
  const TEXTES_LOCAUX = {};
  for (const id in LIEUX) {
    const compteurs = {};
    for (const nom of LIEUX[id].locaux || []) {
      const cle = compact(nom);
      if (LOCAUX_SPECIAUX[cle] && LOCAUX_SPECIAUX[cle].texte) continue;
      const cat = categorieLocal(cle);
      const liste = LISTES_LOCAUX[cat];
      const n = compteurs[cat] || 0;
      compteurs[cat] = n + 1;
      TEXTES_LOCAUX[cle] = liste[(hachage(id + cat) + n) % liste.length];
    }
  }

  function texteLocal(nom) {
    const cle = compact(nom);
    if (LOCAUX_SPECIAUX[cle] && LOCAUX_SPECIAUX[cle].texte) return LOCAUX_SPECIAUX[cle].texte;
    return TEXTES_LOCAUX[cle] || LOCAUX_CLASSE[hachage(cle) % LOCAUX_CLASSE.length];
  }

  // ==========================================
  // OBJECTIFS (journal) ET INDICES
  // ==========================================
  // Une ligne n'apparaît que lorsque le joueur a découvert ce dont elle parle : aucun divulgâcheur.
  const PIECES_ARME = ["tuyau_metal", "lame_lourde", "ruban_adhesif"];
  const OBJECTIFS = [
    { id: "sortir", texte: "Sortir de l'école.", visible: () => true, fait: (p) => p.gagne },
    { id: "cle", texte: "Les portes principales sont enchaînées : trouver la clé principale.", visible: (p) => p.visites.has(LIEU_SORTIE) || p.faits.includes("mural"), fait: (p) => p.possede("cle_principale") || p.gagne, faitTexte: "Tu as la clé principale. Maintenant, la sortie." },
    { id: "coffre", texte: "La clé est dans le coffre du secrétariat.", visible: (p) => p.faits.includes("mural") || p.faits.includes("postit") || p.pages.includes(6), fait: (p) => Boolean(p.codes[11]) },
    { id: "code_coffre", texte: "Trouver le code du coffre : la réponse au problème du tableau de M. Plante.", visible: (p) => p.faits.includes("postit") || p.faits.includes("mural"), fait: (p) => Boolean(p.codes[11]) },
    { id: "cadenas", texte: "Briser le cadenas rouillé du secrétariat. Il faut quelque chose de solide.", visible: (p) => p.visites.has(LIEU_SORTIE), fait: (p) => p.flags.cadenas_brise },
    { id: "arme", texte: "Te fabriquer une arme (« Ne sors pas sans te défendre »).", visible: (p) => p.faits.includes("mural") || p.possede("tuyau_metal") || p.possede("lame_lourde") || p.flags.arme_fabriquee, fait: (p) => p.flags.arme_fabriquee },
    { id: "ruban", texte: "Trouver de quoi faire tenir les pièces ensemble.", visible: (p) => p.faits.includes("sans_ruban"), fait: (p) => p.possede("ruban_adhesif") || p.flags.arme_fabriquee, faitTexte: "Tu as de quoi faire tenir les pièces ensemble." },
    { id: "force", texte: "Reprendre des forces : manger quelque chose avant de frapper.", visible: (p) => p.faits.includes("faible") || p.scenes.includes("faim2"), fait: (p) => p.flags.a_mange, faitTexte: "Tu as repris des forces." },
    { id: "depot", texte: "Ouvrir le dépôt de sciences (B247) : cadenas à deux lettres.", visible: (p) => p.visites.has(5), fait: (p) => Boolean(p.codes[5]) },
    { id: "armoire", texte: "Ouvrir l'armoire de premiers soins (F212) : cadenas à trois chiffres.", visible: (p) => p.visites.has(16) || p.pages.includes(3), fait: (p) => Boolean(p.codes[16]) },
    { id: "lumiere", texte: "Revenir aux vestiaires avec de la lumière : quelque chose traîne par terre.", visible: (p) => p.faits.includes("noir13"), fait: (p) => p.possede("tuyau_metal") || p.flags.arme_fabriquee, faitTexte: "Tu as trouvé ce qui traînait aux vestiaires." },
  ];

  // Indices gradués. L'étape visée est la première non accomplie dont la condition est remplie.
  // Niveau 1 : où chercher. 2 : quoi relier. 3 : la méthode. Jamais la réponse d'un code.
  // Un niveau de plus se débloque après ATTENTE_INDICE actions (regarder et lire ne comptent pas).
  const ATTENTE_INDICE = 12;
  const INDICES = [
    {
      id: "silhouette", ok: (p) => !p.silhouetteIci(),
      niveaux: [
        "Elle ne voit rien : elle écoute. Ne fais aucun bruit, et surtout, ne passe pas près d'elle.",
        "Deux façons de t'en débarrasser : ATTENDRE sans bouger qu'elle s'en aille, ou LANCER un objet inutile pour faire du bruit ailleurs.",
      ],
    },
    {
      id: "gardien", ok: (p) => !p.gardien,
      niveaux: ["Ton arme. C'est maintenant qu'elle sert : FRAPPER. Ou LANCE quelque chose d'inutile pour l'attirer ailleurs. Vite."],
    },
    {
      id: "depot", ok: (p) => Boolean(p.codes[5]), deja: (p) => (p.faits.includes("fiche") ? 1 : 0),
      niveaux: [
        "Aux laboratoires de sciences, tout près du carrefour de l'étage, un dépôt est fermé par un cadenas à lettres.",
        "Lis la fiche collée sur la porte du dépôt, puis le tableau périodique au mur.",
        "Ce métal argenté coulait autrefois dans les thermomètres. Il porte le nom de la planète la plus proche du Soleil. Cherche ce nom sur le tableau périodique, puis compose son symbole.",
      ],
    },
    {
      id: "armoire", ok: (p) => Boolean(p.codes[16]), deja: (p) => (p.faits.includes("gravure") ? 1 : 0),
      niveaux: [
        "Il existe une armoire de premiers soins à l'étage de l'Aile F. On y monte par l'escalier au bout du couloir de l'Aile F, ou en passant par l'étage de l'Aile C.",
        "La gravure de l'armoire parle de « la caverne » : relis la description de l'auditorium. Et la classe où tout a commencé, c'est celle où tu as ouvert les yeux.",
        "Compte les places de l'auditorium (le balcon ou la salle te le disent), puis soustrais le numéro de ta classe.",
      ],
    },
    {
      id: "tuyau", ok: (p) => p.possede("tuyau_metal") || p.flags.arme_fabriquee, si: (p) => p.possede("baton_lumineux"),
      niveaux: [
        "Les vestiaires, au couloir des gymnases, sont plongés dans le noir complet. Quelque chose y traîne par terre.",
        "Ton bâton lumineux éclaire (ALLUMER BÂTON s'il est éteint) : va aux vestiaires et prends ce qui traîne par terre.",
      ],
    },
    {
      id: "lame", ok: (p) => p.possede("lame_lourde") || p.flags.arme_fabriquee,
      niveaux: [
        "Une arme, ça prend un manche et quelque chose de tranchant. Une cuisine de cafétéria regorge de choses tranchantes.",
        "Passe par la porte battante de la cafétéria : les cuisines sont juste derrière.",
      ],
    },
    {
      id: "arme", ok: (p) => p.flags.arme_fabriquee, si: (p) => PIECES_ARME.every((id) => p.possede(id)),
      niveaux: ["Tu as un manche, une lame et du ruban. Tape COMBINER TUYAU ET LAME (ou touche « Combiner »)."],
    },
    {
      id: "ruban", ok: (p) => p.possede("ruban_adhesif") || p.flags.arme_fabriquee,
      niveaux: ["Pour fixer une lame à un manche, il te faut du ruban adhésif. Le dépôt des laboratoires en contient."],
    },
    {
      id: "force", ok: (p) => p.flags.a_mange, si: (p) => p.flags.arme_fabriquee,
      niveaux: ["Tu n'as rien mangé depuis le dîner. Une barre tendre a été oubliée sur une table de la cafétéria. MANGE-la avant de frapper."],
    },
    {
      id: "avant_cadenas", ok: (p) => p.flags.cadenas_brise, deja: (p) => (p.faits.includes("postit") ? 1 : 0),
      niveaux: [
        "Le cadenas du secrétariat cédera sous ton arme. Mais le bruit va les attirer, et tu n'auras que quelques gestes. Connais-tu déjà le code du coffre ?",
        "Lis le post-it à travers la vitre du secrétariat, au couloir administratif. Résous le problème du tableau de M. Plante AVANT de frapper.",
        "Intérêt composé : la 1re année, tu gagnes 10 % de 1 000 $. La 2e année, 10 % du NOUVEAU montant. Calcule en deux étapes, note le résultat, puis frappe.",
      ],
    },
    {
      id: "coffre", ok: (p) => Boolean(p.codes[11]),
      niveaux: ["Le code du coffre est la réponse au problème du tableau de M. Plante. Compose-le, vite."],
    },
    {
      id: "fin", ok: (p) => p.gagne,
      niveaux: ["Tu as la clé principale. Retourne au couloir administratif et UTILISE LA CLÉ sur les chaînes."],
    },
  ];

  // ==========================================
  // ÉCOUTER, SCÈNES
  // ==========================================
  // Les infectés entendent tout. Toi aussi, si tu tends l'oreille.
  const ECOUTES = {
    1: "Le tic-tac de l'horloge s'est arrêté. Tu ne savais même pas qu'il existait avant qu'il manque.",
    2: "Le métal des casiers craque doucement en refroidissant. Au bout du corridor, rien. Tu crois.",
    3: "Par la cage d'escalier monte un souffle d'air froid. Et, tout en bas, très loin, un bruit mouillé, régulier. Une goutte ? Des pas ? Impossible à dire.",
    4: "En bas, dans la mer de sièges, un craquement. Un fauteuil qui se replie. Comme quand quelqu'un se lève.",
    5: "Le bourdonnement des hottes s'est tu. Seule une goutte tombe dans un évier, quelque part.",
    6: "L'escalier, les piliers, quatre couloirs. Le moindre son pourrait venir de n'importe où. Pour l'instant, il n'y en a aucun.",
    7: "Le ronron des frigos s'est tu depuis longtemps. Il ne reste que le craquement des chaises en plastique qui refroidissent.",
    8: "Tes propres pas te reviennent, déformés, une demi-seconde trop tard. Comme si quelqu'un marchait derrière toi, à ton rythme.",
    10: "Derrière les chaînes, le vent siffle sous les portes. Au loin, très loin, quelque chose qui traîne.",
    11: "Le tic-tac d'une horloge à pile, sur le mur. La seule chose qui marche encore dans cette école.",
    12: "Tes pas, étouffés. Et, au bout du couloir, vers l'Aile H, un murmure continu que tu préfères ne pas reconnaître.",
    13: "La goutte. Encore la goutte. Et, entre deux gouttes, une respiration qui n'est pas la tienne.",
    14: "Le vent siffle contre les hautes fenêtres. Dehors, dans la cour, un froissement de pieds sur le gravier. Beaucoup de pieds.",
    15: "De l'autre côté de la porte de secours, un frottement contre le métal. Comme des ongles.",
    16: "Le couloir est si étroit que tu entends ton propre cœur rebondir contre les murs.",
    17: "Derrière les vitres, la ville. Pas une sirène, pas un moteur, pas un chien. Montréal n'a jamais été aussi silencieuse.",
    18: "Rien. Une place immense et vide, où même ton souffle a de l'écho.",
    19: "Un néon grince au bout de son fil. Puis s'immobilise. Comme si on l'avait retenu.",
    20: "Des portes du gymnase 6 monte un murmure continu, comme une respiration. Des centaines de souffles, au même rythme. Ne t'approche pas.",
    21: "Le métal des comptoirs travaille dans le froid, avec de petits claquements secs.",
    22: "Les pages du sac à dos tournent encore, avec un petit bruit sec. Il n'y a pas de courant d'air.",
    23: "Le silence d'une bibliothèque. Mais en pire.",
    24: "Le divan craque quand tu passes à côté. Tu te figes. Rien ne répond.",
    25: "Un ventilateur d'ordinateur ralentit, ralentit… et s'arrête. Il restait donc un peu de courant quelque part. Il n'en reste plus.",
    26: "Derrière la barricade, en bas de l'escalier, quelque chose gratte. Lentement. Patiemment.",
    27: "Un dédale de couloirs, et partout le même silence.",
    28: "Le distributeur éventré cliquette en refroidissant.",
    defaut: "Tu retiens ton souffle et tu tends l'oreille. Rien. Le silence a une épaisseur, ici, comme sous l'eau.",
  };
  const ECOUTE_VESTIAIRES_NOIR =
    "Une goutte, régulière. Et, quand tu bouges le pied, un tintement métallique qui roule sur le carrelage. Il y a quelque chose par terre.";
  const ECOUTE_CHAMBRE_FROIDE =
    "Derrière la porte de la chambre froide, le frottement. Il tourne en rond. Il ne sait pas que tu es là. Pas encore.";
  const ECOUTE_SILHOUETTE = "Sa respiration. Rauque, mouillée, lente. Elle n'a rien entendu.";

  // Scènes jouées une seule fois, au plus une par action. quand(p) : vrai quand elle doit arriver.
  const SCENES = [
    {
      id: "descente",
      quand: (p, avant) => p.lieu === 6 && avant !== 6,
      texte: "Tu viens à peine d'atteindre le carrefour quand, quelque part dans le bâtiment, une porte claque. Une seule fois. L'écho roule entre les piliers, puis s'éteint. Tu restes immobile. Tu comptes jusqu'à soixante. Rien d'autre ne vient. Au pied de l'escalier, une chaussure de course. Une seule. Le lacet est encore noué.",
    },
    {
      id: "faim1",
      quand: (p) => p.actions >= 20 && !p.flags.a_mange,
      texte: "Ton ventre gargouille. Dans ce silence, le bruit te paraît énorme. Tu plaques les deux mains sur ton estomac et tu attends, le souffle coupé. Rien. Tu n'as rien mangé depuis le dîner. Il va falloir trouver quelque chose.",
    },
    {
      id: "traces",
      quand: (p) => p.lieu === 13 && p.flags.lumiere,
      texte: "Dans la lueur verte, des traces de pas mouillées partent des douches et traversent la pièce. Elles s'arrêtent devant un casier fermé. Elles ne repartent pas.",
    },
    {
      id: "avant_le_coup",
      quand: (p) => p.lieu === LIEU_SORTIE && p.possede("arme_artisanale") && !p.flags.cadenas_brise,
      texte: "Tu regardes le cadenas rouillé. Puis le couloir derrière toi, qui s'enfonce dans le noir. Un seul coup suffira peut-être. Mais ce coup-là, toute l'école va l'entendre. Avant de frapper, sache exactement ce que tu feras ensuite.",
    },
    {
      id: "ballon",
      quand: (p) => Object.keys(p.codes).length >= 2 && p.lieu !== 14 && p.poursuite === 0,
      texte: "Très loin, du côté des gymnases, un ballon rebondit. Une fois. Deux fois. Puis il roule, longtemps, et s'arrête. Le silence qui suit est pire que le bruit.",
    },
    {
      id: "faim2",
      quand: (p) => p.actions >= 45 && !p.flags.a_mange,
      texte: "Tes jambes tremblent. Ta vue se brouille quand tu tournes la tête trop vite. Le froid, la peur, la faim : ton corps commence à lâcher. Sans manger, tu n'auras jamais la force de frapper.",
    },
    {
      id: "interphone",
      quand: (p) => p.actions >= 80 && !p.faits.includes("postit") && !p.faits.includes("mural") && p.poursuite === 0,
      texte: "L'interphone grésille au-dessus de toi. Tu sursautes. Une voix hachée, à moitié avalée par la friture : « …le code du coffre… au tableau… Plante… » Un sifflement aigu, puis plus rien.",
    },
  ];

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
    ALLER: "ALLER", VA: "ALLER", VAS: "ALLER", AVANCER: "ALLER", MARCHER: "ALLER", AVANCE: "ALLER", MARCHE: "ALLER",
    GO: "ALLER", COURIR: "ALLER", COURS: "ALLER", DIRIGER: "ALLER",
    PASSER: "ALLER", PASSE: "ALLER", TRAVERSER: "ALLER", TRAVERSE: "ALLER",
    PRENDRE: "PRENDRE", PRENDS: "PRENDRE", PREND: "PRENDRE", RAMASSER: "PRENDRE", RAMASSE: "PRENDRE", P: "PRENDRE",
    POGNER: "PRENDRE", POGNE: "PRENDRE", POGNES: "PRENDRE", ATTRAPER: "PRENDRE", ATTRAPE: "PRENDRE",
    SAISIR: "PRENDRE", SAISIS: "PRENDRE", TAKE: "PRENDRE", GET: "PRENDRE", RECUPERER: "PRENDRE", RECUPERE: "PRENDRE",
    REGARDER: "REGARDER", REGARDE: "REGARDER", R: "REGARDER", L: "REGARDER", EXAMINER: "REGARDER", EXAMINE: "REGARDER",
    OBSERVER: "REGARDER", OBSERVE: "REGARDER", X: "REGARDER", FOUILLER: "REGARDER", FOUILLE: "REGARDER",
    CHECK: "REGARDER", CHECKER: "REGARDER", CHECKE: "REGARDER", LOOK: "REGARDER", VOIR: "REGARDER", VOIS: "REGARDER",
    INSPECTER: "REGARDER", INSPECTE: "REGARDER", TOUCHER: "REGARDER", TOUCHE: "REGARDER", DECRIRE: "REGARDER",
    TATER: "REGARDER", TATE: "REGARDER", TATONNER: "REGARDER", TATONNE: "REGARDER", CHERCHER: "REGARDER", CHERCHE: "REGARDER",
    LIRE: "LIRE", LIS: "LIRE", LIT: "LIRE", READ: "LIRE",
    COMBINER: "COMBINER", COMBINE: "COMBINER", ASSEMBLER: "COMBINER", ASSEMBLE: "COMBINER",
    FABRIQUER: "COMBINER", FABRIQUE: "COMBINER", FIXER: "COMBINER", FIXE: "COMBINER", ATTACHER: "COMBINER", ATTACHE: "COMBINER",
    COLLER: "COMBINER", COLLE: "COMBINER", SCOTCHER: "COMBINER",
    MANGER: "MANGER", MANGE: "MANGER", AVALER: "MANGER", AVALE: "MANGER", CROQUER: "MANGER", CROQUE: "MANGER",
    BOUFFER: "MANGER", BOUFFE: "MANGER", EAT: "MANGER",
    FRAPPER: "FRAPPER", FRAPPE: "FRAPPER", FRACASSER: "FRAPPER", FRACASSE: "FRAPPER",
    BRISER: "FRAPPER", BRISE: "FRAPPER", CASSER: "FRAPPER", CASSE: "FRAPPER", COGNER: "FRAPPER", COGNE: "FRAPPER",
    DEFONCER: "FRAPPER", DEFONCE: "FRAPPER", ATTAQUER: "FRAPPER", ATTAQUE: "FRAPPER", BOTTER: "FRAPPER", BOTTE: "FRAPPER",
    TUER: "FRAPPER", TUE: "FRAPPER", HIT: "FRAPPER", KICK: "FRAPPER", DETRUIRE: "FRAPPER",
    UTILISER: "UTILISER", UTILISE: "UTILISER", U: "UTILISER", USE: "UTILISER", INSERER: "UTILISER", INSERE: "UTILISER",
    OUVRIR: "OUVRIR", OUVRE: "OUVRIR", DEVERROUILLER: "OUVRIR", DEVERROUILLE: "OUVRIR", DEBARRER: "OUVRIR", DEBARRE: "OUVRIR",
    OPEN: "OUVRIR", POUSSER: "OUVRIR", POUSSE: "OUVRIR",
    ENTRER: "ENTRER", ENTRE: "ENTRER", VISITER: "ENTRER", VISITE: "ENTRER",
    COMPOSER: "COMPOSER", COMPOSE: "COMPOSER", TAPER: "COMPOSER", TAPE: "COMPOSER",
    CODE: "COMPOSER", COMBINAISON: "COMPOSER", ESSAYER: "COMPOSER", ESSAIE: "COMPOSER",
    TIRER: "TIRER", TIRE: "TIRER", ACTIONNER: "TIRER", ACTIONNE: "TIRER", ABAISSER: "TIRER", ABAISSE: "TIRER",
    RETOUR: "RETOUR", RETOURNER: "RETOUR", REVENIR: "RETOUR", RECULER: "RETOUR", RECULE: "RETOUR", BACK: "RETOUR",
    SORTIR: "SORTIR", SORS: "SORTIR", FUIR: "SORTIR", FUIS: "SORTIR", RESSORTIR: "SORTIR", RESSORS: "SORTIR", QUITTER: "META",
    CARTE: "CARTE", PLAN: "CARTE", M: "CARTE", MAP: "CARTE",
    ALLUMER: "ALLUMER", ALLUME: "ALLUMER", PLIER: "ALLUMER", PLIE: "ALLUMER", CRAQUER: "ALLUMER", CRAQUE: "ALLUMER",
    INVENTAIRE: "INVENTAIRE", INV: "INVENTAIRE", I: "INVENTAIRE", SAC: "INVENTAIRE", POCHES: "INVENTAIRE",
    NOTES: "NOTES", RELIRE: "NOTES",
    LOCAUX: "LOCAUX", LOCAL: "LOCAUX",
    AIDE: "AIDE", "?": "AIDE", HELP: "AIDE", COMMANDES: "AIDE",
    ECOUTER: "ECOUTER", ECOUTE: "ECOUTER", LISTEN: "ECOUTER", ENTENDRE: "ECOUTER",
    ATTENDRE: "ATTENDRE", ATTENDS: "ATTENDRE", PATIENTER: "ATTENDRE", CACHER: "ATTENDRE", CACHE: "ATTENDRE",
    RETENIR: "ATTENDRE", IMMOBILE: "ATTENDRE", WAIT: "ATTENDRE", Z: "ATTENDRE", FIGER: "ATTENDRE",
    CRIER: "CRIER", CRIE: "CRIER", HURLER: "CRIER", HURLE: "CRIER", APPELER: "CRIER", APPELLE: "CRIER", ALLO: "CRIER",
    LANCER: "LANCER", LANCE: "LANCER", JETER: "LANCER", JETTE: "LANCER", THROW: "LANCER",
    INDICE: "INDICE", INDICES: "INDICE", ASTUCE: "INDICE", BLOQUE: "INDICE", HINT: "INDICE",
    OBJECTIFS: "OBJECTIFS", OBJECTIF: "OBJECTIFS", BUT: "OBJECTIFS", BUTS: "OBJECTIFS", QUETE: "OBJECTIFS", MISSION: "OBJECTIFS",
    // Commandes qui ne font rien dans la nuit, mais qui méritent une réponse.
    SAUVEGARDER: "META", SAUVEGARDE: "META", SAVE: "META", CHARGER: "META", LOAD: "META", UNDO: "META", ANNULER: "META",
    CONTINUER: "META", REPRENDRE: "META",
    DORMIR: "META", DORS: "META", SAUTER: "META", SAUTE: "META", PLEURER: "META", PLEURE: "META", PRIER: "META",
  };
  const TEXTES_META = {
    DORMIR: "Dormir ? C'est comme ça que tout a commencé.", DORS: "Dormir ? C'est comme ça que tout a commencé.",
    SAUTER: "Sauter ? Ici, dans le noir ? Pas question.", SAUTE: "Sauter ? Ici, dans le noir ? Pas question.",
    PLEURER: "Tu en as envie. Tu serres les dents. Pas maintenant.", PLEURE: "Tu en as envie. Tu serres les dents. Pas maintenant.",
    PRIER: "Tu fermes les yeux une seconde. Quand tu les rouvres, l'école est toujours là.",
    CONTINUER: "Tu es bien en vie. Continue.", REPRENDRE: "Tu es bien en vie. Continue.",
    QUITTER: "Pour quitter la partie, touche QUITTER en haut de l'écran. Pour sortir d'ici, touche une sortie.",
    defaut: "Pas besoin : la nuit garde elle-même un moment sûr à chaque étape importante.",
  };
  // Commandes qui ne coûtent ni temps de poursuite ni attente d'indice : regarder, lire, consulter.
  const GRATUITS = new Set(["REGARDER", "LIRE", "INVENTAIRE", "CARTE", "ECOUTER", "META", "LOCAUX"]);

  const MOTS_VIDES = new Set([
    "LE", "LA", "LES", "L", "UN", "UNE", "DES", "DE", "DU", "D", "AU", "AUX", "DANS",
    "A", "VERS", "SUR", "AVEC", "ET", "EN", "MON", "MA", "MES", "TON", "TA", "TES", "CE", "CETTE",
    "SON", "SA", "SES", "PAR", "POUR",
  ]);
  // Débuts de phrase ignorés : « je prends le calepin », « je vais à la cafétéria ».
  const PRONOMS = new Set(["JE", "J", "TU", "ON", "ME", "M", "TE", "T", "SE", "S", "VAIS", "VEUX", "PEUX", "DOIS"]);

  // Décors : mots reconnus mais qui ne sont pas des objets d'inventaire.
  const DECORS = {
    CADENAS: "CADENAS",
    CHAINE: "CHAINES", CHAINES: "CHAINES", SERRURE: "CHAINES",
    PORTE: "PORTE", PORTES: "PORTE", SORTIE: "PORTE",
    SECRETARIAT: "SECRETARIAT",
    FENETRE: "FENETRE", FENETRES: "FENETRE", VITRE: "FENETRE", VITRES: "FENETRE", CARREAU: "FENETRE",
    ALARME: "ALARME", AVERTISSEUR: "ALARME", POIGNEE: "ALARME",
    COFFRE: "COFFRE", ARMOIRE: "ARMOIRE", DEPOT: "DEPOT", TIROIR: "TIROIR",
    SILHOUETTE: "SILHOUETTE", ZOMBIE: "SILHOUETTE", ZOMBIES: "SILHOUETTE", CREATURE: "SILHOUETTE", CHOSE: "SILHOUETTE",
    INFECTE: "SILHOUETTE", MONSTRE: "SILHOUETTE", ELLE: "SILHOUETTE", LUI: "SILHOUETTE", GARDIEN: "SILHOUETTE", CONCIERGE: "SILHOUETTE",
    DEHORS: "DEHORS", EXTERIEUR: "DEHORS", ECOLE: "DEHORS", COUR: "DEHORS", SECOURS: "DEHORS",
  };

  function normaliser(texte) {
    return texte
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9?]+/g, " ")
      .trim();
  }

  // Distance d'édition (une inversion de deux lettres compte pour une faute) : « agneda » = « agenda ».
  function distance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) d[i] = [i];
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cout = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  // Le mot connu le plus proche d'une faute de frappe, s'il n'y en a qu'un.
  function corriger(mot, connus) {
    if (mot.length < 5 || /[0-9]/.test(mot)) return null;
    const max = mot.length >= 8 ? 2 : 1;
    let meilleur = null;
    let ex = false;
    let min = max + 1;
    for (const k of connus) {
      if (Math.abs(k.length - mot.length) > max || k.length < 4) continue;
      const dd = distance(mot, k);
      if (dd < min) { min = dd; meilleur = k; ex = false; } else if (dd === min) ex = true;
    }
    return meilleur && !ex ? meilleur : null;
  }
  const MOTS_OBJETS = [...new Set(Object.values(OBJETS).flatMap((o) => o.mots))];
  // Une faute de frappe ne doit jamais produire un geste bruyant (« classe » n'est pas « casse »).
  const VERBES_BRUYANTS = new Set(["FRAPPER", "CRIER", "TIRER", "LANCER"]);
  const MOTS_VERBES = Object.keys(VERBES).filter((k) => k.length >= 4 && !VERBES_BRUYANTS.has(VERBES[k]));

  const MOTIF_LOCAL = /^[A-H][0-9]{3}[A-Z]?$/;
  // « noter … », « écrire … », « prendre note(s) … » : le reste est gardé tel quel.
  const MOTIF_NOTER = /^\s*(?:noter|note|[ée]crire|[ée]cris|prendre\s+notes?|prends\s+notes?)\b\s*:?\s*(.*)$/i;
  const MOTIF_EFFACER_NOTES = /^\s*(?:effacer|efface|arracher|arrache)\s+(?:les\s+|mes\s+)?(?:notes?|pages?|calepin)\s*$/i;
  const NOTES_MAX = 40;
  const NOTE_LONGUEUR_MAX = 200;

  // Un mot que le jeu connaît déjà (objet, décor, lieu) n'est jamais « corrigé » en verbe.
  let MOTS_CONNUS = null;
  function motConnu(m) {
    if (!MOTS_CONNUS) {
      MOTS_CONNUS = new Set([...MOTS_OBJETS, ...Object.keys(DECORS), ...Object.keys(SYNONYMES), "CLASSE", "SALLE", "LOCAL", "CRAIE", "TITRE"]);
      for (const id in DESTINATIONS) for (const x of normaliser(DESTINATIONS[id]).split(" ")) MOTS_CONNUS.add(x);
      for (const id in LIEUX) for (const l of LIEUX[id].lectures || []) for (const x of l.mots || []) MOTS_CONNUS.add(x);
    }
    return MOTS_CONNUS.has(m);
  }

  function analyser(commande) {
    let mots = normaliser(commande).split(" ").filter(Boolean);
    while (mots.length > 1 && PRONOMS.has(mots[0])) mots = mots.slice(1);
    if (mots.length === 0) return null;
    let verbe = null;
    let direction = null;
    // « local A120 », « salle B145 », « classe A209 » : le numéro suffit.
    if (["LOCAL", "SALLE", "CLASSE", "PORTE"].includes(mots[0]) && mots.length > 1 && MOTIF_LOCAL.test(mots.slice(1).join(""))) mots = mots.slice(1);
    let premier = mots[0];
    if (!VERBES[premier] && !DIRECTIONS[premier] && !motConnu(premier) && !MOTIF_LOCAL.test(mots.join(""))) {
      const proche = corriger(premier, MOTS_VERBES);
      if (proche) premier = mots[0] = proche;
    }
    if (MOTIF_LOCAL.test(mots.join(""))) {
      verbe = "ENTRER"; // « B243 » ou « B 243 » tout seul
    } else if (DIRECTIONS[premier] && mots.length === 1) {
      verbe = "ALLER";
      direction = DIRECTIONS[premier];
    } else if (VERBES[premier]) {
      verbe = VERBES[premier];
    } else if (DIRECTIONS[premier]) {
      verbe = "ALLER";
      direction = DIRECTIONS[premier];
    }
    const suite = verbe === "ENTRER" && !VERBES[premier] ? mots : mots.slice(1);
    const reste = suite.filter((m) => !MOTS_VIDES.has(m));
    if (verbe === "ALLER" && !direction) {
      const d = reste.find((m) => DIRECTIONS[m]);
      if (d && reste.length === 1) direction = DIRECTIONS[d];
    }
    const objets = [];
    const decors = [];
    for (let m of reste) {
      let trouve = false;
      for (const id in OBJETS) {
        if (OBJETS[id].mots.includes(m)) {
          trouve = true;
          if (!objets.includes(id)) objets.push(id);
        }
      }
      if (DECORS[m] && !decors.includes(DECORS[m])) decors.push(DECORS[m]);
      if (!trouve && !DECORS[m] && verbe && !["ALLER", "ENTRER", "COMPOSER"].includes(verbe)) {
        const proche = corriger(m, MOTS_OBJETS);
        if (proche) {
          for (const id in OBJETS) if (OBJETS[id].mots.includes(proche) && !objets.includes(id)) objets.push(id);
        }
      }
    }
    // « clé dorée », « clé principale » : le mot qui suit tranche. « clé » tout court : la partie décide.
    if (objets.includes("cle_doree") && objets.includes("cle_principale")) {
      if (reste.some((m) => ["DOREE", "ETOILE", "PETITE"].includes(m))) objets.splice(objets.indexOf("cle_principale"), 1);
      else if (reste.includes("PRINCIPALE")) objets.splice(objets.indexOf("cle_doree"), 1);
    }
    return {
      verbe, direction, objets, decors, mots: reste, suite: suite.join(""), complet: mots.join(""),
      cle: mots.filter((m) => !MOTS_VIDES.has(m)).join(""), brut: commande, premier,
    };
  }

  // Description avec mots touchables : « [tableau] » ou « [texte|commande] ».
  function lier(s) {
    const segments = [];
    const re = /\[([^\]|]+)(?:\|([^\]]+))?\]/g;
    let i = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > i) segments.push(s.slice(i, m.index));
      segments.push({ t: m[1], c: m[2] || "regarder " + m[1] });
      i = re.lastIndex;
    }
    if (i < s.length) segments.push(s.slice(i));
    return { texte: segments.map((x) => (typeof x === "string" ? x : x.t)).join(""), segments };
  }

  const sansBalises = (s) => lier(s).texte;

  function sys(texte) {
    return { type: "systeme", texte };
  }

  function chapitre(n) {
    return { type: "chapitre", numero: CHAPITRES[n][0], texte: CHAPITRES[n][1] };
  }

  // Autres noms des lieux : « labos », « sciences », « cafét », « gym »…
  const SYNONYMES = {
    LABO: 5, LABOS: 5, LABORATOIRE: 5, SCIENCES: 5, LABOSCIENCES: 5, LABORATOIRESSCIENCES: 5,
    CAFET: 7, CAFE: 7, CAFETE: 7, CAFETERIAS: 7, CUISINE: 21, AUDITO: 8, AUDI: 8, SALLESPECTACLE: 8,
    DIRECTION: 10, ADMINISTRATION: 10, ENTREE: 10, BIBLIO: 23, VESTIAIRE: 13, GYM: 12, GYMNASES: 12, GYM1: 14,
    CLASSE: 1, A217: 1, CLASSEPLANTE: 1, PLANTE: 1, CENTRE: 25, PASSERELLES: 5, VIEETUDIANTE: 24,
  };

  // Nom d'une destination comparé sans les petits mots (« de », « l' »), comme une commande.
  const cleNom = (nom) => normaliser(nom).split(" ").filter((m) => !MOTS_VIDES.has(m)).join("");

  // ==========================================
  // PARTIE
  // ==========================================
  class Partie {
    constructor() {
      this.lieu = LIEU_DEPART;
      this.inventaire = ["telephone_mort"];
      this.objetsParLieu = {};
      for (const id in LIEUX) this.objetsParLieu[id] = (LIEUX[id].objets || []).slice();
      this.flags = { a_mange: false, arme_fabriquee: false, cadenas_brise: false, lumiere: false };
      this.codes = {}; // réponses trouvées, par lieu
      this.notes = []; // ce que le joueur a écrit dans le calepin
      this.indicesTrouves = []; // lectures clés recopiées automatiquement dans le calepin
      this.indicesLus = []; // lectures clés lues, même sans calepin (recopiées quand on le prend)
      this.objetsVus = ["telephone_mort"]; // objets déjà aperçus (on ne nomme jamais un objet jamais vu)
      this.textesVus = []; // textes de locaux ordinaires déjà lus (la deuxième fois, une version courte)
      this.locauxFouilles = [];
      this.objetsLocaux = objetsLocauxDepart(); // objets encore dans les locaux, par numéro
      this.localOuvert = null; // local où l'on vient d'entrer : PRENDRE y fonctionne jusqu'au prochain déplacement
      this.visites = new Set([LIEU_DEPART]);
      this.chemin = []; // lieux traversés, pour RETOUR
      this.precedent = null;
      this.poursuite = 0; // actions restantes avant que la chose n'arrive (0 = pas de poursuite)
      this.tour = 0; // commandes jouées (hors aide et calepin)
      this.actions = 0; // gestes qui prennent du temps (regarder, lire, consulter ne comptent pas)
      this.evenementVu = false;
      this.scenes = []; // scènes déjà jouées
      this.chapitres = [];
      this.faits = []; // découvertes : mur lu, post-it lu, trop faible, pas de ruban…
      this.approches = []; // dangers déjà vus de près (la deuxième fois, c'est un choix)
      this.silhouette = "absente"; // la rencontre de la cafétéria : absente, cafeteria, chambre_froide
      this.attente = 0;
      this.gardien = false; // une silhouette entre toi et la sortie
      this.epargne = null; // le gardien : épargné (leurre) ou frappé
      this.pages = []; // pages du carnet de R. trouvées
      this.pointSur = null; // dernier moment sûr (état JSON) où l'on revient après une mort
      this.pointSurLibelle = null;
      this.morts = 0;
      this.indice = { etape: null, niveau: 0, actions: 0 };
      this.indicesUtilises = 0;
      this.actionsIndice = 0; // gestes qui comptent pour débloquer l'indice suivant (ATTENDRE ne compte pas)
      this.derniereMort = null;
      this.termine = false;
      this.gagne = false;
    }

    // Sauvegarde : un objet JSON qu'on peut remettre dans Partie.restaurer.
    exporter() {
      return {
        lieu: this.lieu,
        inventaire: this.inventaire,
        objetsParLieu: this.objetsParLieu,
        flags: this.flags,
        codes: this.codes,
        notes: this.notes,
        indicesTrouves: this.indicesTrouves,
        indicesLus: this.indicesLus,
        objetsVus: this.objetsVus,
        textesVus: this.textesVus,
        locauxFouilles: this.locauxFouilles,
        objetsLocaux: this.objetsLocaux,
        localOuvert: this.localOuvert,
        visites: [...this.visites],
        chemin: this.chemin,
        precedent: this.precedent,
        poursuite: this.poursuite,
        tour: this.tour,
        actions: this.actions,
        evenementVu: this.evenementVu,
        scenes: this.scenes,
        chapitres: this.chapitres,
        faits: this.faits,
        approches: this.approches,
        silhouette: this.silhouette,
        attente: this.attente,
        gardien: this.gardien,
        epargne: this.epargne,
        pages: this.pages,
        pointSur: this.pointSur,
        pointSurLibelle: this.pointSurLibelle,
        morts: this.morts,
        indice: this.indice,
        indicesUtilises: this.indicesUtilises,
        actionsIndice: this.actionsIndice || 0,
        derniereMort: this.derniereMort,
        termine: this.termine,
        gagne: this.gagne,
      };
    }

    // Accepte aussi les sauvegardes des versions précédentes (champs absents = valeurs de départ).
    static restaurer(d) {
      const p = new Partie();
      const s = JSON.parse(JSON.stringify(d));
      Object.assign(p, s, {
        visites: new Set(s.visites || [LIEU_DEPART]),
        notes: s.notes || [],
        indicesTrouves: s.indicesTrouves || [],
        indicesLus: s.indicesLus || s.indicesTrouves || [],
        objetsVus: s.objetsVus || [...new Set(["telephone_mort", ...(s.inventaire || [])])],
        textesVus: s.textesVus || [],
        objetsLocaux: s.objetsLocaux || objetsLocauxDepart(),
        localOuvert: s.localOuvert || null,
        chemin: s.chemin || (s.precedent ? [s.precedent] : []),
        scenes: s.scenes || [],
        chapitres: s.chapitres || [1],
        faits: s.faits || [],
        approches: s.approches || [],
        silhouette: s.silhouette || "absente",
        attente: s.attente || 0,
        gardien: Boolean(s.gardien),
        pages: s.pages || [],
        pointSur: s.pointSur || null,
        pointSurLibelle: s.pointSurLibelle || null,
        morts: s.morts || 0,
        indice: s.indice || { etape: null, niveau: 0, actions: 0 },
        indicesUtilises: s.indicesUtilises || 0,
        actions: s.actions !== undefined ? s.actions : s.tour || 0,
        derniereMort: s.derniereMort || null,
      });
      for (const id in LIEUX) if (!p.objetsParLieu[id]) p.objetsParLieu[id] = (LIEUX[id].objets || []).slice();
      return p;
    }

    // Moment sûr : instantané de la partie où l'on revient après une mort.
    marquerPointSur(libelle) {
      // Jamais pendant la poursuite : on reviendrait mourir au même endroit, sans fin.
      if (this.poursuite > 0) return { type: "sauvegarde", texte: "" };
      const d = this.exporter();
      d.pointSur = null;
      d.notes = [];
      d.indicesTrouves = [];
      this.pointSur = JSON.stringify(d);
      this.pointSurLibelle = libelle;
      return { type: "sauvegarde", texte: "◆ Moment sûr : " + libelle + "." };
    }

    // Après une mort : le monde revient au dernier moment sûr. Ce que tu as appris reste :
    // le calepin, les pages, les locaux visités, les dangers déjà vus, les indices et le compte des morts.
    reprendreAuPointSur() {
      const sauve = JSON.parse(this.pointSur);
      const avantInventaire = this.inventaire.slice();
      const garder = {
        notes: this.notes,
        indicesTrouves: this.indicesTrouves,
        indicesLus: this.indicesLus,
        objetsVus: this.objetsVus,
        textesVus: this.textesVus,
        // Les scènes déjà vues ne se rejouent pas (sauf le gardien, qui dépend de la poursuite).
        scenes: [...new Set([...(sauve.scenes || []), ...this.scenes.filter((x) => x !== "gardien")])],
        faits: this.faits,
        approches: this.approches,
        locauxFouilles: [...new Set([...(sauve.locauxFouilles || []), ...this.locauxFouilles])],
        visites: new Set([...(sauve.visites || []), ...this.visites]),
        pages: this.pages,
        morts: this.morts + 1,
        indice: this.indice,
        indicesUtilises: this.indicesUtilises,
        actionsIndice: this.actionsIndice || 0,
        actions: this.actions,
        tour: this.tour,
        evenementVu: this.evenementVu || Boolean(sauve.evenementVu),
        chapitres: this.chapitres,
        pointSur: this.pointSur,
        pointSurLibelle: this.pointSurLibelle,
        derniereMort: null,
      };
      Object.assign(this, Partie.restaurer(sauve), garder);
      const perdus = avantInventaire.filter((id) => !this.inventaire.includes(id) && OBJETS[id]);
      const blocs = [{ type: "reprise", texte: TEXTE_REPRISE(DESTINATIONS[this.lieu]) }];
      if (perdus.length) blocs.push(sys("Ce que tu avais ramassé depuis est retourné à sa place : " + perdus.map((id) => OBJETS[id].nom).join(", ") + "."));
      return [...blocs, ...this.decrireLieu(undefined, "long")];
    }

    // Sortie : liste de blocs { type, texte } que l'interface affiche.
    demarrer() {
      this.chapitres.push(1);
      this.marquerPointSur("le réveil, dans la classe de M. Plante");
      return [
        ...OUVERTURE.map((t) => ({ type: "ouverture", texte: t })),
        chapitre(1),
        ...this.decrireLieu(undefined, "long"),
      ];
    }

    // Reprise d'une partie sauvegardée (compte). Une partie interrompue par une mort reprend au moment sûr.
    reprendre() {
      if (this.termine && !this.gagne && this.pointSur) {
        return [sys("Ta dernière nuit s'était mal terminée."), ...this.reprendreAuPointSur()];
      }
      if (!this.pointSur) {
        // Ancienne sauvegarde prise en pleine poursuite : on revient devant le cadenas intact.
        if (this.poursuite > 0) {
          this.poursuite = 0;
          this.flags.cadenas_brise = false;
          this.gardien = false;
          this.scenes = this.scenes.filter((x) => x !== "gardien");
          this.lieu = LIEU_SORTIE;
          this.localOuvert = null;
        }
        this.marquerPointSur(DESTINATIONS[this.lieu]);
      }
      return [sys("Partie reprise là où tu l'avais laissée. Tape REJOUER pour recommencer à zéro."), ...this.decrireLieu(undefined, "long")];
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

    // Objet qu'on peut ramasser ici : dans le lieu (s'il y a de la lumière) ou dans le local ouvert.
    aPortee(id) {
      if (!this.dansLeNoir() && this.objetsParLieu[this.lieu].includes(id)) return true;
      const local = this.localOuvert && this.localOuvert.lieu === this.lieu ? this.localOuvert.cle : null;
      return Boolean(local && (this.objetsLocaux[local] || []).includes(id));
    }

    voir(ids) {
      for (const id of ids) if (!this.objetsVus.includes(id)) this.objetsVus.push(id);
    }

    // « Il n'y a pas de tuyau de métal ici » apprendrait qu'il existe : un objet jamais vu n'est pas nommé.
    absent(id) {
      return sys(this.objetsVus.includes(id) ? "Il n'y a pas " + OBJETS[id].pas + " ici." : "Tu ne vois pas ça ici.");
    }

    silhouetteIci() {
      return this.silhouette === "cafeteria" && this.lieu === LIEU_CAFETERIA;
    }

    gardienIci() {
      return this.gardien && this.lieu === LIEU_SORTIE;
    }

    // « clé » tout court : la clé dorée ou la clé principale, selon celle qui est là.
    preciser(c) {
      if (!(c.objets.includes("cle_principale") && c.objets.includes("cle_doree"))) return;
      const presents = ["cle_principale", "cle_doree"].filter((id) => this.possede(id) || this.aPortee(id));
      let garder;
      if (presents.length === 1) garder = presents[0];
      else if (presents.length === 2) garder = c.verbe === "LANCER" ? "cle_doree" : "cle_principale";
      else {
        c.objets = c.objets.filter((id) => !id.startsWith("cle_"));
        c.cleAbsente = true;
        return;
      }
      c.objets = c.objets.filter((id) => !id.startsWith("cle_") || id === garder);
    }

    lectures() {
      return (LIEUX[this.lieu].lectures || []).filter((l) => !l.si || l.si(this));
    }

    // Sorties du lieu, nommées par leur destination.
    sorties() {
      const lieu = LIEUX[this.lieu];
      const liste = ORDRE_DIRECTIONS.filter((d) => d in lieu.sorties).map((d) => {
        const dest = lieu.sorties[d];
        const garde = this.silhouetteIci() && dest === LIEU_CUISINES;
        return {
          direction: d,
          nom: DESTINATIONS[dest],
          id: dest,
          escalier: d === "HAUT" || d === "BAS",
          verrouille: this.lieu === LIEU_SORTIE && dest === LIEU_SECRETARIAT && !this.flags.cadenas_brise,
          piege: false,
          garde,
          averti: garde && this.approches.includes("rencontre_cuisines"),
        };
      });
      for (const d of ORDRE_DIRECTIONS) {
        if (lieu.pieges && lieu.pieges[d]) {
          const cle = lieu.pieges[d] === MORT_GYM6 ? "gym6" : "secours";
          liste.push({ direction: d, nom: NOMS_PIEGES[this.lieu][d], escalier: false, verrouille: false, piege: true, garde: false, averti: this.approches.includes(cle) });
        }
      }
      return liste;
    }

    sortiesVisibles() {
      return this.sorties().map((s) => {
        const fleche = s.direction === "HAUT" ? "↑ " : s.direction === "BAS" ? "↓ " : "→ ";
        return fleche + s.nom + (s.verrouille ? " (verrouillée)" : "") + (s.garde ? " (la silhouette)" : "") + (s.piege && s.averti ? " ⚠" : "");
      });
    }

    // Sortie désignée par son nom (« cafétéria », « place publique 1 », « escalier », « passerelle »), ou un message si ambigu.
    trouverSortie(cible) {
      if (!cible || cible.length < 3) return null;
      if (SYNONYMES[cible]) cible = cleNom(DESTINATIONS[SYNONYMES[cible]]);
      const sorties = this.sorties();
      const alias = LIEUX[this.lieu].alias || {};
      for (const mot in alias) {
        if (cible === mot || cible.includes(mot)) {
          const s = sorties.find((x) => x.id === alias[mot]);
          if (s) return s;
        }
      }
      const exactes = sorties.filter((s) => cleNom(s.nom) === cible || compact(s.nom) === cible);
      if (exactes.length) return exactes[0];
      let candidates = sorties.filter((s) => cleNom(s.nom).includes(cible) || compact(s.nom).includes(cible));
      if (!candidates.length && /^ESCALIERS?$/.test(cible)) candidates = sorties.filter((s) => s.escalier);
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) return { ambigu: candidates.map((s) => s.nom) };
      return null;
    }

    // origine : le lieu d'où l'on arrive (« Tu as descendu les marches. »).
    // mode : « long » (première visite, REGARDER) ou « court » (visites suivantes, poursuite).
    decrireLieu(origine, mode = "long") {
      const lieu = LIEUX[this.lieu];
      const arrivees = lieu.arrivees || {};
      const intro = this.poursuite > 0 ? null : arrivees[origine] || arrivees.defaut;
      let brut = mode === "court" ? (typeof lieu.court === "function" ? lieu.court(this) : lieu.court) : null;
      if (!brut) brut = (lieu.variante && lieu.variante(this)) || lieu.description;
      const { texte, segments } = lier(brut);
      const introUtile = intro && !texte.startsWith(intro) ? intro : null;
      const blocs = [
        { type: "lieu", texte: lieu.nom, zone: lieu.zone, id: this.lieu },
        { type: "texte", texte: introUtile ? introUtile + " " + texte : texte, segments: introUtile ? [introUtile + " ", ...segments] : segments },
      ];
      if (this.silhouetteIci()) blocs.push({ type: "danger", texte: TEXTE_SILHOUETTE_PRESENTE });
      if (this.gardienIci()) blocs.push({ type: "danger", texte: TEXTE_GARDIEN_PRESENT });
      const ici = this.objetsParLieu[this.lieu];
      if (this.dansLeNoir()) {
        if (ici.length && !this.faits.includes("noir" + this.lieu)) this.faits.push("noir" + this.lieu);
        blocs.push({ type: "objets", texte: (ici.length && lieu.noirIndice) || "Il fait trop noir pour distinguer quoi que ce soit." });
        if (this.possede("baton_lumineux")) blocs.push(sys("Tu tâtes ta poche : le bâton lumineux. Il faut le plier pour qu'il s'allume (ALLUMER BÂTON)."));
      } else if (ici.length) {
        this.voir(ici);
        blocs.push({
          type: "objets",
          texte: "Tu distingues ici : " + ici.map((id) => OBJETS[id].enPlace).join(", ") + ".",
          objets: ici.map((id) => ({ id, nom: OBJETS[id].nom })),
        });
      }
      if (lieu.locaux && lieu.locaux.length && this.poursuite === 0) {
        const locaux = this.etatLocaux();
        const vus = locaux.filter((l) => l.visite).length;
        const aRevoir = locaux.filter((l) => l.aRevoir).length;
        const marque = (l) => (l.aRevoir ? l.nom + " ✓ (à revoir)" : l.visite ? l.nom + " ✓" : l.nom);
        blocs.push({
          type: "locaux",
          texte: "Locaux : " + locaux.map(marque).join(" · ") + (vus ? ` (${vus}/${locaux.length} visités)` : "") +
            (this.secteurFouille() ? " Plus rien d'important dans ce secteur." :
              vus * 2 >= locaux.length && vus < locaux.length && this.secteurReste() ? " Tu sens qu'il reste quelque chose, quelque part derrière ces portes." : ""),
          locaux,
          vus,
          aRevoir,
        });
      }
      blocs.push({ type: "sorties", texte: "Sorties : " + this.sortiesVisibles().join(" · ") });
      return blocs;
    }

    // Un local visité où il reste un objet est « à revoir » (crochet jaune) ; sinon il est fait (vert).
    etatLocaux() {
      return (LIEUX[this.lieu].locaux || []).map((nom) => {
        const cle = compact(nom);
        const visite = this.locauxFouilles.includes(cle);
        const aRevoir = visite && (this.objetsLocaux[cle] || []).length > 0;
        return { nom, visite, aRevoir };
      });
    }

    // Ce que l'interface propose en boutons, toujours à jour.
    contexte() {
      const ouvert = this.localOuvert && this.localOuvert.lieu === this.lieu ? this.objetsLocaux[this.localOuvert.cle] || [] : [];
      const objets = this.dansLeNoir() ? [] : [...this.objetsParLieu[this.lieu], ...ouvert];
      return {
        sorties: this.sorties(),
        objets: objets.map((id) => ({ id, nom: OBJETS[id].nom })),
        locaux: this.poursuite > 0 ? [] : this.etatLocaux(),
        fouille: this.secteurFouille(),
        actions: this.termine ? [] : this.actionsProposees(objets),
        menace: this.poursuite > 0 ? { restant: this.poursuite, total: DELAI_POURSUITE } : null,
        pointSur: this.pointSurLibelle,
      };
    }

    // Après quelques locaux visités, on dit quand il ne reste plus rien d'important dans le secteur.
    secteurFouille() {
      const locaux = LIEUX[this.lieu].locaux || [];
      const vus = locaux.filter((nom) => this.locauxFouilles.includes(compact(nom))).length;
      return locaux.length > 0 && vus >= 3 && !this.secteurReste();
    }

    // Une page du carnet ou un objet attend encore dans un local de ce secteur.
    secteurReste() {
      return (LIEUX[this.lieu].locaux || []).some((nom) => {
        const cle = compact(nom);
        const sp = LOCAUX_SPECIAUX[cle];
        return (sp && sp.page && !this.pages.includes(sp.page)) || (this.objetsLocaux[cle] || []).length > 0;
      });
    }

    // Boutons d'action selon la situation : { texte, commande, genre } ; saisie : texte à compléter au clavier.
    actionsProposees(objets) {
      const a = [];
      const ajouter = (texte, commande, genre, extra) => a.push(Object.assign({ texte, commande, genre }, extra || {}));
      const leurres = LEURRES.filter((id) => this.possede(id));
      if (this.gardienIci()) {
        if (this.possede("arme_artisanale")) ajouter("Frapper", "frapper silhouette", "action");
        for (const id of leurres) ajouter("Lancer : " + OBJETS[id].nom, "lancer " + OBJETS[id].nom, "action");
      }
      if (this.silhouetteIci()) {
        ajouter("Attendre sans bouger", "attendre", "action");
        for (const id of leurres) ajouter("Lancer : " + OBJETS[id].nom, "lancer " + OBJETS[id].nom, "action");
      }
      const danger = this.gardienIci() || this.silhouetteIci();
      for (const id of objets) ajouter((danger ? "⚠ Prendre : " : "Prendre : ") + OBJETS[id].nom, "prendre " + OBJETS[id].nom, danger ? "danger" : "prise");
      if (!this.dansLeNoir() && !danger) {
        for (const l of this.lectures()) if (l.bouton) ajouter("Lire : " + l.bouton, "lire " + l.bouton, "lecture");
      }
      if (this.localOuvert && this.localOuvert.lieu === this.lieu) ajouter("Ressortir", "sortir", "action");
      if (CODES[this.lieu] && !this.codes[this.lieu]) ajouter("Composer un code…", null, "code", { saisie: "composer " });
      const pieces = PIECES_ARME.filter((id) => this.possede(id));
      if (!this.flags.arme_fabriquee && pieces.length >= 2) ajouter("Combiner", "combiner " + pieces.map((id) => OBJETS[id].nom).join(" et "), "action");
      if (this.possede("barre_tendre")) ajouter("Manger : barre tendre", "manger barre tendre", "action");
      if (this.possede("baton_lumineux") && !this.flags.lumiere) ajouter("Allumer : bâton lumineux", "allumer bâton", "action");
      if (this.lieu === LIEU_SORTIE && !this.flags.cadenas_brise && this.possede("arme_artisanale")) ajouter("Frapper le cadenas", "frapper cadenas", "danger");
      if (this.lieu === LIEU_SORTIE && this.possede("cle_principale") && !this.gardien) ajouter("Utiliser la clé principale", "utiliser clé principale", "fin");
      ajouter("Regarder", "regarder", "outil");
      ajouter("Écouter", "écouter", "outil");
      return a;
    }

    executer(commande) {
      if (this.termine) {
        if (!this.gagne && this.pointSur && /^(CONTINUER|REPRENDRE)$/.test(normaliser(commande))) return this.reprendreAuPointSur();
        return [sys(this.gagne
          ? "La nuit est terminée. Touche « Continuer : le générique » pour voir ta phrase."
          : "La nuit a gagné. Touche « Reprendre au moment sûr », ou tape REJOUER pour tout recommencer.")];
      }
      if (MOTIF_EFFACER_NOTES.test(commande)) return this.effacerNotes();
      const note = MOTIF_NOTER.exec(commande);
      if (note) return this.noter(note[1]);
      const c = analyser(commande);
      if (!c) return [];
      this.preciser(c);

      // Consulter ne coûte rien et ne compte pas comme un tour.
      if (c.verbe === "AIDE") return this.aide();
      if (c.verbe === "NOTES" || (c.verbe === "LIRE" && c.objets.includes("calepin"))) return this.lireNotes();
      if (c.verbe === "INDICE") return this.donnerIndice();
      if (c.verbe === "OBJECTIFS") return this.afficherObjectifs();
      if (c.verbe === "META") return [sys(TEXTES_META[c.premier] || TEXTES_META.defaut)];

      this.tour += 1;
      const enPoursuite = this.poursuite > 0;
      const avant = this.objectifsEtat();
      const signature = () => JSON.stringify([
        this.lieu, this.inventaire, this.codes, this.flags, this.locauxFouilles.length, this.termine,
        this.silhouette, this.attente, this.gardien, this.approches.length, this.pages.length, this.localOuvert,
      ]);
      const sigAvant = signature();
      const lieuAvant = this.lieu;
      this._gratuit = false;
      const blocs = this.traiter(c);
      // Seuls les gestes qui prennent du temps comptent : regarder, lire, consulter, une faute de frappe
      // ou un refus du jeu (message système seul, rien n'a changé) sont gratuits.
      const gratuit = this._gratuit || GRATUITS.has(c.verbe) || (signature() === sigAvant && blocs.every((b) => b.type === "systeme"));
      if (!gratuit) this.actions += 1;
      // Attendre sur place ne fait pas avancer l'attente des indices (sinon : 12 × ATTENDRE).
      if (!gratuit && c.verbe !== "ATTENDRE") this.actionsIndice = (this.actionsIndice || 0) + 1;
      if (this.termine) return blocs;

      if (enPoursuite && !gratuit && this.poursuite > 0) {
        this.poursuite -= 1;
        if (this.poursuite <= 0) return blocs.concat(this.mort(MORT_POURSUITE));
        blocs.push({ type: "menace", texte: COMPTE_A_REBOURS[this.poursuite] || TEXTE_PAS_PROCHES, restant: this.poursuite, total: DELAI_POURSUITE, son: "coeur" });
      }

      // Le texto arrive au réveil : dans la classe au 5e geste, ou dès qu'on met le pied dans le corridor.
      if (!this.evenementVu && (this.tour >= TOUR_EVENEMENT || (this.lieu === 2 && this.tour >= 2))) {
        this.evenementVu = true;
        blocs.push(
          { type: "evenement", texte: TEXTO_AVANT },
          { type: "texto", texte: TEXTO.message, de: TEXTO.de, son: "vibration" },
          { type: "evenement", texte: TEXTO_APRES },
        );
      } else if (!blocs.some((b) => b.type === "danger" || b.type === "chapitre")) {
        // Une scène au plus par action, jamais en même temps qu'un danger.
        const scene = SCENES.find((s) => !this.scenes.includes(s.id) && s.quand(this, lieuAvant));
        if (scene) {
          this.scenes.push(scene.id);
          blocs.push({ type: "scene", texte: scene.texte });
        }
      }

      // Journal : ce qui vient d'être accompli, ce qu'on vient de découvrir.
      const apres = this.objectifsEtat();
      for (const o of OBJECTIFS) {
        if (apres.faits.includes(o.id) && !avant.faits.includes(o.id)) {
          if (o.faitTexte) blocs.push({ type: "objectif", texte: "✔ " + o.faitTexte });
        } else if (apres.visibles.includes(o.id) && !avant.visibles.includes(o.id) && !apres.faits.includes(o.id)) {
          blocs.push({ type: "objectif", texte: "Nouvel objectif : " + o.texte, nouveau: true });
        }
      }
      return blocs.filter((b) => b && !(b.type === "sauvegarde" && !b.texte));
    }

    traiter(c) {
      if (this.silhouetteIci()) {
        const r = this.traiterRencontre(c);
        if (r) return r;
      }
      if (this.gardienIci()) {
        const r = this.traiterGardien(c);
        if (r) return r;
      }
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
        case "ENTRER": return this.entrer(c);
        case "COMPOSER": return this.composer(c);
        case "TIRER": return this.tirer(c);
        case "SORTIR": return this.sortir(c);
        case "RETOUR": return this.retour();
        case "ALLUMER": return this.allumer(c);
        case "CARTE": return this.carte();
        case "INVENTAIRE": return this.afficherInventaire();
        case "LOCAUX": {
          const b = this.decrireLieu().find((x) => x.type === "locaux");
          return b ? [b] : [sys("Il n'y a pas de locaux à visiter ici.")];
        }
        case "ECOUTER": return this.ecouter();
        case "ATTENDRE": return this.attendre();
        case "CRIER": return this.crier();
        case "LANCER": return this.lancer(c);
        default: {
          // Le nom d'une sortie ou d'un local tout seul (« cafétéria », « Réception », « Gym 2 »).
          const sortie = this.trouverSortie(c.cle);
          const exact = this.nomExactAilleurs(c.cle, sortie);
          if (exact) return exact;
          if (sortie && sortie.ambigu) return [sys("Lequel ? " + sortie.ambigu.join(" ou ") + ".")];
          if (sortie) return this.allerVers(sortie.direction);
          const nom = (LIEUX[this.lieu].locaux || []).find((l) => compact(l) === c.complet);
          if (nom) return this.entrer(Object.assign({}, c, { suite: c.complet }));
          const loin = this.trajet(c.cle);
          if (loin) return loin;
          if (CODES[this.lieu] && !this.codes[this.lieu] && /^[A-Z0-9]{2,4}$/.test(c.complet)) return this.composer(c);
          return [sys("Je ne comprends pas. Touche un bouton, ou tape AIDE pour la liste des commandes.")];
        }
      }
    }

    // Une silhouette dans la cafétéria : le bruit tue, l'immobilité sauve.
    traiterRencontre(c) {
      const veutBarre = c.objets.includes("barre_tendre") ||
        (c.verbe === "PRENDRE" && c.mots.some((m) => m === "TOUT" || m === "TOUS") && this.objetsParLieu[LIEU_CAFETERIA].includes("barre_tendre")) ||
        (c.verbe === "MANGER" && !c.objets.length && !c.mots.length && (this.possede("barre_tendre") || this.objetsParLieu[LIEU_CAFETERIA].includes("barre_tendre")));
      switch (c.verbe) {
        case "ATTENDRE":
          this.attente += 1;
          if (this.attente >= 2) {
            this.silhouette = "chambre_froide";
            return [{ type: "scene", texte: TEXTE_RENCONTRE_PASSEE }, this.marquerPointSur("la cafétéria, la silhouette partie")];
          }
          return [{ type: "danger", texte: TEXTE_RENCONTRE_ATTENTE }];
        case "ECOUTER":
          return [{ type: "ecoute", texte: ECOUTE_SILHOUETTE }];
        case "CRIER":
          return this.piege("rencontre_cri", MORT_CRI);
        case "FRAPPER":
          if (c.objets.includes("baton_lumineux") || c.decors.includes("FENETRE")) return null;
          return this.piege("rencontre_frapper", MORT_RENCONTRE);
        case "PRENDRE":
        case "MANGER":
        case "UTILISER":
          if (veutBarre) return this.piege("rencontre_barre", MORT_RENCONTRE);
          return null;
        default:
          return null;
      }
    }

    // La silhouette à la chemise grise, entre toi et les portes principales.
    traiterGardien(c) {
      switch (c.verbe) {
        case "FRAPPER":
          if (c.decors.includes("FENETRE") || c.objets.includes("baton_lumineux")) return null;
          if (!this.possede("arme_artisanale")) return this.piege("rencontre_frapper", MORT_RENCONTRE);
          this.gardien = false;
          this.epargne = false;
          return [{ type: "choc", texte: TEXTE_GARDIEN_FRAPPE, son: "choc" }];
        case "UTILISER":
          if (c.objets.includes("arme_artisanale")) return this.traiterGardien(Object.assign({}, c, { verbe: "FRAPPER", objets: [] }));
          if (c.objets.includes("cle_principale")) {
            this._gratuit = true;
            return [{ type: "danger", texte: TEXTE_GARDIEN_BLOQUE }];
          }
          return null;
        case "OUVRIR":
          if (c.decors.includes("SECRETARIAT") || c.objets.includes("agenda") || c.objets.includes("calepin")) return null;
          this._gratuit = true;
          return [{ type: "danger", texte: TEXTE_GARDIEN_BLOQUE }];
        case "SORTIR":
          this._gratuit = true;
          return [{ type: "danger", texte: TEXTE_GARDIEN_BLOQUE }];
        case "ATTENDRE":
          return [{ type: "texte", texte: "Attendre ? Derrière toi, les pas se rapprochent. Elle ne partira pas toute seule." }];
        case "CRIER":
          return this.piege("rencontre_cri", MORT_CRI);
        case "ECOUTER":
          return [{ type: "ecoute", texte: "Le tintement des clés à sa ceinture. Et, derrière toi, les pas qui se rapprochent." }];
        default:
          return null;
      }
    }

    // Danger en deux temps : la première fois, on voit et on recule ; ensuite, c'est un choix.
    piege(cle, texteMort) {
      if (this.approches.includes(cle)) return this.mort(texteMort);
      this.approches.push(cle);
      const [avertissement, consigne] = AVERTISSEMENTS[cle];
      return [{ type: "danger", texte: avertissement }, sys(consigne)];
    }

    aide() {
      return [
        sys(
          "Touche les boutons, ou écris ce que tu veux faire.\n" +
            "Se déplacer : touche une sortie, ou tape ALLER suivi d'un lieu (ex. : ALLER CAFÉTÉRIA). Un lieu déjà visité ? Le jeu t'y mène. RETOUR revient sur tes pas.\n" +
            "Locaux : touche « Locaux », ou tape ENTRER suivi du numéro (ex. : ENTRER A215). RESSORTIR pour revenir au couloir.\n" +
            "Actions : PRENDRE, REGARDER, LIRE, COMBINER, MANGER, FRAPPER, UTILISER, OUVRIR, ALLUMER, COMPOSER (un code), ÉCOUTER, ATTENDRE, LANCER.\n" +
            "Outils : INVENTAIRE (ou I), CARTE, OBJECTIFS, INDICE (si tu bloques), NOTES.\n" +
            "Calepin : NOTER suivi de ton texte, EFFACER NOTES pour tout effacer.\n" +
            "Regarder, lire et consulter ne font jamais avancer le temps."
        ),
      ];
    }

    aller(c) {
      if (c.direction) return this.allerVers(c.direction);
      const cible = c.mots.join("");
      const sortie = this.trouverSortie(cible);
      const exact = this.nomExactAilleurs(cible, sortie);
      if (exact) return exact;
      if (sortie && sortie.ambigu) return [sys("Lequel ? " + sortie.ambigu.join(" ou ") + ".")];
      if (sortie) return this.allerVers(sortie.direction);
      const nom = (LIEUX[this.lieu].locaux || []).find((l) => compact(l) === cible);
      if (nom) return this.entrer(c);
      const loin = this.trajet(cible);
      if (loin) return loin;
      if (c.mots.length) return this.entrer(c);
      return [sys("Aller où ? Touche une sortie, ou tape son nom (ex. : ALLER CAFÉTÉRIA).")];
    }

    // « Aile C » est le nom exact d'un lieu : ne pas filer vers « Aile C est » parce que la sortie le contient.
    nomExactAilleurs(cible, sortie) {
      if (!cible || !sortie || sortie.ambigu || !sortie.nom) return null;
      const vise = SYNONYMES[cible] ? cleNom(DESTINATIONS[SYNONYMES[cible]]) : cible;
      if (cleNom(sortie.nom) === vise || compact(sortie.nom) === vise) return null;
      const connu = Object.keys(DESTINATIONS).map(Number).some((id) => this.visites.has(id) && (cleNom(DESTINATIONS[id]) === vise || compact(DESTINATIONS[id]) === vise));
      return connu ? this.trajet(cible) : null;
    }

    allerVers(direction, options) {
      const lieu = LIEUX[this.lieu];
      if (lieu.pieges && lieu.pieges[direction]) {
        const texte = lieu.pieges[direction];
        return this.piege(texte === MORT_GYM6 ? "gym6" : "secours", texte);
      }
      const dest = lieu.sorties[direction];
      if (dest === undefined) return [sys("Tu ne peux pas aller par là.")];
      if (this.lieu === LIEU_SORTIE && dest === LIEU_SECRETARIAT && !this.flags.cadenas_brise) {
        this._gratuit = true;
        return [{ type: "texte", texte: "La porte du secrétariat est verrouillée par un lourd cadenas rouillé." }];
      }
      if (this.silhouetteIci()) {
        if (dest === LIEU_CUISINES) return this.piege("rencontre_cuisines", MORT_CUISINES);
        return [{ type: "texte", texte: TEXTE_RENCONTRE_RECUL }, ...this.allerA(dest, options)];
      }
      return this.allerA(dest, options);
    }

    // ALLER <lieu déjà visité> : le trajet le plus court par des lieux déjà visités.
    // Chaque pas compte comme une action. Refusé pendant la poursuite ; s'arrête si quelque chose arrive.
    trajet(cible) {
      if (!cible || cible.length < 3) return null;
      cible = SYNONYMES[cible] ? cleNom(DESTINATIONS[SYNONYMES[cible]]) : cible;
      const exact = (id) => cleNom(DESTINATIONS[id]) === cible || compact(DESTINATIONS[id]) === cible;
      const proche = (id) => exact(id) || cleNom(DESTINATIONS[id]).includes(cible);
      if (exact(this.lieu)) return [sys("Tu y es déjà.")];
      // Un lieu déjà visité, ou aperçu comme sortie d'un lieu visité : le chemin est connu.
      const ouvert = (de, vers) => !(de === LIEU_SORTIE && vers === LIEU_SECRETARIAT && !this.flags.cadenas_brise);
      const apercu = (id) => [...this.visites].some((v) => LIEUX[v] && Object.values(LIEUX[v].sorties).includes(id) && ouvert(v, id));
      const visites = Object.keys(DESTINATIONS).map(Number).filter((id) => id !== this.lieu && PLAN[id] && (this.visites.has(id) || apercu(id)));
      let candidats = visites.filter(exact);
      if (!candidats.length) candidats = visites.filter(proche);
      if (!candidats.length && proche(this.lieu)) return [sys("Tu y es déjà.")];
      const exactInconnu = Object.keys(DESTINATIONS).map(Number).find((id) => id !== this.lieu && exact(id) && !visites.includes(id));
      if (exactInconnu) return [sys(`Tu ne connais pas encore le chemin vers « ${DESTINATIONS[exactInconnu]} ». Explore pour le trouver.`)];
      if (!candidats.length) {
        const inconnus = Object.keys(DESTINATIONS).map(Number).filter((id) => id !== this.lieu && proche(id));
        if (inconnus.length === 1) return [sys(`Tu ne connais pas encore le chemin vers « ${DESTINATIONS[inconnus[0]]} ». Explore pour le trouver.`)];
        return null;
      }
      if (candidats.length > 1) return [sys("Lequel ? " + candidats.map((id) => DESTINATIONS[id]).join(" ou ") + ".")];
      if (this.poursuite > 0) return [sys("Pas le temps de penser à un trajet. Un pas à la fois : touche une sortie.")];
      const but = candidats[0];
      const precedent = { [this.lieu]: null };
      const file = [this.lieu];
      while (file.length && !(but in precedent)) {
        const ici = file.shift();
        for (const dest of Object.values(LIEUX[ici].sorties)) {
          if (dest in precedent || (!this.visites.has(dest) && dest !== but)) continue;
          if (ici === LIEU_SORTIE && dest === LIEU_SECRETARIAT && !this.flags.cadenas_brise) continue;
          if (ici === LIEU_CAFETERIA && dest === LIEU_CUISINES && this.silhouette === "cafeteria") continue;
          precedent[dest] = ici;
          file.push(dest);
        }
      }
      if (!(but in precedent)) return [sys(`Tu ne vois pas comment aller d'ici vers « ${DESTINATIONS[but]} ».`)];
      const chemin = [];
      for (let x = but; x !== this.lieu; x = precedent[x]) chemin.unshift(x);
      const noms = [];
      const marquants = [];
      let blocs = [];
      for (const pas of chemin) {
        const d = Object.keys(LIEUX[this.lieu].sorties).find((k) => LIEUX[this.lieu].sorties[k] === pas);
        blocs = this.allerVers(d);
        noms.push(DESTINATIONS[pas]);
        if (this.termine || this.silhouetteIci() || pas === but) break;
        marquants.push(...blocs.filter((b) => b.type === "chapitre"));
        this.tour += 1;
        this.actions += 1;
      }
      return [sys("Tu marches sans bruit : " + noms.join(" → ") + "."), ...marquants, ...blocs];
    }

    retour() {
      let direction;
      while (this.chemin.length && !direction) {
        const dest = this.chemin.pop();
        direction = Object.keys(LIEUX[this.lieu].sorties).find((d) => LIEUX[this.lieu].sorties[d] === dest);
      }
      if (!direction) return [sys("Tu ne sais plus d'où tu viens. Choisis une sortie.")];
      return this.allerVers(direction, { retour: true });
    }

    allerA(dest, options) {
      const origine = this.lieu;
      const premiere = !this.visites.has(dest);
      if (!(options && options.retour)) {
        this.chemin.push(origine);
        if (this.chemin.length > 60) this.chemin.shift();
      }
      this.precedent = origine;
      this.localOuvert = null;
      this.lieu = dest;
      this.visites.add(dest);
      const blocs = [];
      if (PLAN[dest] && PLAN[dest][0] === "rdc" && !this.chapitres.includes(2)) {
        this.chapitres.push(2);
        blocs.push(chapitre(2));
      }
      blocs.push(...this.decrireLieu(origine, premiere ? "long" : "court"));
      // La silhouette de la cafétéria apparaît au milieu de la partie, avant qu'on ait la lame.
      if (dest === LIEU_CAFETERIA && this.silhouette === "absente" && this.poursuite === 0 &&
          !this.possede("lame_lourde") && !this.flags.arme_fabriquee) {
        this.silhouette = "cafeteria";
        this.attente = 0;
        this.marquerPointSur("la cafétéria, face à la silhouette");
        blocs.splice(blocs.findIndex((b) => b.type === "texte") + 1, 0, { type: "danger", texte: TEXTE_RENCONTRE, son: "souffle" }, sys("Ne fais aucun bruit."));
      }
      // La silhouette à la chemise grise : entre toi et la sortie, la clé en main.
      if (dest === LIEU_SORTIE && this.poursuite > 0 && this.possede("cle_principale") && !this.scenes.includes("gardien")) {
        this.scenes.push("gardien");
        this.gardien = true;
        blocs.splice(blocs.findIndex((b) => b.type === "texte") + 1, 0, { type: "danger", texte: TEXTE_GARDIEN, son: "souffle" }, sys("Ton arme est dans tes mains."));
      }
      return blocs;
    }

    entrer(c) {
      let cible = c.suite;
      if (!cible) return [sys("Entrer où ? Touche « Locaux », ou tape ENTRER suivi du numéro d'un local.")];
      const lieu = LIEUX[this.lieu];
      cible = cible.replace(/^(?:LOCAL|CLASSE|SALLE)?GYMNASE([0-9])$/, "GYM$1");
      let nom = (lieu.locaux || []).find((l) => cible.endsWith(compact(l)));
      // « entrer 204 » dans l'Aile A : le numéro sans la lettre.
      if (!nom && /^[0-9]{3}[A-Z]?$/.test(cible)) {
        const possibles = (lieu.locaux || []).filter((l) => compact(l).slice(1) === cible);
        if (possibles.length === 1) nom = possibles[0];
        else if (!possibles.length) {
          const lettre = compact((lieu.locaux || [""])[0] || "")[0];
          if (lettre && INDEX_LOCAUX[lettre + cible]) cible = lettre + cible;
        }
      }
      const connu = INDEX_LOCAUX[cible] || Object.values(INDEX_LOCAUX).find((x) => cible.endsWith(compact(x.nom)));
      if (!nom) {
        if (connu && connu.lieu === this.lieu) {
          if (connu.vers) return this.allerA(connu.vers);
          if (connu.depot) {
            return [{ type: "texte", texte: this.codes[5] ? "Le dépôt est ouvert. Des bocaux, des béchers, des produits étiquetés. Rien d'autre d'utile." : "Le dépôt de sciences est fermé par un cadenas à deux lettres. Une fiche plastifiée est collée sur la porte." }];
          }
          if (connu.armoire) return [{ type: "texte", texte: "Le local F212. L'armoire de premiers soins est là, contre le mur." }];
          if (compact(connu.nom) === "H105") return this.piege("gym6", MORT_GYM6);
          if (compact(connu.nom) === "H115") return [{ type: "texte", texte: "La grille du café est baissée et cadenassée. Derrière, les chaises retournées sur les tables. Rien à faire ici." }];
        }
        if (connu && connu.vers === this.lieu) return [sys("Tu y es déjà.")];
        const sortie = this.trouverSortie(c.mots.join(""));
        if (sortie && !sortie.ambigu) return this.allerVers(sortie.direction);
        if (connu) return [sys(`Le local ${connu.nom} n'est pas ici. On y accède par « ${DESTINATIONS[connu.lieu]} ».`)];
        const loin = this.trajet(c.mots.join(""));
        if (loin) return loin;
        if (CODES[this.lieu] && /[0-9]/.test(cible)) return this.composer(c);
        return [sys("Il n'y a pas de local de ce nom ici. Touche « Locaux » pour voir la liste.")];
      }
      const cle = compact(nom);
      const special = LOCAUX_SPECIAUX[cle];
      if (special && special.piege) return this.piege(special.piege, MORT_GYM6);
      const restants = this.objetsLocaux[cle] || [];
      let description = special && special.objet && !restants.length ? special.objetSorti : texteLocal(nom);
      const pageDejaPrise = special && special.page && this.pages.includes(special.page);
      if (pageDejaPrise) description = "Il n'y a plus rien ici : la page du carnet est dans ta poche.";
      // Un texte ordinaire déjà lu ailleurs revient en version courte : on ne relit pas dix fois le tambour.
      const ordinaire = !special && TEXTES_LOCAUX[cle];
      if (ordinaire) {
        if (this.textesVus.includes(description) && !this.locauxFouilles.includes(cle)) description = LOCAUX_DEJA_VUS[hachage(cle) % LOCAUX_DEJA_VUS.length];
        else if (!this.textesVus.includes(description)) this.textesVus.push(description);
      }
      const blocs = [{ type: "texte", texte: (MOTIF_LOCAL.test(cle) ? `Tu entres dans le local ${nom}. ` : "Tu entres. ") + description }];
      if (!this.locauxFouilles.includes(cle)) this.locauxFouilles.push(cle);
      if (special && special.fait && !this.faits.includes(special.fait)) this.faits.push(special.fait);
      if (special && special.page && !pageDejaPrise) {
        this.pages.push(special.page);
        blocs.push({ type: "page", texte: PAGES[special.page - 1].texte, numero: special.page, total: PAGES.length, trouvees: this.pages.length });
        blocs.push(sys(`Tu glisses la page dans ta poche. Carnet de R. : ${this.pages.length}/${PAGES.length} pages. (NOTES pour les relire.)`));
      }
      if (restants.length) {
        this.localOuvert = { cle, lieu: this.lieu };
        this.voir(restants);
        blocs.push({
          type: "objets",
          texte: "Tu distingues ici : " + restants.map((id) => OBJETS[id].enPlace).join(", ") + ".",
          objets: restants.map((id) => ({ id, nom: OBJETS[id].nom })),
        });
        blocs.push(sys("Prends-la, ou ressors : si tu pars sans, elle restera ici."));
        return blocs;
      }
      this.localOuvert = null;
      if (!/demi-tour|recules/.test(description)) blocs.push(sys(lieu.ressortir || "Tu ressors dans le couloir."));
      return blocs;
    }

    composer(c) {
      const enigme = CODES[this.lieu];
      if (!enigme) return [sys("Il n'y a rien ici qui demande un code.")];
      if (this.codes[this.lieu]) return [sys("C'est déjà ouvert.")];
      // On garde les mots tels que tapés : AU, LA, CE sont des symboles chimiques, pas des petits mots.
      // « 1 234 », « 1234,00 $ » : les espaces, les décimales nulles et le $ ne comptent pas.
      const brut = String(c.brut).replace(/(\d)\s*[.,]\s*0{1,2}(?!\d)/g, "$1");
      let mots = normaliser(brut).split(" ").filter(Boolean);
      while (mots.length && (PRONOMS.has(mots[0]) || ["COMPOSER", "ENTRER", "OUVRIR", "UTILISER"].includes(VERBES[mots[0]]))) mots.shift();
      const bruit = new Set(["CODE", "COMBINAISON", "CADENAS", "COFFRE", "ARMOIRE", "DEPOT", "CLAVIER", "MOLETTES", "SECRET", "LETTRES", "CHIFFRES"]);
      mots = mots.filter((m) => !bruit.has(m));
      const utiles = mots.filter((m) => !MOTS_VIDES.has(m));
      const essai = (utiles.length ? utiles : mots).join("");
      if (!essai) return [sys("Quel code ? Tape COMPOSER suivi du code. " + enigme.forme)];
      const bonneForme = (enigme.genre === "lettres" ? /^[A-Z]+$/ : /^[0-9]+$/).test(essai) && essai.length === enigme.longueur;
      if (!bonneForme) return [sys(enigme.forme)];
      if (empreinte(essai) !== enigme.empreinte) {
        const blocs = [{ type: "texte", texte: enigme.echec }];
        if (enigme.bruyant) {
          blocs[0].son = "bip";
          if (this.poursuite > 1) {
            this.poursuite -= 1; // le bip coûte une action de plus
            blocs.push(sys("Le bip a résonné partout : ils accélèrent. Ce geste t'en a coûté deux."));
          }
        }
        return blocs;
      }
      this.codes[this.lieu] = essai;
      this.objetsParLieu[this.lieu].push(enigme.revele);
      const ouvertes = ORDRE_CODES.filter((id) => this.codes[id]).length;
      const blocs = [{ type: "succes", texte: enigme.succes, son: "succes" }, { type: "objectif", texte: `Serrures ouvertes : ${ouvertes}/3` }];
      if (this.poursuite === 0) blocs.push(this.marquerPointSur(DESTINATIONS[this.lieu]));
      return blocs;
    }

    prendre(c) {
      const local = this.localOuvert && this.localOuvert.lieu === this.lieu ? this.localOuvert.cle : null;
      let ids = c.objets;
      if (c.mots.some((m) => m === "TOUT" || m === "TOUS" || m === "TOUTE")) {
        if (this.dansLeNoir() && this.objetsParLieu[this.lieu].length) return [{ type: "texte", texte: TEXTE_NOIR_ABSOLU }];
        ids = [...(this.dansLeNoir() ? [] : this.objetsParLieu[this.lieu]), ...(local ? this.objetsLocaux[local] || [] : [])];
        if (!ids.length) return [sys("Il n'y a rien à prendre ici.")];
      }
      if (ids.length === 0) {
        if (c.cleAbsente) return [sys("Il n'y a pas de clé ici.")];
        const lu = this.dansLeNoir() ? null : this.lecture(c);
        if (lu) return [sys(lu.prendre || "Tu n'as pas besoin de ça.")];
        const g = this.motGlobal(c);
        if (g) return [sys(g)];
        if (this.dansLeNoir() && c.mots.length) return [{ type: "texte", texte: TEXTE_TATONNER }];
        return [sys(c.mots.length ? "Tu ne vois pas ça ici." : "Prendre quoi ?")];
      }
      const blocs = [];
      for (const id of ids) {
        const ici = this.objetsParLieu[this.lieu];
        if (this.dansLeNoir() && ici.includes(id)) {
          blocs.push({ type: "texte", texte: TEXTE_NOIR_ABSOLU });
          continue;
        }
        const dansLocal = local ? this.objetsLocaux[local] || [] : [];
        const pris = OBJETS[id].pris || "Pris : " + OBJETS[id].nom + ".";
        if (this.possede(id)) {
          blocs.push(sys("Tu as déjà " + OBJETS[id].le + "."));
        } else if (dansLocal.includes(id)) {
          this.objetsLocaux[local] = dansLocal.filter((x) => x !== id);
          this.inventaire.push(id);
          blocs.push(sys(pris));
          if (!this.objetsLocaux[local].length) {
            this.localOuvert = null;
            blocs.push(sys(LIEUX[this.lieu].ressortir || "Tu ressors dans le couloir."));
          }
        } else if (ici.includes(id)) {
          this.objetsParLieu[this.lieu] = ici.filter((x) => x !== id);
          this.inventaire.push(id);
          blocs.push(sys(pris));
          if (id === "calepin") blocs.push(...this.recopier());
          if (id === "lame_lourde" && this.silhouette === "chambre_froide" && this.lieu === LIEU_CUISINES) {
            blocs.push({ type: "scene", texte: TEXTE_COUPERET });
          }
        } else {
          blocs.push(this.absent(id));
        }
      }
      // Chaque objet ramassé est un moment sûr (en silence) : une mort ne le fera plus perdre.
      if (this.poursuite === 0 && !this.silhouetteIci() && ids.some((id) => this.possede(id))) this.marquerPointSur(DESTINATIONS[this.lieu]);
      return blocs;
    }

    // En prenant le calepin, on recopie ce qu'on a déjà lu d'important.
    recopier() {
      const nouveaux = this.indicesLus.filter((t) => !this.indicesTrouves.includes(t));
      if (!nouveaux.length) return [];
      this.indicesTrouves.push(...nouveaux);
      const seul = nouveaux.length === 1 && nouveaux[0].startsWith("Tableau");
      return [sys(seul ? "Tu recopies en vitesse le problème du tableau dans ton calepin." : "Tu recopies en vitesse dans ton calepin ce que tu as déjà lu.")];
    }

    // Mots du décor qui méritent une réponse partout (et un indice sans le nommer).
    motGlobal(c) {
      if (c.mots.some((m) => ["VADROUILLE", "VADROUILLES", "BALAI", "BALAIS", "MOP"].includes(m))) {
        return "Le manche de la vadrouille est en plastique creux : il plierait au premier coup. Il te faudrait du métal.";
      }
      if (c.mots.some((m) => ["CHAISE", "CHAISES", "PUPITRE", "PUPITRES"].includes(m))) return "Trop lourd, trop bruyant. Tu ne vas pas te promener avec ça.";
      return null;
    }

    // La lecture du lieu que vise la commande (mots exacts, puis fautes de frappe).
    lecture(c) {
      const lectures = this.lectures();
      const exacte = lectures.find((l) => c.mots.some((m) => l.mots.includes(m)));
      if (exacte) return exacte;
      const connus = [...new Set(lectures.flatMap((l) => l.mots))];
      for (const m of c.mots) {
        const proche = corriger(m, connus);
        if (proche) return lectures.find((l) => l.mots.includes(proche));
      }
      return null;
    }

    // Lire quelque chose d'important : la découverte est notée, et l'indice recopié dans le calepin.
    lu(l) {
      if (l.fait && !this.faits.includes(l.fait)) this.faits.push(l.fait);
      const blocs = [{ type: l.type || "lecture", texte: l.texte }];
      if (l.indice && !this.indicesLus.includes(l.indice)) this.indicesLus.push(l.indice);
      if (l.indice && this.possede("calepin") && !this.indicesTrouves.includes(l.indice)) {
        this.indicesTrouves.push(l.indice);
        blocs.push(sys("Recopié dans ton calepin."));
      }
      return blocs;
    }

    regarder(c) {
      if (c.objets.length === 0 && c.decors.length === 0 && c.mots.length === 0) return this.decrireLieu(undefined, "long");
      if (c.decors.includes("SILHOUETTE") && !c.objets.length) {
        if (this.silhouetteIci()) return [{ type: "texte", texte: TEXTE_SILHOUETTE_REGARD }];
        if (this.gardienIci()) return [{ type: "texte", texte: "Une chemise de travail grise, un trousseau de clés à la ceinture. Tu connais cette silhouette. Tu l'as croisée cent fois dans les couloirs, une vadrouille à la main." }];
        return [sys("Tu ne vois personne. Du moins, pas encore.")];
      }
      if (this.dansLeNoir() && !c.objets.some((id) => this.possede(id))) {
        const g = this.motGlobal(c);
        return [g ? sys(g) : { type: "texte", texte: TEXTE_TATONNER }];
      }
      const lu = this.dansLeNoir() ? null : this.lecture(c);
      if (lu) return this.lu(lu);
      if (c.objets.length) {
        const id = c.objets[0];
        if (id === "agenda" && c.mots.some((m) => m === "CARTE" || m === "PLAN")) return this.carte();
        if (id === "telephone_mort" && this.evenementVu && this.possede(id)) return [{ type: "texte", texte: TEXTE_TELEPHONE_MORT }];
        if (this.possede(id) || this.aPortee(id)) {
          const lumiere = id === "baton_lumineux" && this.flags.lumiere ? " Il luit d'une lueur verte, faible et têtue." : "";
          return [{ type: "texte", texte: OBJETS[id].description + lumiere }];
        }
        return [this.absent(id)];
      }
      if (c.cleAbsente) return [sys("Il n'y a pas de clé ici.")];
      const g = this.motGlobal(c);
      if (g) return [sys(g)];
      const decor = c.decors[0];
      if (this.lieu === LIEU_SORTIE) {
        if (decor === "CADENAS" || decor === "SECRETARIAT") {
          return [{ type: "texte", texte: this.flags.cadenas_brise ? "La porte du secrétariat s'entrouvre." : "La porte du secrétariat est verrouillée par un lourd cadenas rouillé." }];
        }
        if (decor === "CHAINES" || decor === "PORTE") {
          return [{ type: "texte", texte: "Devant toi, les portes principales menant vers l'extérieur sont scellées par d'épaisses chaînes industrielles." }];
        }
      }
      if (decor === "FENETRE") return [{ type: "texte", texte: "Dehors, le noir. Des formes immobiles, peut-être. Tu préfères ne pas t'approcher de la vitre." }];
      if (decor === "ALARME") return [sys("Il n'y a pas d'avertisseur à portée de main ici.")];
      // Un mot de la description, sans rien de plus à en dire.
      const decrit = normaliser(sansBalises(LIEUX[this.lieu].description)).split(" ");
      if (c.mots.some((m) => m.length >= 4 && decrit.some((d) => d === m || d === m + "S" || m === d + "S"))) {
        return [sys("Tu t'approches. Rien de plus que ce que tu vois déjà. Ce n'est pas ça qui t'aidera à sortir.")];
      }
      return [sys("Tu ne vois rien de particulier.")];
    }

    lire(c) {
      if (c.objets.includes("agenda")) return this.carte();
      if (this.dansLeNoir()) return [sys("Il fait trop noir pour lire quoi que ce soit.")];
      const lectures = this.lectures();
      const lu = this.lecture(c) || (c.mots.length === 0 ? lectures.find((l) => l.bouton) || lectures[0] : null);
      if (lu) return this.lu(lu);
      if (c.objets.length) return this.regarder(c);
      return [sys("Il n'y a rien à lire ici.")];
    }

    combiner(c) {
      if (this.flags.arme_fabriquee) return [sys("Ton arme est déjà assemblée.")];
      // « combiner ruban lame », « combiner tuyau ruban » : deux pièces sur trois suffisent ; « combiner » tout court aussi.
      const nommees = PIECES_ARME.filter((id) => c.objets.includes(id));
      const enMain = PIECES_ARME.filter((id) => this.possede(id));
      const veutArme = nommees.length >= 2 || c.objets.includes("arme_artisanale") || (c.objets.length === 0 && enMain.length >= 2) ||
        (nommees.length === 1 && enMain.length >= 2);
      if (!veutArme) return [sys("Combiner quoi avec quoi ? Tape COMBINER suivi de deux objets que tu portes.")];
      if (!this.possede("tuyau_metal") && !this.possede("lame_lourde")) return [sys("Il te manque un manche solide et quelque chose de tranchant.")];
      if (!this.possede("tuyau_metal")) return [sys("Il te manque un manche solide.")];
      if (!this.possede("lame_lourde")) return [sys("Il te manque quelque chose de tranchant.")];
      if (!this.possede("ruban_adhesif")) {
        if (!this.faits.includes("sans_ruban")) this.faits.push("sans_ruban");
        return [{ type: "texte", texte: TEXTE_COMBINER_SANS_RUBAN }];
      }
      for (const id of PIECES_ARME) this.retirer(id);
      this.inventaire.push("arme_artisanale");
      this.flags.arme_fabriquee = true;
      return [{ type: "succes", texte: TEXTE_COMBINER_REUSSI, son: "succes" }, this.marquerPointSur("ton arme est fabriquée")];
    }

    manger(c) {
      if (c.objets.length === 0 && !this.possede("barre_tendre") && !this.aPortee("barre_tendre")) return [sys("Manger quoi ?")];
      if (c.objets.length && !c.objets.includes("barre_tendre")) return [sys("Ça ne se mange pas.")];
      if (!c.objets.length && c.mots.length) return [sys("Tu n'as rien de tel à manger. Seulement une barre tendre, peut-être.")];
      const ici = this.objetsParLieu[this.lieu];
      if (this.possede("barre_tendre")) {
        this.retirer("barre_tendre");
      } else if (ici.includes("barre_tendre") && !this.dansLeNoir()) {
        this.objetsParLieu[this.lieu] = ici.filter((x) => x !== "barre_tendre");
      } else {
        return [sys("Tu n'as rien à manger.")];
      }
      this.flags.a_mange = true;
      if (this.poursuite === 0 && !this.silhouetteIci()) this.marquerPointSur(DESTINATIONS[this.lieu]);
      return [{ type: "texte", texte: TEXTE_MANGER }];
    }

    frapper(c) {
      if (c.objets.includes("baton_lumineux")) return this.allumer(c);
      if (c.decors.includes("FENETRE")) return this.piege("fenetre", MORT_FENETRE);
      if (c.decors.includes("ALARME")) return this.tirer(c);
      const cadenas = c.decors.includes("CADENAS") || c.decors.includes("SECRETARIAT");
      if (this.lieu === LIEU_SORTIE && this.flags.cadenas_brise && this.scenes.includes("gardien") && !this.gardien && !cadenas) {
        return [sys("Il n'y a plus rien à frapper. Les portes. Maintenant.")];
      }
      if (this.lieu === LIEU_SORTIE && (cadenas || c.mots.length === 0 || c.objets.includes("arme_artisanale") || c.objets.includes("tuyau_metal") || c.decors.includes("PORTE"))) {
        if (c.decors.includes("CHAINES")) return [sys("Les chaînes sont trop épaisses. Il te faut la clé principale.")];
        return this.frapperCadenas();
      }
      if (c.decors.includes("CHAINES")) return [sys("Les chaînes sont trop épaisses. Il te faut la clé principale.")];
      if (c.mots.length === 0) return [sys("Frapper quoi ?")];
      if (c.decors.some((d) => ["COFFRE", "ARMOIRE", "DEPOT"].includes(d)) || (CODES[this.lieu] && cadenas)) {
        return [sys("Ça ferait un vacarme épouvantable, et ça ne céderait pas. Il doit y avoir un code.")];
      }
      if (cadenas) return [sys("Il n'y a pas de cadenas à briser ici.")];
      if (c.decors.includes("SILHOUETTE")) return [sys("Il n'y a personne à frapper ici. Heureusement.")];
      return [sys("Frapper ça ne servirait à rien. Et ça ferait du bruit.")];
    }

    frapperCadenas() {
      if (this.flags.cadenas_brise) return [sys("Le cadenas est déjà brisé.")];
      if (!this.possede("arme_artisanale")) {
        if (this.possede("tuyau_metal")) return [sys("Le tuyau seul rebondirait sur le cadenas avec un bruit de cloche. Il te faudrait quelque chose de plus redoutable.")];
        return [sys("Tu n'as rien d'assez solide pour briser ce cadenas.")];
      }
      if (!this.flags.a_mange) {
        if (!this.faits.includes("faible")) this.faits.push("faible");
        return [{ type: "texte", texte: TEXTE_FRAPPER_FAIBLE }];
      }
      // Moment sûr juste AVANT le fracas : mourir pendant la poursuite ramène devant le cadenas intact.
      const sauve = this.marquerPointSur("juste avant le coup sur le cadenas");
      this.flags.cadenas_brise = true;
      this.poursuite = DELAI_POURSUITE;
      const blocs = [
        { type: "choc", texte: TEXTE_FRAPPER_REUSSI, son: "choc" },
        { type: "menace", texte: TEXTE_ALERTE, restant: DELAI_POURSUITE, total: DELAI_POURSUITE },
      ];
      if (!this.chapitres.includes(4)) {
        this.chapitres.push(4);
        blocs.push(chapitre(4));
      }
      blocs.push(sauve);
      return blocs;
    }

    tirer(c) {
      if (c.decors.includes("ALARME")) {
        if (this.lieu !== 19) return [sys("Il n'y a pas d'avertisseur à portée de main ici.")];
        return this.piege("alarme", MORT_ALARME);
      }
      return [sys("Tirer quoi ?")];
    }

    // SORTIR veut dire quitter la pièce. Pour sortir DEHORS, il faut le dire (et en assumer le prix).
    sortir(c) {
      if (this.lieu === LIEU_SORTIE) return this.ouvrir({ decors: ["PORTE"], objets: [], mots: [] });
      if (this.localOuvert) {
        this.localOuvert = null;
        return [sys(LIEUX[this.lieu].ressortir || "Tu ressors dans le couloir.")];
      }
      const pieges = LIEUX[this.lieu].pieges;
      if (c.decors.includes("DEHORS") || c.decors.includes("PORTE")) {
        if (pieges) {
          const d = Object.keys(pieges).find((k) => pieges[k] === MORT_PORTE_SECOURS) || Object.keys(pieges)[0];
          return this.allerVers(d);
        }
        if (c.decors.includes("DEHORS")) return [sys("Il n'y a pas de sortie vers l'extérieur ici. Les portes principales sont au couloir administratif.")];
      }
      const sorties = LIEUX[this.lieu].sorties;
      const dernier = this.chemin[this.chemin.length - 1];
      if (dernier !== undefined && Object.values(sorties).includes(dernier)) return this.retour();
      const directions = Object.keys(sorties);
      if (directions.length === 1) return this.allerVers(directions[0]);
      return [sys("Sortir par où ? Touche une sortie, ou tape son nom.")];
    }

    utiliser(c) {
      if (c.decors.includes("ALARME")) return this.tirer(c);
      if (c.objets.length === 0 && CODES[this.lieu] && !this.codes[this.lieu] && /[0-9]/.test(c.brut || "")) return this.composer(c);
      if (c.objets.length === 0) return [sys(c.cleAbsente ? "Tu n'as pas de clé." : "Utiliser quoi ?")];
      const id = c.objets[0];
      if (!this.possede(id)) {
        if (id === "barre_tendre" && this.aPortee(id)) return this.manger(c);
        if (id === "agenda" && this.objetsParLieu[this.lieu].includes(id)) return this.carte();
        return [sys("Tu n'as pas " + OBJETS[id].pas + ".")];
      }
      switch (id) {
        case "cle_principale":
          if (this.lieu === LIEU_SORTIE) return this.victoire();
          if (this.lieu === LIEU_SECRETARIAT) return [sys("La clé ouvre les chaînes des portes principales, dans le couloir.")];
          return [sys("Il n'y a rien à ouvrir ici.")];
        case "arme_artisanale":
          if (this.lieu === LIEU_SORTIE) return this.frapperCadenas();
          return [sys("Il n'y a rien à frapper ici.")];
        case "barre_tendre":
          return this.manger(c);
        case "baton_lumineux":
        case "lampe_morte":
          return this.allumer(c);
        case "agenda":
          return this.carte();
        case "calepin":
          return this.lireNotes();
        case "cle_doree":
          return [{ type: "texte", texte: "Tu essaies la petite clé dorée. Elle n'entre dans aucune serrure ici. Mais elle tinte joliment. Beaucoup trop fort." }];
        case "telephone_mort":
          return [{ type: "texte", texte: this.evenementVu ? TEXTE_TELEPHONE_MORT : OBJETS.telephone_mort.description }];
        case "tuyau_metal":
        case "lame_lourde":
        case "ruban_adhesif":
          return [sys("Seul, ça ne sert à rien. Essaie de COMBINER.")];
        default:
          return [sys("Rien ne se passe.")];
      }
    }

    ouvrir(c) {
      if (c.decors.includes("FENETRE")) {
        this._gratuit = true;
        return [{ type: "texte", texte: TEXTE_FENETRE_SCELLEE }];
      }
      if (c.objets.includes("agenda")) return this.carte();
      if (c.objets.includes("calepin")) return this.lireNotes();
      if (this.lieu === LIEU_CUISINES && c.mots.some((m) => ["CHAMBRE", "FROIDE", "FRIGO"].includes(m)) && this.silhouette === "chambre_froide") {
        return [{ type: "danger", texte: "Tu poses la main sur la poignée glacée. De l'autre côté, le frottement s'arrête net. Tu lâches la poignée. Lentement. Jamais tu n'ouvriras cette porte." }];
      }
      if (this.lieu === 13 && c.mots.some((m) => ["CASIER", "CASIERS"].includes(m))) {
        return [{ type: "texte", texte: this.flags.lumiere ? "Le casier aux traces mouillées. Tu tends la main vers la poignée… et tu la retires. Tu ne l'ouvriras jamais." : "Dans le noir, tes doigts trouvent des portes de casier froides. Tu n'iras pas plus loin sans lumière." }];
      }
      if (c.decors.includes("TIROIR")) {
        const l = this.lectures().find((x) => x.mots.includes("TIROIR"));
        return l ? this.lu(l) : [sys("Il n'y a pas de tiroir à ouvrir ici.")];
      }
      if (CODES[this.lieu] && !this.codes[this.lieu] && /[0-9]/.test(c.brut || "")) return this.composer(c);
      if (CODES[this.lieu] && !this.codes[this.lieu]) {
        return [sys("C'est fermé par un code. " + CODES[this.lieu].forme + " Tape COMPOSER suivi du code.")];
      }
      if (this.lieu === LIEU_SORTIE) {
        if (c.decors.includes("SECRETARIAT") || c.decors.includes("CADENAS")) {
          return this.flags.cadenas_brise
            ? [sys("La porte du secrétariat est déjà ouverte.")]
            : [sys("La porte du secrétariat est verrouillée par un lourd cadenas rouillé. Il faudrait le briser.")];
        }
        if (this.possede("cle_principale")) return this.victoire();
        this._gratuit = true;
        return [{ type: "texte", texte: "Les portes principales menant vers l'extérieur sont scellées par d'épaisses chaînes industrielles. Il faudrait la clé principale." }];
      }
      const pieges = LIEUX[this.lieu].pieges;
      if ((c.decors.includes("PORTE") || c.decors.includes("DEHORS")) && pieges) {
        const gym = c.mots.some((m) => ["GYMNASE", "GYM", "6", "DOUBLES", "DOUBLE", "RESPIRATIONS"].includes(m));
        const d = Object.keys(pieges).find((k) => (gym ? pieges[k] === MORT_GYM6 : pieges[k] === MORT_PORTE_SECOURS)) || Object.keys(pieges)[0];
        return this.allerVers(d);
      }
      if (c.decors.includes("PORTE")) return [sys("Les portes ne sont pas verrouillées : touche une sortie pour passer.")];
      return [sys("Il n'y a rien à ouvrir ici.")];
    }

    carte() {
      const blocs = [];
      if (!this.possede("agenda")) {
        // L'agenda est à portée de main (sur le pupitre) : on le prend avant de l'ouvrir.
        if (!this.objetsParLieu[this.lieu].includes("agenda") || this.dansLeNoir()) {
          return [sys("Tu n'as pas de plan de l'école. Ton agenda en contient un.")];
        }
        this.objetsParLieu[this.lieu] = this.objetsParLieu[this.lieu].filter((x) => x !== "agenda");
        this.inventaire.push("agenda");
        blocs.push(sys("Pris : agenda."));
        if (this.poursuite === 0 && !this.silhouetteIci()) this.marquerPointSur(DESTINATIONS[this.lieu]);
      }
      if (this.dansLeNoir()) return [sys("Il fait trop noir pour lire quoi que ce soit.")];
      const marque = (id) => {
        if (id === LIEU_SECRETARIAT && !this.flags.cadenas_brise) return "🔒";
        if (id === 13 && !this.flags.lumiere && this.objetsParLieu[13].length) return "?";
        if (id === LIEU_CAFETERIA && this.silhouette === "cafeteria") return "!";
        return "";
      };
      const lieux = [...this.visites].filter((id) => PLAN[id]).map((id) => {
        const [etage, x, y, nom] = PLAN[id];
        const s = LIEUX[id].sorties;
        const vertical = ["HAUT", "BAS"].some((d) => s[d] !== undefined && this.visites.has(s[d]));
        return { id, etage, x, y, nom, actuel: id === this.lieu, vertical, marque: marque(id), destination: DESTINATIONS[id] };
      });
      const liens = [];
      for (const id of this.visites) {
        for (const [d, dest] of Object.entries(LIEUX[id].sorties)) {
          if (d === "HAUT" || d === "BAS" || !this.visites.has(dest) || id > dest) continue;
          if (PLAN[id] && PLAN[dest] && PLAN[id][0] === PLAN[dest][0]) liens.push([id, dest]);
        }
      }
      return [
        ...blocs,
        { type: "texte", texte: "Tu ouvres ton agenda sur le plan de l'école. Tu n'y repères que les endroits que tu as déjà visités." + (this.poursuite > 0 ? "" : " Touche un lieu pour t'y rendre.") },
        { type: "carte", texte: "Plan de l'école (lieux visités).", etageActuel: PLAN[this.lieu][0], lieux, liens },
      ];
    }

    allumer(c) {
      if (c.objets.includes("lampe_morte")) {
        if (!this.possede("lampe_morte")) return [sys("Tu n'as pas de lampe de poche.")];
        return [{ type: "texte", texte: "Tu appuies sur l'interrupteur de la lampe. Rien. Tu la secoues. Toujours rien. Les piles sont mortes." }];
      }
      if (c.objets.length && !c.objets.includes("baton_lumineux")) return [sys("Ça ne s'allume pas.")];
      if (!this.possede("baton_lumineux")) return [sys("Tu n'as rien pour faire de la lumière.")];
      if (this.flags.lumiere) return [sys("Le bâton luit déjà dans ta main.")];
      this.flags.lumiere = true;
      const blocs = [];
      if (!this.chapitres.includes(3)) {
        this.chapitres.push(3);
        blocs.push(chapitre(3));
      }
      blocs.push({ type: "texte", texte: TEXTE_ALLUMER });
      if (LIEUX[this.lieu].sombre) blocs.push(...this.decrireLieu(undefined, "long"));
      return blocs;
    }

    ecouter() {
      if (this.poursuite > 0) return [{ type: "ecoute", texte: "Des pas. Ils ne cherchent plus. Ils savent où tu es." }];
      if (this.lieu === 13 && this.dansLeNoir() && this.objetsParLieu[13].length) return [{ type: "ecoute", texte: ECOUTE_VESTIAIRES_NOIR }];
      if (this.lieu === LIEU_CUISINES && this.silhouette === "chambre_froide") return [{ type: "ecoute", texte: ECOUTE_CHAMBRE_FROIDE }];
      return [{ type: "ecoute", texte: ECOUTES[this.lieu] || ECOUTES.defaut }];
    }

    attendre() {
      if (this.poursuite > 0) return [{ type: "texte", texte: "Attendre ? Maintenant ? Chaque seconde les rapproche." }];
      return [{ type: "texte", texte: "Tu restes immobile, le dos contre le mur, et tu comptes jusqu'à trente. Rien ne vient. Pour l'instant." }];
    }

    crier() {
      return this.piege("cri", MORT_CRI);
    }

    lancer(c) {
      const leurres = LEURRES.filter((id) => this.possede(id));
      if (!c.objets.length) {
        return [sys("Lancer quoi ? Tape LANCER suivi d'un objet que tu portes.")];
      }
      const id = c.objets[0];
      if (!this.possede(id)) return [sys("Tu n'as pas " + OBJETS[id].pas + ".")];
      if (!LEURRES.includes(id)) return [sys("Tu pourrais en avoir besoin. Garde ça.")];
      const nom = { cle_doree: "la petite clé dorée", lampe_morte: "la lampe de poche", telephone_mort: "ton téléphone" }[id];
      if (this.silhouetteIci()) {
        this.retirer(id);
        this.silhouette = "chambre_froide";
        return [{ type: "scene", texte: TEXTE_RENCONTRE_LANCER(nom), son: "choc" }];
      }
      if (this.gardienIci()) {
        this.retirer(id);
        this.gardien = false;
        this.epargne = true;
        return [{ type: "choc", texte: TEXTE_GARDIEN_LANCER(nom), son: "choc" }];
      }
      return [sys("Faire du bruit pour rien ? Mauvaise idée. Garde ça pour le bon moment.")];
    }

    noter(texte) {
      texte = texte.trim().slice(0, NOTE_LONGUEUR_MAX);
      if (!this.possede("calepin")) return [sys("Tu n'as rien pour écrire. Il te faudrait un calepin.")];
      if (!texte) return [sys("Noter quoi ? Tape NOTER suivi de ton texte (ex. : NOTER A215 : rien d'utile).")];
      if (this.dansLeNoir()) return [sys("Il fait trop noir pour écrire.")];
      if (this.notes.length >= NOTES_MAX) return [sys("Ton calepin est plein. Tape EFFACER NOTES pour arracher les pages.")];
      this.notes.push(texte);
      return [sys(`Noté dans ton calepin (${this.notes.length}).`)];
    }

    effacerNotes() {
      if (!this.possede("calepin")) return [sys("Tu n'as pas de calepin.")];
      this.notes = [];
      return [sys("Tu arraches les pages où tu avais écrit. Ton calepin est vide (les indices recopiés restent sur la première page).")];
    }

    // Le calepin : indices recopiés, notes personnelles, et les pages du carnet de R.
    lireNotes() {
      const calepin = this.possede("calepin");
      if (!calepin && !this.pages.length) return [sys("Tu n'as pas de calepin.")];
      if (calepin && this.dansLeNoir()) return [sys("Il fait trop noir pour lire quoi que ce soit.")];
      const notes = this.notes.map((n, i) => `${i + 1}. ${n}`).join("\n");
      const sections = [];
      if (calepin && this.indicesTrouves.length) sections.push("Indices recopiés :\n" + this.indicesTrouves.map((t) => "• " + t).join("\n"));
      if (calepin && this.notes.length) sections.push(sections.length ? "Tes notes :\n" + notes : notes);
      if (this.pages.length) {
        sections.push(`Carnet de R. (${this.pages.length}/${PAGES.length}) :\n` + this.pages.slice().sort((a, b) => a - b).map((n) => "— " + PAGES[n - 1].texte).join("\n"));
      }
      if (!sections.length) return [sys("Ton calepin est vide. Tape NOTER suivi de ce que tu veux retenir.")];
      return [{ type: "notes", texte: sections.join("\n\n") }];
    }

    afficherInventaire() {
      const noms = this.inventaire.map((id) => OBJETS[id].nom + (id === "baton_lumineux" && this.flags.lumiere ? " (allumé)" : ""));
      return [sys("Tu portes : " + noms.join(", ") + "." + (this.pages.length ? ` Et ${this.pages.length} page${this.pages.length > 1 ? "s" : ""} du carnet de R.` : ""))];
    }

    objectifsEtat() {
      const visibles = OBJECTIFS.filter((o) => o.visible(this)).map((o) => o.id);
      return { visibles, faits: OBJECTIFS.filter((o) => visibles.includes(o.id) && o.fait(this)).map((o) => o.id) };
    }

    afficherObjectifs() {
      const etat = this.objectifsEtat();
      const lignes = OBJECTIFS.filter((o) => etat.visibles.includes(o.id)).map((o) => ({ texte: o.texte, fait: etat.faits.includes(o.id) }));
      // Les objectifs en cours d'abord, les accomplis ensuite.
      lignes.sort((a, b) => Number(a.fait) - Number(b.fait));
      const serrures = ORDRE_CODES.filter((id) => this.codes[id]).length;
      const resume = `Serrures ouvertes : ${serrures}/3 · Pages du carnet : ${this.pages.length}/${PAGES.length} · Morts : ${this.morts} · Indices : ${this.indicesUtilises}`;
      return [{
        type: "objectifs",
        lignes,
        resume,
        texte: "OBJECTIFS\n" + lignes.map((l) => (l.fait ? "✔ " : "□ ") + l.texte).join("\n") + "\n" + resume,
      }];
    }

    donnerIndice() {
      const etape = INDICES.find((e) => !e.ok(this) && (!e.si || e.si(this)));
      if (!etape) return [sys("Tu sais tout ce qu'il faut savoir. Fonce.")];
      if (this.indice.etape !== etape.id) this.indice = { etape: etape.id, niveau: etape.deja ? Math.min(etape.deja(this), etape.niveaux.length - 1) : 0, actions: 0, neuf: true };
      const max = etape.niveaux.length;
      const urgent = etape.id === "silhouette" || etape.id === "gardien" || etape.id === "coffre";
      const fait = this.actionsIndice || 0;
      const attente = this.indice.neuf || urgent ? 0 : this.indice.actions + ATTENTE_INDICE - fait;
      if (this.indice.niveau >= max || attente > 0) {
        const n = this.indice.niveau;
        const suite = n >= max ? "" : ` Cherche encore un peu : l'indice suivant se débloque dans ${attente} action${attente > 1 ? "s" : ""}.`;
        return [{ type: "indice", texte: `Indice ${n}/${max} : ${etape.niveaux[n - 1]}${suite}`, rappel: true }];
      }
      this.indice.niveau += 1;
      this.indice.actions = fait;
      this.indice.neuf = false;
      this.indicesUtilises += 1;
      return [{ type: "indice", texte: `Indice ${this.indice.niveau}/${max} : ${etape.niveaux[this.indice.niveau - 1]}` }];
    }

    mort(texte) {
      this.termine = true;
      this.poursuite = 0;
      this.gardien = false;
      const indice = INDICES_MORT.get(texte) || null;
      this.derniereMort = { indice };
      const blocs = [
        { type: "mort", texte, son: "mort" },
        { type: "coupure", texte: TEXTE_FIN_MORT[0] },
        { type: "finmort", texte: TEXTE_FIN_MORT[1] },
      ];
      if (indice) blocs.push({ type: "indicemort", texte: "Ce que tu sais maintenant : " + indice });
      blocs.push(sys(this.pointSur
        ? `Tu peux reprendre au dernier moment sûr (${this.pointSurLibelle}), ou tout recommencer.`
        : "Tu peux tout recommencer."));
      return blocs;
    }

    // Réponses trouvées, dans l'ordre attendu par le serveur pour valider une victoire.
    reponses() {
      return ORDRE_CODES.map((id) => this.codes[id] || "");
    }

    statistiques() {
      return {
        actions: this.actions,
        morts: this.morts,
        indices: this.indicesUtilises,
        locaux: this.locauxFouilles.length,
        totalLocaux: TOTAL_LOCAUX,
        pages: this.pages.length,
        totalPages: PAGES.length,
        serrures: ORDRE_CODES.filter((id) => this.codes[id]).length,
        epargne: this.epargne === true,
      };
    }

    victoire() {
      this.termine = true;
      this.gagne = true;
      this.poursuite = 0;
      const cle = ORDRE_CODES.map((id) => this.codes[id]).join("|");
      const blocs = [
        { type: "victoire", texte: TEXTE_VICTOIRE[0] },
        { type: "coupure", texte: TEXTE_VICTOIRE[1] },
        { type: "coupure", texte: EPILOGUE[0] },
        { type: "epilogue", texte: EPILOGUE[1] },
      ];
      if (this.pages.length === PAGES.length) blocs.splice(1, 0, { type: "victoire", texte: EPILOGUE_CARNET(this.epargne === true) });
      blocs.push(
        { type: "fin", texte: TEXTE_VICTOIRE[2] },
        { type: "recompense", texte: TEXTE_RECOMPENSE },
        { type: "phrase", texte: "« " + dechiffrer(PHRASE_CHIFFREE, cle) + " »" },
      );
      return blocs;
    }

    etat() {
      return this.exporter();
    }
  }

  const api = {
    Partie, LIEUX, OBJETS, PAGES, DESTINATIONS, DELAI_POURSUITE, TOTAL_LOCAUX, INDICES, LOCAUX_SPECIAUX,
    analyser, normaliser, empreinte, chiffrer, utf8, hex, dechiffrer, texteLocal, lier,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.NuitStEx = api;
})(typeof window !== "undefined" ? window : globalThis);
