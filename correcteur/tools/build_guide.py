# Génère le guide d'utilisation public, en français (guide.html) et en anglais (guide-en.html).
# Consultable sans clé ni essai : on y explore le produit avant de l'essayer.
# Utilisation : python3 tools/build_guide.py public
import sys
OUT = sys.argv[1]

# Chaque section : (ancre, titre, contenu HTML). Le même ordre dans les deux langues.
FR = dict(
  file='guide.html', alt='guide-en.html', html_lang='fr-CA', lang='fr', brand='Brûle la pile', home='index.html',
  title='Guide d’utilisation — Brûle la pile', h1='Guide d’utilisation',
  intro='Tout ce que fait Brûle la pile, et ce qu’il faut savoir avant de commencer. Vous pouvez lire ce guide sans clé et sans essai.',
  search='Rechercher dans le guide (ex. : CSV, téléphone, nom)…', none='Aucune section ne correspond à votre recherche.', toc='Sommaire',
  nav_prices='Tarifs', anchor_prices='tarifs', nav_try='Essayer gratuitement', switch_label='Langue / Language',
  cta_title='Prêt à essayer ?', cta_text='30 pages gratuites, sans carte de crédit et sans compte.',
  privacy_href='confidentialite.html', privacy='Confidentialité', terms_href='conditions.html', terms='Conditions', mail='bonjour@brulelapile.ca', contact='Nous écrire',
  sections=[
    ('demarrer', 'Démarrer en 3 étapes', '''
<ol>
<li><b>Ajoutez votre corrigé</b> : tapez les réponses attendues et les points par question, ou déposez le corrigé en PDF ou en photos. Le corrigé n’est jamais facturé.</li>
<li><b>Déposez les copies</b> : un PDF numérisé de toute la pile, des photos, ou numérisez la pile avec votre téléphone.</li>
<li><b>Cliquez sur « Corriger »</b>, puis relisez. Chaque copie reçoit une note par question, une justification et un commentaire pour l’élève. Vous gardez le dernier mot : tout se modifie avant l’export.</li>
</ol>
<p>Pour la langue, choisissez l’onglet <b>Correction de la langue</b> : les fautes sont surlignées directement sur la copie.</p>'''),
    ('cle', 'Clé d’accès, essai et pages', '''
<ul>
<li><b>Pas de compte</b> : vous recevez une <b>clé d’accès</b> (ex. CE-XXXXX-XXXXX-XXXXX) qui contient votre solde de pages. <b>Notez-la</b> : elle sert à utiliser vos pages sur un autre appareil et à recharger. Elle figure aussi sur le reçu de paiement.</li>
<li><b>Essai gratuit</b> : 30 pages, sans carte de crédit. Une clé d’essai qui n’a pas servi à un achat est effacée après 90 jours.</li>
<li><b>Ce qui est décompté</b> : 1 page de copie = 1 page en mode rapide, 2 pages en mode approfondi (double correction). Le corrigé, la détection des copies, le redressement des photos et la grille détaillée sont gratuits. Une copie illisible n’est pas facturée.</li>
<li><b>Les packs</b> : paiement unique, sans abonnement ; les pages achetées n’expirent pas.</li>
<li>Vous avez déjà une clé ? Sur l’écran d’accès, entrez-la dans « J’ai déjà une clé d’accès ».</li>
</ul>'''),
    ('importer', 'Importer les copies', '''
<ul>
<li><b>Formats acceptés</b> : PDF (une numérisation de toute la pile convient), photos (JPG, PNG, HEIC d’iPhone…), Word (.docx) et texte (.txt). Plusieurs fichiers à la fois, par glisser-déposer ou en cliquant.</li>
<li><b>« Comment sont vos copies ? »</b> : l’outil choisit pour vous, et vous pouvez changer :
  <ul><li><b>Une photo ou un fichier par élève</b> : choisi quand chaque fichier n’a qu’une page ;</li>
  <li><b>Trouver chaque copie pour moi</b> : choisi pour un PDF de plusieurs pages (photocopieur) ; l’IA repère où commence chaque copie (gratuit) ;</li>
  <li><b>Le même nombre de pages par élève</b> (ex. 2 pages chacun).</li></ul></li>
<li><b>Vérifiez les copies</b> sur les miniatures : ✂ sépare deux pages, « rattacher à la copie du dessus » réunit deux copies, × retire une page. Cliquez sur une miniature pour l’agrandir.</li>
<li><b>Photos prises de côté</b> : elles sont redressées automatiquement ; le bouton ↻ d’une miniature la tourne à la main.</li>
<li><b>Limite</b> : 10 pages par copie. Au-delà, il s’agit sans doute de plusieurs élèves : utilisez le nombre fixe de pages ou ✂.</li>
</ul>'''),
    ('camera', 'Numériser avec le téléphone', '''
<ul>
<li>Sur téléphone, le bouton <b>Numériser « Brûle la pile »</b> ouvre la caméra. Cadrez la feuille dans les repères et touchez <b>Démarrer</b>.</li>
<li>Tournez les pages devant le téléphone : chaque feuille est photographiée toute seule dès qu’elle est immobile et nette (bip, vibration et éclair vert). Rien n’est photographié avant « Démarrer » : la table ou votre main ne sont pas prises.</li>
<li><b>Pages par élève</b> : réglez-le avant de commencer. « Annuler la dernière » retire une photo ratée ; ◉ prend une photo à la main.</li>
<li>Touchez <b>Terminé</b> : vous relisez la pile, puis lancez la correction. L’option « Corriger pendant la prise de vue » corrige au fur et à mesure.</li>
</ul>'''),
    ('corrige', 'Corrigé, consignes et grille détaillée', '''
<ul>
<li><b>Le corrigé améliore beaucoup la fiabilité</b> : réponses attendues, points par question, réponses acceptées, ce qui vaut des points partiels. Sans corrigé, les notes ont tendance à être généreuses.</li>
<li>Tapez-le dans la case, ou déposez-le en PDF ou en photos (6 pages au plus). Il n’est pas facturé.</li>
<li><b>La forme du rendu</b> se demande dans la même case : « commentaire de 2 phrases, au tu, qui commence par un point fort », « justifications courtes », etc.</li>
<li><b>Grille détaillée (gratuite)</b>, recommandée pour les travaux de rédaction : l’IA rédige des niveaux précis pour chaque critère, vous les validez, et la même grille s’applique à toutes les copies. Les notes deviennent plus constantes.</li>
<li>Sur une grosse pile d’un même examen, le découpage en questions de la première copie sert de modèle aux suivantes : toutes sont découpées pareil.</li>
</ul>'''),
    ('modes', 'Correction rapide ou approfondie', '''
<ul>
<li><b>Rapide</b> : une seule correction, 1 page décomptée par page.</li>
<li><b>Approfondie</b> : deux corrections indépendantes ; la note retenue est leur moyenne, question par question. Une <b>fiabilité</b> (en %) mesure leur accord, et les questions où elles diffèrent sont signalées ⚖. 2 pages décomptées par page.</li>
<li>Le choix se fait dans l’affichage <b>Avancé</b>.</li>
</ul>'''),
    ('calibrage', 'Calibrage : une pile corrigée comme vous', '''
<p>Comme lorsque vous corrigez quelques copies pour « vous faire la main », le calibrage montre à l’outil votre façon de noter avant qu’il corrige le reste de la pile.</p>
<ul>
<li>Avec plus de 4 copies, cliquez sur <b>« 🎯 Calibrer d’abord »</b> : 3 copies seulement sont corrigées.</li>
<li>Relisez-les et <b>changez les notes</b> qui ne vous conviennent pas. Un champ <b>« Pourquoi ? »</b> apparaît : une courte raison aide beaucoup (ex. « j’accepte une conséquence générale si elle est expliquée »), mais elle est facultative.</li>
<li>Cliquez ensuite sur <b>« Corriger »</b> pour le reste : chaque note changée sert d’exemple (la réponse de l’élève, la note proposée, la vôtre et votre raison). L’outil applique les mêmes critères sans recopier vos notes.</li>
<li>Les notes changées plus tard, en cours de relecture, guident aussi les copies corrigées ensuite. Le calibrage vaut pour la même évaluation (même nom, barème et corrigé).</li>
<li>Rien n’est conservé sur nos serveurs : les exemples restent dans votre navigateur et partent avec chaque copie. Aucune page n’est décomptée en plus.</li>
</ul>'''),
    ('langue', 'Correction de la langue', '''
<ul>
<li>Onglet <b>Correction de la langue</b> : l’IA relève les fautes sur chaque page et les <b>surligne sur la copie</b>, avec la correction et la règle. 1 page de copie = 1 page décomptée.</li>
<li>Choisissez le <b>niveau des élèves</b> et les <b>types de fautes</b> à relever : orthographe, accords, conjugaison, ponctuation, syntaxe, vocabulaire.</li>
<li>Facultatif : une <b>note</b> (note sur, points retirés par faute, retrait maximum).</li>
<li>Une seconde lecture se fait ensuite en arrière-plan et peut ajouter des fautes oubliées. Une faute dont la lecture est douteuse est marquée « à vérifier » et n’est pas comptée.</li>
<li>Dans <b>Voir la copie annotée</b>, vous pouvez supprimer une faute relevée à tort, en ajouter une oubliée, et imprimer la copie surlignée.</li>
</ul>'''),
    ('resultats', 'Relire et modifier les résultats', '''
<ul>
<li>Chaque copie apparaît sur <b>une ligne</b> : n° de copie, nom, groupe, note. Un clic sur la ligne l’ouvre ; les copies à vérifier sont marquées ⚠.</li>
<li>Dans la fiche : les points et la justification de chaque question. <b>Modifiez les points</b> directement, réécrivez le commentaire, complétez le nom ou le groupe.</li>
<li>Les <b>statistiques</b> donnent la moyenne, le minimum et le maximum, et la <b>moyenne par question</b> montre celle que le groupe a le moins réussie.</li>
<li><b>Rechercher un élève</b> filtre la liste (et l’impression).</li>
<li>Les notes de l’IA sont des <b>propositions</b> : vérifiez en priorité les copies ⚠.</li>
</ul>'''),
    ('exporter', 'Exporter et imprimer', '''
<ul>
<li><b>Télécharger les notes (Excel)</b> : un fichier (CSV) qui s’ouvre dans Excel ou Google Sheets ou se charge dans votre logiciel de notes. Une colonne par question quand toutes les copies ont le même découpage. La correction de la langue a son propre fichier.</li>
<li><b>Voir la copie corrigée</b> : la copie annotée comme à la main : ✓ vert sur les bonnes réponses, encadré rouge (et ✗ si aucun point) sur les autres, la note en haut et, dans la marge, les points et une courte note par question, plus le commentaire.</li>
<li><b>Imprimer…</b> : toutes les copies d’un coup, dans l’ordre de la pile. Au choix : les <b>copies annotées</b>, les <b>fiches de résultats</b> (plusieurs par feuille, à découper) ou <b>les deux</b> (la fiche de chaque élève, puis sa copie). Pour enregistrer en PDF, choisissez « Enregistrer au format PDF » comme imprimante.</li>
<li><b>Terminer la session</b> ouvre une fenêtre : téléchargez ou imprimez vos notes, puis effacez tout en gardant votre clé, ou en la retirant de l’ordinateur (ordinateur partagé).</li>
</ul>'''),
    ('confidentialite', 'Confidentialité des élèves', '''
<ul>
<li><b>Aucune copie, note ou nom d’élève n’est conservé</b> sur nos serveurs. Les copies sont transmises, sans être enregistrées, à notre fournisseur d’IA (Google, offre payante : pas d’entraînement des modèles sur vos données).</li>
<li><b>Masquer le nom de l’élève</b> : le haut de la première page de chaque copie est blanchi dans votre navigateur avant l’envoi (hauteur réglable, et sur toutes les pages au besoin). Vous inscrivez les noms vous-même. Un code d’élève reste la solution la plus sûre.</li>
<li>Détails et documents pour les établissements : voir la <a href="confidentialite.html">politique de confidentialité</a>.</li>
</ul>'''),
    ('limites', 'Limites importantes à connaître', '''
<div class="callout">
<ul>
<li><b>Rien n’est sauvegardé.</b> C’est voulu, pour la confidentialité : les copies et les résultats n’existent que dans votre onglet. <b>Téléchargez le CSV</b> ou imprimez avant de partir.</li>
<li><b>Ne fermez pas l’onglet et ne rechargez pas la page</b> tant que vous n’avez pas exporté : les résultats seraient perdus. Vous pouvez utiliser un autre onglet en attendant.</li>
<li><b>Sur téléphone, gardez l’écran allumé</b> et restez sur la page pendant la correction : un téléphone en veille l’arrête. Elle reprend toute seule quand vous revenez.</li>
<li><b>Connexion perdue</b> : la copie en cours attend et repart toute seule. Le bouton <b>Arrêter</b> interrompt la correction ; les copies non corrigées restent dans la liste, sans rien décompter.</li>
<li><b>L’IA peut se tromper</b>, surtout sur une écriture difficile à lire : relisez avant de remettre les notes.</li>
<li><b>Ce qui est retenu</b> dans votre navigateur : votre clé et vos réglages (barème, mode, options). Le nom de l’évaluation et le corrigé sont gardés jusqu’à la fermeture de l’onglet.</li>
</ul>
</div>'''),
    ('affichage', 'Affichage simple ou avancé', '''
<ul>
<li><b>Simple</b> (par défaut) : seulement l’essentiel (nom de l’évaluation, barème, corrigé, copies).</li>
<li><b>Avancé</b> : les réglages fins (groupe par défaut, demi-points, mode approfondi, langue des copies et des commentaires, orthographe dans la note, grille détaillée, options de masquage).</li>
<li>Les réglages avancés restent appliqués en mode simple ; une ligne vous prévient si l’un d’eux n’a pas sa valeur par défaut.</li>
</ul>'''),
  ],
)

EN = dict(
  file='guide-en.html', alt='guide.html', html_lang='en-CA', lang='en', brand='Burn the Pile', home='index-en.html',
  title='User guide — Burn the Pile', h1='User guide',
  intro='Everything Burn the Pile does, and what to know before you start. You can read this guide without a key or a trial.',
  search='Search the guide (e.g. CSV, phone, name)…', none='No section matches your search.', toc='Contents',
  nav_prices='Pricing', anchor_prices='pricing', nav_try='Try for free', switch_label='Langue / Language',
  cta_title='Ready to try it?', cta_text='30 free pages, no credit card, no account.',
  privacy_href='privacy.html', privacy='Privacy', terms_href='terms.html', terms='Terms', mail='hello@burnthepile.com', contact='Contact us',
  sections=[
    ('demarrer', 'Get started in 3 steps', '''
<ol>
<li><b>Add your answer key</b>: type the expected answers and the points per question, or drop the key as a PDF or photos. The answer key is never charged.</li>
<li><b>Drop the student work</b>: a scanned PDF of the whole stack, photos, or scan the stack with your phone.</li>
<li><b>Click “Grade”</b>, then review. Every paper gets points per question, a justification and feedback for the student. You have the final say: everything can be edited before export.</li>
</ol>
<p>For writing, choose the <b>Language check</b> tab: errors are highlighted right on the paper.</p>'''),
    ('cle', 'Access key, trial and pages', '''
<ul>
<li><b>No account</b>: you get an <b>access key</b> (e.g. CE-XXXXX-XXXXX-XXXXX) that holds your page balance. <b>Write it down</b>: it lets you use your pages on another device and top up. It also appears on your payment receipt.</li>
<li><b>Free trial</b>: 30 pages, no credit card. A trial key that was never used for a purchase is deleted after 90 days.</li>
<li><b>What is charged</b>: 1 page of student work = 1 page in quick mode, 2 pages in in-depth mode (double grading). The answer key, paper detection, photo straightening and the detailed rubric are free. An illegible paper is not charged.</li>
<li><b>Packs</b>: one-time payment, no subscription; purchased pages never expire.</li>
<li>Already have a key? On the access screen, enter it under “I already have an access key”.</li>
</ul>'''),
    ('importer', 'Importing student work', '''
<ul>
<li><b>Accepted formats</b>: PDF (a scan of the whole stack works), photos (JPG, PNG, iPhone HEIC…), Word (.docx) and text (.txt). Several files at once, by drag and drop or by clicking.</li>
<li><b>“How are your papers organized?”</b>: the app picks for you, and you can change it:
  <ul><li><b>One photo or file per student</b>: picked when each file has a single page;</li>
  <li><b>Find each student’s paper for me</b>: picked for a multi-page PDF (photocopier); the AI finds where each paper starts (free);</li>
  <li><b>Same number of pages for every student</b> (e.g. 2 pages each).</li></ul></li>
<li><b>Check the papers</b> on the thumbnails: ✂ splits two pages, “join to the paper above” combines two papers, × removes a page. Click a thumbnail to enlarge it.</li>
<li><b>Sideways photos</b> are straightened automatically; the ↻ button on a thumbnail rotates it by hand.</li>
<li><b>Limit</b>: 10 pages per paper. Beyond that, it is probably several students: use a fixed number of pages or ✂.</li>
</ul>'''),
    ('camera', 'Scanning with your phone', '''
<ul>
<li>On a phone, the <b>Scan “Burn the Pile”</b> button opens the camera. Frame the sheet within the corner marks and tap <b>Start</b>.</li>
<li>Turn the pages in front of the phone: each sheet is photographed on its own as soon as it is still and sharp (beep, vibration and green flash). Nothing is photographed before “Start”, so the table or your hand are not captured.</li>
<li><b>Pages per student</b>: set it before you begin. “Undo last” removes a bad photo; ◉ takes a photo by hand.</li>
<li>Tap <b>Done</b>: you review the stack, then start grading. The “Grade while capturing” option grades as you go.</li>
</ul>'''),
    ('corrige', 'Answer key, instructions and detailed rubric', '''
<ul>
<li><b>An answer key greatly improves reliability</b>: expected answers, points per question, accepted answers, what earns partial credit. Without a key, grades tend to be generous.</li>
<li>Type it in the box, or drop it as a PDF or photos (6 pages at most). It is not charged.</li>
<li><b>How results are written</b> can be requested in the same box: “2-sentence feedback that starts with a strength”, “short justifications”, etc.</li>
<li><b>Detailed rubric (free)</b>, recommended for written work: the AI drafts precise levels for each criterion, you approve them, and the same rubric applies to every paper. Grades become more consistent.</li>
<li>On a large stack of the same test, the question breakdown of the first paper serves as the model for the others, so every paper is split the same way.</li>
</ul>'''),
    ('modes', 'Quick or in-depth grading', '''
<ul>
<li><b>Quick</b>: a single grading, 1 page used per page.</li>
<li><b>In-depth</b>: two independent gradings; the grade kept is their average, question by question. A <b>reliability</b> score (%) measures how much they agree, and questions where they differ are flagged ⚖. 2 pages used per page.</li>
<li>The choice is in the <b>Advanced</b> view.</li>
</ul>'''),
    ('calibrage', 'Calibration: a pile marked your way', '''
<p>Just like marking a few papers first to “get your eye in”, calibration shows the tool how you mark before it marks the rest of the pile.</p>
<ul>
<li>With more than 4 papers, click <b>“🎯 Calibrate first”</b>: only 3 papers are marked.</li>
<li>Review them and <b>change any marks</b> you disagree with. A <b>“Why?”</b> field appears: a short reason helps a lot (e.g. “I accept a general consequence if it is explained”), but it is optional.</li>
<li>Then click <b>“Grade”</b> for the rest: each changed mark becomes an example (the student’s answer, the suggested mark, yours and your reason). The tool applies the same criteria without copying your marks.</li>
<li>Marks you change later, while reviewing, also guide the papers marked afterwards. Calibration applies to the same assessment (same name, total and answer key).</li>
<li>Nothing is stored on our servers: the examples stay in your browser and are sent with each paper. No extra pages are used.</li>
</ul>'''),
    ('langue', 'Language check', '''
<ul>
<li><b>Language check</b> tab: the AI finds the errors on each page and <b>highlights them on the paper</b>, with the correction and the rule. 1 page of student work = 1 page used.</li>
<li>Choose the <b>student level</b> and the <b>types of errors</b> to flag: spelling, agreement, verb forms, punctuation, sentence structure, word choice.</li>
<li>Optional: a <b>score</b> (out of, points off per error, maximum deduction).</li>
<li>A second reading then runs in the background and may add missed errors. An error whose reading is doubtful is marked “to check” and is not counted.</li>
<li>In <b>View annotated paper</b>, you can delete a wrongly flagged error, add a missed one, and print the highlighted paper.</li>
</ul>'''),
    ('resultats', 'Reviewing and editing results', '''
<ul>
<li>Each paper appears on <b>one line</b>: paper number, name, class, grade. Click the line to open it; papers to review are marked ⚠.</li>
<li>In the sheet: the points and justification for each question. <b>Edit the points</b> directly, rewrite the feedback, fill in the name or class.</li>
<li><b>Statistics</b> show the average, minimum and maximum, and the <b>average by question</b> shows the one the class struggled with most.</li>
<li><b>Search for a student</b> filters the list (and printing).</li>
<li>AI grades are <b>suggestions</b>: review the ⚠ papers first.</li>
</ul>'''),
    ('exporter', 'Exporting and printing', '''
<ul>
<li><b>Download marks (Excel)</b>: a file (CSV) that opens in Excel or Google Sheets, or imports into your markbook. One column per question when every paper has the same breakdown. The language check has its own file.</li>
<li><b>View graded paper</b>: the paper marked up as if by hand: green ✓ on correct answers, red box (and ✗ if no points) on the others, the grade at the top and, in the margin, the points and a short note per question, plus the feedback.</li>
<li><b>Print…</b>: all papers at once, in stack order. Your choice: the <b>annotated papers</b>, the <b>result sheets</b> (several per page, to cut out) or <b>both</b> (each student’s sheet, then their paper). To save as PDF, choose “Save as PDF” as the printer.</li>
<li><b>End session</b> opens a window: download or print your marks, then erase everything while keeping your key, or removing it from the computer (shared computer).</li>
</ul>'''),
    ('confidentialite', 'Student privacy', '''
<ul>
<li><b>No student paper, grade or name is stored</b> on our servers. Papers are passed, without being saved, to our AI provider (Google, paid tier: your data is not used to train its models).</li>
<li><b>Hide the student’s name</b>: the top of each paper’s first page is blanked in your browser before sending (adjustable height, and on every page if needed). You enter the names yourself. A student code remains the safest option.</li>
<li>Details and documents for schools: see the <a href="privacy.html">privacy policy</a>.</li>
</ul>'''),
    ('limites', 'Important limits to know', '''
<div class="callout">
<ul>
<li><b>Nothing is saved.</b> This is on purpose, for privacy: papers and results only exist in your browser tab. <b>Download the CSV</b> or print before you leave.</li>
<li><b>Don’t close the tab or reload the page</b> until you have exported: the results would be lost. You can use another tab in the meantime.</li>
<li><b>On a phone, keep the screen on</b> and stay on the page while grading: a phone that goes to sleep stops it. It resumes on its own when you come back.</li>
<li><b>Lost connection</b>: the current paper waits and resumes on its own. The <b>Stop</b> button interrupts grading; papers not yet graded stay in the list, and nothing is charged for them.</li>
<li><b>The AI can make mistakes</b>, especially with hard-to-read handwriting: review before handing back grades.</li>
<li><b>What your browser remembers</b>: your key and your settings (total points, mode, options). The assessment name and answer key are kept until the tab is closed.</li>
</ul>
</div>'''),
    ('affichage', 'Simple or advanced view', '''
<ul>
<li><b>Simple</b> (default): only the essentials (assessment name, total points, answer key, student work).</li>
<li><b>Advanced</b>: the fine settings (default class, half points, in-depth mode, language of the papers and feedback, spelling in the grade, detailed rubric, name-hiding options).</li>
<li>Advanced settings stay applied in the simple view; a line warns you if one of them is not at its default value.</li>
</ul>'''),
  ],
)

SCRIPT = '''<script>
// Recherche : n'affiche que les sections qui contiennent tous les mots tapés (accents ignorés).
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const q = document.getElementById('guide-search'), none = document.getElementById('guide-none');
const secs = [...document.querySelectorAll('.guide-sec')], links = [...document.querySelectorAll('.guide-toc a')];
q.addEventListener('input', () => {
  const words = norm(q.value).split(/\\s+/).filter(Boolean);
  let shown = 0;
  secs.forEach((s, i) => { const ok = words.every((w) => norm(s.textContent).includes(w)); s.hidden = !ok; links[i].parentElement.hidden = !ok; if (ok) shown++; });
  none.hidden = shown > 0;
});
</script>'''

def page(d):
    sw = f'<div class="lang-switch" role="group" aria-label="{d["switch_label"]}"><a href="guide.html" data-set-lang="fr">FR</a><a href="guide-en.html" data-set-lang="en">EN</a></div>'
    toc = ''.join(f'<li><a href="#{a}">{t}</a></li>' for a, t, _ in d['sections'])
    body = ''.join(f'<section class="guide-sec" id="{a}"><h2>{t}</h2>{c.strip()}</section>' for a, t, c in d['sections'])
    return f'''<!DOCTYPE html>
<html lang="{d['html_lang']}" data-lang="{d['lang']}" data-alt="{d['alt']}">
<head>
  <meta charset="UTF-8">
  <script src="lang.js"></script>
  <link rel="icon" href="favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{d['intro']}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="site.css">
  <title>{d['title']}</title>
</head>
<body>
  <header class="topbar"><div class="wrap"><a class="brand" href="{d['home']}"><img class="logo" src="logo-96.png" alt="" width="40" height="40"><strong>{d['brand']}</strong></a><div class="top-actions">{sw}<a class="btn ghost" href="{d['home']}#{d['anchor_prices']}">{d['nav_prices']}</a><a class="btn primary" href="app.html">{d['nav_try']}</a></div></div></header>
  <main class="wrap guide">
    <h1>{d['h1']}</h1>
    <p class="sub">{d['intro']}</p>
    <input id="guide-search" type="search" placeholder="{d['search']}" aria-label="{d['search']}">
    <div class="guide-layout">
      <nav class="guide-toc" aria-label="{d['toc']}"><b>{d['toc']}</b><ol>{toc}</ol></nav>
      <div class="guide-body">{body}
        <p id="guide-none" class="sub" hidden>{d['none']}</p>
        <div class="guide-cta"><div><b>{d['cta_title']}</b><br><span class="sub">{d['cta_text']}</span></div><a class="btn primary" href="app.html">{d['nav_try']}</a></div>
      </div>
    </div>
  </main>
  <footer><div class="wrap"><span>© 2026 {d['brand']}</span><span><a href="{d['privacy_href']}">{d['privacy']}</a> · <a href="{d['terms_href']}">{d['terms']}</a> · <a href="mailto:{d['mail']}">{d['contact']}</a></span></div></footer>
  {SCRIPT}
</body>
</html>
'''

for d in (FR, EN):
    with open(f"{OUT}/{d['file']}", 'w', encoding='utf-8') as f:
        f.write(page(d))
print('ok')
