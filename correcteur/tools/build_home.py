# Génère les pages d'accueil française (index.html) et anglaise (index-en.html) à partir des mêmes blocs.
# Utilisation : python3 tools/build_home.py public
import sys, json
OUT = sys.argv[1]
ICON = {
    'clip': '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
    'upload': '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    'check': '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    'search': '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    'scale': '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 21h14M7 7h10"/><path d="M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z"/></svg>',
    'lock': '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
}

# Mention de l'en-tête, montrée aux visiteurs du Canada seulement : drapeau du Québec en français, du Canada en anglais.
CA_FLAG = '<svg class="flag" viewBox="0 0 40 20" aria-hidden="true"><rect width="40" height="20" fill="#fff"/><rect width="10" height="20" fill="#d52b1e"/><rect x="30" width="10" height="20" fill="#d52b1e"/><path fill="#d52b1e" d="M20 3l1.2 2.4 1.4-.7-.5 3.2 2-2.1.4 1.2 2.3-.4-.8 2.4 1 .5-3.6 2.9.4 1.3-3.3-.4.1 3.4h-.8l.1-3.4-3.3.4.4-1.3-3.6-2.9 1-.5-.8-2.4 2.3.4.4-1.2 2 2.1-.5-3.2 1.4.7z"/></svg>'
QC_FLAG = '<svg class="flag qc" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#003da5"/><path fill="#fff" d="M13 0h4v20h-4zM0 8h30v4H0z"/><g fill="#fff"><g transform="translate(6.5 4)"><path d="M0-3.2C1.1-2.2 1.2-.6 0 .9-1.2-.6-1.1-2.2 0-3.2zM.4.9C.9-1 2.9-1.2 2.6.6 2.4 1.5 1.5 1.3 1.4.8M-.4.9C-.9-1-2.9-1.2-2.6.6-2.4 1.5-1.5 1.3-1.4.8M-1.8.8h3.6v.6h-3.6zM-.5 1.4h1L0 3z"/></g><g transform="translate(23.5 4)"><path d="M0-3.2C1.1-2.2 1.2-.6 0 .9-1.2-.6-1.1-2.2 0-3.2zM.4.9C.9-1 2.9-1.2 2.6.6 2.4 1.5 1.5 1.3 1.4.8M-.4.9C-.9-1-2.9-1.2-2.6.6-2.4 1.5-1.5 1.3-1.4.8M-1.8.8h3.6v.6h-3.6zM-.5 1.4h1L0 3z"/></g><g transform="translate(6.5 16)"><path d="M0-3.2C1.1-2.2 1.2-.6 0 .9-1.2-.6-1.1-2.2 0-3.2zM.4.9C.9-1 2.9-1.2 2.6.6 2.4 1.5 1.5 1.3 1.4.8M-.4.9C-.9-1-2.9-1.2-2.6.6-2.4 1.5-1.5 1.3-1.4.8M-1.8.8h3.6v.6h-3.6zM-.5 1.4h1L0 3z"/></g><g transform="translate(23.5 16)"><path d="M0-3.2C1.1-2.2 1.2-.6 0 .9-1.2-.6-1.1-2.2 0-3.2zM.4.9C.9-1 2.9-1.2 2.6.6 2.4 1.5 1.5 1.3 1.4.8M-.4.9C-.9-1-2.9-1.2-2.6.6-2.4 1.5-1.5 1.3-1.4.8M-1.8.8h3.6v.6h-3.6zM-.5 1.4h1L0 3z"/></g></g></svg>'

T = {
 'fr': dict(
  file='index.html', alt='index-en.html', html_lang='fr-CA', brand='Brûle la pile',
  title='Brûle la pile — Le premier jet de vos corrections, fait par un prof pour des profs',
  desc="Photographiez ou numérisez vos copies, même manuscrites : Brûle la pile propose une note et une explication pour chaque question, et surligne les fautes. Vous avez le dernier mot. 30 pages gratuites, sans compte.",
  og_title='Brûle la pile fait le premier jet. Vous avez le dernier mot.',
  og_desc="Brûle la pile propose la note et la rétroaction, et surligne les fautes de français. Vous gardez le dernier mot. 30 pages gratuites.",
  made='Fait au Québec', flag=QC_FLAG, nav_prices='Tarifs', nav_guide='Guide', guide_href='guide.html', nav_key='J’ai déjà une clé', nav_try='Essayer gratuitement', anchor_prices='tarifs',
  eyebrow='Fait par un prof, pour des profs · Primaire, secondaire et cégep',
  h1='Brûle la pile fait <em>le premier jet</em>. Vous avez le dernier mot.',
  lead="Photographiez ou numérisez les copies, même manuscrites, et ajoutez votre corrigé : chaque question reçoit une note proposée et son explication, et les fautes sont surlignées sur la copie. Vous relisez, ajustez et exportez.",
  cta1='Essayer avec 30 pages gratuites', cta2='Voir comment ça marche',
  reassure='Sans compte · Sans carte de crédit · Aucune copie conservée · Pensé pour la Loi 25',
  demo='demo-fr', demo_label='Démonstration : une copie manuscrite corrigée par Brûle la pile, avec la note et l’explication de chaque question', demo_note='Copie fictive ; notes, marques et explications produites par Brûle la pile.',
  steps_h='Trois étapes, quelques minutes', steps_sub="Pas de formation, pas d'installation. Ça fonctionne dans votre navigateur, sur ordinateur comme sur tablette.",
  steps=[('clip', '1. Votre corrigé', "Collez vos consignes ou importez votre corrigé (PDF, photo). Points par question, réponses acceptées, critères : Brûle la pile suit votre grille, ou vous en prépare une détaillée."),
         ('upload', '2. Les copies', "Glissez le PDF de la numérisation de toute la classe, des photos ou des documents Word. Brûle la pile repère où commence chaque copie, et vous pouvez ajuster."),
         ('check', '3. Vous validez', "Note et justification pour chaque question, commentaire pour l'élève. Ajustez un point en un clic et téléchargez la grille pour Excel ou votre logiciel de notes.")],
  lang_h='Corrigez aussi la langue, directement sur la copie',
  lang_sub="Un onglet dédié relève les fautes sur chaque page, les surligne par catégorie et explique la règle. Idéal pour les textes à rendre aux élèves.",
  paper_name='Nom : Moussa Diallo · 542',
  paper=[('Les villes ', None), ('ont été bombardé', ('c-acc', 1)), (' pendant la guerre et la population ', None), ('seloigne', ('c-orth', 2)), (' des zones de combat', None), ('.', None),
         (' Elle se ', None), ('défenda', ('c-conj', 3)), (' comme elle pouvait', None), (' mais', ('c-ponc', 4)), (" l'aide arrive lentement.", None)],
  fixes=[('c-acc', '1. Accords', 'ont été bombardé', 'ont été bombardées', 'Avec « être », le participe passé s’accorde avec le sujet (les villes).'),
         ('c-orth', '2. Orthographe', 'seloigne', 's’éloigne', 'Pronom « se » + verbe « éloigner » : apostrophe.'),
         ('c-conj', '3. Conjugaison', 'défenda', 'défendait', 'Imparfait de « défendre » : terminaison -ait.'),
         ('c-ponc', '4. Ponctuation', 'pouvait mais', 'pouvait, mais', 'Virgule devant « mais » qui relie deux propositions.')],
  lang_points=['Au primaire : selon la Progression des apprentissages de l’année, avec le % de fautes et la cote', 'Six catégories au choix : orthographe, accords, conjugaison, ponctuation, syntaxe, vocabulaire', 'Note de langue facultative (ex. −0,5 par faute)', 'Copie annotée à imprimer ou à enregistrer en PDF pour l’élève', 'Fonctionne sur l’écriture à la main comme sur les textes tapés'],
  trust_h='Conçu pour que vous puissiez lui faire confiance', trust_sub="Une IA qui se trompe en silence ne vous fait pas gagner de temps. Brûle la pile vous montre où regarder.",
  trust=[('search', 'Chaque point est justifié', '« Écrit : 1942, attendu : 1955. » Vous voyez pourquoi chaque point a été retiré, et vous le changez si vous n’êtes pas d’accord.'),
         ('scale', 'Correction approfondie', 'Chaque copie peut être corrigée deux fois, indépendamment, par deux modèles d’IA différents, avec un pourcentage de fiabilité. Les questions où les corrections divergent sont surlignées.'),
         ('lock', 'Rien n’est conservé', 'Les copies sont traitées puis oubliées : aucune copie ni note n’est stockée sur nos serveurs. Vous téléchargez votre grille, c’est tout.')],
  price_h='Payez à la page, sans abonnement',
  price_sub="Une classe de 30 élèves avec des copies de 3 pages : environ 5 $ en mode rapide, 10 $ en mode approfondi (double correction). La correction de la langue compte 1 page par page. Le corrigé n'est jamais facturé. Les pages achetées n'expirent pas.",
  prices=[('Découverte', '14 $', '200 pages', ['~7 ¢ la page', '~2 classes en mode rapide'], ''), ('Session', '29 $', '500 pages', ['~5,8 ¢ la page', '~5 classes en mode rapide, 2 à 3 en approfondi'], 'Le plus populaire'), ('Année', '79 $', '1 800 pages', ['~4,4 ¢ la page', "Toute l'année scolaire"], '')],
  start='Essayer gratuitement d’abord',
  price_note='Prix en dollars canadiens. Commencez par 30 pages gratuites. École ou centre de services ? <a href="mailto:bonjour@brulelapile.ca">Écrivez-nous</a> pour un tarif de groupe.',
  faq_h='Questions fréquentes',
  faq=[("L'IA remplace-t-elle mon jugement ?", "Non. Elle vous propose une note et une justification ; vous restez le correcteur. Tout est modifiable avant l'export, et les copies douteuses sont signalées."),
       ("Ça fonctionne avec l'écriture à la main ?", "Oui, avec des numérisations ou des photos nettes. Si un passage est difficile à lire, la copie est marquée à vérifier. Si la photo est illisible, aucune note n'est inventée : la copie est marquée « Illisible » et n'est pas facturée."),
       ("Puis-je cacher le nom des élèves ?", "Oui. Cochez « Masquer le nom de l'élève avant l'envoi » : le haut de la première page de chaque copie est blanchi dans votre navigateur avant l'envoi. Un nom écrit ailleurs n'est pas masqué : un code d'élève reste le plus sûr. Vous voyez toujours la copie complète et inscrivez les noms vous-même."),
       ('Quels formats de copies ?', "PDF numérisés (une ou plusieurs copies par fichier), photos prises au téléphone (y compris les photos d'iPhone), documents Word (.docx) et fichiers texte. Les copies d'une même numérisation sont séparées automatiquement par élève."),
       ('Ça fonctionne pour le primaire ?', "Oui. Dans « Correction de la langue », choisissez « Primaire », l’année et l’étape : seules les fautes prévues à cette année par la Progression des apprentissages comptent, et vous obtenez le nombre de mots, le pourcentage de fautes et la cote. Vous pouvez aussi corriger avec votre propre grille d’évaluation (critères et niveaux)."),
       ('Quelles matières ?', 'Toutes celles où un corrigé ou une grille permet de juger les réponses : histoire, sciences, mathématiques (réponses et démarches), français, langues, questions à développement court. Plus votre corrigé est précis, plus la correction l’est.'),
       ('Qu’est-ce qu’une « page » ?', 'Une page de copie d’élève (une face numérisée ou une photo). En mode rapide et en correction de la langue, une page de copie compte pour 1 page ; en mode approfondi (double correction et fiabilité), pour 2 pages. Le corrigé n’est pas compté. Une correction qui échoue n’est pas décomptée.'),
       ('Que deviennent les copies de mes élèves ?', 'Nous ne conservons aucune copie, aucune note et aucun nom d’élève. Pour la correction, les copies sont envoyées de façon chiffrée à Google (API Gemini, offre payante) : Google ne s’en sert pas pour entraîner ses modèles et ne les garde que brièvement, pour détecter les abus. Voir notre <a href="confidentialite.html">politique de confidentialité</a>.'),
       ('Dois-je créer un compte ?', 'Non. Vous recevez une clé d’accès qui contient votre solde de pages. Notez-la pour l’utiliser sur un autre appareil ou recharger votre compte.')],
  end_h='Votre prochaine pile de copies, en quelques minutes', end_sub='30 pages gratuites, sans carte de crédit.', end_cta='Essayer maintenant',
  prim_link='🍎 Au primaire ? Les fautes comptées selon la Progression des apprentissages ↓',
  prim=dict(
    h='Au primaire : seules les fautes vues en classe comptent',
    sub="Choisissez l’année de vos élèves : Brûle la pile surligne les fautes sur le texte manuscrit et ne compte que les notions prévues à cette année par la Progression des apprentissages.",
    img='primaire-fr.jpg', alt='Texte fictif d’une élève de 3e année, annoté par Brûle la pile : fautes surlignées, cote et pourcentage de fautes',
    note='Texte fictif d’une élève de 3e année ; annotations produites par Brûle la pile.',
    points=[('<b>Votre année, votre étape</b>', 'De la 1re à la 6e année. Aux étapes 1 et 2, les notions de l’année sont « en apprentissage » ; à l’étape 3, elles comptent.'),
            ('<b>Ce qui compte, ce qui ne compte pas</b>', 'Les notions acquises sont surlignées en couleur et comptent. Celles en apprentissage sont montrées en gris pour que l’élève les voie, sans compter.'),
            ('<b>Le nombre de mots, le % de fautes, la cote</b>', '« 86 mots · 2 fautes retenues · 2,3 % → B », selon les seuils de votre école.'),
            ('<b>Des explications pour un enfant</b>', '« Il y a plusieurs chiens : on ajoute un s. » Sans mots savants de grammaire.'),
            ('<b>Vous gardez le dernier mot</b>', 'Chaque notion se règle d’un clic, et chaque faute se retire ou s’ajoute sur la copie.')],
    cta='Essayer avec les textes de mes élèves'),
  creator_h='Fait par un prof, pour des profs.', creator_p='Je suis enseignant d’histoire au secondaire, au Québec. J’ai créé Brûle la pile pour faire le premier jet de mes propres piles de copies, sans envoyer les copies de mes élèves n’importe où. Je relis toujours chaque copie : l’outil fait le premier passage, je garde le jugement.',
  idea_h='Une idée pour Brûle la pile ?', idea_sub='Proposez une fonctionnalité ou signalez ce qui manque dans votre matière. Je lis chaque suggestion.', idea_ph='Ex. : pouvoir corriger les examens de mathématiques avec la démarche…', idea_mail='Votre courriel (facultatif, pour que je vous réponde)', idea_send='Envoyer mon idée', idea_ok='Merci ! Votre idée est bien reçue.', idea_err='L’envoi n’a pas fonctionné. Réessayez, ou écrivez-nous.', idea_short='Décrivez votre idée en quelques mots.', idea_link='Proposer une idée',
  privacy_href='confidentialite.html', mail='bonjour@brulelapile.ca', site='https://brulelapile.ca', privacy='Confidentialité', terms_href='conditions.html', terms='Conditions', contact='Nous joindre'),
 'en': dict(
  file='index-en.html', alt='index.html', html_lang='en-CA', brand='Burn the Pile',
  title='Burn the Pile — The first pass of your marking, made by a teacher for teachers',
  desc='Photograph or scan student work, even handwritten: Burn the Pile suggests a mark and an explanation for every question and highlights errors. You make the call. 30 free pages, no account.',
  og_title='Burn the Pile does the first pass. You make the call.',
  og_desc='Burn the Pile suggests marks and feedback and highlights language errors. You have the final say. 30 free pages.',
  made='Made in Canada', flag=CA_FLAG, nav_prices='Pricing', nav_guide='Guide', guide_href='guide-en.html', nav_key='I already have a key', nav_try='Try for free', anchor_prices='pricing',
  eyebrow='Made by a teacher, for teachers · Elementary, high school, CEGEP and college',
  h1='Burn the Pile does <em>the first pass</em>. You make the call.',
  lead='Photograph or scan the papers, even handwritten, and add your answer key: every question gets a suggested mark and its explanation, and errors are highlighted on the paper. You review, adjust and export.',
  cta1='Try it with 30 free pages', cta2='See how it works',
  reassure='No account · No credit card · No student work stored · Privacy-first',
  demo='demo-en', demo_label='Demo: a handwritten paper marked by Burn the Pile, with the mark and explanation for each question', demo_note='Fictional paper; marks, notes and explanations produced by Burn the Pile.',
  steps_h='Three steps, a few minutes', steps_sub='No training, nothing to install. It runs in your browser, on a computer or a tablet.',
  steps=[('clip', '1. Your answer key', 'Paste your instructions or upload your answer key (PDF, photo). Points per question, accepted answers, criteria: Burn the Pile follows your rubric, or builds a detailed one for you.'),
         ('upload', '2. Student work', 'Drop the scanned PDF of the whole class, photos or Word documents. Burn the Pile finds where each paper starts, and you can adjust.'),
         ('check', '3. You approve', 'A grade and justification for each question, feedback for the student. Adjust a point in one click and download the results for Excel or your markbook.')],
  lang_h='Check the writing too, right on the paper',
  lang_sub='A dedicated tab finds the errors on every page, highlights them by category and explains the rule. Perfect for papers you hand back to students.',
  paper_name='Name: Arjun Patel · Period 2',
  paper=[('The cities ', None), ('was bombed', ('c-acc', 1)), (' during the war and the people ', None), ('recieved', ('c-orth', 2)), (' little help', None), ('.', None),
         (' Yesterday they ', None), ('leave', ('c-conj', 3)), (' their homes', None), (' however', ('c-ponc', 4)), (' many stayed behind.', None)],
  fixes=[('c-acc', '1. Agreement', 'was bombed', 'were bombed', 'Plural subject (“the cities”) takes a plural verb.'),
         ('c-orth', '2. Spelling', 'recieved', 'received', '“i before e, except after c.”'),
         ('c-conj', '3. Verb forms', 'leave', 'left', '“Yesterday” calls for the simple past.'),
         ('c-ponc', '4. Punctuation', 'homes however', 'homes; however,', 'Use a semicolon before “however” joining two clauses, and a comma after it.')],
  lang_points=['Six categories to choose from: spelling, agreement, verb forms, punctuation, sentence structure, word choice', 'Optional writing score (e.g., −0.5 per error)', 'Annotated paper to print or save as PDF for the student', 'Works on handwriting as well as typed text'],
  trust_h='Built so you can trust it', trust_sub='An AI that is silently wrong doesn’t save you time. Burn the Pile shows you where to look.',
  trust=[('search', 'Every point is justified', '“Wrote: 1942, expected: 1955.” You see why each point was taken off, and you change it if you disagree.'),
         ('scale', 'In-depth grading', 'Each paper can be marked twice, independently, by two different AI models, with a reliability score. Questions where the two passes disagree are highlighted.'),
         ('lock', 'Nothing is stored', 'Papers are processed, then forgotten: no student work or grades are stored on our servers. You download your results, that’s it.')],
  price_h='Pay per page, no subscription',
  price_sub='A class of 30 students with 3-page tests: about $5 in quick mode, $10 in in-depth mode (double marking). Language checks count 1 page per page. The answer key is never charged. Purchased pages never expire.',
  prices=[('Starter', '$14 CAD', '200 pages', ['~7¢ per page', '~2 classes in quick mode'], ''), ('Term', '$29 CAD', '500 pages', ['~5.8¢ per page', '~5 classes in quick mode, 2–3 in-depth'], 'Most popular'), ('Year', '$79 CAD', '1,800 pages', ['~4.4¢ per page', 'The whole school year'], '')],
  start='Try it free first',
  price_note='Prices in Canadian dollars. Start with 30 free pages. A school or board? <a href="mailto:hello@burnthepile.com">Contact us</a> for group pricing.',
  faq_h='Frequently asked questions',
  faq=[('Does the AI replace my judgment?', 'No. It suggests a mark and a justification; you remain the marker. Everything can be edited before export, and papers that need a second look are flagged.'),
       ('Does it work with handwriting?', 'Yes, with clear scans or photos. If a passage is hard to read, the paper is flagged for review. If the photo is illegible, we never guess a mark: the paper is marked “Illegible” and is not charged.'),
       ('Can I hide student names?', 'Yes. Tick “Hide the student’s name before sending”: the top of each paper’s first page is hidden in your browser before sending. A name written elsewhere is not hidden: a student code is safest. You still see the full paper and enter the names yourself.'),
       ('Which file formats?', 'Scanned PDFs (one or several papers per file), phone photos (including iPhone photos), Word documents (.docx) and text files. Papers in a single scan are split by student automatically.'),
       ('Which subjects?', 'Any subject where an answer key or rubric can judge the answers: history, science, math (answers and work shown), English, languages, short written answers. The more precise your answer key, the more precise the grading.'),
       ('What is a “page”?', 'One page of student work (one scanned side or one photo). In quick mode and for language checks, a page counts as 1; in in-depth mode (double grading and reliability), as 2. The answer key is not counted. Failed gradings are not charged.'),
       ('What happens to my students’ work?', 'We store no student work, marks or student names. For marking, papers are sent encrypted to Google (Gemini API, paid tier): Google does not use them to train its models and keeps them only briefly, to detect abuse. See our <a href="privacy.html">privacy policy</a>.'),
       ('Do I need an account?', 'No. You get an access key that holds your page balance. Write it down to use it on another device or to top up.')],
  end_h='Your next pile of papers, in a few minutes', end_sub='30 free pages, no credit card.', end_cta='Try it now',
  creator_h='Made by a teacher, for teachers.', creator_p='I teach high-school history in Quebec. I built Burn the Pile to do the first pass of my own stacks of tests, without sending my students’ work just anywhere. I still read every paper: the tool does the first pass, I keep the judgment.',
  idea_h='An idea for Burn the Pile?', idea_sub='Suggest a feature or tell us what’s missing for your subject. I read every suggestion.', idea_ph='E.g., marking math tests including the work shown…', idea_mail='Your email (optional, so I can reply)', idea_send='Send my idea', idea_ok='Thank you! Your idea has been received.', idea_err='Sending didn’t work. Try again, or email us.', idea_short='Describe your idea in a few words.', idea_link='Suggest an idea',
  privacy_href='privacy.html', mail='hello@burnthepile.com', site='https://burnthepile.com', privacy='Privacy', terms_href='terms.html', terms='Terms', contact='Contact us'),
}

# Section « Au primaire » (site français seulement : la Progression des apprentissages est québécoise).
def prim_section(d):
    p = d.get('prim')
    if not p: return ''
    pts = ''.join(f'<li>{h} : {t}</li>' for h, t in p['points'])
    return f'''<section class="block prim" id="primaire">
      <h2>{p['h']}</h2>
      <p class="sub">{p['sub']}</p>
      <div class="prim-grid">
        <figure class="prim-shot"><img src="{p['img']}" alt="{p['alt']}" width="1196" height="548" loading="lazy"><figcaption>{p['note']}</figcaption></figure>
        <div><ul class="points prim-points">{pts}</ul><a class="btn primary big" href="app.html">{p['cta']}</a></div>
      </div>
    </section>'''

def page(L, d):
    other = 'en' if L == 'fr' else 'fr'
    sw = (f'<div class="lang-switch" role="group" aria-label="Langue / Language">'
          f'<a href="index.html" data-set-lang="fr">FR</a><a href="index-en.html" data-set-lang="en">EN</a></div>')
    paper = ''.join(t if not mk else f'<span class="mark {mk[0]}"><sup>{mk[1]}</sup>{t}</span>' for t, mk in d['paper'])
    return f'''<!DOCTYPE html>
<html lang="{d['html_lang']}" data-lang="{L}" data-alt="{d['alt']}">
<head>
  <meta charset="UTF-8">
  <script src="lang.js"></script>
  <link rel="icon" href="favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="alternate" hreflang="fr" href="index.html">
  <link rel="alternate" hreflang="en" href="index-en.html">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="site.css">
  <title>{d['title']}</title>
  <meta name="description" content="{d['desc']}">
  <meta property="og:title" content="{d['og_title']}">
  <meta property="og:description" content="{d['og_desc']}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="{d['site']}/logo.png">
  <meta property="og:url" content="{d['site']}/">
</head>
<body>
  <header class="topbar"><div class="wrap"><a class="brand" href="{d['file']}"><img class="logo" src="logo-96.png" alt="" width="40" height="40"><strong>{d['brand']}</strong></a><span id="made-ca" class="made-ca" hidden>{d['flag']}{d['made']}</span><div class="top-actions">{sw}<a class="btn ghost nav-x" href="#{d['anchor_prices']}">{d['nav_prices']}</a><a class="btn ghost nav-x" href="{d['guide_href']}">{d['nav_guide']}</a><a class="btn ghost nav-x" href="app.html#cle">{d['nav_key']}</a><a class="btn primary" href="app.html">{d['nav_try']}</a></div></div></header>
  <main class="wrap">
    <section class="hero">
      <div>
        <img class="hero-logo" src="logo.png" alt="{d['brand']}" width="132" height="132">
        <span class="eyebrow">{d['eyebrow']}</span>
        <h1>{d['h1']}</h1>
        <p class="lead">{d['lead']}</p>
        {f'<p class="prim-link"><a href="#primaire">{d["prim_link"]}</a></p>' if d.get('prim_link') else ''}
        <div class="cta">
          <a class="btn primary big" href="app.html">{d['cta1']}</a>
          <a class="btn ghost big" href="#how">{d['cta2']}</a>
        </div>
        <p class="muted small">{d['reassure']}</p>
      </div>
      <figure class="demo">
        <video id="demo" autoplay muted loop playsinline preload="metadata" poster="{d['demo']}.jpg" aria-label="{d['demo_label']}"><source src="{d['demo']}.webm" type="video/webm"><source src="{d['demo']}.mp4" type="video/mp4"></video>
        <figcaption>{d['demo_note']}</figcaption>
      </figure>
    </section>

    {prim_section(d)}

    <section class="creator"><div class="creator-card"><span class="creator-mark" aria-hidden="true">✍</span><div><b>{d['creator_h']}</b><p>{d['creator_p']}</p></div></div></section>

    <section class="block" id="how">
      <h2>{d['steps_h']}</h2>
      <p class="sub">{d['steps_sub']}</p>
      <div class="grid3">
        {''.join(f'<div class="panel feature"><div class="n">{ICON[i]}</div><h3>{h}</h3><p>{p}</p></div>' for i, h, p in d['steps'])}
      </div>
    </section>

    <section class="block" id="language">
      <h2>{d['lang_h']}</h2>
      <p class="sub">{d['lang_sub']}</p>
      <div class="lang-demo">
        <div>
          <div class="paper" aria-label="Exemple / Example"><div class="nm">{d['paper_name']}</div>{paper}</div>
          <ul class="points">{''.join(f'<li>{x}</li>' for x in d['lang_points'])}</ul>
        </div>
        <div class="fixes">
          {''.join(f'<div class="fix {c}"><b style="color:var(--dot)">{t}</b><div><s>{a}</s> → <b>{b}</b></div><small>{w}</small></div>' for c, t, a, b, w in d['fixes'])}
        </div>
      </div>
    </section>

    <section class="block">
      <h2>{d['trust_h']}</h2>
      <p class="sub">{d['trust_sub']}</p>
      <div class="grid3">
        {''.join(f'<div class="panel feature"><div class="n">{ICON[i]}</div><h3>{h}</h3><p>{p}</p></div>' for i, h, p in d['trust'])}
      </div>
    </section>

    <section class="block" id="{d['anchor_prices']}">
      <h2>{d['price_h']}</h2>
      <p class="sub">{d['price_sub']}</p>
      <div class="grid3">
        {''.join(f'<div class="panel price{" best" if badge else ""}"><b>{n}{f" <span class=\"pill\">{badge}</span>" if badge else ""}</b><div class="amount">{a} <small>{pg}</small></div><ul>{"".join(f"<li>{li}</li>" for li in lis)}</ul><a class="btn{" primary" if badge else ""} block" href="app.html">{d["start"]}</a></div>' for n, a, pg, lis, badge in d['prices'])}
      </div>
      <p class="muted small" style="margin-top:1rem">{d['price_note']}</p>
    </section>

    <section class="block faq">
      <h2>{d['faq_h']}</h2>
      {''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in d['faq'])}
    </section>

    <section class="block" id="idees">
      <h2>{d['idea_h']}</h2>
      <p class="sub">{d['idea_sub']}</p>
      <form id="idea-form" class="panel idea-form">
        <textarea id="idea-text" rows="4" maxlength="2000" required placeholder="{d['idea_ph']}" aria-label="{d['idea_h']}"></textarea>
        <input id="idea-email" type="email" maxlength="200" placeholder="{d['idea_mail']}" aria-label="{d['idea_mail']}">
        <input id="idea-website" type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <div class="idea-row"><button class="btn primary" type="submit">{d['idea_send']}</button><span id="idea-msg" class="small" role="status"></span></div>
      </form>
    </section>

    <section class="block" style="text-align:center">
      <h2>{d['end_h']}</h2>
      <p class="sub" style="margin:0 auto 1.5rem">{d['end_sub']}</p>
      <a class="btn primary big" href="app.html">{d['end_cta']}</a>
    </section>
  </main>
  <footer><div class="wrap"><span>© 2026 {d['brand']}</span><span><a href="{d['guide_href']}">{d['nav_guide']}</a> · <a href="#idees">{d['idea_link']}</a> · <a href="{d['privacy_href']}">{d['privacy']}</a> · <a href="{d['terms_href']}">{d['terms']}</a> · <a href="mailto:{d['mail']}">{d['contact']}</a></span></div></footer>
<script>
// Mouvement réduit demandé : la démo ne joue pas toute seule ; on peut la lancer au besoin.
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {{ const v = document.getElementById('demo'); v.removeAttribute('autoplay'); v.pause(); v.controls = true; }}
</script>
<script>
// « Proposez une fonctionnalité » : envoi sans quitter la page.
document.getElementById('idea-form').addEventListener('submit', async (e) => {{
  e.preventDefault();
  const msg = document.getElementById('idea-msg'), btn = e.target.querySelector('button'), text = document.getElementById('idea-text');
  if (text.value.trim().length < 5) {{ msg.textContent = {json.dumps(d['idea_short'])}; return; }}
  btn.disabled = true; msg.textContent = '';
  try {{
    const r = await fetch('/api/idea', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json', 'X-Lang': '{L}' }},
      body: JSON.stringify({{ text: text.value, email: document.getElementById('idea-email').value, website: document.getElementById('idea-website').value }}) }});
    if (!r.ok) throw new Error();
    e.target.reset(); msg.textContent = {json.dumps(d['idea_ok'])}; msg.className = 'small ok';
  }} catch {{ msg.textContent = {json.dumps(d['idea_err'])}; msg.className = 'small err'; }}
  btn.disabled = false;
}});
</script>
<script>fetch('/api/geo').then((r) => r.json()).then((g) => {{ if (g.country === 'CA') document.getElementById('made-ca').hidden = false; }}).catch(() => {{}});</script>
</body>
</html>
'''

for L, d in T.items():
    open(f"{OUT}/{d['file']}", 'w').write(page(L, d))
print('ok')
