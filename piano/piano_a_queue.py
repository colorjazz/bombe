# -*- coding: utf-8 -*-
"""
Piano à queue 3D avec mécanique complète et vue éclatée — script Blender.

Ce script construit entièrement la scène par code (aucun fichier externe) :

  * un piano à queue : ceinture, couvercle et béquille, pupitre, pieds, lyre et
    pédales, fond de clavier, cadre en fonte, sommier, chevilles, 88 notes de
    cordes (filées cuivre dans les graves), table d'harmonie, chevalet, barrages ;
  * les 88 touches et, pour chaque note, la mécanique à double échappement :
    pilote, bascule (wippen), échappement (jack), levier de répétition,
    marteau (manche, rouleau, tête en feutre), levier et tête d'étouffoir ;
  * des drivers qui relient toutes les pièces : enfoncer une touche fait monter
    la bascule, l'échappement pousse le rouleau, le marteau frappe la corde,
    l'étouffoir se soulève ;
  * une VUE ÉCLATÉE GLOBALE (propriété « explosion ») qui sépare les grands
    sous-ensembles du piano, avec étiquettes ;
  * une VITRINE : la mécanique d'une note agrandie ×3, avec sa propre VUE
    ÉCLATÉE DÉTAILLÉE pièce par pièce (propriété « explosion_detail ») et ses
    étiquettes ;
  * une animation de démonstration (« Au clair de la lune », éclatement,
    vitrine), deux caméras, des lumières et un panneau « Piano » dans la barre
    latérale (N) de la vue 3D.

Utilisation
-----------
  Dans Blender (4.2 ou plus récent) : onglet Scripting > Ouvrir ce fichier > Exécuter.

  En ligne de commande :
      blender --python piano_a_queue.py
      blender -b --python piano_a_queue.py -- --sauver piano.blend
      blender -b --python piano_a_queue.py -- --rendu rendus/ --images 1,200,420

  Les commandes : vue 3D > barre latérale (touche N) > onglet « Piano », ou
  propriétés de l'objet « PIANO_Controle ».
"""

import math
import os
import sys

import bpy  # noqa: I001  (bpy doit être importé avant bmesh hors de Blender)
import bmesh
from mathutils import Matrix, Vector

# =============================================================================
# Paramètres géométriques (mètres). Repère : X = largeur du clavier (graves à
# gauche), Y = profondeur (le pianiste est du côté -Y), Z = hauteur.
# Les cotes « z » des pièces de la mécanique sont relatives au dessus du fond
# de clavier (KB).
# =============================================================================

KB = 0.67                      # dessus du fond de clavier
N_KEYS = 88
N_WHITE = 52
WHITE_W = 0.02345              # largeur d'une touche blanche (164 mm / octave)
KBW = N_WHITE * WHITE_W        # largeur du clavier
PITCH = KBW / N_KEYS           # pas de la mécanique (une note)
X0 = -KBW / 2

# Touches
KEY_LEN = 0.47
BAL_Y = 0.24                   # barre d'équilibre (pivot de la touche)
KEY_Z0, KEY_Z1 = 0.012, 0.035  # bois de la touche
WHITE_TOP = 0.046
BLACK_TOP = 0.058
WHITE_LEN = 0.150
BLACK_Y0, BLACK_Y1 = 0.050, 0.148
BLACK_W = 0.0125
KEY_DIP = 0.010                # enfoncement de la touche
TH_MAX = math.atan(KEY_DIP / BAL_Y)

# Mécanique (y, z relatif à KB)
CAP_Y, CAP_TOP = 0.40, 0.050   # pilote
P_KEY = (BAL_Y, KEY_Z0)
P_WIP = (0.325, 0.072)         # axe de la bascule
P_JACK = (0.415, 0.066)        # axe de l'échappement
P_HAM = (0.385, 0.127)         # axe du marteau
KNUCKLE = (0.415, 0.116, 0.006)
P_DL = (0.62, 0.060)           # axe du levier d'étouffoir
PAD_Y = 0.461                  # contact touche / levier d'étouffoir
DW_Y = 0.54                    # tige d'étouffoir

R_WIP = (CAP_Y - BAL_Y) / (CAP_Y - P_WIP[0])                       # bascule / touche
R_HAM = R_WIP * (P_JACK[0] - P_WIP[0]) / (KNUCKLE[0] - P_HAM[0])   # marteau / touche
R_DL = (PAD_Y - BAL_Y) / (P_DL[0] - PAD_Y)                         # levier étouffoir / touche
R_DW = R_DL * (P_DL[0] - DW_Y)                                     # levée étouffoir / touche
JACK_TILT = math.radians(11)   # basculement de l'échappement en fin de course
LETOFF = 0.85                  # fraction de course où l'échappement bascule

HAMMER_FELT = [(0.483, 0.140), (0.507, 0.140), (0.506, 0.163), (0.502, 0.173),
               (0.495, 0.178), (0.488, 0.173), (0.484, 0.163)]


def _strike_height():
    """Hauteur atteinte par le sommet du feutre quand la touche est au fond."""
    a = R_HAM * TH_MAX
    zmax = 0.0
    for y, z in HAMMER_FELT:
        dy, dz = y - P_HAM[0], z - P_HAM[1]
        zmax = max(zmax, P_HAM[1] + dy * math.sin(a) + dz * math.cos(a))
    return zmax


Z_STRIKE = _strike_height()    # dessous des cordes (relatif à KB)
ZS = KB + Z_STRIKE             # idem, absolu

# Caisse
RIM_X = 0.74
RIM_FRONT = 0.16
RIM_Z0, RIM_Z1 = 0.60, 0.95
RIM_T = 0.04
SB_Y0 = 0.665                  # avant de la table d'harmonie
SHOWCASE_LOC = (2.9, 0.45, -1.40)  # repère de la vitrine (mécanique agrandie)
LID_OPEN = math.radians(32)
DAMPER_LAST = 68               # pas d'étouffoirs dans l'extrême aigu

BLACK_PC = {1, 3, 6, 8, 10}
BLACK_OFFSET = {1: -0.0025, 3: 0.0025, 6: -0.003, 8: 0.0, 10: 0.003}
NOTE_NAMES = ["Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"]


def xa(n):
    """Abscisse de la mécanique de la note n (0 = La0, 87 = Do8)."""
    return X0 + (n + 0.5) * PITCH


def string_count(n):
    return 1 if n < 20 else (2 if n < 28 else 3)


def string_radius(n):
    if n < 20:
        return 0.0024 - n * 0.00003
    if n < 28:
        return 0.0016
    return max(0.0007, 0.00095 - (n - 28) * 0.000004)


def string_xs(n):
    c = string_count(n)
    if c == 1:
        return [xa(n)]
    if c == 2:
        return [xa(n) - 0.0022, xa(n) + 0.0022]
    return [xa(n) - 0.0036, xa(n), xa(n) + 0.0036]


# =============================================================================
# Outils
# =============================================================================

def clean_poly(pts, eps=1e-7):
    out = []
    for p in pts:
        if not out or (abs(p[0] - out[-1][0]) > eps or abs(p[1] - out[-1][1]) > eps):
            out.append(tuple(p))
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < eps and abs(out[0][1] - out[-1][1]) < eps:
        out.pop()
    return out


class MB:
    """Petit constructeur de maillage : accumule des primitives puis crée un mesh."""

    def __init__(self):
        self.v, self.f, self.mi, self.sm, self.mats = [], [], [], [], []

    def _m(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add(self, verts, faces, mat, smooth=None):
        b = len(self.v)
        self.v.extend(Vector(v) for v in verts)
        mi = self._m(mat)
        for i, f in enumerate(faces):
            self.f.append([b + k for k in f])
            self.mi.append(mi)
            self.sm.append(bool(smooth[i]) if smooth else False)
        return self

    def box(self, x0, x1, y0, y1, z0, z1, mat):
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        return self.hexa(v, mat)

    def hexa(self, v, mat):
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.add(v, f, mat)

    def prism(self, pts, a0, a1, mat, axis="z", smooth_sides=False):
        """Extrusion d'un polygone 2D. axis='z': pts en (x,y); 'x': pts en (y,z)."""
        pts = clean_poly(pts)
        n = len(pts)

        def P(p, a):
            if axis == "z":
                return (p[0], p[1], a)
            if axis == "x":
                return (a, p[0], p[1])
            return (p[0], a, p[1])

        v = [P(p, a0) for p in pts] + [P(p, a1) for p in pts]
        f = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
        f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        return self.add(v, f, mat, [False, False] + [smooth_sides] * n)

    def cyl(self, p0, p1, r, mat, seg=16, r1=None, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        ax = (p1 - p0).normalized()
        u = ax.orthogonal().normalized()
        w = ax.cross(u)
        r1 = r if r1 is None else r1
        v = []
        for rad, base in ((r, p0), (r1, p1)):
            for i in range(seg):
                a = 2 * math.pi * i / seg
                v.append(base + (u * math.cos(a) + w * math.sin(a)) * rad)
        f = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)]
        sm = [True] * seg
        if caps:
            f += [tuple(reversed(range(seg))), tuple(range(seg, 2 * seg))]
            sm += [False, False]
        return self.add(v, f, mat, sm)

    def sphere(self, c, r, mat, seg=16, rings=8, sz=1.0):
        c = Vector(c)
        v = [c + Vector((0, 0, -r * sz))]
        for j in range(1, rings):
            t = math.pi * j / rings - math.pi / 2
            for i in range(seg):
                a = 2 * math.pi * i / seg
                v.append(c + Vector((r * math.cos(t) * math.cos(a), r * math.cos(t) * math.sin(a),
                                     r * sz * math.sin(t))))
        v.append(c + Vector((0, 0, r * sz)))
        top = len(v) - 1
        f = []
        for i in range(seg):
            f.append((0, 1 + (i + 1) % seg, 1 + i))
        for j in range(rings - 2):
            b0, b1 = 1 + j * seg, 1 + (j + 1) * seg
            for i in range(seg):
                f.append((b0 + i, b0 + (i + 1) % seg, b1 + (i + 1) % seg, b1 + i))
        b = 1 + (rings - 2) * seg
        for i in range(seg):
            f.append((b + i, b + (i + 1) % seg, top))
        return self.add(v, f, mat, [True] * len(f))

    def sweep(self, pts, width, z0, z1, mat, closed=False, smooth=True):
        """Bande de section rectangulaire le long d'une polyligne XY (vers la gauche)."""
        inner = offset_path(pts, width, closed)
        n = len(pts)
        v = []
        for p, q in zip(pts, inner):
            v += [(p[0], p[1], z0), (q[0], q[1], z0), (q[0], q[1], z1), (p[0], p[1], z1)]
        f, sm = [], []
        m = n if closed else n - 1
        for i in range(m):
            a, b = 4 * i, 4 * ((i + 1) % n)
            for k in range(4):
                f.append((a + k, a + (k + 1) % 4, b + (k + 1) % 4, b + k))
                sm.append(smooth and k in (1, 3))
        if not closed:
            f += [(0, 1, 2, 3), (4 * (n - 1) + 3, 4 * (n - 1) + 2, 4 * (n - 1) + 1, 4 * (n - 1))]
            sm += [False, False]
        return self.add(v, f, mat, sm)

    def mesh(self, name, origin=(0, 0, 0)):
        o = Vector(origin)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v - o) for v in self.v], [], self.f)
        for m in self.mats:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", self.mi)
        me.polygons.foreach_set("use_smooth", self.sm)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
        return me


def offset_path(pts, d, closed=False):
    """Décale une polyligne vers sa gauche (vers l'intérieur pour un contour anti-horaire)."""
    n = len(pts)
    P = [Vector((p[0], p[1])) for p in pts]

    def left(a, b):
        t = (b - a).normalized()
        return Vector((-t.y, t.x))

    out = []
    for i in range(n):
        if closed:
            n1 = left(P[i - 1], P[i])
            n2 = left(P[i], P[(i + 1) % n])
        else:
            n1 = left(P[i - 1], P[i]) if i > 0 else left(P[0], P[1])
            n2 = left(P[i], P[i + 1]) if i < n - 1 else left(P[n - 2], P[n - 1])
        m = (n1 + n2) / max(0.2, 1 + n1.dot(n2))
        out.append(P[i] + m * d)
    return [(p.x, p.y) for p in out]


def clip_poly_y(pts, y0, keep_above=True):
    """Découpe d'un polygone par la droite y = y0 (Sutherland-Hodgman)."""
    def inside(p):
        return p[1] >= y0 if keep_above else p[1] <= y0

    out = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        ia, ib = inside(a), inside(b)
        if ia:
            out.append(a)
        if ia != ib:
            t = (y0 - a[1]) / (b[1] - a[1])
            out.append((a[0] + t * (b[0] - a[0]), y0))
    return out


def point_in_poly(p, poly):
    x, y = p
    c = False
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def max_y_at(poly, x):
    ys = []
    n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (x1 - x) * (x2 - x) <= 0 and x1 != x2:
            ys.append(y1 + (x - x1) * (y2 - y1) / (x2 - x1))
    return max(ys) if ys else None


def ray_to_edge(poly, start, direction, step=0.005):
    p = Vector(start)
    d = Vector(direction).normalized()
    last = p.copy()
    for _ in range(2000):
        p = p + d * step
        if not point_in_poly((p.x, p.y), poly):
            return last
        last = p.copy()
    return last


def clip_segment(poly, a, b, steps=400):
    a, b = Vector(a), Vector(b)
    ins = [t / steps for t in range(steps + 1) if point_in_poly(tuple(a.lerp(b, t / steps)), poly)]
    if not ins:
        return None
    return a.lerp(b, ins[0]), a.lerp(b, ins[-1])


def bezier(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        out.append(tuple(mt ** 3 * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t ** 3 * d
                         for a, b, c, d in zip(p0, p1, p2, p3)))
    return out


def rim_path():
    """Contour extérieur de la ceinture, ouvert à l'avant (sens anti-horaire)."""
    pts = [(RIM_X, RIM_FRONT), (RIM_X, 0.45), (RIM_X, 0.55)]
    pts += bezier((RIM_X, 0.95), (RIM_X, 1.30), (0.0, 1.25), (-0.12, 1.70), 30)
    pts += bezier((-0.12, 1.70), (-0.18, 1.95), (-RIM_X, 1.97), (-RIM_X, 1.65), 20)[1:]
    pts += [(-RIM_X, 1.1), (-RIM_X, 0.45), (-RIM_X, RIM_FRONT)]
    return clean_poly(pts)


# =============================================================================
# Scène, collections, matériaux
# =============================================================================

def reset_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                 bpy.data.cameras, bpy.data.lights, bpy.data.actions, bpy.data.collections):
        for b in list(coll):
            coll.remove(b)
    for w in list(bpy.data.worlds):
        bpy.data.worlds.remove(w)


COLLS = {}


def coll(name, parent=None):
    if name in COLLS:
        return COLLS[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    COLLS[name] = c
    return c


def set_input(node, names, value):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def material(name, color, rough=0.5, metal=0.0, coat=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    set_input(bsdf, ["Base Color"], (*color, 1.0))
    set_input(bsdf, ["Roughness"], rough)
    set_input(bsdf, ["Metallic"], metal)
    set_input(bsdf, ["Coat Weight", "Clearcoat"], coat)
    if coat:
        set_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.03)
    if emit:
        set_input(bsdf, ["Emission Color", "Emission"], (*color, 1.0))
        set_input(bsdf, ["Emission Strength"], emit)
    m.diffuse_color = (*color, 1.0)
    m.metallic = metal
    m.roughness = rough
    return m


M = {}


def make_materials():
    M["laque"] = material("Laque noire", (0.006, 0.006, 0.008), 0.25, coat=0.5)
    M["ivoire"] = material("Ivoire (touches blanches)", (0.90, 0.88, 0.82), 0.25)
    M["ebene"] = material("Ébène (touches noires)", (0.012, 0.012, 0.012), 0.30)
    M["bois"] = material("Charme (bois de mécanique)", (0.66, 0.47, 0.28), 0.55)
    M["tilleul"] = material("Tilleul (bois des touches)", (0.86, 0.76, 0.58), 0.6)
    M["epicea"] = material("Épicéa (table d'harmonie)", (0.86, 0.68, 0.38), 0.4)
    M["erable"] = material("Érable (chevalet, sommier)", (0.55, 0.33, 0.16), 0.45)
    M["feutre"] = material("Feutre de marteau", (0.92, 0.90, 0.84), 1.0)
    M["feutre_rouge"] = material("Feutre rouge", (0.55, 0.04, 0.06), 1.0)
    M["feutre_gris"] = material("Feutre d'étouffoir", (0.30, 0.30, 0.32), 1.0)
    M["cuir"] = material("Peau (rouleau)", (0.72, 0.58, 0.40), 0.8)
    M["fonte"] = material("Fonte dorée (cadre)", (0.80, 0.60, 0.25), 0.35, metal=1.0)
    M["acier"] = material("Acier (cordes, chevilles)", (0.80, 0.80, 0.83), 0.18, metal=1.0)
    M["cuivre"] = material("Cuivre (cordes filées)", (0.85, 0.42, 0.22), 0.30, metal=1.0)
    M["laiton"] = material("Laiton (pédales)", (0.92, 0.72, 0.35), 0.15, metal=1.0)
    M["sol"] = material("Sol", (0.30, 0.30, 0.32), 0.75)
    M["texte"] = material("Étiquettes", (0.02, 0.02, 0.03), 0.6)
    M["repere"] = material("Repères numérotés", (0.75, 0.05, 0.05), 0.5)
    M["texte_clair"] = material("Étiquettes claires", (0.95, 0.95, 0.95), 0.5, emit=0.6)


def obj(name, data, collection, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, data)
    collection.objects.link(o)
    o.location = loc
    if parent:
        o.parent = parent
    return o


def empty(name, collection, parent=None, loc=(0, 0, 0), size=0.1, kind="PLAIN_AXES"):
    o = obj(name, None, collection, parent, loc)
    o.empty_display_type = kind
    o.empty_display_size = size
    return o


def driver(target, path, index, expr, variables):
    """variables : liste de (nom, objet, chemin de propriété)."""
    fc = target.driver_add(path, index) if index is not None else target.driver_add(path)
    d = fc.driver
    d.type = "SCRIPTED"
    for name, idobj, dp in variables:
        v = d.variables.new()
        v.name = name
        v.type = "SINGLE_PROP"
        v.targets[0].id_type = "OBJECT"
        v.targets[0].id = idobj
        v.targets[0].data_path = dp
    d.expression = expr
    return fc


def smooth_window(var, delay, dur):
    t = "max(0,min(1,({}-{:.3f})/{:.3f}))".format(var, delay, dur)
    return "({t})*({t})*(3-2*({t}))".format(t=t)


def label(text, collection, parent, loc, size, rot=None, cam=None):
    cu = bpy.data.curves.new("Etiquette_" + text[:20], "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "BOTTOM"
    cu.extrude = size * 0.02
    cu.materials.append(M["texte"])
    o = obj("Étiquette - " + text, cu, collection, parent, loc)
    if rot is not None:
        o.rotation_euler = rot
    if cam is not None:
        c = o.constraints.new("TRACK_TO")
        c.target = cam
        c.track_axis = "TRACK_Z"
        c.up_axis = "UP_Y"
    return o


def visibility_driver(o, ctrl, prop, start=0.6, speed=4.0):
    for i in range(3):
        driver(o, "scale", i, "max(0,min(1,(e-{:.2f})*{:.1f}))".format(start, speed),
               [("e", ctrl, '["{}"]'.format(prop))])


# =============================================================================
# Pièces de la mécanique (une note). Géométrie en absolu (x centré sur la note),
# puis ramenée à l'axe de rotation de la pièce par MB.mesh(origin=...).
# =============================================================================

def Z(z):
    return KB + z


def pivot(p, x=0.0):
    return (x, p[0], Z(p[1]))


def key_layout():
    notes = []
    wi = 0
    for n in range(N_KEYS):
        midi = 21 + n
        pc = midi % 12
        d = {"n": n, "midi": midi, "pc": pc, "black": pc in BLACK_PC,
             "name": "{}{}".format(NOTE_NAMES[pc], midi // 12 - 1)}
        if d["black"]:
            d["cx"] = X0 + wi * WHITE_W + BLACK_OFFSET[pc]
        else:
            d["w"] = wi
            d["xl"], d["xr"] = X0 + wi * WHITE_W, X0 + (wi + 1) * WHITE_W
            d["cx"] = (d["xl"] + d["xr"]) / 2
            wi += 1
        notes.append(d)
    return notes


def mb_key(notes, n, with_capstan=True):
    d = notes[n]
    mb = MB()
    x = xa(n)
    g = 0.0005
    if not d["black"]:
        xl, xr = d["xl"] + g, d["xr"] - g
        tl, tr = xl, xr
        if n > 0 and notes[n - 1]["black"]:
            tl = notes[n - 1]["cx"] + BLACK_W / 2 + 0.0012
        if n < N_KEYS - 1 and notes[n + 1]["black"]:
            tr = notes[n + 1]["cx"] - BLACK_W / 2 - 0.0012
        foot = [(xl, 0.0), (xr, 0.0), (xr, BLACK_Y0), (tr, BLACK_Y0), (tr, WHITE_LEN),
                (tl, WHITE_LEN), (tl, BLACK_Y0), (xl, BLACK_Y0)]
        mb.prism(foot, Z(KEY_Z0), Z(KEY_Z1), M["tilleul"])
        mb.prism(foot, Z(KEY_Z1), Z(WHITE_TOP), M["ivoire"])
        mb.box(xl, xr, -0.002, 0.0, Z(0.022), Z(WHITE_TOP), M["ivoire"])
        stick_y0 = WHITE_LEN - 0.006
        sx0 = min(max(x, tl + 0.0057), tr - 0.0057)
        mb.box(sx0 - 0.0045, sx0 + 0.0045, BLACK_Y0, WHITE_LEN, Z(KEY_Z0), Z(KEY_Z1), M["tilleul"])
    else:
        c = d["cx"]
        mb.box(c - 0.0045, c + 0.0045, BLACK_Y0, WHITE_LEN, Z(KEY_Z0), Z(KEY_Z1), M["tilleul"])
        h0, h1 = BLACK_W / 2, 0.0048
        mb.hexa([(c - h0, BLACK_Y0, Z(KEY_Z1)), (c + h0, BLACK_Y0, Z(KEY_Z1)),
                 (c + h0, BLACK_Y1, Z(KEY_Z1)), (c - h0, BLACK_Y1, Z(KEY_Z1)),
                 (c - h1, BLACK_Y0 + 0.008, Z(BLACK_TOP)), (c + h1, BLACK_Y0 + 0.008, Z(BLACK_TOP)),
                 (c + h1, BLACK_Y1 - 0.002, Z(BLACK_TOP)), (c - h1, BLACK_Y1 - 0.002, Z(BLACK_TOP))],
                M["ebene"])
        stick_y0 = WHITE_LEN - 0.006
    # Corps de la touche jusqu'à la queue, avec le contrepoids en plomb
    mb.box(x - 0.0057, x + 0.0057, stick_y0, KEY_LEN, Z(KEY_Z0), Z(KEY_Z1), M["tilleul"])
    mb.cyl((x - 0.0058, 0.09 if d["black"] else 0.07, Z(0.022)),
           (x + 0.0058, 0.09 if d["black"] else 0.07, Z(0.022)), 0.005, M["acier"], seg=10)
    if with_capstan:
        mb.cyl((x, CAP_Y, Z(KEY_Z1)), (x, CAP_Y, Z(CAP_TOP)), 0.0045, M["laiton"], seg=12)
    return mb


def mb_capstan():
    return MB().cyl((0, CAP_Y, Z(KEY_Z1)), (0, CAP_Y, Z(CAP_TOP)), 0.0045, M["laiton"], seg=12)


def mb_wippen():
    mb = MB()
    poly = [(0.312, 0.062), (0.335, 0.055), (0.375, 0.050), (0.448, 0.050),
            (0.448, 0.064), (0.335, 0.068), (0.318, 0.079), (0.312, 0.074)]
    mb.prism([(y, Z(z)) for y, z in poly], -0.0052, 0.0052, M["bois"], axis="x")
    mb.cyl((-0.0053, P_WIP[0], Z(P_WIP[1])), (0.0053, P_WIP[0], Z(P_WIP[1])), 0.0045,
           M["bois"], seg=12)
    # coussin de feutre sur le pilote
    mb.box(-0.0045, 0.0045, CAP_Y - 0.008, CAP_Y + 0.008, Z(0.0485), Z(0.0505), M["feutre_rouge"])
    return mb


def mb_jack():
    mb = MB()
    poly = [(0.402, 0.064), (0.420, 0.064), (0.420, 0.1095), (0.411, 0.1095),
            (0.411, 0.072), (0.402, 0.072)]
    mb.prism([(y, Z(z)) for y, z in poly], -0.0035, 0.0035, M["bois"], axis="x")
    return mb


def mb_repetition():
    mb = MB()
    mb.box(-0.0052, 0.0052, 0.379, 0.391, Z(0.064), Z(0.096), M["bois"])  # support
    mb.box(-0.0052, 0.0052, 0.360, 0.404, Z(0.096), Z(0.1045), M["bois"])
    for s in (-1, 1):  # fourche autour de l'échappement
        mb.box(s * 0.0037, s * 0.0052, 0.404, 0.452, Z(0.096), Z(0.1045), M["bois"])
    mb.box(-0.0052, 0.0052, 0.440, 0.452, Z(0.096), Z(0.1045), M["bois"])
    mb.cyl((-0.0053, 0.385, Z(0.0975)), (0.0053, 0.385, Z(0.0975)), 0.004, M["bois"], seg=10)
    return mb


def mb_hammer(head=True, shank=True):
    mb = MB()
    if shank:
        mb.cyl((0, P_HAM[0] - 0.002, Z(P_HAM[1])), (0, 0.488, Z(P_HAM[1])), 0.0035, M["bois"], seg=10)
        mb.cyl((-0.0045, P_HAM[0], Z(P_HAM[1])), (0.0045, P_HAM[0], Z(P_HAM[1])), 0.0062,
               M["bois"], seg=14)
        ky, kz, kr = KNUCKLE
        mb.cyl((-0.004, ky, Z(kz)), (0.004, ky, Z(kz)), kr, M["cuir"], seg=16)
    if head:
        mb.box(-0.0055, 0.0055, 0.484, 0.506, Z(P_HAM[1] - 0.004), Z(0.141), M["bois"])
        mb.prism([(y, Z(z)) for y, z in HAMMER_FELT], -0.006, 0.006, M["feutre"], axis="x",
                 smooth_sides=True)
        under = [(y, Z(z)) for y, z in [(0.486, 0.141), (0.504, 0.141), (0.503, 0.160),
                                        (0.495, 0.168), (0.487, 0.160)]]
        mb.prism(under, -0.0062, 0.0062, M["feutre_rouge"], axis="x")
    return mb


def mb_damper_lever():
    mb = MB()
    poly = [(0.452, 0.045), (0.625, 0.050), (0.632, 0.058), (0.625, 0.066), (0.540, 0.0605),
            (0.452, 0.055)]
    mb.prism([(y, Z(z)) for y, z in poly], -0.0047, 0.0047, M["bois"], axis="x")
    mb.box(-0.0047, 0.0047, 0.452, 0.470, Z(KEY_Z1), Z(0.045), M["feutre_rouge"])
    mb.cyl((-0.0048, P_DL[0], Z(P_DL[1])), (0.0048, P_DL[0], Z(P_DL[1])), 0.004, M["bois"], seg=10)
    return mb


def damper_rest_z(n):
    """Dessous du feutre d'étouffoir (posé sur les cordes)."""
    return ZS + 2 * string_radius(n)


def mb_damper(n):
    """Tige + tête d'étouffoir, origine = dessous du feutre."""
    mb = MB()
    z0 = damper_rest_z(n)
    mb.cyl((0, DW_Y, Z(0.0605)), (0, DW_Y, z0 + 0.012), 0.0012, M["acier"], seg=8)
    mb.box(-0.0058, 0.0058, DW_Y - 0.012, DW_Y + 0.012, z0 + 0.008, z0 + 0.030, M["bois"])
    mb.box(-0.006, 0.006, DW_Y - 0.010, DW_Y + 0.010, z0, z0 + 0.008, M["feutre_gris"])
    return mb


def mb_strings_segment(n, y0, y1, xoff=0.0):
    mb = MB()
    r = string_radius(n)
    mat = M["cuivre"] if n < 28 else M["acier"]
    for sx in string_xs(n):
        x = sx - xa(n) + xoff
        mb.cyl((x, y0, ZS + r), (x, y1, ZS + r), r, mat, seg=8, caps=False)
    return mb


def mb_action_frame(x0, x1, brackets):
    mb = MB()
    mb.box(x0, x1, 0.305, 0.335, Z(0.080), Z(0.098), M["bois"])        # barre des bascules
    mb.box(x0, x1, 0.368, 0.402, Z(0.137), Z(0.157), M["bois"])        # barre des fourches
    mb.box(x0, x1, 0.455, 0.472, Z(0.100), Z(0.119), M["bois"])        # barre d'appui des marteaux
    mb.box(x0, x1, 0.455, 0.472, Z(0.119), Z(0.1215), M["feutre_rouge"])
    mb.box(x0, x1, 0.300, 0.480, Z(0.000), Z(0.010), M["bois"])        # semelle de mécanique
    bracket = [(0.300, 0.010), (0.480, 0.010), (0.480, 0.100), (0.430, 0.157),
               (0.360, 0.157), (0.300, 0.100)]
    for bx in brackets:
        mb.prism([(y, Z(z)) for y, z in bracket], bx - 0.001, bx + 0.001, M["fonte"], axis="x")
    return mb


def mb_flanges(x):
    mb = MB()
    mb.box(x - 0.003, x + 0.003, 0.318, 0.332, Z(P_WIP[1]), Z(0.080), M["bois"])   # fourche bascule
    mb.box(x - 0.003, x + 0.003, 0.379, 0.391, Z(P_HAM[1]), Z(0.137), M["bois"])  # fourche marteau
    mb.cyl((x, 0.418, Z(0.098)), (x, 0.418, Z(0.120)), 0.0018, M["acier"], seg=6)  # vis de réglage
    return mb


def mb_key_frame(x0, x1):
    mb = MB()
    mb.box(x0, x1, 0.004, 0.022, Z(0.0), Z(0.008), M["bois"])
    mb.box(x0, x1, 0.004, 0.022, Z(0.008), Z(0.010), M["feutre_rouge"])
    mb.box(x0, x1, BAL_Y - 0.009, BAL_Y + 0.009, Z(0.0), Z(KEY_Z0 - 0.002), M["bois"])
    mb.box(x0, x1, BAL_Y - 0.006, BAL_Y + 0.006, Z(KEY_Z0 - 0.002), Z(KEY_Z0), M["feutre_rouge"])
    mb.box(x0, x1, 0.430, 0.470, Z(0.0), Z(0.006), M["bois"])
    mb.box(x0, x1, 0.430, 0.470, Z(0.006), Z(KEY_Z0), M["feutre_rouge"])
    mb.box(x0, x1, 0.0, 0.47, Z(-0.004), Z(0.0), M["bois"])
    return mb


def mb_damper_rail(x0, x1):
    mb = MB()
    mb.box(x0, x1, 0.600, 0.640, Z(0.0), Z(0.038), M["bois"])
    mb.box(x0, x1, DW_Y - 0.014, DW_Y + 0.014, Z(Z_STRIKE - 0.055), Z(Z_STRIKE - 0.043), M["bois"])
    return mb


def mb_damper_flange(x):
    return MB().box(x - 0.003, x + 0.003, 0.612, 0.628, Z(0.038), Z(P_DL[1]), M["bois"])


# =============================================================================
# Piano
# =============================================================================

def build_piano(ctrl, root, cam):
    notes = key_layout()
    rim_out = rim_path()
    rim_closed = rim_out[:]                       # fermé par l'avant (y = RIM_FRONT)
    inner = offset_path(rim_closed, RIM_T, closed=True)
    hitch_poly = offset_path(rim_closed, RIM_T + 0.075, closed=True)
    strut_poly = offset_path(rim_closed, RIM_T + 0.06, closed=True)

    labels = coll("Étiquettes", root)
    groups = {}
    G = [  # nom, collection, décalage éclaté, retard
        ("Caisse", (0, 0, 0), 0.0),
        ("Couvercle", (0, 0.25, 1.0), 0.0),
        ("Pupitre", (0, -0.35, 0.5), 0.05),
        ("Cadre en fonte", (0, 0, 0.80), 0.12),
        ("Sommier", (0, 0, 0.62), 0.20),
        ("Cordes", (0, 0, 0.45), 0.26),
        ("Table d'harmonie", (0, 0, 0.20), 0.32),
        ("Étouffoirs", (0, -0.75, 0.50), 0.30),
        ("Marteaux", (0, -0.75, 0.30), 0.36),
        ("Mécanique", (0, -0.75, 0.10), 0.42),
        ("Clavier", (0, -1.15, -0.08), 0.46),
        ("Lyre et pédales", (0, -0.55, 0), 0.50),
        ("Pied avant gauche", (-0.30, -0.15, 0), 0.55),
        ("Pied avant droit", (0.30, -0.15, 0), 0.55),
        ("Pied arrière", (-0.15, 0.35, 0), 0.55),
    ]
    for name, off, delay in G:
        c = coll(name, root)
        e = empty("GROUPE_" + name, c, None, (0, 0, 0), 0.15)
        for i in range(3):
            if off[i]:
                driver(e, "location", i, "{:.3f}*{}".format(off[i], smooth_window("e", delay, 0.45)),
                       [("e", ctrl, '["explosion"]')])
        groups[name] = (c, e)

    def put(mb, name, group, origin=(0, 0, 0)):
        c, e = groups[group]
        return obj(name, mb.mesh(name, origin), c, e, origin)

    # ---------------------------------------------------------------- Caisse
    mb = MB()
    mb.sweep(rim_out, RIM_T, RIM_Z0, RIM_Z1, M["laque"])
    mb.box(-RIM_X, RIM_X, -0.022, SB_Y0 - 0.005, KB - 0.03, KB, M["laque"])      # fond de clavier
    mb.box(-RIM_X, RIM_X, SB_Y0 - 0.01, 0.70, RIM_Z0, ZS - 0.045, M["laque"])     # sommier de table
    for s in (-1, 1):
        mb.box(min(s * RIM_X, s * 0.6115), max(s * RIM_X, s * 0.6115), -0.022, RIM_FRONT,
               RIM_Z0, KB + 0.10, M["laque"])                                    # joues
    mb.box(-0.6115, 0.6115, -0.022, -0.003, KB - 0.025, KB + 0.03, M["laque"])     # liteau
    fall = [(0.150, KB + 0.056), (0.168, KB + 0.056), (0.208, KB + 0.14), (0.190, KB + 0.14)]
    mb.prism(fall, -0.6115, 0.6115, M["laque"], axis="x")                        # cylindre
    for a, b in [((-0.55, 0.70), (-0.55, 1.9)), ((0.0, 0.70), (-0.45, 1.9)), ((0.5, 0.70), (0.0, 1.4))]:
        seg = clip_segment(inner, a, b)
        if seg:
            p, q = seg
            d = (q - p).normalized()
            nrm = Vector((-d.y, d.x)) * 0.03
            v = [(p - nrm).to_3d(), (p + nrm).to_3d(), (q + nrm).to_3d(), (q - nrm).to_3d()]
            mb.hexa([(u.x, u.y, RIM_Z0) for u in v] + [(u.x, u.y, RIM_Z0 + 0.07) for u in v],
                    M["laque"])                                                  # barrages
    put(mb, "Ceinture et caisse", "Caisse")

    # ------------------------------------------------------------- Couvercle
    c, e = groups["Couvercle"]
    hinge = Vector((-RIM_X, 0.0, RIM_Z1))
    lid = MB()
    lid_pts = [(x + RIM_X, y) for x, y in clip_poly_y(rim_closed, 0.45)]
    lid.prism(lid_pts, 0.0, 0.02, M["laque"])
    lid.box(0.0, 2 * RIM_X, 0.45, 0.74, 0.02, 0.038, M["laque"])                    # abattant replié
    for y in (0.6, 1.1, 1.5):
        lid.cyl((-0.006, y - 0.04, 0.01), (-0.006, y + 0.04, 0.01), 0.008, M["laiton"], seg=10)
    lid_o = obj("Couvercle", lid.mesh("Couvercle"), c, e, hinge)
    lid_o.rotation_euler = (0, -LID_OPEN, 0)
    base = Vector((RIM_X - 0.022, 0.82, RIM_Z1))
    d = 1.40
    top = hinge + Vector((d * math.cos(LID_OPEN), 0.82, d * math.sin(LID_OPEN)))
    prop = MB().cyl(base, top, 0.011, M["laque"], seg=12, r1=0.008)
    obj("Béquille", prop.mesh("Béquille"), c, e)

    # ---------------------------------------------------------------- Pupitre
    desk = MB()
    sl = [(0.300, RIM_Z1 + 0.012), (0.318, RIM_Z1 + 0.012), (0.388, RIM_Z1 + 0.30), (0.370, RIM_Z1 + 0.30)]
    desk.prism(sl, -0.36, 0.36, M["laque"], axis="x")
    desk.box(-0.36, 0.36, 0.275, 0.318, RIM_Z1 + 0.002, RIM_Z1 + 0.016, M["laque"])
    desk.box(-0.36, 0.36, 0.275, 0.283, RIM_Z1 + 0.016, RIM_Z1 + 0.04, M["laque"])
    for x in (-0.3, 0.3):
        desk.box(x - 0.02, x + 0.02, 0.28, 0.33, ZS + 0.026, RIM_Z1 + 0.002, M["laque"])
    put(desk, "Pupitre", "Pupitre")

    # ---------------------------------------------------------- Cadre en fonte
    PL0, PL1 = ZS + 0.010, ZS + 0.026
    pl = MB()
    pl.box(-RIM_X + RIM_T, RIM_X - RIM_T, 0.18, 0.45, PL0, PL1, M["fonte"])        # barre de capo
    band = [p for p in offset_path(rim_out, RIM_T) if p[1] >= 0.40]
    pl.sweep(band, 0.11, PL0, PL1, M["fonte"])
    pl.box(-RIM_X + RIM_T, RIM_X - RIM_T, 0.625, 0.665, PL0, PL1, M["fonte"])
    for sx, tgt in [(-0.45, (-0.62, 1.75)), (-0.15, (-0.42, 1.95)), (0.18, (-0.05, 1.6)),
                    (0.48, (0.40, 1.4))]:
        p = Vector((sx, 0.645))
        q = ray_to_edge(strut_poly, p + Vector((0, 0.03)), Vector(tgt) - p)
        dd = (q - p).normalized()
        nrm = Vector((-dd.y, dd.x)) * 0.018
        v = [p - nrm, p + nrm, q + nrm, q - nrm]
        pl.hexa([(u.x, u.y, PL0) for u in v] + [(u.x, u.y, PL1) for u in v], M["fonte"])
    for x in (-0.48, -0.16, 0.16, 0.48):
        pl.cyl((x, 0.315, PL1), (x, 0.315, PL1 + 0.004), 0.03, M["fonte"], seg=24)  # rosaces
    # chevilles et pointes d'accroche
    for n in range(N_KEYS):
        for k, sx in enumerate(string_xs(n)):
            py = 0.225 + 0.045 * k + 0.022 * (n % 2)
            pl.cyl((sx, py, ZS - 0.030), (sx, py, PL1 + 0.045), 0.0032, M["acier"], seg=8, caps=False)
            pl.cyl((sx, py, PL1 + 0.045), (sx, py, PL1 + 0.047), 0.0032, M["acier"], seg=8)
            hy = max_y_at(hitch_poly, sx) or 1.0
            pl.cyl((sx, hy, ZS - 0.003), (sx, hy, PL0), 0.0018, M["acier"], seg=6)
    put(pl, "Cadre en fonte", "Cadre en fonte")

    # ---------------------------------------------------------------- Sommier
    sm = MB().box(-RIM_X + RIM_T, RIM_X - RIM_T, 0.18, 0.45, ZS - 0.034, ZS - 0.004, M["erable"])
    put(sm, "Sommier", "Sommier")

    # ------------------------------------------------------------------ Cordes
    st_steel, st_copper = MB(), MB()
    for n in range(N_KEYS):
        r = string_radius(n)
        target = st_copper if n < 28 else st_steel
        for k, sx in enumerate(string_xs(n)):
            py = 0.225 + 0.045 * k + 0.022 * (n % 2)
            hy = max_y_at(hitch_poly, sx) or 1.0
            target.cyl((sx, py, ZS + r), (sx, hy, ZS + r), r, M["cuivre"] if n < 28 else M["acier"],
                       seg=6, caps=False)
            if n < 28:  # âme acier visible aux extrémités
                st_steel.cyl((sx, py - 0.003, ZS + r), (sx, py + 0.03, ZS + r), 0.0007, M["acier"],
                             seg=6, caps=False)
    put(st_steel, "Cordes acier", "Cordes")
    put(st_copper, "Cordes filées", "Cordes")

    # ------------------------------------------------------- Table d'harmonie
    sb_poly = clip_poly_y(inner, SB_Y0)
    zsb1 = ZS - 0.031
    tb = MB()
    tb.prism(sb_poly, zsb1 - 0.009, zsb1, M["epicea"])
    bridge = []
    for n in range(N_KEYS):
        hy = max_y_at(hitch_poly, xa(n)) or 1.0
        speak = 0.055 * 2 ** ((87 - n) / 12 * 0.92)
        bridge.append((xa(n), max(0.73, min(hy - 0.075, 0.49 + speak))))
    bridge = [(bridge[0][0] - 0.01, bridge[0][1])] + bridge + [(bridge[-1][0] + 0.01, bridge[-1][1])]
    tb.sweep(list(reversed(bridge)), 0.026, zsb1, ZS - 0.0003, M["erable"])
    for i in range(11):  # barrages (nervures) sous la table
        a = Vector((-0.95 + i * 0.22, 0.4))
        b = a + Vector((0.9, 1.4))
        seg = clip_segment(sb_poly, a, b)
        if seg:
            p, q = seg
            dd = (q - p).normalized()
            nrm = Vector((-dd.y, dd.x)) * 0.011
            v = [p - nrm, p + nrm, q + nrm, q - nrm]
            tb.hexa([(u.x, u.y, zsb1 - 0.026) for u in v] + [(u.x, u.y, zsb1 - 0.009) for u in v],
                    M["epicea"])
    put(tb, "Table d'harmonie et chevalet", "Table d'harmonie")

    # -------------------------------------------------------- Pieds et lyre
    for name, (x, y) in [("Pied avant gauche", (-0.63, 0.30)), ("Pied avant droit", (0.63, 0.30)),
                         ("Pied arrière", (-0.42, 1.55))]:
        lg = MB()
        lg.box(x - 0.075, x + 0.075, y - 0.075, y + 0.075, RIM_Z0 - 0.06, RIM_Z0, M["laque"])
        lg.cyl((x, y, 0.075), (x, y, RIM_Z0 - 0.06), 0.045, M["laque"], seg=24, r1=0.062)
        lg.cyl((x, y, 0.06), (x, y, 0.08), 0.05, M["laiton"], seg=24)
        lg.cyl((x - 0.015, y + 0.02, 0.032), (x + 0.015, y + 0.02, 0.032), 0.032, M["laiton"], seg=20)
        put(lg, name, name)

    ly = MB()
    for x in (-0.10, 0.10):
        ly.cyl((x, 0.42, 0.13), (x, 0.42, KB - 0.03), 0.022, M["laque"], seg=16, r1=0.03)
    ly.box(-0.15, 0.15, 0.36, 0.48, 0.07, 0.14, M["laque"])
    ly.box(-0.08, 0.08, 0.40, 0.44, 0.20, KB - 0.05, M["laque"])
    for x in (-0.06, 0.0, 0.06):
        ly.box(x - 0.016, x + 0.016, 0.22, 0.37, 0.088, 0.098, M["laiton"])
        ly.box(x - 0.021, x + 0.021, 0.20, 0.24, 0.086, 0.100, M["laiton"])
        ly.cyl((x * 0.5, 0.42, 0.14), (x * 0.5, 0.42, KB - 0.03), 0.004, M["acier"], seg=8)
    for s in (-1, 1):  # jambes de force
        ly.cyl((s * 0.12, 0.47, 0.12), (s * 0.12, 0.66, KB - 0.03), 0.009, M["laiton"], seg=8)
    put(ly, "Lyre et pédales", "Lyre et pédales")

    # ------------------------------------------------- Clavier et mécanique
    xmin, xmax = xa(0) - PITCH / 2, xa(N_KEYS - 1) + PITCH / 2
    put(mb_key_frame(xmin, xmax), "Cadre de clavier", "Clavier")
    put(mb_action_frame(xmin + 0.004, xmax - 0.004,
                        [xmin + 0.001, xa(21) + PITCH / 2, xa(43) + PITCH / 2, xa(65) + PITCH / 2,
                         xmax - 0.001]),
        "Cadre de mécanique", "Mécanique")
    flanges = MB()
    for n in range(N_KEYS):
        sub = mb_flanges(xa(n))
        flanges.add([tuple(v) for v in sub.v], sub.f, M["bois"])
    put(flanges, "Fourches", "Mécanique")
    put(mb_damper_rail(xmin, xa(DAMPER_LAST) + PITCH / 2), "Barres d'étouffoirs", "Étouffoirs")
    dfl = MB()
    for n in range(DAMPER_LAST + 1):
        sub = mb_damper_flange(xa(n))
        dfl.add([tuple(v) for v in sub.v], sub.f, M["bois"])
    put(dfl, "Fourches d'étouffoirs", "Étouffoirs")

    me_wip = mb_wippen().mesh("Bascule", pivot(P_WIP))
    me_jack = mb_jack().mesh("Échappement", pivot(P_JACK))
    me_rep = mb_repetition().mesh("Levier de répétition", pivot(P_WIP))
    me_ham = mb_hammer().mesh("Marteau", pivot(P_HAM))
    me_dl = mb_damper_lever().mesh("Levier d'étouffoir", pivot(P_DL))

    ck, ek = groups["Clavier"]
    cm, em = groups["Mécanique"]
    ch, eh = groups["Marteaux"]
    cd, ed = groups["Étouffoirs"]
    keys = []
    for d in notes:
        n = d["n"]
        x = xa(n)
        tag = "{:02d} {}".format(n + 1, d["name"])
        k = obj("Touche " + tag, mb_key(notes, n).mesh("Touche " + tag, pivot(P_KEY, x)), ck, ek,
                pivot(P_KEY, x))
        keys.append(k)
        kv = [("k", k, "rotation_euler[0]")]
        w = obj("Bascule " + tag, me_wip, cm, em, pivot(P_WIP, x))
        driver(w, "rotation_euler", 0, "k*{:.5f}".format(R_WIP), kv)
        j = obj("Échappement " + tag, me_jack, cm, w,
                (0, P_JACK[0] - P_WIP[0], P_JACK[1] - P_WIP[1]))
        driver(j, "rotation_euler", 0, "max(0,k-{:.6f})*{:.5f}".format(LETOFF * TH_MAX,
                                                                      JACK_TILT / ((1 - LETOFF) * TH_MAX)), kv)
        obj("Levier de répétition " + tag, me_rep, cm, w, (0, 0, 0))
        h = obj("Marteau " + tag, me_ham, ch, eh, pivot(P_HAM, x))
        driver(h, "rotation_euler", 0, "k*{:.5f}".format(R_HAM), kv)
        if n <= DAMPER_LAST:
            dl = obj("Levier d'étouffoir " + tag, me_dl, cd, ed, pivot(P_DL, x))
            driver(dl, "rotation_euler", 0, "-k*{:.5f}".format(R_DL), kv)
            z0 = damper_rest_z(n)
            dh = obj("Étouffoir " + tag, mb_damper(n).mesh("Étouffoir " + tag, (0, DW_Y, z0)), cd, ed,
                     (x, DW_Y, z0))
            driver(dh, "location", 2, "{:.5f}+k*{:.5f}".format(z0, R_DW), kv)

    # -------------------------------------------------------------- Étiquettes
    L = [
        ("Caisse", "Ceinture (caisse)", (1.45, 0.25, 0.78)),
        ("Couvercle", "Couvercle et béquille", (1.45, 0.25, 1.30)),
        ("Cadre en fonte", "Cadre en fonte", (1.45, 0.25, 0.93)),
        ("Sommier", "Sommier (chevilles)", (1.45, 0.25, 0.85)),
        ("Cordes", "Cordes", (1.45, 0.25, 0.88)),
        ("Table d'harmonie", "Table d'harmonie et chevalet", (1.45, 0.25, 0.84)),
        ("Pupitre", "Pupitre", (-0.80, 0.35, 1.25)),
        ("Étouffoirs", "Étouffoirs", (-1.55, 0.54, 0.83)),
        ("Marteaux", "Marteaux", (-1.55, 0.45, 0.80)),
        ("Mécanique", "Mécanique (bascules, échappements)", (-1.55, 0.40, 0.73)),
        ("Clavier", "Clavier (88 touches)", (-1.55, 0.15, 0.72)),
        ("Lyre et pédales", "Lyre et pédales", (-0.65, 0.40, 0.12)),
    ]
    for g, text, pos in L:
        lb = label(text, labels, groups[g][1], pos, 0.075, cam=cam)
        lb.data.materials[0] = M["texte_clair"]
        visibility_driver(lb, ctrl, "explosion", 0.55, 4.0)
    return keys


# =============================================================================
# Vitrine : une mécanique agrandie, éclatée pièce par pièce
# =============================================================================

def build_showcase(ctrl, root, notes):
    """Mécanique de la note Do4 agrandie ×3 ; chaque pièce a sa propre trajectoire
    d'éclatement, un repère numéroté et une ligne dans la légende."""
    n = 39  # Do4 (Do central)
    c = coll("Vitrine mécanique (×3)", root)
    base = empty("VITRINE_Mecanique", c, None, SHOWCASE_LOC, 0.3)
    base.rotation_euler = (0, 0, math.radians(-90))
    base.scale = (3, 3, 3)
    text_rot = (Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X")).to_euler()
    a = [("a", ctrl, '["appui_demo"]')]
    th = "a*{:.6f}".format(TH_MAX)
    legend = []

    def explode_empty(name, off, delay):
        ex = empty("ÉCLATÉ_" + name, c, base, (0, 0, 0), 0.02)
        for i in range(3):
            if off[i]:
                driver(ex, "location", i, "{:.3f}*{}".format(off[i], smooth_window("e", delay, 0.5)),
                       [("e", ctrl, '["explosion_detail"]')])
        return ex

    def callout(text, ex, pos):
        legend.append(text)
        num = label(str(len(legend)), c, ex, pos, 0.022, rot=text_rot)
        num.data.materials[0] = M["repere"]
        visibility_driver(num, ctrl, "explosion_detail", 0.5, 3.0)

    def part(name, mb, pv, off, text, pos, delay, rot_expr=None, loc_z_expr=None):
        ex = explode_empty(name, off, delay)
        o = obj("Vitrine - " + name, mb.mesh("Vitrine - " + name, pv), c, ex, pv)
        if rot_expr:
            driver(o, "rotation_euler", 0, rot_expr, a)
        if loc_z_expr:
            driver(o, "location", 2, loc_z_expr, a)
        callout(text, ex, pos)
        return o

    k_mb = mb_key(notes, n, with_capstan=False)
    k_mb.v = [v - Vector((xa(n), 0, 0)) for v in k_mb.v]
    part("Touche", k_mb, pivot(P_KEY), (0, 0, -0.08), "Touche (bascule sur la barre d'équilibre)",
         (0, 0.10, Z(0.050)), 0.30, th)
    part("Pilote", mb_capstan(), pivot(P_KEY), (0, 0, -0.04), "Pilote (réglage de la bascule)",
         (0, CAP_Y - 0.03, Z(0.034)), 0.25, th)
    part("Cadre de clavier", mb_key_frame(-0.012, 0.012), (0, 0, 0), (0, 0, -0.13),
         "Cadre de clavier : barres avant, d'équilibre, arrière", (0, 0.06, Z(0.012)), 0.35)
    part("Bascule", mb_wippen(), pivot(P_WIP), (0, 0, 0), "Bascule (chevalet de mécanique)",
         (0, 0.31, Z(0.040)), 0.0, "{}*{:.5f}".format(th, R_WIP))

    # Échappement et levier de répétition : montés sur la bascule (porteur commun)
    for name, mb, pv, off, text, pos, delay in [
        ("Échappement", mb_jack(), pivot(P_JACK), (0, 0, 0.03), "Échappement (pousse le rouleau)",
         (0, 0.39, Z(0.10)), 0.08),
        ("Levier de répétition", mb_repetition(), pivot(P_WIP), (0, -0.10, 0.05),
         "Levier de répétition (double échappement)", (0, 0.345, Z(0.105)), 0.12),
    ]:
        ex = explode_empty(name, off, delay)
        carrier = empty("Porteur - " + name, c, ex, pivot(P_WIP), 0.01)
        driver(carrier, "rotation_euler", 0, "{}*{:.5f}".format(th, R_WIP), a)
        o = obj("Vitrine - " + name, mb.mesh("Vitrine - " + name, pv), c, carrier,
                Vector(pv) - Vector(pivot(P_WIP)))
        if name == "Échappement":
            driver(o, "rotation_euler", 0,
                   "max(0,a-{:.3f})*{:.5f}".format(LETOFF, JACK_TILT / (1 - LETOFF)), a)
        callout(text, ex, pos)

    part("Manche et rouleau", mb_hammer(head=False), pivot(P_HAM), (0, 0, 0.08),
         "Manche de marteau et rouleau", (0, 0.36, Z(0.135)), 0.16, "{}*{:.5f}".format(th, R_HAM))
    part("Tête de marteau", mb_hammer(shank=False), pivot(P_HAM), (0, 0, 0.12),
         "Tête de marteau (feutre)", (0, 0.465, Z(0.170)), 0.20, "{}*{:.5f}".format(th, R_HAM))
    fr = mb_action_frame(-0.012, 0.012, [])
    sub = mb_flanges(0.0)
    fr.add([tuple(v) for v in sub.v], sub.f, M["bois"])
    part("Cadre de mécanique", fr, (0, 0, 0), (0, -0.25, 0.0), "Cadre de mécanique, fourches, barre d'appui",
         (0, 0.29, Z(0.165)), 0.10)
    part("Levier d'étouffoir", mb_damper_lever(), pivot(P_DL), (0, 0.12, -0.02), "Levier d'étouffoir",
         (0, 0.48, Z(0.072)), 0.25, "-{}*{:.5f}".format(th, R_DL))
    z0 = damper_rest_z(n)
    part("Étouffoir", mb_damper(n), (0, DW_Y, z0), (0, 0.12, 0.10), "Étouffoir : tige, tête, feutre",
         (0, DW_Y - 0.03, z0 + 0.02), 0.05, None, "{:.5f}+{}*{:.5f}".format(z0, th, R_DW))
    dr = mb_damper_rail(-0.012, 0.012)
    sub = mb_damper_flange(0.0)
    dr.add([tuple(v) for v in sub.v], sub.f, M["bois"])
    part("Barres d'étouffoirs", dr, (0, 0, 0), (0, 0.25, -0.03), "Barre et guide d'étouffoirs",
         (0, 0.70, Z(0.10)), 0.30)
    part("Cordes", mb_strings_segment(n, 0.30, 0.86), (0, 0, 0), (0, 0, 0.20), "Cordes (3 par note)",
         (0, 0.29, ZS + 0.004), 0.0)

    # Titre et légende
    title = label("Mécanique de piano à queue à double échappement — note Do4, échelle ×3",
                  c, base, (0, 0.62, Z(0.48)), 0.024, rot=text_rot)
    visibility_driver(title, ctrl, "explosion_detail", 0.3, 3.0)
    body = "\n".join("{:>2}  {}".format(i + 1, t) for i, t in enumerate(legend))
    leg = label(body, c, base, (0, 0.92, Z(0.42)), 0.0165, rot=text_rot)
    leg.data.align_x = "LEFT"
    leg.data.align_y = "TOP"
    leg.name = "Légende de la vitrine"
    visibility_driver(leg, ctrl, "explosion_detail", 0.4, 3.0)
    return base


# =============================================================================
# Caméras, lumières, animation, interface
# =============================================================================

def look_at(o, target):
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def build_stage(root, ctrl):
    c = coll("Studio", root)
    # Fond de studio sans raccord (sol + gorge + mur)
    prof = [(-12.0, 0.0), (4.0, 0.0)]
    prof += [(4.0 + 2.0 * math.sin(t * math.pi / 32), 2.0 - 2.0 * math.cos(t * math.pi / 32)) for t in range(1, 17)]
    prof += [(6.0, 9.0)]
    v, f = [], []
    for i, (y, z) in enumerate(prof):
        v += [(-25.0, y, z), (30.0, y, z)]
        if i:
            f.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    sol = MB().add(v, f, M["sol"], [True] * len(f))
    obj("Fond de studio", sol.mesh("Fond de studio"), c)

    cam_d = bpy.data.cameras.new("Camera_Generale")
    cam_d.lens = 28
    cam = obj("Camera_Generale", cam_d, c, None, (-3.1, -4.4, 2.75))
    look_at(cam, (0.0, 0.05, 1.12))

    cam2_d = bpy.data.cameras.new("Camera_Mecanique")
    cam2_d.type = "ORTHO"
    cam2 = obj("Camera_Mecanique", cam2_d, c, None)
    cam2.rotation_euler = (math.radians(82), 0, math.radians(-10))
    # Le cadrage suit l'éclatement de la vitrine : serré quand elle est assemblée,
    # large quand elle est éclatée.
    view = cam2.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    near, far = Vector((4.19, 0.45, 0.99)) - 8 * view, Vector((4.85, 0.45, 1.15)) - 8 * view
    cam2.location = near
    cam2_d.ortho_scale = 2.9
    ease = smooth_window("e", 0.0, 1.0)
    ev = [("e", ctrl, '["explosion_detail"]')]
    for i in range(3):
        driver(cam2, "location", i, "{:.4f}+{:.4f}*{}".format(near[i], far[i] - near[i], ease), ev)
    driver(cam2_d, "ortho_scale", None, "2.9+1.2*{}".format(ease), ev)

    for name, kind, loc, energy, size, tgt in [
        ("Lumière principale", "AREA", (-2.5, -2.5, 4.0), 380, 3.0, (0.3, 0.5, 0.9)),
        ("Lumière d'appoint", "AREA", (2.0, -3.5, 2.5), 150, 4.0, (0.5, 0.5, 1.0)),
        ("Lumière vitrine", "AREA", (2.4, -1.2, 3.8), 320, 2.0, (4.8, 0.45, 1.1)),
        ("Contre-jour", "AREA", (1.5, 4.5, 3.5), 300, 3.0, (0.5, 0.5, 1.0)),
    ]:
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.size = size
        lo = obj(name, ld, c, None, loc)
        look_at(lo, tgt)
    sun = bpy.data.lights.new("Soleil", "SUN")
    sun.energy = 1.2
    sun.angle = math.radians(8)
    so = obj("Soleil", sun, c, None, (0, 0, 6))
    so.rotation_euler = (math.radians(35), math.radians(-20), math.radians(-30))

    world = bpy.data.worlds.new("Studio")
    if bpy.app.version < (5, 0, 0):
        world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.48, 0.49, 0.53, 1)
        bg.inputs[1].default_value = 0.35
    world.color = (0.48, 0.49, 0.53)
    bpy.context.scene.world = world
    return cam, cam2


def key_press(key, f, hold, amount=1.0):
    for frame, v in ((f, 0.0), (f + 2, amount), (f + 2 + hold, amount), (f + 5 + hold, 0.0)):
        key.rotation_euler[0] = v * TH_MAX
        key.keyframe_insert("rotation_euler", index=0, frame=frame)


def animate(ctrl, keys, cam, cam2):
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, 520
    sc.render.fps = 24

    # « Au clair de la lune » (main droite) + basses (main gauche)
    melody = [(60, 0, 4), (60, 6, 4), (60, 12, 4), (62, 18, 4), (64, 24, 10), (62, 36, 10),
              (60, 48, 4), (64, 54, 4), (62, 60, 4), (62, 66, 4), (60, 72, 16)]
    bass = [(48, 0, 16), (55, 0, 16), (43, 24, 16), (55, 24, 16), (48, 48, 16), (52, 48, 16),
            (43, 60, 10), (48, 72, 16), (55, 72, 16)]
    for start in (8, 175):
        for midi, t, dur in melody + bass:
            key_press(keys[midi - 21], start + t, dur)

    def kf(prop, pts):
        for f, v in pts:
            ctrl[prop] = v
            ctrl.keyframe_insert('["{}"]'.format(prop), frame=f)

    kf("explosion", [(1, 0.0), (95, 0.0), (165, 1.0), (265, 1.0), (330, 0.0)])
    kf("explosion_detail", [(1, 0.0), (345, 0.0), (395, 1.0), (490, 1.0), (515, 0.0)])
    pts = [(1, 0.0)]
    for f in (400, 425, 450, 470):
        pts += [(f, 0.0), (f + 5, 1.0), (f + 11, 1.0), (f + 17, 0.0)]
    kf("appui_demo", pts)

    m1 = sc.timeline_markers.new("Vue générale", frame=1)
    m1.camera = cam
    m2 = sc.timeline_markers.new("Vitrine mécanique", frame=335)
    m2.camera = cam2
    sc.camera = cam
    sc.frame_set(1)


PANEL_CODE = r'''
import bpy


class PIANO_OT_camera(bpy.types.Operator):
    bl_idname = "piano.camera"
    bl_label = "Caméra"
    nom: bpy.props.StringProperty()

    def execute(self, context):
        cam = bpy.data.objects.get(self.nom)
        if cam:
            context.scene.camera = cam
            for area in context.screen.areas:
                if area.type == 'VIEW_3D':
                    area.spaces.active.region_3d.view_perspective = 'CAMERA'
        return {'FINISHED'}


class PIANO_OT_manuel(bpy.types.Operator):
    """Supprime l'animation des curseurs pour les piloter à la main"""
    bl_idname = "piano.mode_manuel"
    bl_label = "Mode manuel (retirer l'animation des curseurs)"

    def execute(self, context):
        ctrl = bpy.data.objects.get("PIANO_Controle")
        if ctrl and ctrl.animation_data:
            ctrl.animation_data_clear()
        return {'FINISHED'}


class PIANO_PT_panneau(bpy.types.Panel):
    bl_label = "Piano à queue"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Piano"

    def draw(self, context):
        lay = self.layout
        ctrl = bpy.data.objects.get("PIANO_Controle")
        if ctrl is None:
            lay.label(text="Objet PIANO_Controle introuvable")
            return
        col = lay.column(align=True)
        col.label(text="Vue éclatée")
        col.prop(ctrl, '["explosion"]', text="Piano entier", slider=True)
        col.prop(ctrl, '["explosion_detail"]', text="Mécanique (vitrine)", slider=True)
        col.separator()
        col.label(text="Mécanisme")
        col.prop(ctrl, '["appui_demo"]', text="Enfoncer la touche (vitrine)", slider=True)
        col.separator()
        row = lay.row(align=True)
        row.operator("piano.camera", text="Vue générale").nom = "Camera_Generale"
        row.operator("piano.camera", text="Vitrine").nom = "Camera_Mecanique"
        lay.operator("piano.mode_manuel", icon='UNLINKED')
        lay.label(text="Lecture : Espace (animation de démo)")


CLASSES = (PIANO_OT_camera, PIANO_OT_manuel, PIANO_PT_panneau)


def register():
    for c in CLASSES:
        try:
            bpy.utils.unregister_class(getattr(bpy.types, c.__name__))
        except Exception:
            pass
        bpy.utils.register_class(c)


register()
'''


def install_panel():
    txt = bpy.data.texts.get("piano_panneau.py") or bpy.data.texts.new("piano_panneau.py")
    txt.clear()
    txt.write(PANEL_CODE)
    txt.use_module = True  # se ré-enregistre à l'ouverture du .blend (scripts autorisés)
    try:
        exec(compile(PANEL_CODE, "piano_panneau.py", "exec"), {"__name__": "piano_panneau"})
    except Exception as exc:  # pas d'interface (mode batch) : sans importance
        print("Panneau non enregistré :", exc)


def setup_render():
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    try:
        sc.view_settings.view_transform = "AgX"
    except TypeError:
        pass


# =============================================================================
# Programme principal
# =============================================================================

def build():
    reset_scene()
    COLLS.clear()
    make_materials()
    root = coll("Piano à queue")
    ctrl = empty("PIANO_Controle", root, None, (0, -1.2, 0.02), 0.25, "ARROWS")
    for prop, desc in [("explosion", "Vue éclatée du piano entier (0 = assemblé, 1 = éclaté)"),
                       ("explosion_detail", "Vue éclatée de la mécanique en vitrine"),
                       ("appui_demo", "Enfoncement de la touche de la vitrine")]:
        ctrl[prop] = 0.0
        ui = ctrl.id_properties_ui(prop)
        ui.update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0, description=desc)
    cam, cam2 = build_stage(root, ctrl)
    keys = build_piano(ctrl, root, cam)
    build_showcase(ctrl, root, key_layout())
    animate(ctrl, keys, cam, cam2)
    install_panel()
    setup_render()
    n_obj = len(bpy.data.objects)
    n_drv = sum(len(o.animation_data.drivers) for o in bpy.data.objects if o.animation_data)
    print("Piano construit : {} objets, {} drivers.".format(n_obj, n_drv))


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    opts = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--") and i + 1 < len(argv):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    return opts


def main():
    opts = parse_args()
    build()
    if "sauver" in opts:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opts["sauver"]))
        print("Enregistré :", opts["sauver"])
    if "rendu" in opts:
        sc = bpy.context.scene
        out = os.path.abspath(opts["rendu"])
        os.makedirs(out, exist_ok=True)
        if opts.get("moteur", "").upper() == "CYCLES":
            sc.render.engine = "CYCLES"
            sc.cycles.samples = int(opts.get("echantillons", 48))
            sc.cycles.device = "CPU"
        pct = int(opts.get("pourcentage", 50))
        sc.render.resolution_percentage = pct
        for f in [int(v) for v in opts.get("images", "1,200,420").split(",")]:
            sc.frame_set(f)
            markers = sorted((m for m in sc.timeline_markers if m.frame <= f and m.camera),
                             key=lambda m: m.frame)
            if markers:
                sc.camera = markers[-1].camera
            sc.render.filepath = os.path.join(out, "piano_{:04d}.png".format(f))
            bpy.ops.render.render(write_still=True)
            print("Rendu :", sc.render.filepath)


if __name__ == "__main__":
    main()
