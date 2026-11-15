"""Expansion recipe assets (batch 1): jam toast, yogurt parfait, baked apple, apple compote.

Same conventions as the prototype: Z-up, fronts face -Y (glTF +Z), origins bottom centre, flat
shaded low-poly. Each Dish_* root doubles as the on-counter prop; the game shows stages by
toggling named children (PropSpec.only).
"""
import math
import random
from mathutils import Vector
from lib import MB, T, empty, parent, apple_profile, PI, APPLE_PROFILE
from props import wedge_geo, lay_on_cut, centred, apple_body, apple_stem, apple_leaf
from dishes import plate

PLATE_TOP = 0.013


def _top_z_at(r, s=1.0, sz=1.0):
    """Height of the apple's upper surface at radius r (from APPLE_PROFILE), scaled."""
    top = [(pr * s, pz * s * sz) for pr, pz in APPLE_PROFILE[6:]]  # shoulder -> top dimple
    for (r0, z0), (r1, z1) in zip(top, top[1:]):
        if r1 <= r <= r0 or r0 <= r <= r1:
            t = 0 if r0 == r1 else (r - r0) / (r1 - r0)
            return z0 + (z1 - z0) * t
    return top[-1][1]


def _shokupan_outline(w, h, dome=0.22, n=10):
    """Shokupan slice outline in XY: flat bottom/sides, rounded 'mountain' top (y up)."""
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2 - h * dome)]
    for i in range(1, n):
        a = PI * i / n
        pts.append((w / 2 * math.cos(a), h / 2 - h * dome + h * dome * math.sin(a) * 1.1))
    pts.append((-w / 2, h / 2 - h * dome))
    return pts


def build_toast():
    root = empty('Dish_Toast')
    p = MB()
    plate(p, r=0.115)
    po = p.build('Toast_Plate')
    b = MB()
    W, H = 0.13, 0.13
    outer = _shokupan_outline(W, H)
    inner = [(x * 0.86, y * 0.86 - 0.002) for x, y in _shokupan_outline(W, H)]
    z0 = PLATE_TOP
    b.prism(outer, 0.026, T((0, 0.004, z0)), 'M_Crust')
    b.prism(inner, 0.0275, T((0, 0.004, z0)), 'M_Toast')
    # toasted grill marks
    for i in range(3):
        b.box((0.07, 0.006, 0.001), (0, -0.03 + i * 0.03, z0 + 0.028), 'M_Crust', (0, 0, -12))
    bo = b.build('Toast_Bread')
    j = MB()
    rnd = random.Random(7)
    jz = z0 + 0.0285
    j.sphere((0.042, 0.038, 0.006), (0.0, 0.0, jz), 'M_Jam', 12, 5)
    for _ in range(5):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.025, 0.04)
        j.sphere((rnd.uniform(0.012, 0.02), rnd.uniform(0.01, 0.018), 0.005),
                 (rr * math.cos(a), rr * math.sin(a), jz), 'M_Jam', 8, 4)
    # apple bits in the jam
    for _ in range(6):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.0, 0.03)
        j.box((0.008, 0.008, 0.006), (rr * math.cos(a), rr * math.sin(a), jz + 0.003), 'M_Filling',
              (rnd.uniform(0, 40), rnd.uniform(0, 40), rnd.uniform(0, 90)))
    jo = j.build('Toast_Jam', pivot=(0, 0, jz))
    for o in (po, bo, jo):
        parent(o, root)


def build_parfait():
    root = empty('Dish_Parfait')
    g = MB()
    prof = [(0.0, 0.0), (0.042, 0.0), (0.042, 0.006), (0.01, 0.014), (0.009, 0.045), (0.03, 0.056),
            (0.046, 0.08), (0.052, 0.17), (0.0485, 0.17)]
    g.lathe(prof, 12, m='M_Glass', cap=False, phase=PI / 12)
    go = g.build('Parfait_Glass')

    def inner(z):
        pts = [(0.028, 0.058), (0.043, 0.08), (0.049, 0.168)]
        for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return pts[-1][0]

    def band(mb, z0, z1, m):
        mb.lathe([(0.0, z0), (inner(z0) - 0.002, z0), (inner(z1) - 0.002, z1), (0.0, z1)], 12, m=m, phase=PI / 12)

    y = MB()
    band(y, 0.058, 0.095, 'M_Yogurt')
    yo = y.build('Parfait_Yogurt')
    a = MB()
    rnd = random.Random(3)
    band(a, 0.095, 0.118, 'M_Flesh')
    for _ in range(14):
        ang = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.0, inner(0.118) - 0.012)
        a.box((0.012, 0.012, 0.011), (rr * math.cos(ang), rr * math.sin(ang), 0.121),
              rnd.choice(['M_Flesh', 'M_Flesh', 'M_AppleSkin']), (rnd.uniform(0, 30), rnd.uniform(0, 30), rnd.uniform(0, 90)))
    ao = a.build('Parfait_Apple')
    c = MB()
    band(c, 0.126, 0.138, 'M_Granola')
    for _ in range(12):
        ang = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.0, inner(0.138) - 0.01)
        c.ico(rnd.uniform(0.004, 0.007), (rr * math.cos(ang), rr * math.sin(ang), 0.14), 'M_Granola', 1)
    co = c.build('Parfait_Crunch')
    # whipped cream: a stacked, twisted swirl that seals the glass above the apple layer
    t = MB()
    zc = 0.124
    t.lathe([(0.0, zc), (inner(zc) - 0.002, zc), (inner(zc + 0.01) - 0.004, zc + 0.01), (0.0, zc + 0.012)], 12,
            m='M_Whip', phase=PI / 12)
    for k, (r, h) in enumerate([(0.036, 0.018), (0.028, 0.016), (0.019, 0.014), (0.01, 0.012)]):
        z = zc + 0.01 + sum(hh * 0.8 for _, hh in [(0.036, 0.018), (0.028, 0.016), (0.019, 0.014), (0.01, 0.012)][:k])
        t.torus(r * 0.75, h * 0.55, 10, 5, (0, 0, z + h * 0.4), 'M_Whip', (0, 0, k * 17))
    t.cyl(0.006, 0.0005, 0.016, 6, (0.0, 0.0, zc + 0.06), 'M_Whip', base=True)
    w = MB()
    wedge_geo(w, -25, 25, s=0.55, seg=2, core=0.01)
    centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(25))
    w.V = [T((0.022, -0.004, 0.152), (0, -35, 15)) @ v for v in w.V]
    t.merge(w)
    t.box((0.02, 0.003, 0.012), (-0.016, -0.004, 0.168), 'M_Mint', (20, 0, 35))
    t.box((0.018, 0.003, 0.011), (-0.024, 0.006, 0.166), 'M_Mint', (-15, 0, -20))
    to = t.build('Parfait_Top', pivot=(0, 0, 0.14))
    for o in (go, yo, ao, co, to):
        parent(o, root)


def build_microwave():
    root = empty('Microwave')
    W, D, H = 0.40, 0.26, 0.23
    b = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl(0.012, 0.01, 0.012, 6, (sx * 0.17, sy * 0.1, 0.0), 'M_MetalDark', base=True)
    z0 = 0.012
    b.box((W, D, H), (0, 0, z0 + H / 2), 'M_White', bevel=0.03)
    b.box((W + 0.004, D + 0.004, 0.02), (0, 0, z0 + 0.03), 'M_AppleRed', bevel=0.008)
    dx = -0.05
    b.box((0.27, 0.012, 0.17), (dx, -D / 2 - 0.004, z0 + H / 2), 'M_AppleRed', bevel=0.012)   # door frame
    b.box((0.25, 0.02, 0.15), (dx, -D / 2 + 0.002, z0 + H / 2), 'M_OvenWindow')
    b.box((0.012, 0.016, 0.12), (dx + 0.12, -D / 2 - 0.014, z0 + H / 2), 'M_Metal')            # handle
    b.box((0.085, 0.008, 0.19), (0.145, -D / 2 - 0.001, z0 + H / 2), 'M_Cream')                # panel
    b.box((0.06, 0.006, 0.026), (0.145, -D / 2 - 0.005, z0 + H - 0.04), 'M_Black')              # display
    for i in range(3):
        b.box((0.008, 0.002, 0.012), (0.13 + i * 0.014, -D / 2 - 0.0085, z0 + H - 0.04), 'M_JuiceGold')
    bo = b.build('Microwave_Body')
    wi = MB()
    wi.box((0.24, 0.006, 0.14), (dx, -D / 2 - 0.012, z0 + H / 2), 'M_Glass')
    wio = wi.build('Microwave_Window', pivot=(dx, -D / 2 - 0.012, z0 + H / 2))
    gl = MB()
    gl.box((0.23, 0.004, 0.13), (dx, -D / 2 - 0.006, z0 + H / 2), 'M_Lantern')
    for i in range(4):
        gl.box((0.21, 0.003, 0.004), (dx, -D / 2 - 0.0085, z0 + H / 2 - 0.045 + i * 0.03), 'M_MetalDark')
    glo = gl.build('Microwave_Glow', pivot=(dx, -D / 2 - 0.006, z0 + H / 2))
    bt = MB()
    bt.cyl(0.024, 0.02, 0.018, 12, (0.145, -D / 2 - 0.012, z0 + 0.075), 'M_AppleRed', (90, 0, 0))
    bto = bt.build('Microwave_Button', pivot=(0.145, -D / 2 - 0.004, z0 + 0.075))
    for o in (bo, wio, glo, bto):
        parent(o, root)


def build_corer():
    root = empty('Corer')
    c = MB()
    c.cyl(0.013, 0.013, 0.12, 10, (0, 0, 0.0), 'M_Metal', base=True)
    for i in range(10):  # serrated tip
        a = 2 * PI * i / 10
        c.cyl(0.003, 0.0005, 0.008, 4, (0.012 * math.cos(a), 0.012 * math.sin(a), -0.004), 'M_Metal', (180, 0, 0))
    c.box((0.11, 0.024, 0.026), (0, 0, 0.13), 'M_AppleRed', bevel=0.008)
    co = c.build('Corer_Body')
    parent(co, root)


def build_baked_apple():
    root = empty('Dish_BakedApple')
    p = MB()
    plate(p, r=0.105)
    po = p.build('BakedApple_Plate')
    sz = 0.93
    base = PLATE_TOP
    body = MB()
    apple_body(body, M=T((0, 0, base), (0, 0, 0), (1.03, 1.03, sz)))
    bo = body.build('BakedApple_Body')
    st = MB()
    apple_stem(st, M=T((0, 0, base), (0, 0, 0), (1, 1, sz)))
    apple_leaf(st, M=T((0, 0, base), (0, 0, 0), (1, 1, sz)))
    so = st.build('BakedApple_Stem', pivot=(0, 0, base + 0.112 * sz))
    zt = base + _top_z_at(0.02, 1.0, sz)
    h = MB()
    h.cyl(0.022, 0.022, 0.004, 10, (0, 0, zt - 0.001), 'M_CoreHole', base=True)
    h.lathe([(0.0, zt + 0.0035), (0.024, zt + 0.0035), (0.027, zt + 0.0005), (0.0, zt + 0.0005)], 10, m='M_Flesh')
    ho = h.build('BakedApple_Hole', pivot=(0, 0, zt))
    f = MB()
    f.box((0.026, 0.026, 0.02), (0, 0, zt + 0.012), 'M_Butter', (0, 0, 20), bevel=0.003)
    rnd = random.Random(11)
    for _ in range(10):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.01, 0.03)
        f.box((0.004, 0.004, 0.003), (rr * math.cos(a), rr * math.sin(a), zt + 0.005), 'M_Sugar', (0, 0, rnd.uniform(0, 90)))
    fo = f.build('BakedApple_Fill', pivot=(0, 0, zt))
    gz = MB()
    gz.cyl(0.075, 0.07, 0.004, 14, (0, 0, base - 0.0005), 'M_Caramel', base=True)
    gz.sphere((0.03, 0.03, 0.009), (0, 0, zt + 0.004), 'M_Caramel', 10, 5)
    # glossy caramel cap following the apple's shoulders (wavy edge = drips)
    seg = 14
    rings = [0.026, 0.04, 0.052, 0.061]
    verts, faces = [], []
    for k, r0 in enumerate(rings):
        for i in range(seg):
            a = 2 * PI * i / seg
            rr = r0 * (1.04 + (0.12 * math.sin(3 * a + 0.5) if k == len(rings) - 1 else 0))
            z = base + _top_z_at(min(rr, 0.07), 1.03, sz) + 0.0025
            verts.append((rr * 1.03 * math.sin(a), -rr * 1.03 * math.cos(a), z))
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            faces.append([k * seg + i, (k + 1) * seg + i, (k + 1) * seg + j, k * seg + j])
    gz.add_raw(verts, faces, 'M_Caramel')
    go = gz.build('BakedApple_Glaze', pivot=(0, 0, base))
    for o in (po, bo, so, ho, fo, go):
        parent(o, root)


def _wedge_ring(mb, n, s, flesh, R=0.058, z=0.0):
    for i in range(n):
        w = MB()
        wedge_geo(w, -22, 22, s=s, seg=2, core=0.02, flesh=flesh)
        centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(22))
        ang = 360 * i / n
        M = T((0, 0, z), (0, 0, ang)) @ T((0, -R, 0), (0, 0, 90))
        w.V = [M @ v for v in w.V]
        mb.merge(w)


def build_compote():
    root = empty('Dish_Compote')
    b = MB()
    prof = [(0.0, 0.0), (0.07, 0.0), (0.072, 0.006), (0.1, 0.03), (0.112, 0.042), (0.106, 0.044),
            (0.094, 0.034), (0.07, 0.012), (0.0, 0.012)]
    mats = ['M_Ceramic'] * 8
    mats[3] = 'M_AppleRed'
    b.lathe(prof, 16, mats=mats)
    bo = b.build('Compote_Bowl')
    z = 0.012
    r = MB()
    _wedge_ring(r, 8, 0.5, 'M_Flesh', z=z)
    ro = r.build('Compote_Raw', pivot=(0, 0, z))
    sg = MB()
    rnd = random.Random(5)
    for _ in range(26):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.03, 0.08)
        sg.box((0.004, 0.004, 0.003), (rr * math.cos(a), rr * math.sin(a), z + 0.03), 'M_Sugar', (0, 0, rnd.uniform(0, 90)))
    sg.box((0.02, 0.02, 0.012), (0, 0, z + 0.008), 'M_Butter', (0, 0, 25), bevel=0.002)
    sgo = sg.build('Compote_Sugar', pivot=(0, 0, z))
    gl = MB()
    gl.cyl(0.085, 0.085, 0.006, 16, (0, 0, z), 'M_CompoteSyrup', base=True)
    _wedge_ring(gl, 8, 0.48, 'M_Compote', z=z + 0.002)
    glo = gl.build('Compote_Glazed', pivot=(0, 0, z))
    lid = MB()
    lid.lathe([(0.108, 0.04), (0.1, 0.075), (0.07, 0.1), (0.0, 0.108)], 14, m='M_Glass', cap=False)
    lid.sphere((0.012, 0.012, 0.009), (0, 0, 0.114), 'M_AppleRed', 8, 5)
    lido = lid.build('Compote_Lid', pivot=(0, 0, 0.04))
    for o in (bo, ro, sgo, glo, lido):
        parent(o, root)


ROOTS = ['Dish_Toast', 'Dish_Parfait', 'Microwave', 'Corer', 'Dish_BakedApple', 'Dish_Compote']


def build_expansion():
    build_toast()
    build_parfait()
    build_microwave()
    build_corer()
    build_baked_apple()
    build_compote()
