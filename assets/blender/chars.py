"""Chibi characters: Chef + 4 customers. Built facing -Y (Blender), own LEFT = +X."""
import math
import bmesh
from mathutils import Vector, Matrix
from lib import MB, T, empty, parent, emblem, align_z, PI


# ------------------------------------------------------------------ surface utils
def surf(C, R, az, el, off=0.0):
    """Point+normal on ellipsoid. az>0 -> character's left (+X); az=0 -> front (-Y)."""
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    p = Vector((C[0] + R[0] * d.x, C[1] + R[1] * d.y, C[2] + R[2] * d.z))
    n = Vector((d.x / R[0], d.y / R[1], d.z / R[2])).normalized()
    return p + n * off, n


def sticker_sphere(mb, C, R, az, el, size, m, inset=0.0, local=(0, 0), seg=10, rings=6, spin=0.0):
    """Flattened ellipsoid lying on the head surface (size = (w, h, depth) radii)."""
    p, n = surf(C, R, az, el)
    M = align_z(n, p - n * inset, spin)
    mb.sphere(size, (local[0], local[1], 0), m, seg, rings, M=M)
    return p, n


# ------------------------------------------------------------------ face parts
def eyes(C, R, az=0.34, el=-0.06, ew=0.042, eh=0.058, brown=True, lash=False, glasses=None, iris='M_Hair'):
    """Returns MB with both eyes; caller builds with pivot at eye centre."""
    e = MB()
    centres = []
    for s in (-1, 1):
        p, n = surf(C, R, s * az, el)
        centres.append(p)
        M = align_z(n, p - n * 0.012)
        e.sphere((ew, eh, 0.02), (0, 0, 0), 'M_Black', 12, 5, M=M)
        if brown:
            e.sphere((ew * 0.78, eh * 0.55, 0.02), (0, -eh * 0.33, 0.003), iris, 10, 4, M=M)
        e.sphere((ew * 0.36, ew * 0.38, 0.012), (-ew * 0.32, eh * 0.38, 0.012), 'M_EyeWhite', 8, 3, M=M)
        e.sphere((ew * 0.17, ew * 0.17, 0.008), (ew * 0.35, -eh * 0.45, 0.015), 'M_EyeWhite', 6, 3, M=M)
        if lash:
            e.box((ew * 0.55, 0.014, 0.012), (s * ew * 0.95, eh * 0.62, 0.006), 'M_Black', (0, 0, s * 35), M=M)
    centre = (centres[0] + centres[1]) / 2
    return e, centre


def mouth(C, R, el=-0.36, w=0.05, h=0.034, open_=True, smile_only=False):
    m = MB()
    p, n = surf(C, R, 0, el)
    M = align_z(n, p - n * 0.006)
    if smile_only:
        pts = []
        for i in range(7):
            t = PI + PI * i / 6
            pts.append((w * 0.6 * math.cos(t), h * 0.5 * math.sin(t) + h * 0.15))
        m.ring2d(pts, 0.008, 0.008, M, 'M_Mouth', closed=False)
        return m, p
    pts = [(w / 2, 0.0)]
    for i in range(1, 10):
        t = PI * i / 10
        pts.append((w / 2 * math.cos(t), -h * math.sin(t)))
    pts.append((-w / 2, 0.0))
    pts = [(x, y + h * 0.45) for x, y in pts]
    m.prism(pts, 0.008, M, 'M_Mouth')
    tongue = []
    for i in range(0, 9):
        t = PI + PI * i / 8
        tongue.append((w * 0.28 * math.cos(t), h * 0.42 + h * 0.36 * math.sin(t) - h * 0.45 + h * 0.45 - h * 0.62))
    tongue = [(x, y) for x, y in tongue]
    tm = []
    for i in range(9):
        t = PI * i / 8
        tm.append((w * 0.26 * math.cos(t), -h * 0.52 + h * 0.22 * math.sin(t) + h * 0.45 - h * 0.05))
    m.prism(tm, 0.004, M @ Matrix.Translation((0, 0, 0.0085)), 'M_Blush')
    return m, p


def face_base(h, C, R, skin='M_Skin', blush=True, nose=True, ears=True, brows='M_Hair',
              brow_el=0.24, brow_az=0.34, brow_tilt=0.0, blush_az=0.62, blush_el=-0.25):
    h.sphere(R, C, skin, 16, 12)
    if ears:
        for s in (-1, 1):
            p, n = surf(C, R, s * 1.5, -0.08)
            h.sphere((0.026, 0.04, 0.045), tuple(p), skin, 8, 6)
    if nose:
        p, n = surf(C, R, 0, -0.2)
        h.sphere((0.014, 0.011, 0.01), tuple(p), skin, 6, 4)
    if blush:
        for s in (-1, 1):
            sticker_sphere(h, C, R, s * blush_az, blush_el, (0.042, 0.026, 0.008), 'M_Blush', inset=0.004, rings=4)
    if brows:
        for s in (-1, 1):
            pts = []
            for k in range(4):
                a = s * (brow_az - 0.12 + 0.24 * k / 3)
                e = brow_el + 0.025 * math.sin(PI * k / 3) + s * brow_tilt * (k / 3 - 0.5)
                pts.append(surf(C, R, a, e, 0.003)[0])
            h.tube(pts, 0.009, 4, brows)


def hair_shell(h, C, R, k=1.08, m='M_Hair', fringe=0.32, side=1.15, bottom=-0.55, back_bottom=None,
               thick=0.025, nu=18, nv=12, offset=(0, 0.012, 0.012), keep=None):
    """Bob-like hair cap: sphere with face window removed. keep(az, el)->bool overrides."""
    bm = bmesh.new()
    Cc = Vector(C) + Vector(offset)
    Rk = (R[0] * k, R[1] * k, R[2] * k)
    grid = {}
    for j in range(nv + 1):
        el = -PI / 2 + PI * j / nv
        for i in range(nu):
            az = -PI + 2 * PI * i / nu
            p, _ = surf(Cc, Rk, az, el)
            grid[(i, j)] = bm.verts.new(p)
    bb = back_bottom if back_bottom is not None else bottom
    for j in range(nv):
        for i in range(nu):
            az = -PI + 2 * PI * (i + 0.5) / nu
            el = -PI / 2 + PI * (j + 0.5) / nv
            a = abs(az)
            if keep is not None:
                ok = keep(az, el)
            else:
                lim = bottom + (bb - bottom) * max(0.0, (a - side) / (PI - side))
                ok = el > lim and not (a < side and el < fringe)
            if ok:
                ii = (i + 1) % nu
                vs = [grid[(i, j)], grid[(ii, j)], grid[(ii, j + 1)], grid[(i, j + 1)]]
                if len(set(vs)) == 4:
                    bm.faces.new(vs)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thick)
    h.add_bm(bm, m)


def bangs(h, C, R, n=5, el=0.3, span=0.9, m='M_Hair', size=(0.07, 0.1, 0.03), k=1.06, droop=0.12):
    for i in range(n):
        t = (i / (n - 1)) * 2 - 1 if n > 1 else 0
        az = t * span
        sz = (size[0] * (1 - 0.15 * abs(t)), size[1] * (1 - 0.25 * abs(t)), size[2])
        p, nrm = surf(C, (R[0] * k, R[1] * k, R[2] * k), az, el - droop * (1 - abs(t)) * 0.3)
        M = align_z(nrm, p, -t * 25)
        h.sphere(sz, (0, 0, 0), m, 7, 4, M=M)


# ------------------------------------------------------------------ body parts
def arm(prefix, side, shoulder, length, sleeve_m, hand_m='M_Skin', r_top=0.05, r_bot=0.042,
        sleeve_frac=0.82, splay=8, cuff_m=None, hand_r=0.05, short_sleeve=False):
    """Arm hanging down from shoulder (origin). side=+1 => left (+X)."""
    a = MB()
    M = T(shoulder, (0, side * -splay, 0))  # rotate about Y: tip outward
    sl = length * sleeve_frac
    a.sphere(r_top * 1.08, (0, 0, -0.005), sleeve_m, 8, 6, M=M)
    a.cyl(r_top, r_bot, sl, 8, (0, 0, -sl / 2), sleeve_m, M=M)
    if short_sleeve:
        a.cyl(r_bot * 0.75, r_bot * 0.72, length - sl, 6, (0, 0, -sl - (length - sl) / 2 + 0.01), hand_m, M=M)
    if cuff_m:
        a.cyl(r_bot * 1.12, r_bot * 1.12, 0.03, 8, (0, 0, -sl + 0.01), cuff_m, M=M)
    a.sphere((hand_r, hand_r * 0.85, hand_r * 1.1), (0, -0.005, -length - hand_r * 0.4), hand_m, 8, 6, M=M)
    a.sphere(hand_r * 0.42, (-side * hand_r * 0.6, -hand_r * 0.55, -length - hand_r * 0.1), hand_m, 6, 4, M=M)
    return a.build(f'{prefix}_Arm{"L" if side > 0 else "R"}', pivot=shoulder)


def shoe(mb, x, m, size=(0.1, 0.16, 0.07), y=-0.02):
    mb.box(size, (x, y, size[2] / 2), m, bevel=0.025)


def leg(prefix, side, hip, length, pant_m, shoe_m, r=0.055, pant_frac=0.5, skin='M_Skin', sock=None,
        shoe_size=(0.1, 0.15, 0.07)):
    l = MB()
    x = hip[0]
    pl = length * pant_frac
    l.cyl(r * 1.1, r * 1.05, pl, 8, (x, hip[1], hip[2] - pl / 2), pant_m)
    rest = length - pl - shoe_size[2] * 0.6
    if rest > 0:
        l.cyl(r * 0.75, r * 0.72, rest + 0.02, 6, (x, hip[1], hip[2] - pl - rest / 2), sock or skin)
    if sock:
        l.cyl(r * 0.85, r * 0.85, 0.05, 6, (x, hip[1], shoe_size[2] + 0.02), sock)
    shoe(l, x, shoe_m, shoe_size, hip[1] - 0.02)
    return l.build(f'{prefix}_Leg{"L" if side > 0 else "R"}', pivot=hip)


def arc_panel(mb, rx, ry, a0, a1, z0, z1, m, thick=0.012, flare=1.0, seg=8, M=None):
    """Curved front panel on an elliptic cylinder (angles in degrees, 0 = front -Y)."""
    verts, faces = [], []
    rows = [(z0, flare), (z1, 1.0)]
    for (z, f) in rows:
        for i in range(seg + 1):
            a = math.radians(a0 + (a1 - a0) * i / seg)
            for o in (0, thick):
                verts.append(((rx * f + o) * math.sin(a), -(ry * f + o) * math.cos(a), z))
    W = (seg + 1) * 2
    def vi(r, i, o):
        return r * W + i * 2 + o
    for i in range(seg):
        faces.append([vi(0, i, 1), vi(0, i + 1, 1), vi(1, i + 1, 1), vi(1, i, 1)])  # outer
        faces.append([vi(0, i, 0), vi(1, i, 0), vi(1, i + 1, 0), vi(0, i + 1, 0)])  # inner
        faces.append([vi(0, i, 0), vi(0, i + 1, 0), vi(0, i + 1, 1), vi(0, i, 1)])  # bottom
        faces.append([vi(1, i, 1), vi(1, i + 1, 1), vi(1, i + 1, 0), vi(1, i, 0)])  # top
    for i, s in ((0, 1), (seg, -1)):
        f = [vi(0, i, 0), vi(0, i, 1), vi(1, i, 1), vi(1, i, 0)]
        faces.append(f if s < 0 else f[::-1])
    mb.add_raw(verts, faces, m, M)


def assemble(name, body, head, eyes_ob, mouth_ob=None, arms=(), legs=(), extra=()):
    root = empty(name)
    parent(body, root)
    parent(head, root)
    parent(eyes_ob, head)
    if mouth_ob:
        parent(mouth_ob, head)
    for a in arms:
        parent(a, root)
    for l in legs:
        parent(l, root)
    for e, p in extra:
        parent(e, p)
    return root


# ------------------------------------------------------------------ CHEF
def _chef_ribbon(h, at, aim=(-0.6, -0.2, 0.3), m='M_ChefSkirt', s=1.0):
    rb = align_z(aim, at)
    h.sphere(0.026 * s, (0, 0, 0), m, 6, 4, M=rb)
    for sd in (-1, 1):
        h.cyl(0.0, 0.055 * s, 0.075 * s, 4, (sd * 0.042 * s, 0, 0), m, (0, sd * 90, 0), scale=(1, 0.5, 1), M=rb)
    h.box((0.024 * s, 0.08 * s, 0.01), (-0.012 * s, -0.05 * s, 0.0), m, (0, 0, 15), M=rb)
    h.box((0.024 * s, 0.07 * s, 0.01), (0.015 * s, -0.05 * s, 0.0), m, (0, 0, -20), M=rb)


def _chef_hair(style, C, R):
    """One hair style as its own mesh (Chef_Hair_<style>). F1 is the original Chef Hana look."""
    h = MB()
    if style.startswith('F'):
        back = {'F1': -0.8, 'F2': -1.25, 'F3': -0.8}[style]
        hair_shell(h, C, R, 1.08, fringe=0.42, side=1.22, bottom=-0.62, back_bottom=back)
        bangs(h, C, R, 7, 0.52, 1.05, size=(0.075, 0.1, 0.035), k=1.05, droop=0.1)
        for s in (-1, 1):  # side locks framing the face
            p, n = surf(C, (R[0] * 1.05, R[1] * 1.05, R[2] * 1.05), s * 1.2, -0.38)
            h.sphere((0.048, 0.045, 0.1), tuple(p), 'M_Hair', 8, 6, rot=(0, s * -12, 0))
            p, n = surf(C, (R[0] * 1.03, R[1] * 1.03, R[2] * 1.03), s * 1.25, -0.72)
            h.sphere((0.035, 0.035, 0.05), tuple(p), 'M_Hair', 6, 4, rot=(0, s * 20, 0))
        if style == 'F1':  # side ponytail with ribbon
            px, py = -0.24, 0.08
            h.sphere((0.075, 0.07, 0.08), (px - 0.02, py, 1.24), 'M_Hair', 8, 6)
            h.sphere((0.062, 0.058, 0.09), (px - 0.045, py + 0.01, 1.12), 'M_Hair', 8, 6, rot=(0, 15, 0))
            h.cyl(0.04, 0.0, 0.11, 6, (px - 0.07, py + 0.01, 1.0), 'M_Hair', (0, 165, 0))
            _chef_ribbon(h, (px + 0.01, py - 0.02, 1.32))
        elif style == 'F2':  # long hair down the back
            h.sphere((0.2, 0.085, 0.2), (0, 0.13, 1.17), 'M_Hair', 10, 6)
            h.sphere((0.17, 0.07, 0.1), (0, 0.14, 1.0), 'M_Hair', 10, 5)
            for s in (-1, 1):
                h.sphere((0.05, 0.05, 0.14), (s * 0.2, 0.03, 1.13), 'M_Hair', 8, 6, rot=(0, s * -8, 0))
        else:  # F3: twin buns with ribbons
            for s in (-1, 1):
                h.sphere((0.075, 0.07, 0.07), (s * 0.235, 0.06, 1.47), 'M_Hair', 10, 6)
                _chef_ribbon(h, (s * 0.2, 0.0, 1.41), aim=(s * 0.6, -0.5, -0.2), s=0.8)
    else:
        hair_shell(h, C, R, 1.065, fringe=0.5, side=1.32, bottom=-0.32, back_bottom=-0.58, thick=0.03)
        for s in (-1, 1):  # sideburns
            p, n = surf(C, (R[0] * 1.03, R[1] * 1.03, R[2] * 1.03), s * 1.3, -0.2)
            h.sphere((0.025, 0.03, 0.06), tuple(p), 'M_Hair', 6, 4)
        if style == 'M1':  # short neat fringe
            bangs(h, C, R, 6, 0.56, 0.95, size=(0.06, 0.07, 0.03), k=1.05, droop=0.05)
        elif style == 'M2':  # spiky
            for i in range(7):
                t = (i / 6) * 2 - 1
                p, n = surf(C, (R[0] * 1.06, R[1] * 1.06, R[2] * 1.06), t * 1.0, 0.55 - 0.08 * abs(t))
                M = align_z((n + Vector((0, 0, 0.9))).normalized(), p)
                h.cyl(0.035, 0.0, 0.09, 5, (0, 0, 0.0), 'M_Hair', M=M)
        else:  # M3: side-swept fringe
            for i in range(5):
                az = -0.85 + i * 0.32
                p, n = surf(C, (R[0] * 1.06, R[1] * 1.06, R[2] * 1.06), az, 0.5 - 0.04 * i)
                M = align_z(n, p, 55)
                h.sphere((0.1, 0.045, 0.03), (0, 0, 0), 'M_Hair', 8, 4, M=M)
    return h.build(f'Chef_Hair_{style}', pivot=(0, 0, 1.18))


CHEF_HAIR_STYLES = ('F1', 'F2', 'F3', 'M1', 'M2', 'M3')


def build_chef():
    P = 'Chef'
    b = MB()
    # legs + shoes (part of body)
    for s in (-1, 1):
        b.cyl(0.07, 0.065, 0.36, 8, (s * 0.08, 0, 0.24), 'M_Cloth_Charcoal')
        shoe(b, s * 0.08, 'M_WoodDark', (0.11, 0.17, 0.08), -0.02)
    # jacket torso
    prof = [(0.0, 0.36), (0.18, 0.36), (0.195, 0.44), (0.18, 0.6), (0.168, 0.82), (0.18, 1.02),
            (0.172, 1.12), (0.12, 1.18), (0.0, 1.2)]
    TS = (1, 0.78, 1)
    b.lathe(prof, 10, m='M_White', scale=TS)
    # collar
    b.cyl(0.078, 0.07, 0.05, 10, (0, 0, 1.19), 'M_White')
    b.torus(0.075, 0.009, 10, 4, (0, 0, 1.168), 'M_AppleRed')
    # jacket overlap seam
    b.box((0.012, 0.01, 0.22), (0.1, -0.128, 1.02), 'M_Cream', (0, 0, -20))
    body = b.build('Chef_Body')
    # double-breasted buttons (two columns) - recoloured by the player's outfit choice
    bt = MB()
    for z in (1.10, 1.04, 0.98):
        for sx in (-1, 1):
            x = sx * 0.06
            y = -math.sqrt(max(0, (0.18 * 0.78) ** 2 * (1 - (x / 0.18) ** 2))) - 0.003
            bt.sphere((0.018, 0.009, 0.018), (x, y, z), 'M_ChefButton', 8, 4)
    buttons = bt.build('Chef_Buttons')
    # apron skirt + waist band + back bow - recoloured by the player's outfit choice
    ap = MB()
    arc_panel(ap, 0.196, 0.158, -80, 80, 0.30, 0.92, 'M_ChefSkirt', 0.014, flare=1.14, seg=10)
    ap.torus(0.183, 0.02, 12, 4, (0, 0, 0.925), 'M_ChefSkirt', scale=(1.04, 0.84, 1))
    ap.box((0.07, 0.035, 0.055), (0, 0.155, 0.925), 'M_ChefSkirt', bevel=0.012)
    ap.box((0.04, 0.012, 0.13), (0.035, 0.162, 0.84), 'M_ChefSkirt', (0, 15, 0))
    ap.box((0.04, 0.012, 0.13), (-0.035, 0.162, 0.84), 'M_ChefSkirt', (0, -15, 0))
    yskirt = -0.158 * 1.05 - 0.016
    emblem(ap, align_z((0, -1, 0), (0, yskirt, 0.66)), 0.17, 0.008, 'M_Cream')
    apron = ap.build('Chef_Apron')

    # head (face, neck, beret); hair styles are separate children
    C = (0, 0, 1.37)
    R = (0.235, 0.215, 0.205)
    h = MB()
    face_base(h, C, R, brow_el=0.30, brow_az=0.34, blush_el=-0.3, blush_az=0.6, ears=False)
    h.cyl(0.058, 0.058, 0.08, 8, (0, 0, 1.19), 'M_Skin')
    # beret (tilted to the left, with stem nub)
    bt = T((0.045, 0.02, 1.52), (-6, 18, 0))
    h.lathe([(0.15, 0.0), (0.19, 0.025), (0.207, 0.05), (0.185, 0.076), (0.1, 0.096), (0.0, 0.1)], 14,
            m='M_ChefHat', M=bt)
    h.cyl(0.158, 0.152, 0.035, 14, (0, 0, 0.0), 'M_ChefHat', M=bt)
    h.cyl(0.014, 0.01, 0.04, 5, (0.0, 0.0, 0.11), 'M_WoodDark', (0, -10, 0), M=bt)
    head = h.build('Chef_Head', pivot=(0, 0, 1.18))
    hairs = [_chef_hair(st, C, R) for st in CHEF_HAIR_STYLES]

    e, ec = eyes(C, R, az=0.36, el=-0.08, ew=0.05, eh=0.066, lash=False, iris='M_ChefIris')
    eo = e.build('Chef_Eyes', pivot=tuple(ec))
    mm, mp = mouth(C, R, el=-0.42, w=0.06, h=0.04)
    mo = mm.build('Chef_Mouth', pivot=tuple(mp))

    arms = [arm(P, s, (s * 0.18, 0, 1.11), 0.36, 'M_White', r_top=0.058, r_bot=0.05,
                cuff_m='M_White', hand_r=0.052, splay=10) for s in (1, -1)]
    # ---- rank pieces (shown by the game as the player ranks up; hidden by default in Scene.tsx)
    # Apprentice: gold apple badge on the left chest (clear of the buttons)
    bd = MB()
    bp = (-0.125, -0.096, 1.06)
    Mb = align_z((-0.62, -0.78, 0), bp)
    bd.cyl(0.032, 0.032, 0.01, 12, (0, 0, 0), 'M_Gold', M=Mb)
    emblem(bd, Mb @ T((0, -0.004, 0.006)), 0.042, 0.006, 'M_AppleRed', leaf='M_Leaf', stem='M_WoodDark')
    badge = bd.build('Chef_Badge')
    # Cook: neckerchief in the outfit colour, knotted at the front
    sc = MB()
    # sits on the shoulders below the chin (the torso narrows to the collar here)
    sc.torus(0.142, 0.026, 14, 5, (0, 0, 1.15), 'M_ChefSkirt', scale=(1, 0.8, 1))
    sc.sphere((0.042, 0.03, 0.036), (0, -0.128, 1.12), 'M_ChefSkirt', 8, 5)
    for sx in (-1, 1):
        sc.box((0.045, 0.014, 0.1), (sx * 0.026, -0.14, 1.05), 'M_ChefSkirt', (0, sx * 14, 0), bevel=0.004)
    scarf = sc.build('Chef_Scarf')
    # Head Cook: gold star on the front of the beret
    st = MB()
    star = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = 0.042 if i % 2 == 0 else 0.018
        star.append((r * math.cos(a), r * math.sin(a)))
    st.prism(star, 0.012, bt @ align_z((0, -1, 0.15), (0.0, -0.196, 0.045)), 'M_Gold')
    hatstar = st.build('Chef_HatStar')
    return assemble('Chef', body, head, eo, mo, arms,
                    extra=[(buttons, body), (apron, body), (badge, body), (scarf, body), (hatstar, head)]
                    + [(hr, head) for hr in hairs])


# ------------------------------------------------------------------ CUSTOMERS
def _head_common(h, C, R, mouth_el=-0.42, mw=0.05, mh=0.034, smile_only=False):
    mm, mp = mouth(C, R, el=mouth_el, w=mw, h=mh, smile_only=smile_only)
    h.merge(mm)


def cap(h, C, R, m, brim_m=None, tilt=(0, 0, 0), k=1.1, brim_len=0.13):
    M = T((C[0], C[1] + 0.005, C[2] + R[2] * 0.25), tilt)
    prof = [(R[0] * k, 0.0), (R[0] * k * 0.98, R[2] * 0.3), (R[0] * k * 0.8, R[2] * 0.65),
            (R[0] * k * 0.45, R[2] * 0.85), (0.0, R[2] * 0.9)]
    h.lathe(prof, 14, m=m, M=M, scale=(1, R[1] / R[0], 1))
    # brim (half disc forward)
    pts = [(R[0] * 0.95 * math.cos(a), -R[1] * 0.75 - brim_len * math.sin(a)) for a in
           [PI * i / 8 for i in range(9)]]
    h.prism(pts, 0.026, M @ T((0, 0, -0.01), (-14, 0, 0)), brim_m or m)
    h.sphere((0.018, 0.018, 0.012), (0, 0, R[2] * 0.9), brim_m or m, 6, 4, M=M)


def kid_body(b, H, shirt, pants, torso_r=0.13, hip_z=0.36, sh_z=0.66, short=True, flare=1.0,
             skirt_len=0.0, dress=None):
    """Torso lathe with shirt + pants bands."""
    prof = [(0.0, hip_z - 0.06), (torso_r * 1.0 * flare, hip_z - 0.06), (torso_r * 1.03 * flare, hip_z + 0.04),
            (torso_r * 0.97, hip_z + 0.14), (torso_r, sh_z - 0.1), (torso_r * 0.9, sh_z - 0.01),
            (torso_r * 0.55, sh_z + 0.03), (0.0, sh_z + 0.04)]
    mats = [pants, pants, shirt, shirt, shirt, shirt, shirt]
    b.lathe(prof, 10, mats=mats, scale=(1, 0.82, 1))


def build_customer_A():
    P = 'Customer_A'
    hip, sh = 0.36, 0.66
    b = MB()
    kid_body(b, 1.12, 'M_Cloth_Mustard', 'M_Cloth_Blue')
    # shorts legs openings + tee hem
    b.torus(0.133, 0.012, 10, 4, (0, 0, hip + 0.06), 'M_Cloth_Mustard', scale=(1, 0.82, 1))
    b.cyl(0.035, 0.035, 0.05, 8, (0, 0, sh + 0.05), 'M_Skin')
    body = b.build(f'{P}_Body')
    legs = []
    for s in (1, -1):
        l = MB()
        x = s * 0.065
        l.cyl(0.065, 0.062, 0.12, 8, (x, 0, hip - 0.06), 'M_Cloth_Blue')
        l.cyl(0.042, 0.04, 0.22, 6, (x, 0, hip - 0.2), 'M_Skin')
        l.cyl(0.046, 0.046, 0.05, 6, (x, 0, 0.085), 'M_Cloth_White')
        l.box((0.095, 0.15, 0.065), (x, -0.02, 0.0325), 'M_Cloth_Red', bevel=0.022)
        l.box((0.1, 0.155, 0.02), (x, -0.02, 0.01), 'M_Cloth_White', bevel=0.006)
        legs.append(l.build(f'{P}_Leg{"L" if s > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, 0, 0.87)
    R = (0.2, 0.185, 0.18)
    h = MB()
    face_base(h, C, R, brow_el=0.26, brow_az=0.34, brows='M_Hair', blush_el=-0.28)
    hair_shell(h, C, R, 1.06, fringe=0.4, side=1.3, bottom=-0.25, back_bottom=-0.55, thick=0.02)
    bangs(h, C, R, 5, 0.47, 0.75, size=(0.07, 0.07, 0.03), k=1.05, droop=0.0)
    cap(h, C, R, 'M_Cloth_Green', 'M_LeafDark', (8, 0, 0), k=1.1, brim_len=0.15)
    _head_common(h, C, R, -0.42, 0.055, 0.036)
    head = h.build(f'{P}_Head', pivot=(0, 0, sh + 0.03))
    e, ec = eyes(C, R, az=0.36, el=-0.08, ew=0.042, eh=0.056)
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = [arm(P, s, (s * 0.135, 0, sh - 0.04), 0.27, 'M_Cloth_Mustard', r_top=0.048, r_bot=0.046,
                sleeve_frac=0.38, short_sleeve=True, hand_r=0.042, splay=10) for s in (1, -1)]
    return assemble(P, body, head, eo, None, arms, legs)


def build_customer_B():
    P = 'Customer_B'
    hip, sh = 0.36, 0.64
    b = MB()
    # raincoat: A-line from knee to shoulder
    prof = [(0.0, 0.2), (0.175, 0.2), (0.165, 0.32), (0.14, 0.48), (0.128, sh - 0.08), (0.115, sh),
            (0.07, sh + 0.035), (0.0, sh + 0.04)]
    b.lathe(prof, 10, m='M_Cloth_Yellow', scale=(1, 0.85, 1))
    b.torus(0.172, 0.012, 10, 4, (0, 0, 0.205), 'M_Cloth_Yellow', scale=(1, 0.85, 1))
    for z in (0.56, 0.46, 0.36):
        b.sphere((0.016, 0.008, 0.016), (0.0, -0.85 * (0.14 + (0.56 - z) * 0.15) - 0.004, z), 'M_WoodDark', 6, 4)
    # placket line + pockets
    b.box((0.012, 0.01, 0.4), (0.03, -0.132, 0.42), 'M_JuiceGold')
    for s in (-1, 1):
        b.box((0.07, 0.012, 0.05), (s * 0.085, -0.13, 0.33), 'M_JuiceGold', (0, 0, s * 12), bevel=0.004)
    # collar + hood behind
    b.cyl(0.075, 0.065, 0.04, 10, (0, 0, sh + 0.03), 'M_JuiceGold')
    b.sphere((0.13, 0.08, 0.1), (0, 0.11, sh + 0.06), 'M_Cloth_Yellow', 10, 6)
    body = b.build(f'{P}_Body')
    legs = []
    for s in (1, -1):
        l = MB()
        x = s * 0.06
        l.cyl(0.038, 0.036, 0.16, 6, (x, 0, 0.24), 'M_Skin')
        l.cyl(0.055, 0.058, 0.15, 8, (x, -0.005, 0.075), 'M_Cloth_Red')
        l.box((0.1, 0.15, 0.04), (x, -0.025, 0.02), 'M_Cloth_Red', bevel=0.015)
        legs.append(l.build(f'{P}_Leg{"L" if s > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, 0, 0.86)
    R = (0.2, 0.185, 0.18)
    h = MB()
    face_base(h, C, R, brow_el=0.27, brows='M_HairBlack', blush_el=-0.28, ears=False)
    hair_shell(h, C, R, 1.07, m='M_HairBlack', fringe=0.42, side=1.2, bottom=-0.45, back_bottom=-0.65)
    bangs(h, C, R, 6, 0.5, 0.9, m='M_HairBlack', size=(0.07, 0.085, 0.03), k=1.05, droop=0.05)
    for s in (-1, 1):
        # pigtails
        base = Vector((s * 0.205, 0.03, 0.83))
        h.sphere(0.03, tuple(base), 'M_Cloth_Yellow', 8, 4)
        h.sphere((0.03, 0.03, 0.026), tuple(base + Vector((s * 0.03, 0, 0))), 'M_JuiceGold', 6, 4)
        h.sphere((0.06, 0.055, 0.075), tuple(base + Vector((s * 0.065, 0.0, -0.05))), 'M_HairBlack', 8, 6,
                 rot=(0, s * 20, 0))
        h.sphere((0.045, 0.042, 0.06), tuple(base + Vector((s * 0.09, 0.0, -0.14))), 'M_HairBlack', 8, 6,
                 rot=(0, s * 10, 0))
    _head_common(h, C, R, -0.42, 0.05, 0.036)
    head = h.build(f'{P}_Head', pivot=(0, 0, sh + 0.03))
    e, ec = eyes(C, R, az=0.36, el=-0.08, ew=0.044, eh=0.058, lash=True)
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = [arm(P, s, (s * 0.13, 0, sh - 0.04), 0.27, 'M_Cloth_Yellow', r_top=0.048, r_bot=0.05,
                sleeve_frac=0.85, cuff_m='M_JuiceGold', hand_r=0.042, splay=12) for s in (1, -1)]
    return assemble(P, body, head, eo, None, arms, legs)


def build_customer_C():
    P = 'Customer_C'
    hip, sh = 0.5, 0.88
    b = MB()
    stoop = T((0, 0, hip), (-7, 0, 0)) @ T((0, 0, -hip))
    prof = [(0.0, hip - 0.08), (0.15, hip - 0.08), (0.155, hip + 0.04), (0.15, hip + 0.18), (0.155, sh - 0.1),
            (0.14, sh - 0.01), (0.08, sh + 0.035), (0.0, sh + 0.04)]
    mats = ['M_Cloth_Tweed', 'M_Cloth_Tweed', 'M_Cloth_Shirt', 'M_Cloth_Shirt', 'M_Cloth_Shirt',
            'M_Cloth_Shirt', 'M_Cloth_Shirt']
    b.lathe(prof, 10, mats=mats, scale=(1, 0.85, 1), M=stoop)
    # vest: wraps sides/back, open V at front
    arc_panel(b, 0.16, 0.136, 22, 338, hip + 0.02, sh - 0.06, 'M_Cloth_Brown', 0.014, seg=14, M=stoop)
    for s in (-1, 1):
        b.box((0.05, 0.02, 0.26), (s * 0.06, -0.13, hip + 0.16), 'M_Cloth_Brown', (0, 0, 0), M=stoop)
        b.box((0.045, 0.02, 0.14), (s * 0.05, -0.12, sh - 0.12), 'M_Cloth_Brown', (0, s * 22, 0), M=stoop)
    for z in (hip + 0.08, hip + 0.16, hip + 0.24):
        b.sphere((0.012, 0.007, 0.012), (0.04, -0.142, z), 'M_WoodDark', 6, 4, M=stoop)
    # belt + collar
    b.torus(0.153, 0.012, 10, 4, (0, 0, hip + 0.01), 'M_WoodDark', scale=(1, 0.85, 1), M=stoop)
    b.cyl(0.07, 0.062, 0.04, 10, (0, -0.01, sh + 0.04), 'M_Cloth_Shirt', M=stoop)
    body = b.build(f'{P}_Body')
    legs = []
    for s in (1, -1):
        l = MB()
        x = s * 0.075
        l.cyl(0.068, 0.06, hip - 0.04, 8, (x, 0, (hip + 0.04) / 2 + 0.02), 'M_Cloth_Tweed')
        l.box((0.105, 0.17, 0.065), (x, -0.025, 0.0325), 'M_WoodDark', bevel=0.022)
        legs.append(l.build(f'{P}_Leg{"L" if s > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, -0.06, 1.08)
    R = (0.195, 0.18, 0.18)
    h = MB()
    face_base(h, C, R, brow_el=0.3, brows='M_HairGrey', blush_el=-0.3, blush_az=0.66)
    # bigger nose
    p, n = surf(C, R, 0, -0.18)
    h.sphere((0.026, 0.024, 0.022), tuple(p), 'M_Skin', 8, 6)
    # grey hair: sides and back only (bald-ish top hidden by cap)
    hair_shell(h, C, R, 1.06, m='M_HairGrey', keep=lambda az, el: abs(az) > 1.2 and -0.55 < el < 0.35)
    # moustache
    for s in (-1, 1):
        p, n = surf(C, R, s * 0.13, -0.3, 0.005)
        h.sphere((0.05, 0.022, 0.028), tuple(p), 'M_HairGrey', 8, 5, rot=(0, s * 18, 0))
    # flat cap
    cm = T((C[0], C[1] + 0.02, C[2] + R[2] * 0.42), (-10, 0, 0))
    h.lathe([(0.205, 0.0), (0.2, 0.05), (0.17, 0.08), (0.0, 0.09)], 14, m='M_Cloth_Tweed', M=cm,
            scale=(1, 1.05, 1))
    pts = [(0.17 * math.cos(a), -0.19 - 0.075 * math.sin(a)) for a in [PI * i / 8 for i in range(9)]]
    h.prism(pts, 0.016, cm @ T((0, 0, 0.0), (10, 0, 0)), 'M_Cloth_Tweed')
    _head_common(h, C, R, -0.44, 0.04, 0.02, smile_only=True)
    # round glasses live on the head (not the Eyes node) so blinking does not squash them
    for s in (-1, 1):
        p, n = surf(C, R, s * 0.33, -0.06, 0.016)
        h.torus(0.05, 0.007, 12, 4, (0, 0, 0), 'M_Black', M=align_z(n, p))
    pb, nb = surf(C, R, 0, -0.04, 0.024)
    h.cyl(0.005, 0.005, 0.06, 4, tuple(pb), 'M_Black', (0, 90, 0))
    for s in (-1, 1):
        p, n = surf(C, R, s * 0.95, -0.03, 0.01)
        h.tube([p, p + Vector((s * 0.02, 0.1, 0.0))], 0.005, 4, 'M_Black')
    head = h.build(f'{P}_Head', pivot=(0, -0.04, sh + 0.03))
    e, ec = eyes(C, R, az=0.33, el=-0.06, ew=0.03, eh=0.036, brown=False)
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = [arm(P, s, (s * 0.155, -0.045, sh - 0.05), 0.33, 'M_Cloth_Shirt', r_top=0.05, r_bot=0.045,
                sleeve_frac=0.88, cuff_m='M_Cloth_Shirt', hand_r=0.045, splay=7) for s in (1, -1)]
    return assemble(P, body, head, eo, None, arms, legs)


def build_customer_O():
    """Ojiichan: the player's grandpa, a cheerful Hirosaki apple chef home from his travels.
    Same build as Grandpa Kiyoshi (C) but in chef whites: tall white toque, double-breasted
    jacket with red buttons, red neckerchief and a red apron. Only appears at the Golden Chef
    ceremony, so he must read as 'a chef', not as an everyday customer."""
    P = 'Customer_O'
    hip, sh = 0.5, 0.88
    b = MB()
    stoop = T((0, 0, hip), (-5, 0, 0)) @ T((0, 0, -hip))
    prof = [(0.0, hip - 0.08), (0.15, hip - 0.08), (0.158, hip + 0.04), (0.155, hip + 0.18), (0.16, sh - 0.1),
            (0.145, sh - 0.01), (0.08, sh + 0.035), (0.0, sh + 0.04)]
    b.lathe(prof, 10, m='M_Cloth_White', scale=(1, 0.85, 1), M=stoop)
    # red apron: front panel from the knee to mid-chest, with a waist tie
    arc_panel(b, 0.168, 0.145, -58, 58, hip - 0.2, sh - 0.16, 'M_AppleRed', 0.012, flare=1.18, seg=10, M=stoop)
    b.torus(0.162, 0.011, 10, 4, (0, 0, hip + 0.07), 'M_AppleRed', scale=(1, 0.86, 1), M=stoop)
    # double-breasted buttons above the apron bib
    for s in (-1, 1):
        for z in (sh - 0.13, sh - 0.07):
            b.sphere((0.013, 0.008, 0.013), (s * 0.05, -0.138, z), 'M_AppleRed', 6, 4, M=stoop)
    # red neckerchief knot + collar
    b.cyl(0.072, 0.064, 0.045, 10, (0, -0.01, sh + 0.035), 'M_Cloth_White', M=stoop)
    b.sphere((0.03, 0.022, 0.026), (0, -0.075, sh + 0.02), 'M_AppleRed', 8, 5, M=stoop)
    body = b.build(f'{P}_Body')
    legs = []
    for s in (1, -1):
        l = MB()
        x = s * 0.075
        l.cyl(0.068, 0.06, hip - 0.04, 8, (x, 0, (hip + 0.04) / 2 + 0.02), 'M_Cloth_Charcoal')
        l.box((0.105, 0.17, 0.065), (x, -0.025, 0.0325), 'M_WoodDark', bevel=0.022)
        legs.append(l.build(f'{P}_Leg{"L" if s > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, -0.06, 1.08)
    R = (0.195, 0.18, 0.18)
    h = MB()
    face_base(h, C, R, brow_el=0.3, brows='M_HairGrey', blush_el=-0.3, blush_az=0.66)
    p, n = surf(C, R, 0, -0.18)
    h.sphere((0.026, 0.024, 0.022), tuple(p), 'M_Skin', 8, 6)
    hair_shell(h, C, R, 1.06, m='M_HairGrey', keep=lambda az, el: abs(az) > 1.2 and -0.55 < el < 0.35)
    # big friendly moustache
    for s in (-1, 1):
        p, n = surf(C, R, s * 0.14, -0.3, 0.006)
        h.sphere((0.058, 0.024, 0.03), tuple(p), 'M_HairGrey', 8, 5, rot=(0, s * 22, 0))
    # tall puffy chef's toque on a band
    tm = T((C[0], C[1] + 0.01, C[2] + R[2] * 0.5), (-6, 0, 0))
    h.lathe([(0.186, -0.01), (0.19, 0.07), (0.215, 0.11), (0.245, 0.18), (0.24, 0.25), (0.2, 0.3), (0.11, 0.325), (0.0, 0.33)],
            14, m='M_Cloth_White', M=tm, scale=(1, 0.98, 1))
    h.torus(0.19, 0.012, 14, 4, (0, 0, 0.07), 'M_Cream', M=tm)
    _head_common(h, C, R, -0.44, 0.05, 0.03)
    # round glasses on the head (not the Eyes node) so blinking does not squash them
    for s in (-1, 1):
        p, n = surf(C, R, s * 0.33, -0.06, 0.016)
        h.torus(0.05, 0.007, 12, 4, (0, 0, 0), 'M_Black', M=align_z(n, p))
    pb, nb = surf(C, R, 0, -0.04, 0.024)
    h.cyl(0.005, 0.005, 0.06, 4, tuple(pb), 'M_Black', (0, 90, 0))
    for s in (-1, 1):
        p, n = surf(C, R, s * 0.95, -0.03, 0.01)
        h.tube([p, p + Vector((s * 0.02, 0.1, 0.0))], 0.005, 4, 'M_Black')
    head = h.build(f'{P}_Head', pivot=(0, -0.04, sh + 0.03))
    e, ec = eyes(C, R, az=0.33, el=-0.06, ew=0.03, eh=0.036, brown=False)
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = [arm(P, s, (s * 0.158, -0.045, sh - 0.05), 0.33, 'M_Cloth_White', r_top=0.052, r_bot=0.046,
                sleeve_frac=0.88, cuff_m='M_Cloth_White', hand_r=0.045, splay=7) for s in (1, -1)]
    return assemble(P, body, head, eo, None, arms, legs)


def build_customer_D():
    P = 'Customer_D'
    hip, sh = 0.34, 0.63
    b = MB()
    prof = [(0.0, 0.24), (0.16, 0.24), (0.15, 0.3), (0.135, hip + 0.04), (0.132, sh - 0.1), (0.122, sh),
            (0.07, sh + 0.035), (0.0, sh + 0.04)]
    mats = ['M_Cloth_Navy', 'M_Cloth_Navy', 'M_Cloth_LightBlue', 'M_Cloth_LightBlue', 'M_Cloth_LightBlue',
            'M_Cloth_LightBlue', 'M_Cloth_LightBlue']
    b.lathe(prof, 10, mats=mats, scale=(1, 0.84, 1))
    # happi: navy collar band (eri) running down both front edges + belt
    for s in (-1, 1):
        b.tube([(s * 0.06, -0.118, sh + 0.0), (s * 0.03, -0.122, sh - 0.12), (s * 0.02, -0.122, hip + 0.06)],
               0.016, 4, 'M_Cloth_Navy')
    b.box((0.03, 0.012, 0.25), (0, -0.115, hip + 0.16), 'M_Cloth_White')
    b.torus(0.136, 0.016, 10, 4, (0, 0, hip + 0.08), 'M_Cloth_Navy', scale=(1, 0.84, 1))
    b.cyl(0.07, 0.062, 0.035, 10, (0, 0, sh + 0.03), 'M_Cloth_Navy')
    body = b.build(f'{P}_Body')
    legs = []
    for s in (1, -1):
        l = MB()
        x = s * 0.06
        l.cyl(0.038, 0.036, 0.22, 6, (x, 0, 0.17), 'M_Skin')
        l.cyl(0.042, 0.042, 0.05, 6, (x, 0, 0.085), 'M_Cloth_White')
        l.box((0.09, 0.14, 0.06), (x, -0.02, 0.03), 'M_Cloth_Navy', bevel=0.02)
        legs.append(l.build(f'{P}_Leg{"L" if s > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, 0, 0.84)
    R = (0.2, 0.185, 0.18)
    h = MB()
    face_base(h, C, R, brow_el=0.27, brows='M_Hair', blush_el=-0.28, ears=False)
    hair_shell(h, C, R, 1.08, m='M_Hair', fringe=0.45, side=1.12, bottom=-0.5, back_bottom=-0.6)
    bangs(h, C, R, 5, 0.52, 0.8, m='M_Hair', size=(0.085, 0.07, 0.03), k=1.05, droop=0.0)
    # hair clip (apple-red)
    p, n = surf(C, (R[0] * 1.09, R[1] * 1.09, R[2] * 1.09), 0.75, 0.55)
    h.sphere((0.025, 0.018, 0.012), tuple(p), 'M_Cloth_Pink', 6, 4)
    _head_common(h, C, R, -0.42, 0.045, 0.03)
    head = h.build(f'{P}_Head', pivot=(0, 0, sh + 0.03))
    e, ec = eyes(C, R, az=0.36, el=-0.08, ew=0.043, eh=0.056, lash=True)
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = []
    for s in (1, -1):
        a = arm(P, s, (s * 0.128, 0, sh - 0.04), 0.27, 'M_Cloth_LightBlue', r_top=0.05, r_bot=0.058,
                sleeve_frac=0.62, short_sleeve=True, hand_r=0.042, splay=10)
        arms.append(a)
    # basket hanging on left forearm
    k = MB()
    bx, by, bz = 0.128 + 0.075, -0.03, sh - 0.04 - 0.27
    k.lathe([(0.0, 0.0), (0.075, 0.0), (0.09, 0.09), (0.0, 0.09)], 10, (bx + 0.04, by, bz - 0.06), 'M_WoodLight',
            cap=True)
    for z in (0.03, 0.06):
        k.torus(0.084 if z > 0.04 else 0.08, 0.008, 10, 4, (bx + 0.04, by, bz - 0.06 + z), 'M_Wood')
    k.torus(0.092, 0.01, 10, 4, (bx + 0.04, by, bz + 0.03), 'M_Wood')
    k.torus(0.085, 0.009, 12, 4, (bx + 0.04, by, bz + 0.03), 'M_Wood', (90, 0, 0), scale=(1, 1, 1.25))
    k.ico(0.035, (bx + 0.02, by, bz + 0.035), 'M_AppleRed', 1)
    k.sphere((0.05, 0.03, 0.02), (bx + 0.07, by + 0.01, bz + 0.04), 'M_Cloth_Pink', 6, 4, rot=(20, 0, 0))
    bk = k.build(f'{P}_Basket', pivot=(bx, by, bz + 0.13))
    root = assemble(P, body, head, eo, None, arms, legs)
    parent(bk, arms[0])
    return root


def build_customer_I():
    """Captain Ingrid (Golden Request 1, Norway): a ship captain in a navy double-breasted coat with
    gold buttons, a white captain's cap with a black peak and gold badge, and a long blonde braid."""
    P = 'Customer_I'
    hip, sh = 0.5, 0.88
    b = MB()
    prof = [(0.0, hip - 0.12), (0.16, hip - 0.12), (0.165, hip + 0.02), (0.15, hip + 0.16), (0.155, sh - 0.1),
            (0.14, sh - 0.01), (0.075, sh + 0.035), (0.0, sh + 0.04)]
    b.lathe(prof, 10, m='M_Cloth_Captain', scale=(1, 0.85, 1))
    for s_ in (-1, 1):
        for z in (sh - 0.24, sh - 0.16, sh - 0.08):
            b.sphere((0.013, 0.008, 0.013), (s_ * 0.055, -0.133, z), 'M_Gold', 6, 4)
    b.torus(0.158, 0.012, 10, 4, (0, 0, hip + 0.06), 'M_Black', scale=(1, 0.86, 1))
    b.box((0.04, 0.012, 0.03), (0, -0.138, hip + 0.06), 'M_Gold')
    b.cyl(0.07, 0.062, 0.045, 10, (0, -0.005, sh + 0.035), 'M_Cloth_White')
    for s_ in (-1, 1):  # gold shoulder boards
        b.box((0.07, 0.045, 0.014), (s_ * 0.12, 0, sh - 0.01), 'M_Gold', (0, s_ * 18, 0))
    body = b.build(f'{P}_Body')
    legs = []
    for s_ in (1, -1):
        l = MB()
        x = s_ * 0.072
        l.cyl(0.06, 0.055, hip - 0.12, 8, (x, 0, (hip - 0.12) / 2 + 0.04), 'M_Cloth_Navy')
        l.box((0.1, 0.17, 0.08), (x, -0.025, 0.04), 'M_Black', bevel=0.022)
        legs.append(l.build(f'{P}_Leg{"L" if s_ > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, -0.05, 1.08)
    R = (0.19, 0.175, 0.18)
    h = MB()
    face_base(h, C, R, brow_el=0.28, brows='M_HairBlonde', blush_el=-0.28, blush_az=0.62)
    hair_shell(h, C, R, 1.07, m='M_HairBlonde', fringe=0.42, side=1.1, bottom=-0.45, back_bottom=-0.75)
    bangs(h, C, R, 5, 0.42, 0.85, m='M_HairBlonde', size=(0.08, 0.07, 0.03), k=1.05, droop=0.06)
    # one long braid over the right shoulder
    p0, n0 = surf(C, R, 0.85, -0.5, -0.01)
    pts = [Vector(p0) + Vector((-0.014 * k, -0.03 * k, -0.07 * k)) for k in range(5)]
    for i, q in enumerate(pts):
        h.sphere((0.034 - i * 0.002, 0.03, 0.04), tuple(q), 'M_HairBlonde', 8, 5)
    h.sphere((0.022, 0.02, 0.016), tuple(pts[-1] + Vector((0, -0.005, -0.04))), 'M_AppleRed', 6, 4)
    # captain's cap: white crown, black peak, gold band and badge
    cm = T((C[0], C[1] + 0.0, C[2] + R[2] * 0.55), (-8, 0, 0))
    h.lathe([(0.185, 0.0), (0.19, 0.05), (0.215, 0.09), (0.2, 0.11), (0.0, 0.115)], 14, m='M_Cloth_White', M=cm, scale=(1, 0.98, 1))
    h.torus(0.188, 0.016, 14, 4, (0, 0, 0.025), 'M_Black', M=cm)
    peak = [(0.15 * math.cos(a), -0.12 - 0.09 * math.sin(a)) for a in [PI * i / 8 for i in range(9)]]
    h.prism(peak, 0.016, cm @ T((0, 0, 0.0), (-18, 0, 0)), 'M_Black')
    pb, nb = surf((C[0], C[1], C[2] + R[2] * 0.62), (0.2, 0.19, 0.1), 0, 0.2, 0.0)
    h.sphere((0.03, 0.012, 0.026), (0, C[1] - 0.188, C[2] + R[2] * 0.55 + 0.055), 'M_Gold', 8, 5)
    _head_common(h, C, R, -0.42, 0.05, 0.032)
    head = h.build(f'{P}_Head', pivot=(0, -0.04, sh + 0.03))
    e, ec = eyes(C, R, az=0.34, el=-0.06, ew=0.036, eh=0.048, brown=False, lash=True, iris='M_Cloth_Blue')
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = [arm(P, s_, (s_ * 0.155, -0.04, sh - 0.05), 0.33, 'M_Cloth_Captain', r_top=0.05, r_bot=0.045,
                sleeve_frac=0.9, cuff_m='M_Gold', hand_r=0.044, splay=7) for s_ in (1, -1)]
    return assemble(P, body, head, eo, None, arms, legs)


# ------------------------------------------------------------------ Golden Request visitors (Slice B)
def _visitor(P, coat, legs_m='M_Cloth_Navy', shoes='M_Black', hair='M_Hair', skin='M_Skin', dress=False,
             hair_kw=None, sleeve=None, cuff=None, body_extra=None, head_extra=None, eye_iris='M_Hair', lash=False, tall=0.0):
    """An adult visitor on the Ingrid build: coat or dress, legs, head with hair, arms. `body_extra(b, hip, sh)`
    and `head_extra(h, C, R)` add the details that make each one."""
    hip, sh = 0.5 + tall, 0.88 + tall
    b = MB()
    if dress:
        prof = [(0.0, 0.18), (0.24, 0.18), (0.2, hip - 0.05), (0.15, hip + 0.12), (0.15, sh - 0.1),
                (0.14, sh - 0.01), (0.075, sh + 0.035), (0.0, sh + 0.04)]
    else:
        prof = [(0.0, hip - 0.12), (0.16, hip - 0.12), (0.165, hip + 0.02), (0.15, hip + 0.16), (0.155, sh - 0.1),
                (0.14, sh - 0.01), (0.075, sh + 0.035), (0.0, sh + 0.04)]
    b.lathe(prof, 12, m=coat, scale=(1, 0.85, 1))
    if body_extra:
        body_extra(b, hip, sh)
    body = b.build(f'{P}_Body')
    legs = []
    for s_ in (1, -1):
        l = MB()
        x = s_ * 0.072
        top = 0.2 if dress else hip - 0.12
        l.cyl(0.05 if dress else 0.06, 0.05, top - 0.04, 8, (x, 0, (top - 0.04) / 2 + 0.04), skin if dress else legs_m)
        l.box((0.1, 0.17, 0.08), (x, -0.025, 0.04), shoes, bevel=0.022)
        legs.append(l.build(f'{P}_Leg{"L" if s_ > 0 else "R"}', pivot=(x, 0, hip)))
    C = (0, -0.05, 1.08 + tall)
    R = (0.19, 0.175, 0.18)
    h = MB()
    face_base(h, C, R, skin=skin, brow_el=0.28, brows=hair, blush_el=-0.28, blush_az=0.62)
    hk = dict(k=1.07, m=hair, fringe=0.42, side=1.1, bottom=-0.45, back_bottom=-0.6)
    hk.update(hair_kw or {})
    if hk.pop('none', False) is False:
        hair_shell(h, C, R, **hk)
    if head_extra:
        head_extra(h, C, R)
    _head_common(h, C, R, -0.42, 0.05, 0.032)
    head = h.build(f'{P}_Head', pivot=(0, -0.04, sh + 0.03))
    e, ec = eyes(C, R, az=0.34, el=-0.06, ew=0.036, eh=0.048, brown=eye_iris == 'M_Hair', lash=lash, iris=eye_iris)
    eo = e.build(f'{P}_Eyes', pivot=tuple(ec))
    arms = [arm(P, s_, (s_ * 0.155, -0.04, sh - 0.05), 0.33, sleeve or coat, hand_m=skin, r_top=0.05, r_bot=0.045,
                sleeve_frac=0.9, cuff_m=cuff or (sleeve or coat), hand_r=0.044, splay=7) for s_ in (1, -1)]
    return assemble(P, body, head, eo, None, arms, legs)


def _glasses(h, C, R, m='M_Black', r=0.048):
    for s_ in (-1, 1):
        p, n = surf(C, R, s_ * 0.33, -0.06, 0.016)
        h.torus(r, 0.006, 12, 4, (0, 0, 0), m, M=align_z(n, p))
    pb, nb = surf(C, R, 0, -0.04, 0.024)
    h.cyl(0.005, 0.005, 0.06, 4, tuple(pb), m, (0, 90, 0))


def build_visitors():
    # Mr. Ogane (Tokyo): toy company boss in a grey suit, red tie, round glasses, neat black hair
    def ogane_body(b, hip, sh):
        b.box((0.07, 0.02, 0.16), (0, -0.13, sh - 0.12), 'M_Cloth_White')
        b.prism([(-0.018, 0), (0.018, 0), (0.012, -0.14), (0, -0.16), (-0.012, -0.14)], 0.01, T((0, -0.138, sh - 0.03), (90, 0, 0)), 'M_AppleRed')
        b.sphere((0.012, 0.006, 0.012), (0.07, -0.13, sh - 0.08), 'M_Gold', 6, 4)
    def ogane_head(h, C, R):
        _glasses(h, C, R)
        for s_ in (-1, 1):
            p, n = surf(C, R, s_ * 0.12, -0.3, 0.006)
            h.sphere((0.04, 0.016, 0.018), tuple(p), 'M_HairBlack', 8, 5, rot=(0, s_ * 18, 0))
    _visitor('Customer_G', 'M_Cloth_Suit', 'M_Cloth_Suit', hair='M_HairBlack', body_extra=ogane_body, head_extra=ogane_head,
             hair_kw=dict(fringe=0.25, bottom=-0.25, back_bottom=-0.4))

    # Chef Amelie (Paris): chef whites, blue neckerchief, tall toque, brown bob
    def amelie_body(b, hip, sh):
        for s_ in (-1, 1):
            for z in (sh - 0.2, sh - 0.12):
                b.sphere((0.012, 0.008, 0.012), (s_ * 0.05, -0.133, z), 'M_Cloth_Blue', 6, 4)
        b.sphere((0.03, 0.022, 0.026), (0, -0.075, sh + 0.02), 'M_Cloth_Blue', 8, 5)
    def amelie_head(h, C, R):
        tm = T((C[0], C[1] + 0.01, C[2] + R[2] * 0.55), (-6, 0, 0))
        h.lathe([(0.178, -0.01), (0.182, 0.06), (0.205, 0.1), (0.23, 0.17), (0.225, 0.24), (0.19, 0.29), (0.1, 0.31), (0.0, 0.315)],
                14, m='M_Cloth_White', M=tm, scale=(1, 0.98, 1))
    _visitor('Customer_F', 'M_Cloth_White', 'M_Cloth_Charcoal', hair='M_Hair', body_extra=amelie_body, head_extra=amelie_head,
             eye_iris='M_Cloth_Blue', lash=True, hair_kw=dict(fringe=0.5, bottom=-0.5, back_bottom=-0.55))

    # Commander Leila (space station): white flight suit, blue patches, collar ring, headset
    def leila_body(b, hip, sh):
        b.torus(0.085, 0.022, 12, 5, (0, 0, sh + 0.02), 'M_Metal')
        b.box((0.09, 0.03, 0.06), (0, -0.135, sh - 0.2), 'M_Cloth_Navy', bevel=0.008)
        for i, m in enumerate(('M_AppleRed', 'M_JuiceGold', 'M_Leaf')):
            b.box((0.012, 0.01, 0.012), (-0.025 + i * 0.025, -0.152, sh - 0.2), m)
        b.sphere((0.03, 0.01, 0.03), (0.09, -0.12, sh - 0.08), 'M_Cloth_Blue', 8, 5)
        b.box((0.32, 0.02, 0.03), (0, 0, hip + 0.02), 'M_Cloth_Orange')
    def leila_head(h, C, R):
        p, n = surf(C, R, 1.25, -0.05, 0.02)
        h.sphere((0.03, 0.03, 0.03), tuple(p), 'M_Black', 8, 5)
        h.tube([p, (p[0] - 0.06, p[1] - 0.12, p[2] - 0.08)], 0.006, 4, 'M_Black')
        h.torus(0.2, 0.01, 14, 4, (C[0], C[1] + 0.01, C[2] + 0.02), 'M_Black', (0, 90, 0))
    _visitor('Customer_L', 'M_Cloth_White', 'M_Cloth_White', shoes='M_MetalDark', hair='M_HairBlack', skin='M_SkinMid',
             body_extra=leila_body, head_extra=leila_head, hair_kw=dict(fringe=0.35, bottom=-0.3, back_bottom=-0.45))

    # Carer Mia (Queensland): khaki shirt, green shorts, bush hat, auburn ponytail
    def mia_body(b, hip, sh):
        for s_ in (-1, 1):
            b.box((0.06, 0.012, 0.05), (s_ * 0.06, -0.132, sh - 0.12), 'M_Cloth_Khaki', bevel=0.004)
        b.box((0.32, 0.02, 0.035), (0, 0, hip - 0.05), 'M_Wood')
    def mia_head(h, C, R):
        hm = T((C[0], C[1], C[2] + R[2] * 0.6), (-5, 0, 0))
        h.cyl(0.28, 0.28, 0.012, 16, (0, 0, 0), 'M_Cloth_Khaki', M=hm)
        h.lathe([(0.17, 0.0), (0.16, 0.08), (0.12, 0.12), (0.0, 0.13)], 14, m='M_Cloth_Khaki', M=hm)
        h.torus(0.17, 0.012, 14, 4, (0, 0, 0.02), 'M_Wood', M=hm)
        p, n = surf(C, R, 3.0, 0.0, 0.02)
        for i in range(3):
            h.sphere((0.04, 0.035, 0.045), (p[0], p[1] + 0.03 + i * 0.03, p[2] - 0.05 - i * 0.06), 'M_HairAuburn', 8, 5)
    _visitor('Customer_M', 'M_Cloth_Khaki', 'M_Cloth_Green', shoes='M_WoodDark', hair='M_HairAuburn', body_extra=mia_body,
             head_extra=mia_head, eye_iris='M_Leaf', lash=True, hair_kw=dict(fringe=0.4, bottom=-0.35, back_bottom=-0.5))

    # Princess Amara (Rosevale): pink gown, gold tiara, long dark curls
    def amara_body(b, hip, sh):
        b.torus(0.2, 0.014, 14, 4, (0, 0, 0.3), 'M_Gold', scale=(1, 0.85, 1))
        b.sphere((0.025, 0.012, 0.025), (0, -0.13, sh - 0.06), 'M_AppleRed', 8, 5)
    def amara_head(h, C, R):
        tm = T((C[0], C[1] + 0.01, C[2] + R[2] * 0.78), (-12, 0, 0))
        h.torus(0.13, 0.012, 14, 4, (0, 0, 0), 'M_Gold', M=tm)
        for i, a in enumerate((-40, -20, 0, 20, 40)):
            ar = math.radians(a)
            h.cyl(0.014, 0.0, 0.05 if a == 0 else 0.035, 4, (0.13 * math.sin(ar), -0.13 * math.cos(ar), 0.0), 'M_Gold', M=tm, base=True)
        h.sphere((0.014, 0.01, 0.014), (0, -0.135, 0.02), 'M_Cloth_Pink', 6, 4, M=tm)
    _visitor('Customer_P', 'M_Cloth_Pink', hair='M_HairBlack', skin='M_SkinDeep', dress=True, body_extra=amara_body,
             head_extra=amara_head, lash=True, shoes='M_Gold', hair_kw=dict(k=1.12, fringe=0.45, side=1.2, bottom=-0.75, back_bottom=-1.0))

    # The Head Butler (London): black tailcoat, white shirt front, bow tie, white gloves, grey hair
    def butler_body(b, hip, sh):
        b.box((0.08, 0.02, 0.24), (0, -0.13, sh - 0.14), 'M_Cloth_White')
        b.sphere((0.03, 0.012, 0.014), (-0.02, -0.142, sh - 0.03), 'M_Black', 6, 4)
        b.sphere((0.03, 0.012, 0.014), (0.02, -0.142, sh - 0.03), 'M_Black', 6, 4)
        for s_ in (-1, 1):
            b.box((0.08, 0.03, 0.32), (s_ * 0.08, 0.1, hip - 0.1), 'M_Black', (8, 0, 0))
    def butler_head(h, C, R):
        pass
    _visitor('Customer_H', 'M_Black', 'M_Black', hair='M_HairGrey', body_extra=butler_body, head_extra=butler_head,
             sleeve='M_Black', cuff='M_Cloth_White', tall=0.06, hair_kw=dict(fringe=0.2, bottom=-0.25, back_bottom=-0.45))

    # Grandma Rosa (New York): lavender cardigan, grey bun, glasses, string of pearls
    def rosa_body(b, hip, sh):
        for i in range(4):
            b.sphere((0.01, 0.008, 0.01), (0, -0.132, sh - 0.08 - i * 0.07), 'M_Cream', 6, 4)
        b.torus(0.07, 0.008, 14, 4, (0, -0.02, sh - 0.0), 'M_White', (-20, 0, 0))
    def rosa_head(h, C, R):
        _glasses(h, C, R, 'M_AppleRed')
        h.sphere((0.08, 0.075, 0.07), (C[0], C[1] + 0.07, C[2] + R[2] * 0.95), 'M_HairGrey', 10, 6)
    _visitor('Customer_R', 'M_Cloth_Lavender', 'M_Cloth_Charcoal', shoes='M_WoodDark', hair='M_HairGrey', skin='M_SkinMid',
             body_extra=rosa_body, head_extra=rosa_head, hair_kw=dict(fringe=0.38, bottom=-0.35, back_bottom=-0.45))

    # Dr. Kiri (Antarctica): red parka with a fur-trimmed hood, snow goggles up on the hood, dark trousers, big boots
    def kiri_body(b, hip, sh):
        b.box((0.03, 0.02, 0.34), (0, -0.135, sh - 0.2), 'M_MetalDark')
        b.box((0.33, 0.02, 0.05), (0, 0, hip - 0.08), 'M_Fur')
        for s_ in (-1, 1):
            b.box((0.07, 0.014, 0.06), (s_ * 0.075, -0.13, hip + 0.06), 'M_Cloth_Parka', bevel=0.006)
        b.box((0.05, 0.012, 0.03), (-0.07, -0.135, sh - 0.12), 'M_Cloth_Navy')
    def kiri_head(h, C, R):
        hair_shell(h, C, R, k=1.28, m='M_Cloth_Parka', fringe=0.62, side=1.25, bottom=-0.75, back_bottom=-0.95)
        h.torus(0.2, 0.04, 18, 6, (C[0], C[1] - 0.12, C[2] - 0.01), 'M_Fur', (90, 0, 0), scale=(1.0, 1.15, 1))
        for s_ in (-1, 1):
            p, n = surf(C, R, s_ * 0.3, 0.72, 0.07)
            h.cyl(0.038, 0.038, 0.03, 10, (0, 0, 0), 'M_Goggle', M=align_z(n, p))
        p, n = surf(C, R, 0, 0.72, 0.06)
        h.box((0.3, 0.03, 0.02), tuple(p), 'M_Black', (-40, 0, 0))
    _visitor('Customer_K', 'M_Cloth_Parka', 'M_Cloth_Navy', shoes='M_Black', hair='M_HairBlack', skin='M_SkinMid',
             body_extra=kiri_body, head_extra=kiri_head, sleeve='M_Cloth_Parka', cuff='M_Fur',
             hair_kw=dict(fringe=0.45, bottom=-0.3, back_bottom=-0.4))

    # Halmeoni Ji-woo (Seoul): hanbok with a short pink jacket, red bow and a jade skirt, grey bun with a gold hairpin
    def jiwoo_body(b, hip, sh):
        b.lathe([(0.0, sh - 0.2), (0.165, sh - 0.2), (0.16, sh - 0.08), (0.145, sh - 0.01), (0.075, sh + 0.04), (0.0, sh + 0.045)], 12,
                m='M_Cloth_Pink', scale=(1.02, 0.88, 1))
        b.box((0.32, 0.03, 0.03), (0, -0.005, sh - 0.2), 'M_White')
        b.sphere((0.035, 0.015, 0.025), (0.03, -0.142, sh - 0.12), 'M_Cloth_Red', 8, 5)
        for s_ in (0.3, -0.25):
            b.box((0.024, 0.01, 0.14), (0.03 + s_ * 0.06, -0.142, sh - 0.2), 'M_Cloth_Red', (0, s_ * 20, 0))
    def jiwoo_head(h, C, R):
        h.sphere((0.085, 0.075, 0.07), (C[0], C[1] + 0.15, C[2] - 0.02), 'M_HairGrey', 10, 6)
        h.cyl(0.008, 0.008, 0.26, 6, (C[0], C[1] + 0.2, C[2] - 0.02), 'M_Gold', (0, 90, 0))
    _visitor('Customer_J', 'M_Cloth_Jade', hair='M_HairGrey', dress=True, body_extra=jiwoo_body, head_extra=jiwoo_head,
             sleeve='M_Cloth_Pink', cuff='M_White', shoes='M_White', lash=True, hair_kw=dict(fringe=0.3, bottom=-0.3, back_bottom=-0.45))

    # Ranger Amani (Kenya): olive ranger shirt and cap, khaki trousers, binoculars round the neck
    def amani_body(b, hip, sh):
        for s_ in (-1, 1):
            b.box((0.06, 0.012, 0.05), (s_ * 0.06, -0.132, sh - 0.12), 'M_Cloth_Olive', bevel=0.004)
            b.cyl(0.022, 0.022, 0.06, 8, (s_ * 0.026, -0.16, sh - 0.2), 'M_Black', (90, 0, 0))
        b.tube([(-0.05, -0.15, sh - 0.18), (-0.07, -0.11, sh), (0, -0.07, sh + 0.04), (0.07, -0.11, sh), (0.05, -0.15, sh - 0.18)], 0.006, 4, 'M_WoodDark')
        b.box((0.32, 0.02, 0.035), (0, 0, hip - 0.05), 'M_WoodDark')
        b.box((0.05, 0.01, 0.03), (0.07, -0.135, sh - 0.06), 'M_Gold')
    def amani_head(h, C, R):
        hm = T((C[0], C[1] + 0.01, C[2] + R[2] * 0.55), (-8, 0, 0))
        h.lathe([(0.19, 0.0), (0.185, 0.06), (0.14, 0.12), (0.0, 0.14)], 14, m='M_Cloth_Olive', M=hm)
        h.box((0.2, 0.12, 0.012), (0, -0.2, 0.005), 'M_Cloth_Olive', M=hm)
    _visitor('Customer_N', 'M_Cloth_Olive', 'M_Cloth_Khaki', shoes='M_WoodDark', hair='M_HairBlack', skin='M_SkinDeep',
             body_extra=amani_body, head_extra=amani_head, hair_kw=dict(k=1.04, fringe=0.15, bottom=-0.25, back_bottom=-0.35))

    # Lucas (Rio de Janeiro): white shirt with a green and yellow sash, samba drum at the hip, curly black hair
    def lucas_body(b, hip, sh):
        b.tube([(-0.12, -0.12, sh - 0.02), (0.0, -0.15, sh - 0.2), (0.13, -0.12, hip + 0.02)], 0.028, 6, 'M_Cloth_Samba')
        b.tube([(-0.12, -0.13, sh - 0.06), (0.0, -0.155, sh - 0.24), (0.13, -0.13, hip - 0.02)], 0.014, 6, 'M_Cloth_Yellow')
        b.cyl(0.1, 0.1, 0.2, 14, (0.12, -0.17, hip - 0.02), 'M_Silver', (0, 90, 0))
        for dx in (-0.1, 0.1):
            b.cyl(0.104, 0.104, 0.012, 14, (0.12 + dx, -0.17, hip - 0.02), 'M_White', (0, 90, 0))
        b.cyl(0.006, 0.006, 0.2, 5, (-0.03, -0.24, hip + 0.06), 'M_Wood', (0, 60, 0))
    def lucas_head(h, C, R):
        for i in range(11):
            az = -1.6 + i * 0.32
            p, n = surf(C, R, az, 0.55 - abs(az) * 0.08, 0.03)
            h.sphere((0.05, 0.05, 0.045), tuple(p), 'M_HairBlack', 8, 5)
    _visitor('Customer_S', 'M_Cloth_White', 'M_Cloth_Navy', shoes='M_White', hair='M_HairBlack', skin='M_SkinMid',
             body_extra=lucas_body, head_extra=lucas_head, hair_kw=dict(k=1.1, fringe=0.3, bottom=-0.3, back_bottom=-0.45))

VISITOR_ROOTS = ['Customer_G', 'Customer_F', 'Customer_L', 'Customer_M', 'Customer_P', 'Customer_H', 'Customer_R',
                 'Customer_K', 'Customer_J', 'Customer_N', 'Customer_S']
