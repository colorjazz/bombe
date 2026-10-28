# Génère les pages « Sous-traitants » et « Transparence de l'IA », en français et en anglais.
# Utilisation : python3 tools/build_transparence.py public
# Les chiffres de performance viennent de nos mesures (voir tools/surlignages/README.md) : les mettre à jour ensemble.
import sys
OUT = sys.argv[1]

FR = dict(html_lang='fr-CA', lang='fr', brand='Brûle la pile', home='index.html', pricing='index.html#tarifs', pricing_label='Tarifs',
  try_label='Essayer gratuitement', privacy='confidentialite.html', privacy_label='Confidentialité', consent='consentement.html',
  consent_label='Lettre aux parents', terms='conditions.html', terms_label='Conditions', mail='bonjour@brulelapile.ca', contact='Nous joindre',
  updated='Dernière mise à jour : 28 octobre 2026.')
EN = dict(html_lang='en-CA', lang='en', brand='Burn the Pile', home='index-en.html', pricing='index-en.html#pricing', pricing_label='Pricing',
  try_label='Try for free', privacy='privacy.html', privacy_label='Privacy', consent='consent.html',
  consent_label='Parent letter', terms='terms.html', terms_label='Terms', mail='hello@burnthepile.com', contact='Contact us',
  updated='Last updated: October 28, 2026.')

PAGES = [
  # (fichier FR, fichier EN, titre FR, titre EN, corps FR, corps EN)
  ('sous-traitants.html', 'subprocessors.html', 'Sous-traitants', 'Subprocessors', '''
    <p>Voici la liste complète des entreprises qui traitent des renseignements pour Brûle la pile, avec ce qu'elles reçoivent et où. Nous la mettons à jour avant tout changement de fournisseur qui touche les copies des élèves.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Fournisseur</th><th>Rôle</th><th>Ce qu'il reçoit</th><th>Lieu de traitement</th><th>Garanties</th></tr></thead>
      <tbody>
        <tr><td><b>Google LLC</b><br>API Gemini</td><td>Correction des copies, par défaut</td><td>Images des copies (nom de l'élève masqué sur l'appareil), consignes et corrigé</td><td>États-Unis et autres pays où Google exploite ses centres de données</td><td><a href="https://ai.google.dev/gemini-api/terms" rel="noopener">Offre payante</a> : pas d'entraînement des modèles ; conservation limitée, pour la détection d'abus seulement</td></tr>
        <tr><td><b>Google LLC</b><br>Google Cloud, Vertex AI</td><td>Correction des copies, seulement avec l'option « Traiter les copies au Québec »</td><td>Mêmes données que ci-dessus</td><td>Région de Montréal (northamerica-northeast1), au Québec ; jamais ailleurs</td><td><a href="https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance" rel="noopener">Engagements de Google Cloud</a> : pas d'entraînement des modèles</td></tr>
        <tr><td><b>Cloudflare, Inc.</b></td><td>Hébergement du site et du serveur, base de données, journaux techniques</td><td>Copies en transit, traitées en mémoire et jamais enregistrées ; clés d'accès, soldes, journal d'utilisation sans copie ni nom ; journaux techniques (7 jours au plus)</td><td>Réseau mondial ; entreprise établie aux États-Unis</td><td>Connexions chiffrées (HTTPS) ; aucun contenu de copie dans les journaux</td></tr>
        <tr><td><b>Stripe</b></td><td>Paiements</td><td>Courriel et renseignements de paiement de l'acheteur ; jamais de donnée d'élève</td><td>Entreprise établie aux États-Unis</td><td>Nous ne voyons jamais votre carte</td></tr>
        <tr><td><b>Google Fonts</b></td><td>Polices de caractères du site</td><td>Adresse IP du navigateur, au téléchargement des polices</td><td>Réseau mondial de Google</td><td>Aucune donnée d'élève</td></tr>
      </tbody>
    </table></div>
    <p>Aucun autre fournisseur ne reçoit les copies des élèves. Voir aussi notre <a href="confidentialite.html">politique de confidentialité</a> et la <a href="ia.html">notice de transparence de l'IA</a>.</p>''', '''
    <p>This is the complete list of companies that process information for Burn the Pile, with what they receive and where. We update it before any change of provider that affects student work.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Provider</th><th>Role</th><th>What it receives</th><th>Where it is processed</th><th>Safeguards</th></tr></thead>
      <tbody>
        <tr><td><b>Google LLC</b><br>Gemini API</td><td>Marking papers, by default</td><td>Images of the papers (student name hidden on the device), instructions and answer key</td><td>United States and other countries where Google operates data centres</td><td><a href="https://ai.google.dev/gemini-api/terms" rel="noopener">Paid tier</a>: no model training; kept for a limited time, for abuse detection only</td></tr>
        <tr><td><b>Google LLC</b><br>Google Cloud, Vertex AI</td><td>Marking papers, only with the “Process papers in Quebec” option</td><td>Same data as above</td><td>Montreal region (northamerica-northeast1), in Quebec; never anywhere else</td><td><a href="https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance" rel="noopener">Google Cloud commitments</a>: no model training</td></tr>
        <tr><td><b>Cloudflare, Inc.</b></td><td>Hosting the site and server, database, technical logs</td><td>Papers in transit, processed in memory and never stored; access keys, balances, usage log with no papers or names; technical logs (7 days at most)</td><td>Global network; company based in the United States</td><td>Encrypted connections (HTTPS); no paper content in logs</td></tr>
        <tr><td><b>Stripe</b></td><td>Payments</td><td>Buyer’s email and payment details; never any student data</td><td>Company based in the United States</td><td>We never see your card</td></tr>
        <tr><td><b>Google Fonts</b></td><td>Website fonts</td><td>Browser IP address, when the fonts are downloaded</td><td>Google’s global network</td><td>No student data</td></tr>
      </tbody>
    </table></div>
    <p>No other provider receives student work. See also our <a href="privacy.html">privacy policy</a> and the <a href="ai.html">AI transparency notice</a>.</p>'''),

  ('ia.html', 'ai.html', 'Transparence de l’intelligence artificielle', 'AI transparency notice', '''
    <p>Cette notice explique ce que fait l'IA de Brûle la pile, ce qu'elle ne fait pas, et ce que nous avons mesuré de sa fiabilité. En résumé : <strong>l'IA propose, l'enseignant décide.</strong></p>

    <h2>Ce que fait l'IA</h2>
    <ul>
      <li><b>Correction des copies</b> : elle lit la photo de chaque copie et propose, pour chaque question ou chaque critère de votre grille, une note ou un niveau avec sa justification, puis un commentaire pour l'élève.</li>
      <li><b>Correction de la langue</b> : elle relève et surligne les fautes sur la copie, avec la correction et la règle. Au primaire et au secondaire, elle ne retient que les notions prévues à l'année de vos élèves selon la Progression des apprentissages.</li>
      <li><b>Tâches d'appoint</b> : lire votre grille ou votre corrigé, séparer les copies d'une même numérisation, redresser une photo prise de côté, réécrire un commentaire.</li>
    </ul>
    <p>Modèles utilisés : Gemini 3.5 Flash pour la correction des copies, Gemini 3.7 Flash pour la langue et pour la 2e correction du mode approfondi (Google, API Gemini) ; Gemini 3.5 Flash pour tout, avec l'option « Traiter les copies au Québec » (Google Cloud, Montréal).</p>

    <h2>Ce qu'elle ne fait pas</h2>
    <ul>
      <li>Elle ne décide d'aucune note : chaque proposition est relue, modifiable et validée par l'enseignant. Une note changée par l'enseignant est indiquée comme telle dans la fiche et dans le fichier exporté.</li>
      <li>Elle ne connaît pas l'élève : le nom est masqué sur l'appareil de l'enseignant avant l'envoi, et aucun profil d'élève n'est créé.</li>
      <li>Elle n'apprend pas de vos copies : nos fournisseurs n'entraînent pas leurs modèles avec les copies, et nous ne les conservons pas.</li>
    </ul>

    <h2>Fiabilité mesurée</h2>
    <p>Mesures faites par nous, en octobre 2026 ; elles donnent un ordre de grandeur, pas une garantie.</p>
    <ul>
      <li><b>Langue, primaire</b> (6 copies fictives, 21 fautes prévues, étapes 2 et 3) : 21 fautes trouvées sur 21, toutes bien classées, aucune faute en trop.</li>
      <li><b>Position des surlignages</b> (9 vraies copies, 164 mots fautifs étiquetés à la main) : environ 84 % des cadres exactement sur le mot fautif ; environ 75 % avec l'option « Traiter les copies au Québec ».</li>
      <li><b>Notes</b> : d'une correction à l'autre de la même copie, un niveau ou quelques points peuvent varier. Le mode approfondi fait deux corrections indépendantes et signale les écarts.</li>
    </ul>

    <h2>Limites à connaître</h2>
    <ul>
      <li>Une écriture difficile à lire, une photo floue ou une page mal cadrée réduisent la qualité ; ces copies sont signalées « à vérifier ».</li>
      <li>Sans corrigé, les notes ont tendance à être généreuses.</li>
      <li>L'IA peut oublier une faute ou en relever une qui n'en est pas une : vous pouvez en ajouter ou en retirer sur la copie annotée.</li>
      <li>Le masquage du nom est une protection, pas un anonymat complet : un nom écrit ailleurs sur la copie, l'écriture ou le contenu d'une réponse peuvent parfois permettre de reconnaître un élève.</li>
    </ul>

    <h2>Cadre de référence</h2>
    <p>Ce fonctionnement suit le <a href="https://cdn-contenu.quebec.ca/cdn-contenu/education/Numerique/guide-utilisation-pedagogique-ethique-legale-IAG.pdf" rel="noopener">guide du ministère de l'Éducation sur l'IA générative</a> (2026, section 1.2) : l'IA soutient l'évaluation sans remplacer le jugement professionnel, et les copies traitées ne contiennent pas de renseignements personnels (nom masqué par défaut). Le guide recommande aussi que l'outil soit autorisé par l'organisme scolaire : renseignez-vous auprès de votre direction. Un <a href="consentement.html">modèle de lettre aux parents</a> est offert.</p>
    <p>Une question, une erreur de l'IA à signaler ? Écrivez-nous à <a href="mailto:bonjour@brulelapile.ca">bonjour@brulelapile.ca</a>. Voir aussi la <a href="sous-traitants.html">liste des sous-traitants</a> et la <a href="confidentialite.html">politique de confidentialité</a>.</p>''', '''
    <p>This notice explains what Burn the Pile’s AI does, what it does not do, and what we have measured of its reliability. In short: <strong>the AI suggests, the teacher decides.</strong></p>

    <h2>What the AI does</h2>
    <ul>
      <li><b>Marking papers</b>: it reads the photo of each paper and suggests, for each question or each criterion of your rubric, a mark or a level with its justification, then a comment for the student.</li>
      <li><b>Language check</b>: it finds and highlights errors on the paper, with the correction and the rule. In elementary and high school (Quebec), it only counts the concepts planned for your students’ grade under the Progression of Learning.</li>
      <li><b>Supporting tasks</b>: reading your rubric or answer key, splitting papers in one scan, straightening a photo taken sideways, rewriting a comment.</li>
    </ul>
    <p>Models used: Gemini 3.5 Flash for marking, Gemini 3.7 Flash for language and for the second marking in thorough mode (Google, Gemini API); Gemini 3.5 Flash for everything with the “Process papers in Quebec” option (Google Cloud, Montreal).</p>

    <h2>What it does not do</h2>
    <ul>
      <li>It decides no mark: every suggestion is reviewed, editable and approved by the teacher. A mark changed by the teacher is shown as such on the result card and in the exported file.</li>
      <li>It does not know the student: the name is hidden on the teacher’s device before sending, and no student profile is created.</li>
      <li>It does not learn from your papers: our providers do not train their models on the papers, and we do not keep them.</li>
    </ul>

    <h2>Measured reliability</h2>
    <p>Our own measurements, October 2026; they give an order of magnitude, not a guarantee.</p>
    <ul>
      <li><b>Language, elementary</b> (6 sample papers, 21 planted errors, terms 2 and 3): 21 errors found out of 21, all correctly classified, no extra errors.</li>
      <li><b>Highlight position</b> (9 real papers, 164 error words labelled by hand): about 84% of boxes exactly on the wrong word; about 75% with the “Process papers in Quebec” option.</li>
      <li><b>Marks</b>: between two markings of the same paper, a level or a few points can vary. Thorough mode runs two independent markings and flags differences.</li>
    </ul>

    <h2>Limits to know</h2>
    <ul>
      <li>Hard-to-read handwriting, a blurry photo or a badly framed page lower quality; these papers are flagged for review.</li>
      <li>Without an answer key, marks tend to be generous.</li>
      <li>The AI can miss an error or flag one that is not: you can add or remove errors on the annotated paper.</li>
      <li>Hiding the name is a protection, not full anonymity: a name written elsewhere, the handwriting or the content of an answer can sometimes identify a student.</li>
    </ul>

    <p>A question, or an AI error to report? Write to us at <a href="mailto:hello@burnthepile.com">hello@burnthepile.com</a>. See also the <a href="subprocessors.html">list of subprocessors</a> and the <a href="privacy.html">privacy policy</a>.</p>'''),
]

def page(d, file, alt, title, body):
    return f'''<!DOCTYPE html>
<html lang="{d['html_lang']}" data-lang="{d['lang']}" data-alt="{alt}">
<head>
  <meta charset="UTF-8">
  <script src="lang.js"></script>
  <link rel="icon" href="favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="site.css">
  <title>{title} — {d['brand']}</title>
</head>
<body>
  <header class="topbar"><div class="wrap"><a class="brand" href="{d['home']}"><img class="logo" src="logo-96.png" alt="" width="40" height="40"><strong>{d['brand']}</strong></a><div class="top-actions"><div class="lang-switch" role="group" aria-label="Langue / Language"><a href="{file if d['lang'] == 'fr' else alt}" data-set-lang="fr">FR</a><a href="{alt if d['lang'] == 'fr' else file}" data-set-lang="en">EN</a></div><a class="btn ghost" href="{d['pricing']}">{d['pricing_label']}</a><a class="btn primary" href="app.html">{d['try_label']}</a></div></div></header>
  <main class="wrap legal">
    <h1>{title}</h1>
    <p class="small">{d['updated']}</p>{body}
  </main>
  <footer><div class="wrap"><span>© 2026 {d['brand']}</span><span><a href="{d['privacy']}">{d['privacy_label']}</a> · <a href="{d['consent']}">{d['consent_label']}</a> · <a href="{d['terms']}">{d['terms_label']}</a> · <a href="mailto:{d['mail']}">{d['contact']}</a></span></div></footer>
</body>
</html>
'''

for fr_file, en_file, fr_title, en_title, fr_body, en_body in PAGES:
    open(f'{OUT}/{fr_file}', 'w', encoding='utf-8').write(page(FR, fr_file, en_file, fr_title, fr_body))
    open(f'{OUT}/{en_file}', 'w', encoding='utf-8').write(page(EN, en_file, fr_file, en_title, en_body))
print('ok')
