"""Apples, cut pieces, tools and appliances. Blender coords (-Y = front). Origins bottom centre."""
import math
import random
from mathutils import Vector, Matrix
from lib import MB, T, empty, parent, emblem, align_z, apple_profile, leaf_poly, rot2d, PI, APPLE_PROFILE


# ------------------------------------------------------------------ apple pieces
def wedge_geo(mb, a0, a1, M=None, s=1.0, core=0.02, seg=3, skin='M_AppleSkin', flesh='M_Flesh',
              skin_fn=None):
    """Apple wedge between azimuths a0..a1 (deg, 0 = -Y) with the core removed.
    skin_fn(t, u) -> bool decides per skin quad (t: 0 bottom..1 top, u: 0..1 across) whether it keeps skin."""
    prof = [(r * s, z * s) for r, z in APPLE_PROFILE if r * s > core * s * 1.01]
    zb, zt = prof[0][1], prof[-1][1]
    ring = [(core * s, zb)] + prof + [(core * s, zt)]
    n = len(ring)
    verts, faces, fm = [], [], []
    angs = [math.radians(a0 + (a1 - a0) * i / seg) for i in range(seg + 1)]
    for a in angs:
        for (r, z) in ring:
            verts.append((r * math.sin(a), -r * math.cos(a), z))
    # index: ai * n + k
    for i in range(seg):
        for k in range(n - 1):
            q = [i * n + k, (i + 1) * n + k, (i + 1) * n + k + 1, i * n + k + 1]
            t = (k - 0.5) / (n - 3)
            u = (i + 0.5) / seg
            if k == 0 or k == n - 2:
                m = flesh if skin_fn else skin
            else:
                m = skin if (skin_fn is None or skin_fn(t, u)) else flesh
            faces.append(q)
            fm.append(m)
        # notch (inner core face)
        q = [i * n + n - 1, (i + 1) * n + n - 1, (i + 1) * n + 0, i * n + 0]
        faces.append(q)
        fm.append(flesh)
    faces.append(list(range(0, n)))
    fm.append(flesh)
    faces.append([seg * n + k for k in range(n)][::-1])
    fm.append(flesh)
    MM = M or Matrix()
    off = len(mb.V)
    for v in verts:
        mb.V.append(MM @ Vector(v))
    for f, m in zip(faces, fm):
        mb.F.append([off + j for j in f])
        mb.M.append(m)
        mb.UV.append(None)
    return mb


def lay_on_cut(a1_deg):
    """Rotation that lays a wedge on its cut face at azimuth a1 (axis becomes +X)."""
    a = math.radians(a1_deg)
    u = Vector((0, 0, 1))
    v = Vector((math.sin(a), -math.cos(a), 0))
    w = u.cross(v)  # points toward increasing azimuth (outward of a1 face)
    B_old = Matrix((u, v, w)).transposed()
    B_new = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))).transposed()
    return (B_new @ B_old.inverted()).to_4x4()


def skin_up():
    """Rotation: apple axis -> +X, radial (-Y) -> +Z (skin facing up)."""
    B_old = Matrix(((0, 0, 1), (0, -1, 0), (1, 0, 0))).transposed()  # u=Z, v=-Y, w=u x v = X
    B_new = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).transposed()  # X, Z, X x Z = -Y
    return (B_new @ B_old.inverted()).to_4x4()


def drop_to_ground(mb, start):
    zmin = min(v.z for v in mb.V[start:])
    for i in range(start, len(mb.V)):
        mb.V[i] = mb.V[i] - Vector((0, 0, zmin))


def centred(tmp, R=None):
    """Rotate a temp MB by R, then centre it in XY with its lowest point at z=0."""
    if R is not None:
        tmp.V = [R @ v for v in tmp.V]
    zmin = min(v.z for v in tmp.V)
    cx = sum(v.x for v in tmp.V) / len(tmp.V)
    cy = sum(v.y for v in tmp.V) / len(tmp.V)
    tmp.V = [v - Vector((cx, cy, zmin)) for v in tmp.V]
    return tmp


def fan(i, n, step, pivot=0.25):
    """Placement matrix for item i of n fanned about a pivot behind (+Y)."""
    th = (i - (n - 1) / 2) * step
    return T((0, pivot, 0)) @ T((0, 0, 0), (0, 0, th)) @ T((0, -pivot, 0))


def wedge_surface_pt(t, a_deg, k=1.0, s=1.0, core=0.022):
    """Point on the outer skin of an upright apple (t: 0 bottom .. 1 top along the profile)."""
    prof = [(r * s, z * s) for r, z in APPLE_PROFILE if r * s > core * s * 1.01]
    x = t * (len(prof) - 1)
    i = min(int(x), len(prof) - 2)
    f = x - i
    r = prof[i][0] * (1 - f) + prof[i + 1][0] * f
    z = prof[i][1] * (1 - f) + prof[i + 1][1] * f
    a = math.radians(a_deg)
    return Vector((r * k * math.sin(a), -r * k * math.cos(a), z + (k - 1) * 0.02 * s))


def skin_patch(mb, rows, a0, a1, s, m='M_AppleSkin'):
    """rows: list of (t, u0, u1, k) from one end to the other; builds a 3-column strip."""
    cols = 3
    verts, faces = [], []
    for (t, u0, u1, k) in rows:
        for c in range(cols + 1):
            u = u0 + (u1 - u0) * c / cols
            verts.append(wedge_surface_pt(t, a0 + (a1 - a0) * u, k, s))
    for r in range(len(rows) - 1):
        for c in range(cols):
            i0 = r * (cols + 1) + c
            i1 = (r + 1) * (cols + 1) + c
            f = [i0, i0 + 1, i1 + 1, i1]
            if rows[1][0] < rows[0][0]:
                f = f[::-1]
            faces.append(f)
    mb.add_raw(verts, faces, m)


def build_rabbit_piece(mb, M, s=1.0):
    """Rabbit apple wedge: flesh wedge, skin kept on the back half, two lifted skin 'ears' toward the front.
    Skin up, length along Y (ears point -Y = front), resting on z=0, then placed by M."""
    a0, a1 = -27, 27
    tmp = MB()
    wedge_geo(tmp, a0, a1, s=s, seg=4, core=0.022, skin='M_Flesh')
    # back half skin (apple top end)
    skin_patch(tmp, [(t, 0.0, 1.0, 1.035) for t in (0.5, 0.62, 0.75, 0.88, 1.0)], a0, a1, s)
    # ears (apple bottom end), tapered + lifted
    for side in (0, 1):
        rows = []
        for t in (0.5, 0.39, 0.28, 0.17, 0.08):
            w = 0.16 + 0.26 * (t - 0.08) / 0.42
            k = 1.035 + (0.5 - t) * 0.22
            rows.append((t, 0.0, w, k) if side == 0 else (t, 1.0 - w, 1.0, k))
        skin_patch(tmp, rows, a0, a1, s)
    centred(tmp, T((0, 0, 0), (0, 0, 90)) @ skin_up())
    mb.merge(tmp, M)
    return mb


def rabbit_rule(t, u):
    """t: 0 = apple bottom .. 1 = apple top; u across wedge. Keep skin at the top half (body) and
    the V-shaped ears that point toward the bottom end."""
    v = abs(u - 0.5) * 2  # 0 centre .. 1 edge
    if t > 0.62:
        return True
    if t > 0.18 and v > 1.0 - (t - 0.18) * 2.4 and v > 0.34:
        return True
    return False


def apple_pieces_wedges(name, prefix, rabbit=False, s=1.0):
    root = empty(name)
    for i in range(4):
        w = MB()
        if rabbit:
            build_rabbit_piece(w, Matrix(), s)
            w.V = [T((0, 0.0, 0), (0, 0, 0)) @ v for v in w.V]
        else:
            wedge_geo(w, -45, 45, s=s, seg=3, core=0.022)
            centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(45))
        M = fan(i, 4, 21 if not rabbit else 24, 0.26)
        w.V = [M @ v for v in w.V]
        c = sum((v for v in w.V), Vector()) / len(w.V)
        o = w.build(f'{prefix}_{i + 1}', pivot=(c.x, c.y, 0))
        parent(o, root)
    return root


# ------------------------------------------------------------------ apple
def apple_body(mb, M=None, m='M_AppleSkin', seg=12, uv=True, s=1.0, lo=False):
    mb.lathe(apple_profile(s, lo), seg, m=m, M=M, uv=uv)
    return mb


def apple_stem(mb, M=None, s=1.0):
    mb.tube([(0, 0, 0.112 * s), (0.002 * s, 0, 0.14 * s), (0.008 * s, 0, 0.162 * s)], 0.0055 * s, 5, 'M_WoodDark', M=M)


def apple_leaf(mb, M=None, s=1.0):
    lf = leaf_poly(0.065 * s, 0.032 * s, 5)
    mb.prism(lf, 0.003 * s, (M or Matrix()) @ T((0.006 * s, 0, 0.145 * s), (-15, -25, 20)), 'M_Leaf')
    mb.box((0.04 * s, 0.002 * s, 0.003 * s), (0.026 * s, 0, 0.1555 * s), 'M_LeafDark', (-15, -25, 20), M=M)


def build_apple():
    root = empty('Apple')
    b = apple_body(MB()).build('Apple_Body')
    st = MB()
    apple_stem(st)
    so = st.build('Apple_Stem', pivot=(0, 0, 0.112))
    lf = MB()
    apple_leaf(lf)
    lo = lf.build('Apple_Leaf', pivot=(0.006, 0, 0.145))
    for o in (b, so, lo):
        parent(o, root)
    # peeled
    r2 = empty('Apple_Peeled')
    p = MB().lathe(apple_profile(0.97), 12, m='M_Flesh').build('Apple_Peeled_Body')
    st = MB()
    st.tube([(0, 0, 0.11), (0.002, 0, 0.135), (0.007, 0, 0.152)], 0.005, 5, 'M_WoodDark')
    # a few flat peel facets: tiny skin bits at the bottom where peel is unfinished
    st.lathe([(0.0, 0.006), (0.02, 0.002), (0.0, 0.004)], 8, m='M_AppleSkin')
    so = st.build('Apple_Peeled_Stem', pivot=(0, 0, 0.11))
    parent(p, r2)
    parent(so, r2)


def build_cut_pieces():
    apple_pieces_wedges('Apple_Wedges', 'Wedge')
    apple_pieces_wedges('Rabbit_Wedges', 'RabbitWedge', rabbit=True)
    rnd = random.Random(5)
    # dice
    d = MB()
    pts = []
    for layer, (n, r) in enumerate(((9, 0.065), (5, 0.04), (1, 0.0))):
        for i in range(n):
            a = 2 * PI * i / max(n, 1) + layer
            pts.append((r * math.cos(a) + rnd.uniform(-0.008, 0.008), r * math.sin(a) + rnd.uniform(-0.008, 0.008),
                        0.012 + layer * 0.02))
    pts.append((0.0, 0.0, 0.012))
    for (x, y, z) in pts:
        d.box((0.026, 0.026, 0.024), (x, y, z), 'M_Flesh', (rnd.uniform(-15, 15), rnd.uniform(-15, 15),
                                                            rnd.uniform(0, 90)))
    d.build('Apple_Dice')
    # slices: thin peeled crescents in a fan
    sl = MB()
    for i in range(7):
        tmp = MB()
        wedge_geo(tmp, -8, 8, s=1.0, seg=2, core=0.024, skin='M_Flesh')
        centred(tmp, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(8))
        sl.merge(tmp, fan(i, 7, 14, 0.2) @ T((0, -0.02, i * 0.004 + abs(i - 3) * -0.001)))
    drop_to_ground(sl, 0)
    sl.build('Apple_Slices')
    # chunks with some skin
    ch = MB()
    for i in range(7):
        a = 2 * PI * i / 7
        r = 0.045 if i else 0.0
        x, y = r * math.cos(a), r * math.sin(a)
        M = T((x, y, 0.02 + (0.0 if i else 0.022)), (rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 360)))
        st = len(ch.V)
        wedge_geo(ch, -35, 35, s=0.55, seg=2, core=0.03)
        c = sum(ch.V[st:], Vector()) / (len(ch.V) - st)
        for k in range(st, len(ch.V)):
            ch.V[k] = M @ (ch.V[k] - c)
    drop_to_ground(ch, 0)
    ch.build('Apple_Chunks')


# ------------------------------------------------------------------ tools
def build_tools():
    b = MB()
    b.box((0.46, 0.30, 0.022), (0, 0, 0.011), 'M_Wood', bevel=0.006)
    b.box((0.445, 0.285, 0.01), (0, 0, 0.025), 'M_WoodLight')
    b.cyl(0.014, 0.014, 0.012, 8, (0.19, 0.0, 0.026), 'M_Wood')  # hang hole
    b.build('CuttingBoard')

    k = MB()
    k.box((0.095, 0.02, 0.026), (0.0475, 0, 0), 'M_WoodDark', bevel=0.007)
    for x in (0.025, 0.065):
        k.cyl(0.004, 0.004, 0.022, 6, (x, 0, 0), 'M_Metal', (90, 0, 0))
    k.box((0.012, 0.016, 0.03), (0.1, 0, 0), 'M_Metal')
    blade = [(0.0, 0.016), (0.1, 0.012), (0.122, 0.0), (0.118, -0.008), (0.06, -0.022), (0.0, -0.022)]
    k.prism(blade, 0.004, T((0.105, 0.002, 0.0), (90, 0, 0)), 'M_Metal')
    k.build('Knife')

    s = MB()
    s.sphere((0.03, 0.022, 0.009), (0, 0, 0.0), 'M_WoodLight', 10, 6)
    s.tube([(0.025, 0, 0.004), (0.08, 0, 0.04), (0.17, 0, 0.12)], [0.0065, 0.0065, 0.0075], 6, 'M_WoodLight')
    s.build('Spoon')

    st = MB()
    st.cyl(0.0055, 0.0055, 0.15, 6, (0, 0, 0.0), 'M_WoodLight', base=True)
    st.cyl(0.0055, 0.0015, 0.012, 6, (0, 0, 0.15), 'M_WoodLight', base=True)
    st.build('Stick')

    c = MB()
    c.box((0.28, 0.2, 0.012), (0, 0, 0.006), 'M_Metal')
    for sx in (-1, 1):
        c.box((0.012, 0.2, 0.022), (sx * 0.134, 0, 0.016), 'M_Metal')
        c.box((0.28, 0.012, 0.022), (0, sx * 0.094, 0.016), 'M_Metal')
    c.box((0.24, 0.165, 0.004), (0.003, 0.002, 0.014), 'M_Paper', (0, 0, 2))
    c.build('CoolingTray')


def stove(mb, w=0.28, d=0.24, h=0.075, knob=True):
    mb.box((w, d, h), (0, 0, h / 2), 'M_Cream', bevel=0.014)
    mb.box((w + 0.004, d + 0.004, 0.02), (0, 0, 0.012), 'M_AppleRed', bevel=0.006)
    mb.box((w * 0.86, d * 0.84, 0.006), (0, 0.004, h), 'M_MetalDark')
    mb.torus(0.06, 0.006, 12, 4, (0, 0.004, h + 0.004), 'M_Black')
    for i in range(4):
        mb.box((0.11, 0.012, 0.012), (0, 0.004, h + 0.01), 'M_Black', (0, 0, 45 * i))
    if knob:
        mb.cyl(0.022, 0.02, 0.02, 10, (w * 0.3, -d / 2 - 0.008, h * 0.5), 'M_AppleRed', (90, 0, 0))
        mb.box((0.006, 0.006, 0.026), (w * 0.3, -d / 2 - 0.019, h * 0.5), 'M_White')


def steam_puff(mb, loc, s=1.0):
    x, y, z = loc
    mb.ico(0.03 * s, (x, y, z), 'M_White', 1)
    mb.ico(0.022 * s, (x + 0.026 * s, y, z - 0.008 * s), 'M_White', 1)
    mb.ico(0.02 * s, (x - 0.024 * s, y + 0.004, z - 0.01 * s), 'M_White', 1)


def dice_pile(mb, n, R, z, rnd, size=0.022, m='M_Flesh'):
    for i in range(n):
        a = rnd.uniform(0, 2 * PI)
        r = R * math.sqrt(rnd.random())
        mb.box((size, size, size * 0.9), (r * math.cos(a), r * math.sin(a), z + rnd.uniform(0, 0.01)), m,
               (rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 90)))


def build_appliances():
    rnd = random.Random(9)
    # ---------------- juicer
    root = empty('Juicer')
    j = MB()
    j.cyl(0.11, 0.115, 0.025, 12, (0, 0, 0.0), 'M_AppleRed', base=True, bevel=0.006)
    j.lathe([(0.0, 0.025), (0.105, 0.025), (0.108, 0.08), (0.1, 0.15), (0.09, 0.175), (0.0, 0.175)], 12, m='M_Cream')
    j.cyl(0.075, 0.08, 0.02, 12, (0, 0, 0.175), 'M_AppleRed', base=True)
    jo = j.build('Juicer_Base')
    hp = MB()
    hp.lathe([(0.0, 0.195), (0.062, 0.195), (0.07, 0.29), (0.064, 0.29), (0.056, 0.205), (0.0, 0.205)], 10,
             m='M_Glass')
    hp.torus(0.069, 0.007, 10, 4, (0, 0, 0.29), 'M_AppleRed')
    ho = hp.build('Juicer_Hopper', pivot=(0, 0, 0.195))
    ch = MB()
    for i in range(6):
        a = 2 * PI * i / 6
        st = len(ch.V)
        wedge_geo(ch, -35, 35, s=0.42, seg=2, core=0.03)
        c = sum(ch.V[st:], Vector()) / (len(ch.V) - st)
        M = T((0.03 * math.cos(a), 0.03 * math.sin(a), 0.225 + (i % 2) * 0.025),
              (rnd.uniform(-30, 30), rnd.uniform(-30, 30), rnd.uniform(0, 360)))
        for k in range(st, len(ch.V)):
            ch.V[k] = M @ (ch.V[k] - c)
    cho = ch.build('Juicer_Chunks', pivot=(0, 0, 0.21))
    bt = MB()
    bt.cyl(0.04, 0.04, 0.012, 12, (0, -0.1, 0.12), 'M_Cream', (90, 0, 0), base=False)
    bt.cyl(0.034, 0.03, 0.022, 12, (0, -0.112, 0.12), 'M_AppleRed', (90, 0, 0))
    bto = bt.build('Juicer_Button', pivot=(0, -0.104, 0.12))
    sp = MB()
    sp.tube([(0, -0.09, 0.06), (0, -0.13, 0.06), (0, -0.145, 0.045)], 0.014, 8, 'M_Metal')
    spo = sp.build('Juicer_Spout', pivot=(0, -0.09, 0.06))
    for o in (jo, ho, cho, bto, spo):
        parent(o, root)

    # ---------------- pot on stove
    root = empty('Pot')
    sv = MB()
    stove(sv)
    svo = sv.build('Stove')
    p = MB()
    z0 = 0.085
    p.lathe([(0.0, z0), (0.11, z0), (0.13, z0 + 0.02), (0.13, z0 + 0.13), (0.123, z0 + 0.13),
             (0.123, z0 + 0.012), (0.0, z0 + 0.012)], 14, m='M_Cream')
    p.torus(0.127, 0.008, 14, 4, (0, 0, z0 + 0.13), 'M_AppleRed')
    p.torus(0.131, 0.006, 14, 4, (0, 0, z0 + 0.03), 'M_AppleRed')
    for sx in (-1, 1):
        p.torus(0.02, 0.008, 8, 4, (sx * 0.145, 0, z0 + 0.105), 'M_AppleRed', (90, 0, 0))
    emblem(p, align_z((0, -1, 0), (0, -0.131, z0 + 0.075)), 0.05, 0.004, 'M_AppleRed', 'M_Leaf')
    po = p.build('Pot_Body', pivot=(0, 0, 0))
    pdz = MB()
    dice_pile(pdz, 26, 0.09, z0 + 0.07, rnd)
    for i in range(14):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0, 0.09)
        pdz.box((0.008, 0.008, 0.008), (r * math.cos(a), r * math.sin(a), z0 + 0.088), 'M_White',
                (rnd.uniform(0, 45), rnd.uniform(0, 45), 0))
    pdz.cyl(0.122, 0.122, 0.05, 14, (0, 0, z0 + 0.04), 'M_Flesh')
    pdo = pdz.build('Pot_Dice', pivot=(0, 0, z0 + 0.06))
    pj = MB()
    pj.lathe([(0.0, z0 + 0.01), (0.122, z0 + 0.01), (0.122, z0 + 0.095), (0.09, z0 + 0.1), (0.0, z0 + 0.104)], 14,
             m='M_Jam')
    for i in range(5):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0.02, 0.08)
        pj.box((0.018, 0.018, 0.012), (r * math.cos(a), r * math.sin(a), z0 + 0.1), 'M_Jam',
               (0, 0, rnd.uniform(0, 90)))
    pjo = pj.build('Pot_Jam', pivot=(0, 0, z0 + 0.1))
    ps = MB()
    steam_puff(ps, (-0.03, 0, z0 + 0.2), 1.0)
    steam_puff(ps, (0.04, 0.01, z0 + 0.26), 0.8)
    steam_puff(ps, (-0.01, -0.01, z0 + 0.32), 0.6)
    pso = ps.build('Pot_Steam', pivot=(0, 0, z0 + 0.16))
    for o in (svo, po, pdo, pjo, pso):
        parent(o, root)

    # ---------------- pan on stove
    root = empty('Pan')
    sv = MB()
    stove(sv)
    svo = sv.build('Pan_Stove')
    p = MB()
    z0 = 0.085
    p.lathe([(0.0, z0), (0.11, z0), (0.14, z0 + 0.04), (0.133, z0 + 0.042), (0.105, z0 + 0.01), (0.0, z0 + 0.01)],
            16, m='M_MetalDark')
    p.tube([(0.135, 0, z0 + 0.03), (0.17, 0, z0 + 0.045), (0.29, 0, z0 + 0.065)], [0.009, 0.012, 0.013], 6,
           'M_WoodDark')
    p.cyl(0.013, 0.013, 0.025, 6, (0.155, 0, z0 + 0.038), 'M_Metal', (0, 70, 0))
    po = p.build('Pan_Body')
    sl = MB()
    for i in range(8):
        tmp = MB()
        wedge_geo(tmp, -8, 8, s=0.8, seg=2, core=0.024, skin='M_Flesh')
        centred(tmp, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(8))
        sl.merge(tmp, T((0, 0, z0 + 0.012 + (i % 3) * 0.004), (0, 0, i * 45 + rnd.uniform(-8, 8)))
                 @ T((0, -0.05, 0)))
    sl.box((0.035, 0.03, 0.016), (0.0, 0.0, z0 + 0.04), 'M_Cream', (0, 0, 20))  # butter
    for i in range(18):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0.0, 0.1)
        sl.box((0.006, 0.006, 0.006), (r * math.cos(a), r * math.sin(a), z0 + 0.04), 'M_White',
               (rnd.uniform(0, 45), rnd.uniform(0, 45), 0))
    slo = sl.build('Pan_Slices', pivot=(0, 0, z0 + 0.01))
    fl = MB()
    fl.cyl(0.115, 0.115, 0.018, 16, (0, 0, z0 + 0.01), 'M_Filling', base=True)
    for i in range(16):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0.0, 0.095)
        fl.box((0.03, 0.022, 0.012), (r * math.cos(a), r * math.sin(a), z0 + 0.03), 'M_Filling',
               (rnd.uniform(-10, 10), rnd.uniform(-10, 10), rnd.uniform(0, 180)))
    flo = fl.build('Pan_Filling', pivot=(0, 0, z0 + 0.01))
    for o in (svo, po, slo, flo):
        parent(o, root)

    # ---------------- pie tin
    root = empty('PieTin')
    t = MB()
    t.lathe([(0.0, 0.0), (0.095, 0.0), (0.112, 0.035), (0.122, 0.038), (0.122, 0.042), (0.109, 0.04),
             (0.09, 0.006), (0.0, 0.006)], 16, m='M_Metal')
    to = t.build('PieTin_Tin')
    sh = MB()
    sh.lathe([(0.0, 0.006), (0.09, 0.006), (0.108, 0.04), (0.118, 0.046), (0.112, 0.05), (0.1, 0.044),
              (0.082, 0.014), (0.0, 0.014)], 16, m='M_Pastry')
    for i in range(16):
        a = 2 * PI * (i + 0.5) / 16
        sh.sphere((0.012, 0.012, 0.008), (0.113 * math.sin(a), -0.113 * math.cos(a), 0.049), 'M_Pastry', 6, 4)
    sho = sh.build('PieTin_Shell')
    fi = MB()
    fi.lathe([(0.0, 0.014), (0.084, 0.014), (0.1, 0.04), (0.06, 0.058), (0.0, 0.062)], 16, m='M_Filling')
    for i in range(14):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0.0, 0.075)
        fi.box((0.032, 0.022, 0.014), (r * math.cos(a), r * math.sin(a), 0.06 - r * 0.2), 'M_Filling',
               (rnd.uniform(-10, 10), rnd.uniform(-10, 10), rnd.uniform(0, 180)))
    fio = fi.build('PieTin_Filling')
    for nm, m in (('PieTin_Top', 'M_Pastry'), ('PieTin_TopBaked', 'M_PastryBaked')):
        tp = MB()
        tp.lathe([(0.112, 0.046), (0.1, 0.06), (0.06, 0.074), (0.0, 0.077)], 16, m=m)
        tp.torus(0.11, 0.01, 16, 5, (0, 0, 0.05), m)
        for i in range(5):
            a = 2 * PI * i / 5 + 0.3
            tp.box((0.028, 0.006, 0.006), (0.035 * math.cos(a), 0.035 * math.sin(a), 0.073), 'M_Filling',
                   (0, 0, math.degrees(a)))
        tp.cyl(0.008, 0.008, 0.006, 6, (0, 0, 0.076), 'M_Filling')
        tpo = tp.build(nm)
        parent(tpo, root)
    for o in (to, sho, fio):
        parent(o, root)

    # ---------------- oven
    root = empty('Oven')
    o = MB()
    W, D, H = 0.34, 0.24, 0.24
    for sx in (-1, 1):
        for sy in (-1, 1):
            o.cyl(0.014, 0.012, 0.02, 6, (sx * 0.13, sy * 0.08, 0.0), 'M_WoodDark', base=True)
    o.box((W, D, H), (0, 0, 0.02 + H / 2), 'M_Cream', bevel=0.035)
    o.box((W + 0.006, D + 0.006, 0.03), (0, 0, 0.04), 'M_AppleRed', bevel=0.012)
    o.box((W * 0.8, D * 0.7, 0.012), (0, 0, 0.02 + H), 'M_AppleRed')
    # cavity
    o.box((0.21, 0.02, 0.15), (-0.04, -D / 2 + 0.002, 0.02 + H / 2), 'M_OvenWindow')
    o.box((0.23, 0.012, 0.17), (-0.04, -D / 2 - 0.004, 0.02 + H / 2), 'M_AppleRed')
    o.box((0.12, 0.016, 0.014), (-0.04, -D / 2 - 0.018, 0.02 + H - 0.03), 'M_Metal')  # handle
    for sx in (-1, 1):
        o.box((0.01, 0.02, 0.014), (-0.04 + sx * 0.055, -D / 2 - 0.008, 0.02 + H - 0.03), 'M_Metal')
    # control panel stripe
    o.box((0.075, 0.008, 0.19), (0.115, -D / 2 - 0.001, 0.02 + H / 2), 'M_White')
    oo = o.build('Oven_Body')
    wi = MB()
    wi.box((0.2, 0.006, 0.14), (-0.04, -D / 2 - 0.012, 0.02 + H / 2), 'M_Glass')
    wio = wi.build('Oven_Window', pivot=(-0.04, -D / 2 - 0.012, 0.02 + H / 2))
    gl = MB()
    gl.box((0.19, 0.004, 0.13), (-0.04, -D / 2 - 0.006, 0.02 + H / 2), 'M_Lantern')
    for i in range(3):
        gl.box((0.17, 0.004, 0.006), (-0.04, -D / 2 - 0.0085, 0.02 + H / 2 - 0.04 + i * 0.04), 'M_MetalDark')
    glo = gl.build('Oven_Glow', pivot=(-0.04, -D / 2 - 0.006, 0.02 + H / 2))
    bt = MB()
    bt.cyl(0.026, 0.022, 0.018, 12, (0.115, -D / 2 - 0.013, 0.08), 'M_AppleRed', (90, 0, 0))
    bto = bt.build('Oven_Button', pivot=(0.115, -D / 2 - 0.005, 0.08))
    dl = MB()
    dl.cyl(0.024, 0.024, 0.016, 10, (0.115, -D / 2 - 0.012, 0.18), 'M_White', (90, 0, 0))
    dl.box((0.006, 0.006, 0.02), (0.115, -D / 2 - 0.021, 0.19), 'M_AppleRed')
    dlo = dl.build('Oven_Dial', pivot=(0.115, -D / 2 - 0.005, 0.18))
    for ob in (oo, wio, glo, bto, dlo):
        parent(ob, root)

    # ---------------- syrup pan
    root = empty('SyrupPan')
    sv = MB()
    stove(sv, 0.24, 0.22, 0.075, knob=False)
    svo = sv.build('SyrupPan_Stove')
    hb = MB()
    hb.cyl(0.03, 0.03, 0.012, 12, (0.0, -0.116, 0.04), 'M_White', (90, 0, 0))
    hb.cyl(0.026, 0.022, 0.022, 12, (0.0, -0.128, 0.04), 'M_AppleRed', (90, 0, 0))
    hbo = hb.build('Heat_Button', pivot=(0, -0.11, 0.04))
    parent(hbo, svo)
    p = MB()
    z0 = 0.085
    p.lathe([(0.0, z0), (0.085, z0), (0.09, z0 + 0.08), (0.084, z0 + 0.08), (0.08, z0 + 0.008), (0.0, z0 + 0.008)],
            14, m='M_Metal')
    p.torus(0.088, 0.006, 14, 4, (0, 0, z0 + 0.08), 'M_AppleRed')
    p.tube([(0.088, 0, z0 + 0.06), (0.14, 0, z0 + 0.075), (0.25, 0, z0 + 0.095)], [0.008, 0.011, 0.012], 6,
           'M_WoodDark')
    po = p.build('SyrupPan_Body')
    sy = MB()
    sy.cyl(0.081, 0.081, 0.04, 14, (0, 0, z0 + 0.008), 'M_Candy', base=True)
    syo = sy.build('SyrupPan_Syrup', pivot=(0, 0, z0 + 0.048))
    bb = MB()
    for i in range(6):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0.0, 0.06)
        bb.sphere(rnd.uniform(0.007, 0.013), (r * math.cos(a), r * math.sin(a), z0 + 0.049), 'M_JuiceGold', 8, 5)
    bbo = bb.build('SyrupPan_Bubbles', pivot=(0, 0, z0 + 0.048))
    for ob in (svo, po, syo, bbo):
        parent(ob, root)


def build_misc():
    # delivery crate with tintable apples
    k = MB()
    w, d, h = 0.5, 0.3, 0.32
    from stall import crate
    crate(k, 0, 0, 0.0, w, d, h)
    k.box((w - 0.05, d - 0.05, 0.02), (0, 0, h - 0.1), 'M_WoodDark')
    rnd = random.Random(21)
    for L, (nx, ny) in enumerate(((3, 2), (2, 1))):
        for i in range(nx):
            for j in range(ny):
                x = (i - (nx - 1) / 2) * 0.145
                y = (j - (ny - 1) / 2) * 0.13
                z = h - 0.09 + L * 0.085
                M = T((x, y, z), (rnd.uniform(-10, 10), rnd.uniform(-10, 10), rnd.uniform(0, 360)), 0.95)
                apple_body(k, M, uv=False, seg=9, lo=True)
                apple_stem(k, M)
                if rnd.random() < 0.5:
                    apple_leaf(k, M)
    # side hand holes + stencil-free label plate
    k.box((0.16, 0.012, 0.07), (0, -d / 2 - 0.004, h * 0.45), 'M_WoodLight')
    emblem(k, align_z((0, -1, 0), (0, -d / 2 - 0.011, h * 0.45)), 0.05, 0.004, 'M_AppleRed', 'M_Leaf')
    k.build('Crate_Delivery')

    # sparkle (4-point star facing front)
    s = MB()
    pts = []
    for i in range(8):
        a = PI / 2 + 2 * PI * i / 8
        r = 0.05 if i % 2 == 0 else 0.014
        pts.append((r * math.cos(a), r * math.sin(a)))
    s.prism(pts, 0.012, align_z((0, -1, 0), (0, 0.006, 0)), 'M_JuiceGold')
    # pyramid bumps for facets
    s.cyl(0.016, 0.0, 0.012, 4, (0, -0.006, 0), 'M_JuiceGold', (90, 0, 45))
    s.cyl(0.016, 0.0, 0.012, 4, (0, 0.006, 0), 'M_JuiceGold', (-90, 0, 45))
    s.build('Sparkle')

    st = MB()
    st.ico(0.045, (0, 0, 0.045), 'M_White', 1)
    st.ico(0.033, (0.042, 0.0, 0.03), 'M_White', 1)
    st.ico(0.03, (-0.04, 0.005, 0.028), 'M_White', 1)
    st.ico(0.026, (0.01, 0.0, 0.08), 'M_White', 1)
    st.build('Steam')
