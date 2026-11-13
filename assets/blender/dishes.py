"""Finished dishes (Dish_* roots). Origins bottom centre, fronts face -Y (glTF +Z)."""
import math
import random
from mathutils import Vector, Matrix
from lib import MB, T, empty, parent, emblem, align_z, apple_profile, PI
from props import wedge_geo, centred, lay_on_cut, build_rabbit_piece, apple_stem, apple_leaf


def plate(mb, r=0.11, z0=0.0, rim=True):
    prof = [(0.0, z0), (r * 0.6, z0), (r * 0.66, z0 + 0.008), (r * 0.7, z0 + 0.008), (r, z0 + 0.02),
            (r * 0.98, z0 + 0.0235), (r * 0.92, z0 + 0.0215), (r * 0.87, z0 + 0.0195), (r * 0.68, z0 + 0.013),
            (0.0, z0 + 0.013)]
    mats = ['M_Plate'] * 9
    if rim:
        mats[6] = 'M_AppleRed'
    mb.lathe(prof, 18, mats=mats)


def build_juice():
    root = empty('Dish_Juice')
    # coaster: round faceted wooden disc with plank lines
    c = MB()
    c.cyl(0.078, 0.075, 0.016, 12, (0, 0, 0.0), 'M_Wood', base=True)
    for y in (-0.026, 0.026):
        c.box((2 * math.sqrt(0.07 ** 2 - y ** 2) - 0.01, 0.0025, 0.002), (0, y, 0.0162), 'M_WoodDark')
    co = c.build('Juice_Coaster')
    z0 = 0.016
    seg = 10
    g = MB()
    rb, rt, H = 0.043, 0.054, 0.132
    # single outer wall (keeps the juice readable through one glass layer) + flat rim lip
    g.lathe([(0.0, z0), (rb, z0), (rt, z0 + H), (rt - 0.0045, z0 + H)], seg, m='M_Glass', phase=PI / seg,
            cap=False)
    go = g.build('Juice_Glass')
    f = MB()
    fh = 0.098
    inner = lambda z: (rb - 0.0035) + (rt - rb) * (z - z0) / H  # noqa: E731
    f.lathe([(0.0, z0 + 0.015), (inner(z0 + 0.015), z0 + 0.015), (inner(z0 + fh), z0 + fh), (0.0, z0 + fh)], seg,
            m='M_JuiceGold', phase=PI / seg)
    fo = f.build('Juice_Fill')
    # emblem on front facet (tilted with the taper)
    ez = z0 + 0.055
    re = (rb + (rt - rb) * (ez - z0) / H) * math.cos(PI / seg)
    tilt = math.atan2(rt - rb, H)
    e = MB()
    n = Vector((0, -math.cos(tilt), -math.sin(tilt)))
    emblem(e, align_z(n, (0, -re - 0.0012, ez)), 0.045, 0.0025, 'M_AppleRed', 'M_Leaf', 'M_WoodDark')
    eo = e.build('Juice_Emblem', pivot=(0, -re, ez))
    # straw: spiral red/white stripes (checker over a 8-sided tube)
    s = MB()
    p0 = Vector((-0.012, 0.006, z0 + 0.02))
    d = Vector((-0.38, -0.12, 1.0)).normalized()
    L = 0.19
    N = 24
    pts = [p0 + d * (L * i / N) for i in range(N + 1)]
    sseg = 8
    verts, faces, fm = [], [], []
    side = d.cross(Vector((0, 0, 1))).normalized()
    up = d.cross(side)
    r = 0.0055
    for i, p in enumerate(pts):
        for k in range(sseg):
            a = 2 * PI * k / sseg
            verts.append(p + (side * math.cos(a) + up * math.sin(a)) * r)
    for i in range(N):
        for k in range(sseg):
            kk = (k + 1) % sseg
            faces.append([i * sseg + k, i * sseg + kk, (i + 1) * sseg + kk, (i + 1) * sseg + k])
            fm.append('M_AppleRed' if ((k + i) % 4) < 2 else 'M_Straw')
    faces.append([N * sseg + k for k in range(sseg)])
    fm.append('M_Straw')
    off = len(s.V)
    s.V += verts
    for ff, m in zip(faces, fm):
        s.F.append([off + j for j in ff])
        s.M.append(m)
        s.UV.append(None)
    # hollow top: dark ring
    top = pts[-1]
    s.cyl(r * 0.62, r * 0.62, 0.002, 8, tuple(top + d * 0.0005), 'M_AppleRed', M=None,
          rot=tuple(math.degrees(a) for a in d.to_track_quat('Z', 'Y').to_euler()))
    so = s.build('Juice_Straw', pivot=tuple(p0))
    # garnish: red-skinned apple wedge perched on the rim (back-right), skin arc up/outward,
    # apple axis tangent to the rim, core edge notched over the rim
    w = MB()
    sw = 0.58
    wedge_geo(w, -24, 24, s=sw, seg=4, core=0.012)
    ang = math.radians(20)
    out = Vector((math.cos(ang), math.sin(ang), 0))
    zup = Vector((0, 0, 1))
    rad_dir = (out * 0.8 + zup).normalized()      # skin arc faces up/outward
    axis_dir = (zup - out * 0.8).normalized()     # core edge runs up/inward, in the same radial plane
    zc, yc = axis_dir, -rad_dir
    xc = yc.cross(zc)
    Rm = Matrix((xc, yc, zc)).transposed().to_4x4()
    rim = Vector((rt * math.cos(ang), rt * math.sin(ang), z0 + H))
    pos = rim - rad_dir * 0.006
    M = Matrix.Translation(pos) @ Rm @ Matrix.Translation((0, 0, -0.068 * sw))
    w.V = [M @ v for v in w.V]
    wo = w.build('Juice_Garnish', pivot=tuple(rim))
    for o in (co, go, fo, eo, so, wo):
        parent(o, root)
    return root


def build_pie():
    root = empty('Dish_Pie')
    p = MB()
    plate(p, 0.12)
    po = p.build('Pie_Plate')
    z0 = 0.014
    R = 0.105
    a0, a1 = 152, 208  # crust arc at the back (+Y); tip points to the front so both cut faces show
    nseg = 6

    def sector(r_in, r_out, za, zb, m, mb, inset=0.0, ang=(a0, a1)):
        pts = [(0.0 + 0.0, 0.0)]
        for i in range(nseg + 1):
            t = math.radians(ang[0] + (ang[1] - ang[0]) * i / nseg)
            pts.append((r_out * math.sin(t), -r_out * math.cos(t)))
        mb.prism(pts, zb - za, T((0, 0, za)), m)

    # place the slice so its point is at the back and the crust arc faces front
    off = T((0, -R * 0.6, 0))
    s = MB()
    sector(0, R, z0, z0 + 0.012, 'M_PastryBaked', s)
    s.tube([(R * math.sin(math.radians(a0 + (a1 - a0) * i / 8)), -R * math.cos(math.radians(a0 + (a1 - a0) * i / 8)),
             z0 + 0.04) for i in range(9)], 0.016, 6, 'M_PastryBaked')
    # top crust (slightly domed) + lattice strips
    top = MB()
    sector(0, R - 0.006, z0 + 0.045, z0 + 0.054, 'M_PastryBaked', top)
    s.merge(top)
    for i in range(3):
        y = 0.032 + i * 0.026
        hw = abs(y) * math.tan(math.radians(28)) - 0.004
        s.box((hw * 2, 0.011, 0.006), (0, y, z0 + 0.057), 'M_Pastry')
    for sx in (-1, 1):
        s.box((0.011, 0.07, 0.006), (sx * 0.014, 0.06, z0 + 0.06), 'M_Pastry', (0, 0, -sx * 6))
    s.V = [off @ v for v in s.V]
    so = s.build('Pie_Slice')
    fl = MB()
    sector(0, R - 0.012, z0 + 0.011, z0 + 0.046, 'M_Filling', fl)
    # chunky apple pieces poking out on the cut faces
    rnd = random.Random(3)
    for i in range(5):
        for sgn in (-1, 1):
            t = (i + 0.3 + rnd.uniform(0, 0.4)) / 5
            a = math.radians(180 + sgn * 28)
            rr = (R - 0.025) * t + 0.012
            x, y = rr * math.sin(a) + sgn * 0.003, -rr * math.cos(a)
            sz = rnd.uniform(0.011, 0.017)
            fl.box((sz, sz, sz * 0.8), (x, y, z0 + rnd.uniform(0.02, 0.036)),
                   'M_Flesh' if rnd.random() < 0.45 else 'M_Filling',
                   (rnd.uniform(-15, 15), rnd.uniform(-15, 15), sgn * 28 + rnd.uniform(-25, 25)))
    fl.V = [off @ v for v in fl.V]
    flo = fl.build('Pie_FillingFace')
    for o in (po, so, flo):
        parent(o, root)
    return root


def build_rabbit_dish():
    root = empty('Dish_Rabbit')
    p = MB()
    plate(p, 0.12)
    po = p.build('Rabbit_Plate')
    parent(po, root)
    z0 = 0.013
    from props import fan
    for i in range(4):
        w = MB()
        build_rabbit_piece(w, T((0, 0, z0)), 0.68)
        M = T((0, -0.012, 0)) @ fan(i, 4, 22, 0.14)
        w.V = [M @ v for v in w.V]
        c = sum(w.V, Vector()) / len(w.V)
        o = w.build(f'Rabbit_Piece_{i + 1}', pivot=(c.x, c.y, z0))
        parent(o, root)
    pk = MB()
    tip = Vector((0.075, -0.06, z0 + 0.03))
    top = tip + Vector((0.025, -0.02, 0.05))
    pk.tube([tip, top], 0.0022, 4, 'M_WoodLight')
    pk.sphere(0.0075, tuple(top), 'M_AppleRed', 8, 6)
    pko = pk.build('Rabbit_Pick', pivot=tuple(tip))
    parent(pko, root)
    return root


def build_jam():
    root = empty('Dish_Jam')
    seg = 12
    j = MB()
    R, H = 0.052, 0.12
    j.lathe([(0.0, 0.0), (R - 0.006, 0.0), (R, 0.008), (R, H - 0.02), (R - 0.008, H - 0.008), (R - 0.008, H),
             (R - 0.012, H)], seg, m='M_Glass', phase=PI / seg, cap=False)
    jo = j.build('Jam_Jar')
    f = MB()
    f.lathe([(0.0, 0.006), (R - 0.0045, 0.006), (R - 0.0035, H - 0.03), (0.0, H - 0.028)], seg, m='M_Jam',
            phase=PI / seg)
    fo = f.build('Jam_Fill')
    l = MB()
    l.cyl(R - 0.004, R - 0.004, 0.016, seg, (0, 0, H - 0.008), 'M_Metal', base=True)
    # cloth cover: puffy top + skirt with points
    l.lathe([(0.0, H + 0.016), (R + 0.004, H + 0.012), (R + 0.006, H - 0.002)], 16, m='M_AppleRed')
    pts = []
    for i in range(16):
        a = 2 * PI * i / 16
        rr = R + 0.006 + (0.01 if i % 2 == 0 else 0.0)
        zz = H - 0.002 - (0.024 if i % 2 == 0 else 0.012)
        pts.append((a, rr, zz))
    for i in range(16):
        a, rr, zz = pts[i]
        b, rb_, zb = pts[(i + 1) % 16]
        v = [(( R + 0.006) * math.sin(a), -(R + 0.006) * math.cos(a), H - 0.002),
             ((R + 0.006) * math.sin(b), -(R + 0.006) * math.cos(b), H - 0.002),
             (rb_ * math.sin(b), -rb_ * math.cos(b), zb), (rr * math.sin(a), -rr * math.cos(a), zz)]
        l.add_raw(v, [[0, 3, 2, 1]], 'M_AppleRed')
    # cream gingham hints on top
    for gx in (-1, 0, 1):
        for gy in (-1, 0, 1):
            if (gx + gy) % 2 == 0:
                l.box((0.014, 0.014, 0.002), (gx * 0.018, gy * 0.018, H + 0.0155 - 0.002 * (abs(gx) + abs(gy))),
                      'M_Cream')
    l.torus(R + 0.0075, 0.004, 16, 4, (0, 0, H - 0.008), 'M_Cream')
    # string bow at front
    for sx in (-1, 1):
        l.sphere((0.011, 0.004, 0.006), (sx * 0.011, -R - 0.012, H - 0.006), 'M_Cream', 6, 4, rot=(0, sx * -20, 0))
        l.box((0.004, 0.003, 0.016), (sx * 0.005, -R - 0.012, H - 0.019), 'M_Cream', (0, sx * 20, 0))
    l.sphere(0.004, (0, -R - 0.013, H - 0.007), 'M_Cream', 6, 4)
    lo = l.build('Jam_Lid', pivot=(0, 0, H - 0.008))
    lb = MB()
    re = R * math.cos(PI / seg)
    lb.cyl(0.026, 0.026, 0.003, 14, (0, -re - 0.0005, 0.058), 'M_Cream', (90, 0, 0))
    lb.torus(0.026, 0.0018, 14, 3, (0, -re - 0.0018, 0.058), 'M_AppleRed', (90, 0, 0))
    emblem(lb, align_z((0, -1, 0), (0, -re - 0.0018, 0.057)), 0.026, 0.0015, 'M_AppleRed', 'M_Leaf')
    lbo = lb.build('Jam_Label', pivot=(0, -re, 0.058))
    for o in (jo, fo, lo, lbo):
        parent(o, root)
    return root


def build_candy():
    root = empty('Dish_CandyApple')
    pp = MB()
    pp.box((0.15, 0.15, 0.002), (0, 0, 0.001), 'M_Paper', (0, 0, 12))
    ppo = pp.build('Candy_Paper')
    s = 0.69
    z0 = 0.002
    a = MB()
    a.lathe(apple_profile(s), 12, (0, 0, z0 + 0.004), 'M_AppleSkin')
    ao = a.build('Candy_Apple')
    c = MB()
    k = 1.07
    prof = [(r * s * k, z * s * k) for r, z in apple_profile()]
    c.lathe(prof, 12, (0, 0, z0 + 0.0), 'M_Candy')
    # drip skirt / puddle at the bottom
    c.lathe([(0.0, z0), (0.052, z0), (0.064, z0 + 0.0015), (0.058, z0 + 0.005), (0.03, z0 + 0.009), (0.0, z0 + 0.009)], 12,
            m='M_Candy', phase=0.2)
    co = c.build('Candy_Coat')
    st = MB()
    st.cyl(0.0058, 0.0058, 0.105, 6, (0, 0, z0 + 0.06), 'M_WoodLight', (0, 6, 0), base=True)
    sto = st.build('Candy_Stick', pivot=(0, 0, z0 + 0.06))
    for o in (ppo, ao, co, sto):
        parent(o, root)
    return root


def build_dishes():
    build_juice()
    build_pie()
    build_rabbit_dish()
    build_jam()
    build_candy()
