"""Extraction de la Progression des apprentissages (PDA) du MEQ vers JSON.

Lit la structure du PDF (pas de reconnaissance visuelle) :
- fleche  = image de largeur source 44 px -> "apprentissage"
- etoile  = image de largeur source 41 px -> "maitrise"
- case bleue (rectangle)                  -> "reinvestissement"
- police Bold                             -> contenu prioritaire
Usage : python3 -I extraire_pda.py source.pdf CODE "Discipline" ordre sortie.json
"""
import json, re, sys, collections
import pdfplumber

BLEU = (0.715, 0.77, 0.887)
MARQUEURS = [
    (1, re.compile(r'^[A-H]\.\s')),
    (4, re.compile(r'^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)\.\s')),
    (2, re.compile(r'^\d{1,2}\.\s')),
    (3, re.compile(r'^[a-h]\.\s')),
    (5, re.compile(r'^[–—-]\s')),
]

def proche(c, ref, tol=0.02):
    return isinstance(c, (tuple, list)) and len(c) == 3 and all(abs(a - b) < tol for a, b in zip(c, ref))

def colonnes(page):
    xs = sorted(r['x0'] for r in page.rects if 14 <= r['width'] <= 21 and r['x0'] > 400)
    groupes = []
    for x in xs:
        if groupes and x - groupes[-1][-1] < 4: groupes[-1].append(x)
        else: groupes.append([x])
    groupes = [g for g in groupes if len(g) >= 2]
    if len(groupes) < 6: return None
    groupes = groupes[-6:]
    debuts = [min(g) for g in groupes]
    pas = (debuts[-1] - debuts[0]) / 5
    return [(x, x + pas) for x in debuts]

def niveau(texte):
    for n, rx in MARQUEURS:
        if rx.match(texte): return n
    return None

def extraire(chemin):
    pdf = pdfplumber.open(chemin)
    competence = section = None
    pile = {}
    savoirs, pages_images, pages_sans_tableau = [], [], []
    controle = collections.Counter()
    for num, page in enumerate(pdf.pages, 1):
        lignes_txt = (page.extract_text() or '').split('\n')
        for l in lignes_txt[:6]:
            if l.startswith('Compétence '):
                nouvelle = re.sub(r'\s+\d+$', '', l[len('Compétence '):]).strip()
                if nouvelle != competence: section = None
                competence = nouvelle
            if l.startswith('Section '): section = re.sub(r'\s+\d+$', '', l[len('Section '):]).strip()
        if not any(l.startswith('Compétence ') for l in lignes_txt[:6]):
            # mise en page de type mathematique : domaine en gros titre, section = titre du tableau
            titre = ''.join(c['text'] for c in page.chars if c['size'] >= 13 and 35 <= c['top'] <= 60).strip()
            if titre and titre != competence:
                competence, section = titre, None
            for i, l in enumerate(lignes_txt):
                if l.startswith('L’élève apprend') and i > 0:
                    prec = lignes_txt[i - 1].strip()
                    if len(prec) < 70 and not prec.endswith('.') and not prec.startswith('Énoncés'):
                        section = prec
                    break
        cols = colonnes(page)
        if not cols:
            continue
        # grandes images qui recouvrent les colonnes : symboles illisibles par structure
        zones_image = [(im['top'], im['bottom']) for im in page.images
                       if im['srcsize'][0] > 300 and im['x1'] > cols[0][0]]
        if zones_image: pages_images.append(num)
        x_col = cols[0][0] - 2
        bas_tableau = max(r['bottom'] for r in page.rects if 14 <= r['width'] <= 21 and r['x0'] > 400)
        mots_entete = [w for w in page.extract_words() if w['x0'] >= x_col and w['text'] in ('cycle',)]
        haut = max((w['bottom'] for w in mots_entete), default=0) + 1
        # lignes de texte a gauche des colonnes
        mots = [w for w in page.extract_words(extra_attrs=['fontname'], keep_blank_chars=False)
                if w['x1'] < x_col and w['top'] > haut and w['bottom'] <= bas_tableau + 2]
        rangs = []
        for w in sorted(mots, key=lambda w: (round(w['top']), w['x0'])):
            if rangs and abs(w['top'] - rangs[-1]['top']) < 3:
                rangs[-1]['mots'].append(w)
            else:
                rangs.append({'top': w['top'], 'mots': [w]})
        for r in rangs:
            r['mots'].sort(key=lambda w: w['x0'])
            r['texte'] = ' '.join(w['text'] for w in r['mots'])
            r['x0'] = r['mots'][0]['x0']
            r['bottom'] = max(w['bottom'] for w in r['mots'])
            r['gras'] = sum(len(w['text']) for w in r['mots'] if 'Bold' in w['fontname'])
            r['total'] = sum(len(w['text']) for w in r['mots'])
        # les tirets des sous-elements sont des images (largeur source 23 px)
        tirets = [((im['top'] + im['bottom']) / 2, im['x1']) for im in page.images
                  if im['srcsize'][0] == 23 and im['x0'] < x_col]
        # regrouper en elements (une ligne a marqueur commence un element)
        elements = []
        for r in rangs:
            n = niveau(r['texte'])
            if n is None and any(r['top'] - 3 <= cy <= r['bottom'] + 3 and x1 <= r['x0'] + 1 for cy, x1 in tirets):
                n = 5
            if n is not None or not elements:
                elements.append({'niveau': n, 'lignes': [r], 'top': r['top']})
            else:
                elements[-1]['lignes'].append(r)
        for i, e in enumerate(elements):
            e['bas'] = elements[i + 1]['top'] - 0.5 if i + 1 < len(elements) else bas_tableau
        symboles = []
        rendu = None
        cand = sorted([im for im in page.images if im['x1'] >= x_col and 8 <= im['width'] <= 13 and im['srcsize'][0] <= 60],
                      key=lambda im: (round(im['x0']), im['top']))
        fusion = []  # les symboles sont parfois decoupes en tranches horizontales
        for im in cand:
            if fusion and abs(im['x0'] - fusion[-1]['x0']) < 1.5 and im['top'] - fusion[-1]['bottom'] < 1.5:
                fusion[-1]['bottom'] = max(fusion[-1]['bottom'], im['bottom'])
            else:
                fusion.append({'x0': im['x0'], 'x1': im['x1'], 'top': im['top'], 'bottom': im['bottom'], 'src': im['srcsize'][0]})
        for f in fusion:
            if f['bottom'] - f['top'] < 6: continue
            if rendu is None: rendu = page.to_image(resolution=144).original.convert('L')
            boite = rendu.crop((int(f['x0'] * 2) + 1, int(f['top'] * 2) + 1, int(f['x1'] * 2) - 1, int(f['bottom'] * 2) - 1))
            px = boite.load(); w, h = boite.size
            pts = [(x, y) for x in range(w) for y in range(h) if px[x, y] < 175]
            if len(pts) < 8: continue
            larg = max(x for x, y in pts) - min(x for x, y in pts) + 1
            haut_ = max(y for x, y in pts) - min(y for x, y in pts) + 1
            forme = 'apprentissage' if larg / haut_ > 1.2 else 'maitrise'
            controle[(f['src'], forme)] += 1
            # dans les PDA ou la taille distingue les symboles (44 = fleche, 41 = etoile), elle prime
            if f['src'] == 44: forme = 'apprentissage'
            elif f['src'] == 41: forme = 'maitrise'
            cx, cy = (f['x0'] + f['x1']) / 2, (f['top'] + f['bottom']) / 2
            symboles.append((cx, cy, forme, f['src']))
        bleus = [r for r in page.rects if 14 <= r['width'] <= 130 and r['x0'] > 400 and proche(r.get('non_stroking_color'), BLEU)]
        for e in elements:
            prog = {str(k): None for k in range(1, 7)}
            for k, (x0, x1) in enumerate(cols, 1):
                for r in bleus:
                    cy = (r['top'] + r['bottom']) / 2
                    milieu = (x0 + x1) / 2
                    if r['x0'] - 1 <= milieu <= r['x1'] + 1 and e['top'] - 3 <= cy <= e['bas'] + 1:
                        prog[str(k)] = 'reinvestissement'
                for cx, cy, s, _ in symboles:
                    if x0 - 1 <= cx <= x1 + 1 and e['top'] - 4 <= cy <= e['bas'] + 1:
                        prog[str(k)] = s
            texte = re.sub(r'\s+', ' ', ' '.join(l['texte'] for l in e['lignes'])).strip()
            gras = sum(l['gras'] for l in e['lignes']) / max(1, sum(l['total'] for l in e['lignes']))
            n = e['niveau'] or 6
            dans_image = any(t <= e['top'] <= b for t, b in zones_image)
            a_symbole = any(v for v in prog.values())
            if not a_symbole:
                pile = {k: v for k, v in pile.items() if k < n}
                pile[n] = texte
                continue
            savoirs.append({
                'competence': competence, 'section': section,
                'chemin': [pile[k] for k in sorted(pile) if k < n],
                'texte': texte, 'prioritaire': gras > 0.5,
                'progression': prog, 'page': num,
                'a_verifier': e['niveau'] is None or dans_image,
                'note': 'Symboles intégrés dans une image : vérifier visuellement.' if dans_image else '',
            })
    return savoirs, pages_images, controle

if __name__ == '__main__':
    src, code, disc, ordre, sortie = sys.argv[1:6]
    savoirs, pages_images, controle = extraire(src)
    print('controle forme par largeur source :', dict(controle))
    compteur = collections.Counter()
    for s in savoirs:
        if s['texte'] and s['note'] == '' and s['a_verifier']:
            s['note'] = 'Ligne sans marqueur de liste : vérifier le découpage.'
        cle = re.sub(r'[^A-Z]', '', (s['section'] or s['competence'] or 'XXX').upper().replace('É', 'E'))[:3]
        compteur[cle] += 1
        s['id'] = f'{code}-{cle}-{compteur[cle]:03d}'
    out = {'discipline': disc, 'code_discipline': code, 'ordre': ordre,
           'source': src.split('/')[-1], 'annees': [str(k) for k in range(1, 7)],
           'pages_avec_grandes_images': pages_images,
           'bilan': {'nombre_savoirs': len(savoirs), 'a_verifier': sum(s['a_verifier'] for s in savoirs),
                     'prioritaires': sum(s['prioritaire'] for s in savoirs)},
           'savoirs': [{k: s[k] for k in ('id', 'competence', 'section', 'chemin', 'texte', 'prioritaire', 'progression', 'page', 'a_verifier', 'note')} for s in savoirs]}
    json.dump(out, open(sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(json.dumps(out['bilan'], ensure_ascii=False), 'pages images:', pages_images)
