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
