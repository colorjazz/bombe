# Génère les pages d'accueil française (index.html) et anglaise (index-en.html) à partir des mêmes blocs.
# Utilisation : python3 tools/build_home.py public
import sys
OUT = sys.argv[1]
ICON = {
    'clip': '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
    'upload': '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    'check': '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    'search': '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    'scale': '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 21h14M7 7h10"/><path d="M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z"/></svg>',
    'lock': '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
}

T = {
 'fr': dict(
  file='index.html', alt='index-en.html', html_lang='fr-CA', brand='Brûle la pile',
  title='Brûle la pile — Corrigez vos copies 10 fois plus vite',
  desc="Importez vos copies numérisées : l'IA propose une note détaillée question par question, corrige la langue et rédige un commentaire pour chaque élève. Vous validez. 30 pages gratuites.",
  og_title='Brûle la pile : corrigez une classe entière pendant votre pause café',
  og_desc="L'IA propose la note et la rétroaction, et surligne les fautes de français. Vous gardez le dernier mot. 30 pages gratuites.",
  nav_prices='Tarifs', nav_try='Essayer gratuitement', anchor_prices='tarifs',
  eyebrow='Pour les enseignants du primaire, du secondaire et du collégial',
  h1='Corrigez une classe entière <em>pendant votre pause café</em>.',
  lead="Numérisez les copies, ajoutez votre corrigé : <b>Brûle la pile</b> propose une note détaillée question par question, surligne les fautes de français et rédige une rétroaction pour chaque élève. Vous vérifiez, ajustez et exportez.",
  cta1='Essayer avec 30 pages gratuites', cta2='Voir comment ça marche',
  reassure='Sans carte de crédit · Aucune copie conservée · Payé à la page, sans abonnement',
  mock=[('Yasmine Benali · 541', '22 / 25'), ['Q1 Révolution russe — 2/2 · Réponse attendue : 1917 ✓', 'Q3 Conférence de Bandung — 0/2 · Écrit : 1942, attendu : 1955', "Q6 Assassinat de l'archiduc — 2/2 · ✓"],
        ('Kevin Nguyen · 541', '18 / 25'), '⚖ Q2 : les deux corrections divergent (2 et 4) — fiabilité 78 %', ('Léa Tremblay · 541', '24 / 25')],
  steps_h='Trois étapes, quelques minutes', steps_sub="Pas de formation, pas d'installation. Ça fonctionne dans votre navigateur, sur ordinateur comme sur tablette.",
  steps=[('clip', '1. Votre corrigé', "Collez vos consignes ou importez votre corrigé (PDF, photo). Points par question, réponses acceptées, critères : l'IA suit votre grille, ou vous en prépare une détaillée."),
         ('upload', '2. Les copies', "Glissez le PDF de la numérisation de toute la classe, des photos ou des documents Word. L'IA repère où commence chaque copie, et vous pouvez ajuster."),
         ('check', '3. Vous validez', "Note et justification pour chaque question, commentaire pour l'élève. Ajustez un point en un clic et téléchargez la grille pour Excel ou votre logiciel de notes.")],
  lang_h='Corrigez aussi la langue, directement sur la copie',
  lang_sub="Un onglet dédié relève les fautes sur chaque page, les surligne par catégorie et explique la règle. Idéal pour les textes à rendre aux élèves.",
  paper_name='Nom : Moussa Diallo · 542',
  paper=[('Les villes ', None), ('ont été bombardé', ('c-acc', 1)), (' pendant la guerre et la population ', None), ('seloigne', ('c-orth', 2)), (' des zones de combat', None), ('.', None),
         (' Elle se ', None), ('défends', ('c-conj', 3)), (' comme elle peut', None), (' mais', ('c-ponc', 4)), (" l'aide arrive lentement.", None)],
  fixes=[('c-acc', '1. Accords', 'ont été bombardé', 'ont été bombardées', 'Avec « être », le participe passé s’accorde avec le sujet (les villes).'),
         ('c-orth', '2. Orthographe', 'seloigne', 's’éloigne', 'Pronom « se » + verbe « éloigner » : apostrophe.'),
         ('c-conj', '3. Conjugaison', 'défends', 'défend', '« elle » : 3e personne du singulier, terminaison -d.'),
         ('c-ponc', '4. Ponctuation', 'peut mais', 'peut, mais', 'Virgule devant « mais » qui relie deux propositions.')],
  lang_points=['Six catégories au choix : orthographe, accords, conjugaison, ponctuation, syntaxe, vocabulaire', 'Note de langue facultative (ex. −0,5 par faute)', 'Copie annotée à imprimer ou à enregistrer en PDF pour l’élève', 'Fonctionne sur l’écriture à la main comme sur les textes tapés'],
  trust_h='Conçu pour que vous puissiez lui faire confiance', trust_sub="Une IA qui se trompe en silence ne vous fait pas gagner de temps. Brûle la pile vous montre où regarder.",
  trust=[('search', 'Chaque point est justifié', '« Écrit : 1942, attendu : 1955. » Vous voyez pourquoi chaque point a été retiré, et vous le changez si vous n’êtes pas d’accord.'),
         ('scale', 'Correction approfondie', 'Chaque copie peut être corrigée deux fois, indépendamment, par deux modèles d’IA différents, avec un pourcentage de fiabilité. Les questions où les corrections divergent sont surlignées.'),
         ('lock', 'Rien n’est conservé', 'Les copies sont traitées puis oubliées : aucune copie ni note n’est stockée sur nos serveurs. Vous téléchargez votre grille, c’est tout.')],
  price_h='Payez à la page, sans abonnement',
  price_sub="Une classe de 30 élèves avec des copies de 3 pages : environ 5 $ en mode rapide, 10 $ en mode approfondi (double correction). La correction de la langue compte 1 page par page. Le corrigé n'est jamais facturé. Les pages achetées n'expirent pas.",
  prices=[('Découverte', '14 $', '200 pages', ['~7 ¢ la page', '~2 classes en mode rapide'], ''), ('Session', '29 $', '500 pages', ['~5,8 ¢ la page', '~5 classes en mode rapide, 2 à 3 en approfondi'], 'Le plus populaire'), ('Année', '79 $', '1 800 pages', ['~4,4 ¢ la page', "Toute l'année scolaire"], '')],
  start='Commencer',
  price_note='Prix en dollars canadiens. Commencez par 30 pages gratuites. École ou centre de services ? <a href="mailto:bonjour@brulelapile.ca">Écrivez-nous</a> pour un tarif de groupe.',
  faq_h='Questions fréquentes',
  faq=[("L'IA remplace-t-elle mon jugement ?", "Non. Elle vous propose une note et une justification ; vous restez le correcteur. Tout est modifiable avant l'export, et les copies douteuses sont signalées."),
       ("Ça fonctionne avec l'écriture à la main ?", "Oui, avec des numérisations ou des photos nettes. Si un passage est difficile à lire, la copie est marquée à vérifier. Si la photo est illisible, aucune note n'est inventée : la copie est marquée « Illisible » et n'est pas facturée."),
       ("Puis-je cacher le nom des élèves ?", "Oui. Cochez « Masquer le nom de l'élève avant l'envoi » : le haut de la première page de chaque copie est blanchi dans votre navigateur et n'est jamais transmis. Vous voyez toujours la copie complète et inscrivez les noms vous-même."),
       ('Quels formats de copies ?', "PDF numérisés (une ou plusieurs copies par fichier), photos prises au téléphone (y compris les photos d'iPhone), documents Word (.docx) et fichiers texte. Les copies d'une même numérisation sont séparées automatiquement par élève."),
       ('Quelles matières ?', 'Toutes celles où un corrigé ou une grille permet de juger les réponses : histoire, sciences, mathématiques (réponses et démarches), français, langues, questions à développement court. Plus votre corrigé est précis, plus la correction l’est.'),
       ('Qu’est-ce qu’une « page » ?', 'Une page de copie d’élève (une face numérisée ou une photo). En mode rapide et en correction de la langue, une page de copie compte pour 1 page ; en mode approfondi (double correction et fiabilité), pour 2 pages. Le corrigé n’est pas compté. Une correction qui échoue n’est pas décomptée.'),
       ('Que deviennent les copies de mes élèves ?', 'Elles sont envoyées de façon chiffrée à notre fournisseur d’IA pour la correction, puis oubliées. Nous ne conservons ni copie, ni note, ni nom d’élève. Voir notre <a href="confidentialite.html">politique de confidentialité</a>.'),
       ('Dois-je créer un compte ?', 'Non. Vous recevez une clé d’accès qui contient votre solde de pages. Notez-la pour l’utiliser sur un autre appareil ou recharger votre compte.')],
  end_h='Votre prochaine pile de copies, en quelques minutes', end_sub='30 pages gratuites, sans carte de crédit.', end_cta='Essayer maintenant',
  privacy_href='confidentialite.html', mail='bonjour@brulelapile.ca', site='https://brulelapile.ca', privacy='Confidentialité', terms_href='conditions.html', terms='Conditions', contact='Nous joindre'),
 'en': dict(
  file='index-en.html', alt='index.html', html_lang='en-CA', brand='Burn the Pile',
  title='Burn the Pile — Grade student work 10× faster',
  desc='Upload scanned student work: the AI suggests a detailed, question-by-question grade, checks the writing and drafts feedback for each student. You approve. 30 free pages.',
  og_title='Burn the Pile: grade a whole class during your coffee break',
  og_desc='The AI suggests grades and feedback and highlights language errors. You have the final say. 30 free pages.',
  nav_prices='Pricing', nav_try='Try for free', anchor_prices='pricing',
  eyebrow='For elementary, high school and college teachers',
  h1='Grade a whole class <em>during your coffee break</em>.',
  lead='Scan the papers, add your answer key: <b>Burn the Pile</b> suggests a detailed grade question by question, highlights language errors and drafts feedback for every student. You review, adjust and export.',
  cta1='Try it with 30 free pages', cta2='See how it works',
  reassure='No credit card · No student work stored · Pay per page, no subscription',
  mock=[('Priya Sharma · Period 3', '22 / 25'), ['Q1 Russian Revolution — 2/2 · Expected: 1917 ✓', 'Q3 Battle of Vimy Ridge — 0/2 · Wrote: 1914, expected: 1917', 'Q6 Archduke’s assassination — 2/2 · ✓'],
        ('Daniel Okafor · Period 3', '18 / 25'), '⚖ Q2: the two gradings disagree (2 and 4) — reliability 78%', ('Mei Lin Wong · Period 3', '24 / 25')],
  steps_h='Three steps, a few minutes', steps_sub='No training, nothing to install. It runs in your browser, on a computer or a tablet.',
  steps=[('clip', '1. Your answer key', 'Paste your instructions or upload your answer key (PDF, photo). Points per question, accepted answers, criteria: the AI follows your rubric, or builds a detailed one for you.'),
         ('upload', '2. Student work', 'Drop the scanned PDF of the whole class, photos or Word documents. The AI finds where each paper starts, and you can adjust.'),
         ('check', '3. You approve', 'A grade and justification for each question, feedback for the student. Adjust a point in one click and download the results for Excel or your gradebook.')],
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
         ('scale', 'In-depth grading', 'Each paper can be graded twice, independently, by two different AI models, with a reliability score. Questions where the gradings disagree are highlighted.'),
         ('lock', 'Nothing is stored', 'Papers are processed, then forgotten: no student work or grades are stored on our servers. You download your results, that’s it.')],
  price_h='Pay per page, no subscription',
  price_sub='A class of 30 students with 3-page papers: about $5 in quick mode, $10 in in-depth mode (double grading). Language checks count 1 page per page. The answer key is never charged. Purchased pages never expire.',
  prices=[('Starter', '$14 CAD', '200 pages', ['~7¢ per page', '~2 classes in quick mode'], ''), ('Term', '$29 CAD', '500 pages', ['~5.8¢ per page', '~5 classes in quick mode, 2–3 in-depth'], 'Most popular'), ('Year', '$79 CAD', '1,800 pages', ['~4.4¢ per page', 'The whole school year'], '')],
  start='Get started',
  price_note='Prices in Canadian dollars. Start with 30 free pages. A school or district? <a href="mailto:hello@burnthepile.com">Contact us</a> for group pricing.',
  faq_h='Frequently asked questions',
  faq=[('Does the AI replace my judgment?', 'No. It suggests a grade and a justification; you remain the grader. Everything can be edited before export, and doubtful papers are flagged.'),
       ('Does it work with handwriting?', 'Yes, with clear scans or photos. If a passage is hard to read, the paper is flagged for review. If the photo is illegible, no grade is made up: the paper is marked “Illegible” and is not charged.'),
       ('Can I hide student names?', 'Yes. Tick “Hide the student’s name before sending”: the top of each paper’s first page is blanked in your browser and never sent. You still see the full paper and enter the names yourself.'),
       ('Which file formats?', 'Scanned PDFs (one or several papers per file), phone photos (including iPhone photos), Word documents (.docx) and text files. Papers in a single scan are split by student automatically.'),
       ('Which subjects?', 'Any subject where an answer key or rubric can judge the answers: history, science, math (answers and work shown), English, languages, short written answers. The more precise your answer key, the more precise the grading.'),
       ('What is a “page”?', 'One page of student work (one scanned side or one photo). In quick mode and for language checks, a page counts as 1; in in-depth mode (double grading and reliability), as 2. The answer key is not counted. Failed gradings are not charged.'),
       ('What happens to my students’ work?', 'It is sent encrypted to our AI provider for grading, then forgotten. We store no student work, grades or student names. See our <a href="privacy.html">privacy policy</a>.'),
       ('Do I need an account?', 'No. You get an access key that holds your page balance. Write it down to use it on another device or to top up.')],
  end_h='Your next pile of papers, in a few minutes', end_sub='30 free pages, no credit card.', end_cta='Try it now',
  privacy_href='privacy.html', mail='hello@burnthepile.com', site='https://burnthepile.com', privacy='Privacy', terms_href='terms.html', terms='Terms', contact='Contact us'),
}

def page(L, d):
    m = d['mock']
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
  <header class="topbar"><div class="wrap"><a class="brand" href="{d['file']}"><img class="logo" src="logo-96.png" alt="" width="40" height="40"><strong>{d['brand']}</strong></a><div class="top-actions">{sw}<a class="btn ghost" href="#{d['anchor_prices']}">{d['nav_prices']}</a><a class="btn primary" href="app.html">{d['nav_try']}</a></div></div></header>
  <main class="wrap">
    <section class="hero">
      <div>
        <img class="hero-logo" src="logo.png" alt="{d['brand']}" width="132" height="132">
        <span class="eyebrow">{d['eyebrow']}</span>
        <h1>{d['h1']}</h1>
        <p class="lead">{d['lead']}</p>
        <div class="cta">
          <a class="btn primary big" href="app.html">{d['cta1']}</a>
          <a class="btn ghost big" href="#how">{d['cta2']}</a>
        </div>
        <p class="muted small">{d['reassure']}</p>
      </div>
      <div class="mock" aria-hidden="true">
        <div class="mock-row"><span>{m[0][0]}</span><b class="g">{m[0][1]}</b></div>
        <div class="mock-detail"><div>{m[1][0]}</div><div class="lost">{m[1][1]}</div><div>{m[1][2]}</div></div>
        <div class="mock-row"><span>{m[2][0]}</span><b class="g">{m[2][1]}</b></div>
        <div class="mock-flag">{m[3]}</div>
        <div class="mock-row"><span>{m[4][0]}</span><b class="g">{m[4][1]}</b></div>
      </div>
    </section>

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

    <section class="block" style="text-align:center">
      <h2>{d['end_h']}</h2>
      <p class="sub" style="margin:0 auto 1.5rem">{d['end_sub']}</p>
      <a class="btn primary big" href="app.html">{d['end_cta']}</a>
    </section>
  </main>
  <footer><div class="wrap"><span>© 2026 {d['brand']}</span><span><a href="{d['privacy_href']}">{d['privacy']}</a> · <a href="{d['terms_href']}">{d['terms']}</a> · <a href="mailto:{d['mail']}">{d['contact']}</a></span></div></footer>
</body>
</html>
'''

for L, d in T.items():
    open(f"{OUT}/{d['file']}", 'w').write(page(L, d))
print('ok')
