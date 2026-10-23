// Traduction de l'appli : le français est la langue source ; en anglais, chaque texte affiché
// est remplacé par sa traduction (correspondance exacte, puis modèles avec valeurs variables).
// Les textes produits par l'IA arrivent déjà dans la bonne langue et ne sont pas touchés.

export const lang = window.CE_LANG === 'en' ? 'en' : 'fr';

const EN = {
  // En-tête, accès, achat
  'Brûle la pile': 'Burn the Pile',
  'Brûle la pile — Application': 'Burn the Pile — App',
  'Recharger': 'Top up',
  'Retirer la clé de cet appareil': 'Remove the key from this device',
  'Changer de clé': 'Change key',
  'Commencer gratuitement': 'Start for free',
  "30 pages offertes, sans carte de crédit. Votre clé d'accès s'affiche à l'écran : notez-la.": '30 free pages, no credit card. Your access key appears on screen: write it down.',
  'Obtenir mes 30 pages gratuites': 'Get my 30 free pages',
  'ou': 'or',
  "J'ai déjà une clé d'accès": 'I already have an access key',
  'Utiliser cette clé': 'Use this key',
  'Acheter un pack': 'Buy a pack',
  'Choisir un pack': 'Choose a pack',
  'Fermer': 'Close',
  'Paiement unique par Stripe. Les pages n\'expirent pas. Une page de copie = 1 page en mode rapide, 2 en mode approfondi. Le corrigé est gratuit.': 'One-time payment via Stripe. Pages never expire. One student page = 1 page in quick mode, 2 in in-depth mode. The answer key is free.',
  'Découverte': 'Starter', 'Session': 'Term', 'Année': 'Year', 'Populaire': 'Popular',
  '200 pages · ~7 ¢ la page': '200 pages · ~7¢ per page',
  '500 pages · ~5,8 ¢ la page': '500 pages · ~5.8¢ per page',
  '1 800 pages · ~4,4 ¢ la page': '1,800 pages · ~4.4¢ per page',
  '14 $': '$14', '29 $': '$29', '79 $': '$79',
  "Votre clé d'accès": 'Your access key',
  'Notez-la ou copiez-la : elle vous permet d\'utiliser vos pages sur un autre appareil et de recharger votre compte.': 'Write it down or copy it: it lets you use your pages on another device and top up your account.',
  'Copier': 'Copy',
  "C'est noté, commencer": 'Got it, start',

  // Onglets et réglages
  'Correction de copies': 'Grade work', 'Copies': 'Grading',
  'Correction de la langue': 'Language check', 'Langue': 'Language',
  'Évaluation et copies': 'Assessment and student work',
  "Nom de l'évaluation": 'Assessment name',
  'Ex. : Examen — Révolution tranquille': 'E.g., Exam — The Cold War',
  "Utilisé seulement si le groupe n'est pas écrit sur la copie": 'Used only if the class is not written on the paper',
  'Groupe par défaut': 'Default class',
  'Ex. : 541': 'E.g., Period 3',
  'Barème total (points)': 'Total points',
  'Points': 'Points',
  'Demi-points permis': 'Half points allowed',
  'Points entiers seulement': 'Whole points only',
  'Mode de correction': 'Grading mode',
  'Approfondie : double correction et fiabilité (1 page = 2 pages décomptées)': 'In-depth: double grading and reliability (1 page = 2 pages used)',
  'Rapide : une seule correction, 2× plus vite (1 page = 1 page décomptée)': 'Quick: single grading, 2× faster (1 page = 1 page used)',
  "Évaluer aussi l'orthographe et la grammaire": 'Also assess spelling and grammar',
  'Corrigé ou grille de correction': 'Answer key or rubric',
  'Consignes, réponses attendues, points par question': 'Instructions, expected answers, points per question',
  'Astuce : fournir le corrigé (ici ou en PDF/photo ci-dessous) améliore beaucoup la fiabilité de la correction.\n\nEx. : Q1 (2 pts) : 1960, début de la Révolution tranquille. Q2 (3 pts) : nommer deux réformes… Accepter les synonymes.\n\nVous pouvez aussi demander la forme du rendu : « Commentaire de 2 phrases, au tu, qui commence par un point fort », « Justifications courtes »…':
    'Tip: providing the answer key (here or as a PDF/photo below) greatly improves grading reliability.\n\nE.g., Q1 (2 pts): 1947, start of the Cold War. Q2 (3 pts): name two causes… Accept synonyms.\n\nYou can also ask for a style: “2-sentence comment that starts with a strength”, “Short justifications”…',
  'Ajouter le corrigé (PDF ou photos) —': 'Add the answer key (PDF or photos) —',
  'non facturé': 'not charged',
  'Préparer une grille détaillée (gratuit)': 'Build a detailed rubric (free)',
  'Régénérer la grille': 'Regenerate the rubric',
  "Recommandé pour les travaux de rédaction : l'IA rédige des niveaux précis pour chaque critère, vous les validez, et la même grille s'applique à toutes les copies. Les notes deviennent beaucoup plus constantes.":
    'Recommended for written work: the AI drafts precise levels for each criterion, you approve them, and the same rubric applies to every paper. Grades become much more consistent.',
  'Grille détaillée': 'Detailed rubric',
  'Retirer la grille': 'Remove rubric',
  'Relisez et ajustez au besoin. Un niveau par ligne, sous la forme « points : description ».': 'Review and adjust as needed. One level per line, as “points: description”.',
  'Critère': 'Criterion', 'Points maximum': 'Maximum points',
  'Un instant, l’IA prépare la grille…': 'One moment, the AI is building the rubric…',
  'Copies des élèves': 'Student work',
  'Glissez les copies ici ou cliquez pour parcourir': 'Drop student work here or click to browse',
  'PDF, photos (y compris iPhone), Word (.docx) ou texte · plusieurs fichiers à la fois': 'PDF, photos (including iPhone), Word (.docx) or text · several files at once',
  'Regrouper :': 'Group pages:',
  '— Choisir —': '— Choose —',
  '1 fichier = 1 élève': '1 file = 1 student',
  'Nombre fixe de pages par élève': 'Fixed number of pages per student',
  'Détection automatique (IA, gratuite)': 'Automatic detection (AI, free)',
  'Pages par élève': 'Pages per student',
  'Tout retirer': 'Remove all',
  "Indiquez comment les pages sont regroupées : un fichier par élève, un nombre fixe de pages par élève, ou laissez l'IA détecter où commence chaque copie.":
    'Tell us how pages are grouped: one file per student, a fixed number of pages per student, or let the AI detect where each paper starts.',
  'Vérifiez les regroupements : cliquez sur ✂ pour séparer deux pages, sur « fusionner » pour rattacher une copie à la précédente.':
    'Check the grouping: click ✂ to split two pages, or “merge” to attach a paper to the previous one.',
  'fusionner avec la précédente': 'merge with previous',
  'Séparer : une nouvelle copie commence ici': 'Split: a new paper starts here',
  'Retirer cette page': 'Remove this page',
  'Retirer': 'Remove',
  'Aucune copie importée': 'No work imported',
  'Corriger': 'Grade',
  'Correction en cours…': 'Grading…',
  'Analyse des copies en cours…': 'Analyzing papers…',
  'Choisissez comment regrouper les pages': 'Choose how to group the pages',
  'Indiquez le nombre de pages par élève': 'Enter the number of pages per student',
  'Solde insuffisant : rechargez votre compte': 'Not enough pages: top up your account',
  'Un instant, nous analysons vos copies…': 'One moment, we are analyzing your papers…',
  '⚠ Ne fermez pas cette fenêtre et ne rechargez pas la page pendant la correction : les résultats seraient perdus. Vous pouvez utiliser un autre onglet.':
    '⚠ Do not close this window or reload the page while grading: results would be lost. You can use another tab.',
  'Moins d’une minute restante': 'Less than a minute left',

  // Correction de la langue : réglages
  "L'IA relève les fautes de français sur chaque page et les surligne directement sur la copie, avec la correction et la règle. 1 page de copie = 1 page décomptée.":
    'The AI finds language errors on each page and highlights them right on the paper, with the correction and the rule. 1 student page = 1 page used.',
  'Niveau des élèves': 'Student level',
  'Primaire': 'Elementary', 'Secondaire 1-2': 'Middle school', 'Secondaire 3-5': 'High school', 'Cégep / adultes': 'College / adults',
  'Fautes à relever': 'Errors to flag',
  "Orthographe d'usage": 'Spelling', 'Accords': 'Agreement', 'Conjugaison': 'Verb forms', 'Ponctuation': 'Punctuation', 'Syntaxe': 'Sentence structure', 'Vocabulaire': 'Word choice',
  'Orthographe': 'Spelling',
  'Note sur (facultatif)': 'Score out of (optional)',
  'Ex. : 10': 'E.g., 10', 'Ex. : 0,5': 'E.g., 0.5',
  'Points retirés par faute': 'Points off per error',
  'Retrait maximum': 'Maximum deduction',

  // Résultats
  'Résultats': 'Results',
  'Rechercher un élève…': 'Search for a student…',
  'Télécharger les notes (CSV)': 'Download results (CSV)',
  'Terminer la session': 'End session',
  'Les copies corrigées apparaîtront ici, avec le détail des points par question.': 'Graded papers will appear here, with a point-by-point breakdown.',
  'Les notes sont des propositions : vérifiez-les, surtout les copies marquées ⚠. Tout est modifiable.': 'Grades are suggestions: review them, especially papers marked ⚠. Everything can be edited.',
  "Aucune copie ni note n'est conservée : téléchargez les notes avant de fermer la page.": 'No work or grades are stored: download your results before closing the page.',
  'copies': 'papers', 'moyenne': 'average', 'fiabilité moyenne': 'average reliability', 'à vérifier ⚠': 'to review ⚠',
  'Question': 'Question', 'Justification': 'Justification',
  "Commentaire pour l'élève": 'Feedback for the student',
  'Supprimer': 'Delete',
  'Nom à compléter': 'Name missing',
  "Nom de l'élève": 'Student name',
  'Groupe': 'Class',
  'Détails': 'Details',
  'Moyenne par question': 'Average by question',
  "Gardez l'écran allumé": 'Keep your screen on',
  "Pendant la correction, n'éteignez pas l'écran du téléphone et restez sur cette page.": "While grading, don't turn off your phone's screen and stay on this page.",
  "Si le téléphone se met en veille, la correction s'arrête. Elle reprend toute seule quand vous revenez sur la page.": 'If the phone goes to sleep, grading stops. It resumes on its own when you come back to the page.',
  'Je comprends': 'Got it',
  'Guide': 'Guide', "Le guide s'ouvre dans un nouvel onglet : vos résultats restent ici": 'The guide opens in a new tab: your results stay here',
  'Pas encore prêt à essayer ?': 'Not ready to try yet?', "Découvrez tout ce que fait l'outil dans le guide": 'See everything the tool does in the guide',
  'Bienvenue dans Brûle la pile': 'Welcome to Burn the Pile',
  'Ajoutez votre corrigé': 'Add your answer key', "(texte, PDF ou photos) : il n'est pas facturé.": '(text, PDF or photos): it is not charged.',
  'Déposez les copies': 'Drop the student work', '(un PDF numérisé, des photos, ou numérisez-les avec votre téléphone).': '(a scanned PDF, photos, or scan them with your phone).',
  'Cliquez sur « Corriger »': 'Click “Grade”', ", puis relisez et ajustez avant d'exporter.": ', then review and adjust before exporting.',
  'À savoir': 'Good to know', "Rien n'est sauvegardé": 'Nothing is saved', ', pour protéger vos élèves : téléchargez le CSV ou imprimez avant de partir.': ', to protect your students: download the CSV or print before you leave.',
  "Ne fermez pas l'onglet et ne rechargez pas la page": "Don't close the tab or reload the page", "avant d'avoir exporté.": 'before you have exported.',
  'Sur téléphone': 'On a phone', ", gardez l'écran allumé pendant la correction.": ', keep the screen on while grading.',
  'Ouvrir le guide complet': 'Open the full guide', 'Commencer': 'Start',
  'Imprimer…': 'Print…', 'Imprimer les copies corrigées': 'Print graded papers',
  'Les copies complètes, annotées (note, points et notes dans la marge)': 'Full papers, annotated (grade, points and margin notes)',
  'Les fiches de résultats (note, points et justification par question, commentaire)': 'Result sheets (grade, points and justification per question, feedback)',
  'Fiches seules : plusieurs par feuille, à découper. Avec les copies : la fiche de chaque élève, puis sa copie.': 'Sheets only: several per page, to cut out. With the papers: each student\'s sheet, then their paper.',
  'Imprimer': 'Print',
  'Voir la copie corrigée': 'View graded paper', 'Imprimer la copie corrigée pour l’élève': 'Print the graded paper for the student', 'Copies corrigées': 'Graded papers', 'Préparation de l’impression…': 'Preparing to print…',
  'Arrêter': 'Stop', 'Arrêt en cours…': 'Stopping…', 'Arrêt : les copies déjà parties se terminent…': 'Stopping: papers already sent are finishing…',
  'Connexion perdue. Relancez la correction.': 'Connection lost. Run grading again.',
  'Connexion perdue : la correction reprendra toute seule. Gardez cette page ouverte et l’écran allumé.': 'Connection lost: grading will resume on its own. Keep this page open and the screen on.',
  'Simple': 'Simple', 'Avancé': 'Advanced', 'Affichage des options': 'Settings view',
  'Des réglages avancés sont actifs (': 'Some advanced settings are on (', 'voir': 'show', ').': ').',
  'Fiabilité de la correction : cliquez pour en savoir plus': 'Grading reliability: click to learn more',
  'Que veut dire la fiabilité ?': 'What does reliability mean?',
  'Aucune faute relevée.': 'No errors found.',
  'Voir la copie annotée': 'View annotated paper',
  'Imprimer / PDF': 'Print / PDF',
  'Cliquez pour agrandir ou réduire': 'Click to zoom in or out',
  "Ce n'est pas une faute : retirer": 'Not an error: remove',
  'Élève': 'Student',

  // Fenêtre « fiabilité »
  'Chaque copie est corrigée': 'Each paper is graded',
  'deux fois, indépendamment': 'twice, independently',
  ". La fiabilité mesure à quel point ces deux corrections sont d'accord, question par question.": '. Reliability measures how closely the two gradings agree, question by question.',
  '90 % et +': '90% and up',
  'Les deux corrections concordent : la note est solide.': 'Both gradings agree: the grade is solid.',
  'Léger désaccord sur une question : jetez-y un œil.': 'Slight disagreement on a question: take a look.',
  'moins de 80 %': 'below 80%',
  'Désaccord important : copie signalée ⚠, à vérifier.': 'Major disagreement: paper flagged ⚠, please review.',
  'Les questions en désaccord sont marquées': 'Questions in disagreement are marked',
  ", avec la note de l'autre correction. La fiabilité baisse aussi si l'IA signale un doute (écriture illisible, copie incomplète), si le nom est illisible ou si le barème ne totalise pas.":
    ', with the other grading’s score. Reliability also drops if the AI reports a doubt (illegible writing, incomplete paper), if the name is illegible, or if the points don’t add up.',
  "La fiabilité n'existe qu'en mode": 'Reliability is only available in',
  'Approfondie': 'In-depth',
  '. En mode Rapide, une seule correction est faite : seuls les doutes signalés par l\'IA apparaissent.': ' mode. In Quick mode a single grading is done: only doubts reported by the AI are shown.',
  "Exemple : 1 point d'écart sur 20 donne environ 85 %. Une fiabilité élevée n'est pas une garantie : vous restez le correcteur. Un corrigé précis (points par question, réponses acceptées) augmente la fiabilité.":
    'Example: a 1-point gap out of 20 gives about 85%. High reliability is not a guarantee: you remain the grader. A precise answer key (points per question, accepted answers) increases reliability.',
  'Compris': 'Got it',

  // Messages du serveur
  "Clé d'accès invalide": 'Invalid access key',
  "Clé d'accès inconnue": 'Unknown access key',
  'Solde de pages insuffisant. Rechargez votre compte pour continuer.': 'Not enough pages left. Top up your account to continue.',
  "La correction a échoué. Aucune page n'a été décomptée, réessayez.": 'Grading failed. No pages were used, please try again.',
  "L'analyse de la langue a échoué. Aucune page n'a été décomptée, réessayez.": 'Language check failed. No pages were used, please try again.',
  'La préparation de la grille a échoué. Réessayez.': 'Building the rubric failed. Please try again.',
  "Écrivez d'abord vos consignes ou ajoutez votre corrigé.": 'First write your instructions or add your answer key.',
  'La détection automatique a échoué. Réessayez ou regroupez les pages manuellement.': 'Automatic detection failed. Try again or group pages manually.',
  'Le paiement est momentanément indisponible.': 'Payment is temporarily unavailable.',
  'Erreur interne, réessayez dans un instant.': 'Internal error, please try again shortly.',
  "Trop d'essais gratuits depuis cette connexion aujourd'hui. Réessayez demain ou choisissez un pack.": 'Too many free trials from this connection today. Try again tomorrow or choose a pack.',
  "L'IA a un doute sur cette copie.": 'The AI has a doubt about this paper.',
  'Nom illisible ou absent.': 'Name illegible or missing.',
  'Une seule correction a pu être faite (pas de contre-vérification).': 'Only one grading could be done (no cross-check).',
  'La contre-vérification a échoué : correction simple seulement (une seule page décomptée par page).': 'The cross-check failed: single grading only (one page used per page).',
  "L'IA n'a pas pu préparer de grille à partir de ces consignes. Précisez les critères et réessayez.": 'The AI could not build a rubric from these instructions. Specify the criteria and try again.',

  // Messages de l'appli
  'Vos résultats non téléchargés seront perdus en quittant la page. Continuer vers le paiement ?': 'Results you have not downloaded will be lost when leaving the page. Continue to payment?',
  'module de lecture indisponible (connexion ?)': 'reader unavailable (connection?)',
  'Lecteur PDF indisponible (connexion ?)': 'PDF reader unavailable (connection?)',
  'image illisible': 'unreadable image', 'document vide': 'empty document', 'illisible': 'unreadable',
  'Remplacer la grille actuelle par une nouvelle ?': 'Replace the current rubric with a new one?',
  'Grille préparée : relisez-la et ajustez au besoin. Elle sera appliquée à toutes les copies.': 'Rubric ready: review and adjust as needed. It will be applied to every paper.',
  'Terminer la session et tout effacer (copies, corrigé, résultats) ?': 'End the session and erase everything (papers, answer key, results)?',
  'Télécharger les notes (CSV) avant d’effacer ?': 'Download the results (CSV) before erasing?',
  'Oublier aussi la clé d’accès sur cet ordinateur ? Notez-la d’abord pour utiliser vos pages restantes :': 'Also forget the access key on this computer? Write it down first to use your remaining pages:',
  'Session terminée : tout a été effacé.': 'Session ended: everything was erased.',
  'Des résultats ne sont pas téléchargés. Continuer ?': 'Some results have not been downloaded. Continue?',
  'Autorisez les fenêtres surgissantes pour imprimer.': 'Allow pop-ups to print.',
  "Langue des copies et des commentaires de l'IA": 'Language of the papers and of the AI’s comments', 'Français': 'French',
  'N° copie': 'Paper no.', 'Fichier': 'File', 'Voir la copie': 'View paper', 'Agrandir': 'Enlarge',
  'Évaluation': 'Assessment', 'Note': 'Grade', 'Sur': 'Out of', 'Pourcentage': 'Percentage', 'Fiabilité (%)': 'Reliability (%)',
  'Détail par question': 'Breakdown by question', 'Commentaire': 'Feedback', 'À vérifier': 'To review',
  'Fautes': 'Errors', 'Détail des fautes': 'Error details', 'Corrections': 'Corrections',
  'correction de la langue': 'language check', 'Copie': 'Paper',

  // Page de remerciement
  'Merci — Brûle la pile': 'Thank you — Burn the Pile',
  'Merci pour votre achat !': 'Thank you for your purchase!',
  'Confirmation du paiement…': 'Confirming payment…',
  "Notez cette clé d'accès : elle contient votre solde et sert à recharger votre compte ou à l'utiliser sur un autre appareil. Elle figure aussi sur le reçu envoyé à votre courriel.": 'Write down this access key: it holds your balance and lets you top up or use it on another device. It is also on the receipt sent to your email.',
  'Corriger mes copies': 'Grade my papers',
  'Erreur': 'Error',
  'Écrivez-nous en indiquant votre courriel de paiement.': 'Contact us with your payment email.',
  "Le paiement n'est pas encore confirmé. Rechargez cette page dans une minute.": 'Payment is not confirmed yet. Reload this page in a minute.',
  "Le paiement n'est pas encore confirmé.": 'Payment is not confirmed yet.',
  'Paiement introuvable': 'Payment not found', 'Paiement invalide': 'Invalid payment',
  // Correctifs après les tests d'enseignants
  ", par deux modèles d'IA différents. La fiabilité mesure à quel point ces deux corrections sont d'accord, question par question. Elle ne garantit pas l'exactitude : deux corrections peuvent s'accorder et se tromper toutes les deux.":
    ', by two different AI models. Reliability measures how closely the two gradings agree, question by question. It does not guarantee accuracy: two gradings can agree and both be wrong.',
  'module de lecture indisponible (rechargez la page)': 'file reader unavailable (reload the page)',
  'lecteur PDF indisponible (rechargez la page)': 'PDF reader unavailable (reload the page)',
  'copie': 'paper', 'page': 'page', 'pages': 'pages',
  'Analyse en cours…': 'Checking…',
  'Illisible': 'Illegible',
  'Corrigée sans corrigé : vérifiez que la note n’est pas trop généreuse.': 'Graded without an answer key: check that the grade is not too generous.',
  "Copie illisible (photo floue, sombre ou coupée) : aucune note n'a été attribuée et aucune page n'a été décomptée. Reprenez la photo ou corrigez cette copie vous-même.":
    'Illegible paper (blurry, dark or cut-off photo): no grade was given and no pages were used. Retake the photo or grade this paper yourself.',
  'Certains passages sont difficiles à lire : vérifiez les questions concernées.': 'Some passages are hard to read: check the affected questions.',
  'Les copies analysées apparaîtront ici, avec les fautes surlignées.': 'Checked papers will appear here, with errors highlighted.',
  "Masquer le nom de l'élève avant l'envoi": 'Hide the student’s name before sending',
  "— le haut de la 1re page de chaque copie (zone hachurée sur les miniatures) n'est pas transmis ; vous inscrirez les noms vous-même. Vérifiez qu'aucune réponse ne s'y trouve.": '— the top of each paper’s first page (hatched area on the thumbnails) is not sent; you will enter the names yourself. Make sure no answer is written there.',
  'Zone masquée : non envoyée': 'Hidden area: not sent',
  'Numériser « Brûle la pile »': 'Scan “Burn the Pile”', 'Tournez les pages devant votre téléphone : chaque page est photographiée toute seule. Vous relisez la pile, puis lancez la correction.': 'Turn the pages in front of your phone: each page is photographed automatically. Review the stack, then start grading.', 'Démarrage de la caméra…': 'Starting the camera…',
  'Placez une feuille dans le cadre': 'Place a page in the frame', 'Feuille vide ?': 'Blank page?', 'Tenez immobile…': 'Hold still…',
  '✓ Photographiée — tournez la page': '✓ Captured — turn the page', 'Image floue : tenez le téléphone immobile': 'Blurry: hold the phone still',
  'Pages par élève': 'Pages per student', 'Corriger pendant la prise de vue': 'Grade while capturing', 'Annuler la dernière': 'Undo last',
  'Relecture en cours : d’autres fautes peuvent s’ajouter…': 'Second reading in progress: more errors may be added…',
  'Vous pouvez aussi y préciser comment rédiger les résultats : ton, longueur, tutoiement, ce que le commentaire doit souligner.': 'You can also say how results should be written: tone, length, what the comment should highlight.',
  'Terminer': 'Done', '▶ Démarrer': '▶ Start', '⏸ Pause': '⏸ Pause',
  'En pause : placez la première feuille, puis touchez « Démarrer »': 'Paused: place the first page, then tap “Start”', 'Photographier maintenant': 'Capture now',
  'Caméra indisponible : autorisez l’accès à la caméra pour ce site, puis réessayez.': 'Camera unavailable: allow camera access for this site, then try again.',
  'Bande masquée :': 'Hidden band:', '8 % de la page': '8% of the page', '14 %': '14%', '20 %': '20%', '30 %': '30%', 'sur toutes les pages (nom répété)': 'on every page (name repeated)',
  'Pivoter la page de 90°': 'Rotate the page 90°',
  'Vérification de l’orientation des pages…': 'Checking page orientation…',
  'Importation…': 'Importing…',
  'Pourquoi ? (facultatif, guide les prochaines copies)': 'Why? (optional, guides the next papers)',
  'Raison du changement de note': 'Reason for changing the mark',
  "🎯 Calibrer d'abord : corriger 3 copies, ajuster, puis le reste": '🎯 Calibrate first: mark 3 papers, adjust, then the rest',
  'Corrigez 3 copies, ajustez leurs notes : la suite de la pile est corrigée comme vous': 'Mark 3 papers and adjust their marks: the rest of the pile is marked your way',
  'Déjà en cours d’importation, patientez…': 'Already importing, please wait…',
  '+ Ajouter une faute': '+ Add an error', 'Annuler l’ajout': 'Cancel', 'Tracez un cadre sur la copie autour du mot fautif.': 'Draw a box on the paper around the incorrect word.',
  'Nouvelle faute': 'New error', 'Mot ou passage écrit': 'Word or passage as written', 'Correction': 'Correction', 'Catégorie': 'Category',
  'Explication (facultatif)': 'Explanation (optional)', 'Ajouter': 'Add', 'Annuler': 'Cancel',
  'Ex. : ils mange': 'E.g., they goes', 'Ex. : ils mangent': 'E.g., they go', 'Ex. : accord du verbe avec le sujet': 'E.g., subject-verb agreement',
};

// Textes avec des valeurs variables : [modèle français, traduction] ($1, $2… = valeurs capturées).
const PATTERNS = [
  [/^(\d+) page\(s\) photographiée\(s\)\. Vérifiez les miniatures \(photo floue, page de trop, pages bien regroupées par élève\), puis lancez la correction\.$/, '$1 page(s) captured. Check the thumbnails (blurry photo, extra page, pages grouped by student), then start grading.'],
  [/^(\d+) copie\(s\), (\d+) page\(s\) : (\d+) page\(s\) seront décomptées\. Lancer la correction \?$/, '$1 paper(s), $2 page(s): $3 page(s) will be used. Start grading?'],
  [/^(\d+) pages? · (\d+) copie\(s\) corrigée\(s\)(.*)$/, (m, n, g, rest) => `${n} page(s) · ${g} paper(s) graded${rest.replace(' · correction en cours…', ' · grading…').replace(' · en attente : ', ' · waiting: ')}`],
  [/^(\d+) page\(s\) photographiée\(s\)\.( La correction se poursuit\.)?$/, (m, n, r) => `${n} page(s) captured.${r ? ' Grading continues.' : ''}`],
  [/^(\d+) pages ont été ajoutées\. Solde : (\d+) pages\.$/, '$1 pages added. Balance: $2 pages.'],
  [/^(\d+) pages? restantes?$/, '$1 pages left'],
  [/^Copie (\d+)(.*) · (\d+) pages?$/, 'Paper $1$2 · $3 page(s)'],
  [/^(\d+) copie\(s\) · (\d+) page\(s\)$/, '$1 paper(s) · $2 page(s)'],
  [/^(\d+) page\(s\) seront décomptées$/, '$1 page(s) will be used'],
  [/^Corriger (\d+) copie\(s\)$/, 'Grade $1 paper(s)'],
  [/^Analyser la langue de (\d+) copie\(s\)$/, 'Check language of $1 paper(s)'],
  [/^Correction : (\d+) \/ (\d+) copie\(s\)$/, 'Grading: $1 / $2 paper(s)'],
  [/^Environ (\d+) min restantes$/, 'About $1 min left'],
  [/^(\d+) copie\(s\) corrigée\(s\)\. Vérifiez en priorité les copies marquées ⚠\.$/, '$1 paper(s) graded. Review papers marked ⚠ first.'],
  [/^(\d+) copie\(s\) corrigée\(s\), (\d+) en erreur : elles restent dans la liste, relancez pour réessayer\.$/, '$1 paper(s) graded, $2 failed: they stay in the list, run again to retry.'],
  [/^(\d+) copie\(s\) détectée\(s\)\. Vérifiez les regroupements \(noms affichés sur chaque copie\) avant de corriger\.$/, '$1 paper(s) detected. Check the grouping (names shown on each paper) before grading.'],
  [/^L'IA repère où commence chaque copie \((.*)\)\. Cette étape est gratuite\.$/, 'The AI is finding where each paper starts ($1). This step is free.'],
  [/^pages (\d+) à (\d+) sur (\d+)$/, 'pages $1 to $2 of $3'],
  [/^Lecture de « (.*) » : page (\d+)\/(\d+)…$/, 'Reading “$1”: page $2/$3…'],
  [/^Mise en page de « (.*) »…$/, 'Laying out “$1”…'],
  [/^Fichier (\d+)\/(\d+) · Lecture de « (.*) » : page (\d+)\/(\d+)…$/, 'File $1/$2 · Reading “$3”: page $4/$5…'],
  [/^(Fichier (\d+)\/(\d+) · )?Lecture de « (.*) »…$/, (m, a, i, n, f) => `${a ? `File ${i}/${n} · ` : ''}Reading “${f}”…`],
  [/^Fichier (\d+)\/(\d+) · Mise en page de « (.*) »…$/, 'File $1/$2 · Laying out “$3”…'],
  [/^Importation de (\d+) fichiers…$/, 'Importing $1 files…'],
  [/^🎯 Calibrage : (\d+) note\(s\) que vous avez ajustée\(s\) guideront la correction des prochaines copies\.$/, '🎯 Calibration: $1 mark(s) you adjusted will guide the marking of the next papers.'],
  [/^(\d+) copie\(s\) corrigée\(s\) pour le calibrage\. .*$/, '$1 paper(s) marked for calibration. Review them and change any marks you disagree with (the reason is optional), then click “Grade”: your adjustments will guide the rest of the pile.'],
  [/^Fichiers ignorés : (.*)$/, 'Files skipped: $1'],
  [/\(format non pris en charge : enregistrez-le en PDF( ou en \.docx)?\)/g, (m, d) => `(unsupported format: save it as PDF${d ? ' or .docx' : ''})`],
  [/^⚠ (\d+) pages max : plusieurs élèves \? Utilisez « Nombre fixe de pages par élève » ou ✂$/, '⚠ $1 pages max: several students? Use “Fixed number of pages per student” or ✂'],
  [/^La grille totalise (.*) points au lieu de (.*)$/, 'The rubric totals $1 points instead of $2'],
  [/^Total : (.*) \/ (.*) points$/, 'Total: $1 / $2 points'],
  [/^Corrigé limité à (\d+) pages : les suivantes ont été ignorées\.$/, 'Answer key limited to $1 pages: the rest were ignored.'],
  [/^(\d+) page\(s\) n'ont pas pu être analysées \(non décomptées\)\.$/, '$1 page(s) could not be analyzed (not charged).'],
  [/^moyenne \(min (.*) – max (.*)\)$/, 'average (min $1 – max $2)'],
  [/^⚖ Corrections : (.*) et (.*) → moyenne retenue$/, '⚖ Gradings: $1 and $2 → average kept'],
  [/^⚖ 2e correction : (.*)$/, '⚖ 2nd grading: $1'],
  [/^Fiabilité (\d+) % : les deux corrections ne s'entendent pas sur (.*)\.$/, 'Reliability $1%: the two gradings disagree on $2.'],
  [/^Fiabilité (\d+) % : vérifiez cette copie\.$/, 'Reliability $1%: please review this paper.'],
  [/^Les questions totalisent (.*) points au lieu de (.*)\.$/, 'Questions total $1 points instead of $2.'],
  [/^Les questions totalisent (.*) points au lieu de (.*) : la note a été ramenée sur (.*)\. Vérifiez le barème\.$/, 'Questions total $1 points instead of $2: the grade was scaled to $3. Check the point allocation.'],
  [/^Tentative de manipulation de l'IA détectée et ignorée : « (.*) »$/s, 'Attempt to manipulate the AI detected and ignored: “$1”'],
  [/^(\d+) copie\(s\) analysée\(s\)\. Vérifiez en priorité les copies marquées ⚠\.$/, '$1 paper(s) checked. Review papers marked ⚠ first.'],
  [/^(\d+) copie\(s\) corrigée\(s\) sans corrigé : les notes ont tendance à être généreuses\. Vérifiez-les, ou ajoutez votre corrigé pour des notes plus justes\.$/, '$1 paper(s) graded without an answer key: grades tend to be generous. Review them, or add your answer key for fairer grades.'],
  [/^Remarque transmise à l'IA : (.*)$/s, 'Note sent to the AI: $1'],
  [/^(\d+) page\(s\) photographiée\(s\) de côté ont été redressées\. Vérifiez les miniatures \(bouton ↻ pour pivoter\)\.$/, '$1 page(s) photographed sideways were straightened. Check the thumbnails (↻ button to rotate).'],
  [/^La correction a échoué \((.*)\)\. Aucune page n'a été décomptée, réessayez\.$/, (m, why) => `Grading failed (${translateCause(why)}). No pages were used, please try again.`],
  [/^(\d+) faute\(s\)$/, '$1 error(s)'], [/^(\d+) fautes?$/, (m, n) => `${n} error${n === '1' ? '' : 's'}`],
  [/^ \/ (.*) · (\d+) faute\(s\)$/, ' / $1 · $2 error(s)'],
  [/^(.*) · (\d+) faute\(s\)(.*)$/, (m, who, n, rest) => `${who.replace(/^Copie (\d+)/, 'Paper $1').replace(/^Élève$/, 'Student')} · ${n} error(s)${rest}`],
  [/^(\d+) page\(s\)$/, '$1 page(s)'],
  [/^(.*) · (\d+) page\(s\)$/, (m, rest, n) => `${rest.replace(/^Copie (\d+)/, 'Paper $1')} · ${n} page(s)`],
  [/^(Orthographe|Accords|Conjugaison|Ponctuation|Syntaxe|Vocabulaire) (\d+)$/, (m, c, n) => `${EN[c]} ${n}`],
  [/^(\d+)\. (Orthographe|Accords|Conjugaison|Ponctuation|Syntaxe|Vocabulaire)( \(non localisée\))?( · à vérifier)?$/, (m, k, c, nl, dv) => `${k}. ${EN[c]}${nl ? ' (not located)' : ''}${dv ? ' · to check' : ''}`],
  [/^Connexion perdue : nouvel essai dans (\d+) s…$/, 'Connection lost: retrying in $1 s…'],
  [/^IA occupée : nouvel essai dans (\d+) s…$/, 'AI busy: retrying in $1 s…'],
  [/^Correction arrêtée : (\d+) copie\(s\) corrigée\(s\)\. Les (\d+) autres restent dans la liste : relancez quand vous voulez\.$/, 'Grading stopped: $1 paper(s) graded. The other $2 stay in the list: run again whenever you want.'],
  [/^(\d+) copie\(s\) corrigée\(s\)$/, '$1 graded paper(s)'],
  [/^Préparation de l’impression : (\d+) \/ (\d+)…$/, 'Preparing to print: $1 / $2…'],
  [/^· la plus faible : (.+) \((\d+)\s?%\)$/, '· weakest: $1 ($2%)'],
  [/^Nom à compléter \(copie (\d+)\)$/, 'Name missing (paper $1)'],
  [/^Copie (\d+) · page (\d+) · (.*)$/, 'Paper $1 · page $2 · $3'],
  [/^Copie (\d+)( · .*)?$/, 'Paper $1$2'],
  [/^Supprimer la correction de (.*) \?$/, 'Delete the grading for $1?'],
  [/^Supprimer l'analyse de (.*) \?$/, 'Delete the analysis for $1?'],
  [/^cet élève$/, 'this student'],
];

function translateCause(why) {
  return ({
    'clé IA refusée : vérifiez AI_API_KEY': 'AI key rejected: check AI_API_KEY',
    'limite du fournisseur IA atteinte : facturation activée ?': 'AI provider limit reached: is billing enabled?',
    "réponse de l'IA illisible": 'unreadable AI response',
  })[why] || why.replace("requête refusée par l'IA, code", 'request rejected by the AI, code').replace('modèle ou format', 'model or format').replace('erreur IA', 'AI error');
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Traduit une chaîne française ; renvoie la chaîne d'origine si aucune traduction n'existe.
export function tr(text) {
  if (lang !== 'en' || !text) return text;
  const key = norm(text);
  if (!key) return text;
  if (EN[key] != null) return text.replace(text.trim(), EN[key]);
  const raw = text.trim();
  if (EN[raw] != null) return text.replace(raw, EN[raw]);
  for (const [re, rep] of PATTERNS) {
    if (re.global ? re.test(key) : re.test(key)) { re.lastIndex = 0; return text.replace(text.trim(), key.replace(re, rep)); }
  }
  return text;
}

// Modèle avec valeurs : t('Corriger {n} copie(s)', { n: 3 }).
export const t = (s, vars = {}) => tr(s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m));

const ATTRS = ['placeholder', 'title', 'aria-label'];
function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest('[data-no-i18n], textarea, script, style')) return;
    const next = tr(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest('[data-no-i18n]')) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v) { const next = tr(v); if (next !== v) node.setAttribute(a, next); }
  }
  node.childNodes.forEach(translateNode);
}

// En anglais : traduit la page, puis tout ce que l'appli y ajoute ensuite.
export function startI18n() {
  if (lang !== 'en') return;
  document.title = tr(document.title);
  translateNode(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
