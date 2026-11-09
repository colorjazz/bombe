"""Integre une verification visuelle (Gemini) dans une PDA extraite, avec controles croises.

Une ligne de Gemini est acceptee seulement si :
- sa sequence est logique (fleches -> etoile -> cases bleues),
- ses cases bleues correspondent exactement aux rectangles bleus du PDF sur cette ligne,
- ses fleches incluent les fleches detectees par structure sur cette ligne.
Usage : python3 -I integrer_verification.py source.pdf pda.json verification.json sortie.json
"""
import json, re, sys, unicodedata, collections
import pdfplumber
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from extraire_pda import colonnes, proche, BLEU

SYM = {'apprentissage': '→', 'maitrise': '★', 'reinvestissement': '■', None: '·'}

def norm(t):
    t = unicodedata.normalize('NFKC', t).lower()
    t = re.sub(r'^([a-h]|[ivx]+|\d+)\.\s', '', t)
    return re.sub(r'[^a-zàâçéèêëîïôûùüœ0-9]+', ' ', t).strip()

def logique(prog):
    s = ''.join(SYM[prog[str(k)]] for k in range(1, 7))
    return bool(re.fullmatch(r'·*(→*★)*→*(■*|·*)', s)) and ('■' not in s or '★' in s.split('■')[0])

def lignes_page(page, x_col):
    mots = [w for w in page.extract_words(extra_attrs=['fontname']) if w['x1'] < x_col]
    rangs = []
    for w in sorted(mots, key=lambda w: (round(w['top']), w['x0'])):
        if rangs and abs(w['top'] - rangs[-1]['top']) < 3: rangs[-1]['mots'].append(w)
        else: rangs.append({'top': w['top'], 'mots': [w]})
    for r in rangs:
        r['mots'].sort(key=lambda w: w['x0'])
        r['n'] = norm(' '.join(w['text'] for w in r['mots']))
        r['bottom'] = max(w['bottom'] for w in r['mots'])
        r['gras'] = sum(len(w['text']) for w in r['mots'] if 'Bold' in w['fontname']) / max(1, sum(len(w['text']) for w in r['mots']))
    return rangs

def main(src, pda_f, verif_f, sortie):
    pdf = pdfplumber.open(src)
    pda = json.load(open(pda_f, encoding='utf-8'))
    verif = json.load(open(verif_f, encoding='utf-8'))
    pages_v = sorted(set(e['page'] for e in verif))
    stats = collections.Counter()
    nouveaux = {p: [] for p in pages_v}
    for p in pages_v:
        page = pdf.pages[p - 1]
        cols = colonnes(page)
        rangs = lignes_page(page, cols[0][0] - 2)
        bleus = [r for r in page.rects if r['x0'] > 400 and r['width'] <= 130 and proche(r.get('non_stroking_color'), BLEU)]
        fleches = [((im['x0'] + im['x1']) / 2, (im['top'] + im['bottom']) / 2) for im in page.images if im['srcsize'][0] == 44 and im['x1'] > cols[0][0]]
        anciens = [s for s in pda['savoirs'] if s['page'] == p]
        for e in verif:
            if e['page'] != p: continue
            cible = norm(e['texte'])
            def score(r):
                n = r['n']
                if not n: return 0
                if n == cible: return 3000
                if cible.startswith(n) or n.startswith(cible): return min(len(n), len(cible)) + 1000
                k = 0
                while k < min(len(n), len(cible)) and n[k] == cible[k]: k += 1
                return k
            meilleurs = sorted(range(len(rangs)), key=lambda i: -score(rangs[i]))
            idx = meilleurs[0] if meilleurs and score(rangs[meilleurs[0]]) >= 1015 else None
            note = ''
            if idx is None:
                ok, note = False, 'Ligne introuvable dans le PDF.'
            else:
                y = rangs[idx]['top'] + 2
                # la rangee du tableau = la plus petite cellule de colonne qui contient cette ligne
                cellules = [r for r in page.rects if 14 <= r['width'] <= 21 and r['x0'] > 400 and r['top'] - 1 <= y <= r['bottom'] + 1]
                if cellules:
                    c = min(cellules, key=lambda r: r['bottom'] - r['top'])
                    top, bas = c['top'], c['bottom']
                else:
                    top, bas = rangs[idx]['top'] - 3, rangs[idx]['bottom'] + 3
                milieu_ok = lambda r: top - 1 <= (r['top'] + r['bottom']) / 2 <= bas + 1
                bleu_pdf = {str(k) for k, (x0, x1) in enumerate(cols, 1)
                            if any(r['x0'] - 1 <= (x0 + x1) / 2 <= r['x1'] + 1 and milieu_ok(r) for r in bleus)}
                fl_pdf = {str(k) for k, (x0, x1) in enumerate(cols, 1)
                          if any(x0 - 1 <= cx <= x1 + 1 and top - 1 <= cy <= bas + 1 for cx, cy in fleches)}
                bleu_g = {k for k, v in e['progression'].items() if v == 'reinvestissement'}
                fl_g = {k for k, v in e['progression'].items() if v == 'apprentissage'}
                if not logique(e['progression']): ok, note = False, 'Séquence illogique.'
                elif bleu_pdf != bleu_g: ok, note = False, f'Cases bleues du PDF {sorted(bleu_pdf)} différentes de Gemini {sorted(bleu_g)}.'
                elif not fl_pdf <= fl_g: ok, note = False, f'Flèches du PDF {sorted(fl_pdf)} absentes chez Gemini.'
                else: ok = True
            # metadonnees : savoir d'origine qui contient ce texte
            orig = next((s for s in anciens if cible[:30] in norm(s['texte'])), anciens[0] if anciens else None)
            chemin = list(orig['chemin']) if orig else []
            parent = e.get('parent', '')
            if orig and norm(orig['texte']) != cible and parent and norm(parent) not in [norm(c) for c in chemin]:
                chemin.append(parent)
            nouveaux[p].append({
                'competence': orig['competence'] if orig else None, 'section': orig['section'] if orig else None,
                'chemin': chemin, 'texte': e['texte'],
                'prioritaire': bool(idx is not None and rangs[idx]['gras'] > 0.5),
                'progression': e['progression'], 'page': p,
                'a_verifier': not ok,
                'note': ('Vérifié visuellement (Gemini) et concordant avec le PDF.' if ok else 'Gemini : ' + note),
            })
            stats['acceptees' if ok else 'a_verifier'] += 1
    # remplacer les savoirs des pages verifiees, en gardant l'ordre du document
    final = []
    for s in pda['savoirs']:
        if s['page'] in nouveaux:
            if nouveaux[s['page']] is not None:
                final.extend(nouveaux[s['page']]); nouveaux[s['page']] = None
        else:
            final.append(s)
    compteur = collections.Counter()
    for s in final:
        cle = s['id'].split('-')[1] if s.get('id') else None
        if not cle:
            cle = re.sub(r'[^A-Z]', '', (s['section'] or s['competence'] or 'XXX').upper().replace('É', 'E'))[:3]
        compteur[cle] += 1
        s['id'] = f"{pda['code_discipline']}-{cle}-{compteur[cle]:03d}"
    pda['savoirs'] = [{k: s.get(k) for k in ('id', 'competence', 'section', 'chemin', 'texte', 'prioritaire', 'progression', 'page', 'a_verifier', 'note')} for s in final]
    pda['bilan'] = {'nombre_savoirs': len(final), 'a_verifier': sum(s['a_verifier'] for s in final), 'prioritaires': sum(s['prioritaire'] for s in final)}
    pda['verification_visuelle'] = {'pages': pages_v, 'acceptees': stats['acceptees'], 'a_verifier': stats['a_verifier']}
    json.dump(pda, open(sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(json.dumps(pda['bilan'], ensure_ascii=False), dict(stats))
    for s in final:
        if s['a_verifier']: print(' AV p', s['page'], s['texte'][:55], '|', s['note'][:90])

if __name__ == '__main__':
    main(*sys.argv[1:5])
