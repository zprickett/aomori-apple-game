"""Stall + upgrades. Blender coords: X right, -Y front (toward camera), Z up."""
import math
import random
from mathutils import Vector, Matrix
from lib import MB, T, empty, parent, emblem, chalk_apple, apple_profile, mat, PALETTE, align_z



# ------------------------------------------------------------------ helpers
def small_apple(mb, loc, s=1.0, m='M_AppleRed', rot=(0, 0, 0), leaf=True, seg=8):
    M = T(loc, rot, (s, s, s))
    mb.lathe(apple_profile(lo=True), seg, M=M, m=m)
    mb.cyl(0.006, 0.004, 0.04, 4, (0.003, 0, 0.14), 'M_WoodDark', (0, 12, 0), M=M)
    if leaf:
        mb.box((0.05, 0.022, 0.004), (0.028, 0, 0.142), 'M_Leaf', (0, -20, 25), M=M)
    return mb


def apple_heap(mb, x0, x1, y0, y1, z, rows=2, seed=1, mats=('M_AppleRed', 'M_AppleYellow'), s=1.0, layers=2):
    rnd = random.Random(seed)
    d = 0.15 * s
    nx = max(1, int((x1 - x0) / d))
    ny = max(1, int((y1 - y0) / d))
    for L in range(layers):
        sx = (x1 - x0 - L * d) / max(1, nx - L)
        sy = (y1 - y0 - L * d) / max(1, ny - L)
        for i in range(max(1, nx - L)):
            for j in range(max(1, ny - L)):
                x = x0 + L * d / 2 + (i + 0.5) * sx + rnd.uniform(-0.01, 0.01)
                y = y0 + L * d / 2 + (j + 0.5) * sy + rnd.uniform(-0.01, 0.01)
                zz = z + L * 0.115 * s - 0.005 + rnd.uniform(-0.008, 0.008)
                m = mats[rnd.random() < 0.35] if len(mats) > 1 else mats[0]
                small_apple(mb, (x, y, zz), s * rnd.uniform(0.95, 1.05), m,
                            (rnd.uniform(-12, 12), rnd.uniform(-12, 12), rnd.uniform(0, 360)),
                            leaf=rnd.random() < 0.3)
    return mb


def crate(mb, cx, cy, z0, w, d, h, M=None, slat='M_Wood', frame='M_WoodDark'):
    """Open-top slatted crate centred at (cx,cy), base at z0."""
    M = M or Matrix()
    t = 0.025
    # bottom
    mb.box((w, d, t), (cx, cy, z0 + t / 2), frame, M=M)
    nsl = 3
    gap = 0.012
    sh = (h - t - gap * (nsl - 1)) / nsl
    for k in range(nsl):
        z = z0 + t + sh / 2 + k * (sh + gap)
        m = slat if k % 2 == 0 else 'M_WoodLight'
        mb.box((w, t, sh), (cx, cy - d / 2 + t / 2, z), m, bevel=0.004, M=M)
        mb.box((w, t, sh), (cx, cy + d / 2 - t / 2, z), m, bevel=0.004, M=M)
        mb.box((t, d - 2 * t, sh), (cx - w / 2 + t / 2, cy, z), m, bevel=0.004, M=M)
        mb.box((t, d - 2 * t, sh), (cx + w / 2 - t / 2, cy, z), m, bevel=0.004, M=M)
    # corner posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((0.04, 0.04, h + 0.01), (cx + sx * (w / 2 - 0.005), cy + sy * (d / 2 - 0.005), z0 + h / 2),
                   frame, M=M)
    return mb


# ------------------------------------------------------------------ stall
POST_X = 1.25
POST_YF, POST_YB = -0.15, 0.80
BEAM_Z = 2.30


def build_stall():
    root = empty('Stall')

    # ---------------- frame: deck, counter body, posts, beams, roof
    f = MB()
    # deck planks (top at z=0.05)
    nplank = 8
    y0, y1 = -0.72, 1.0
    pw = (y1 - y0) / nplank
    for i in range(nplank):
        y = y0 + (i + 0.5) * pw
        mb_m = 'M_WoodLight' if i % 3 == 1 else 'M_Wood'
        f.box((3.15, pw - 0.012, 0.05), (0, y, 0.025), mb_m, bevel=0.006)
    f.box((3.2, 0.06, 0.07), (0, y0 - 0.02, 0.035), 'M_WoodDark', bevel=0.008)  # front skirting

    # counter body (x -0.95..0.95, y -0.55..0.05, top 0.95)
    f.box((1.94, 0.66, 0.06), (0, -0.25, 0.92), 'M_WoodLight', bevel=0.012)  # top slab
    f.box((1.98, 0.08, 0.035), (0, -0.565, 0.875), 'M_WoodDark', bevel=0.006)  # front lip under top
    for sx in (-1, 1):
        for yy in (-0.51, 0.01):
            f.box((0.09, 0.09, 0.84), (sx * 0.9, yy, 0.47), 'M_WoodDark', bevel=0.01)
    # side planks + back planks + front planks (front mostly covered by cloth)
    for k in range(4):
        z = 0.15 + k * 0.18
        m = 'M_Wood' if k % 2 == 0 else 'M_WoodLight'
        for sx in (-1, 1):
            f.box((0.04, 0.46, 0.165), (sx * 0.915, -0.25, z), m)
        f.box((1.74, 0.04, 0.165), (0, -0.52, z), m)
        f.box((1.74, 0.04, 0.165), (0, 0.02, z), m)
    # inner shelf behind counter (visible from back only)
    f.box((1.74, 0.3, 0.03), (0, -0.25, 0.45), 'M_Wood')

    # posts
    for sx in (-1, 1):
        for py in (POST_YF, POST_YB):
            f.box((0.18, 0.18, 2.32), (sx * POST_X, py, 0.05 + 1.16), 'M_Wood', bevel=0.018)
            f.box((0.21, 0.21, 0.1), (sx * POST_X, py, 0.1), 'M_WoodDark', bevel=0.012)
    # beams
    for py in (POST_YF, POST_YB):
        f.box((3.05, 0.18, 0.17), (0, py, BEAM_Z + 0.085), 'M_Wood', bevel=0.015)
    for sx in (-1, 1):
        f.box((0.17, 1.55, 0.15), (sx * POST_X, (POST_YF + POST_YB) / 2 - 0.08, BEAM_Z + 0.25), 'M_WoodDark', bevel=0.015)
        # knee braces
        for py, sgn in ((POST_YF, 1), (POST_YB, -1)):
            f.box((0.08, 0.06, 0.42), (sx * POST_X, py + sgn * 0.17, BEAM_Z - 0.13), 'M_WoodDark',
                  (sgn * 45, 0, 0), bevel=0.008)
        f.box((0.42, 0.06, 0.08), (sx * (POST_X - 0.17), POST_YF - 0.0, BEAM_Z - 0.13), 'M_WoodDark',
              (0, sx * 45, 0), bevel=0.008)
    # rafters (short posts from beams up to roof)
    for sx in (-1, 1):
        f.box((0.1, 0.1, 0.25), (sx * POST_X, POST_YB, BEAM_Z + 0.3), 'M_Wood')
    frame = f.build('Stall_Frame')
    parent(frame, root)

    # ---------------- awning (its own part so the stall can earn it): roof slab, eaves, beam ends, cap
    f = MB()
    # roof slab: tilted, front lower
    yF, yB = -0.70, 1.20
    zF, zB = 2.55, 2.74
    ang = math.degrees(math.atan2(zB - zF, yB - yF))
    L = math.hypot(yB - yF, zB - zF)
    cy, cz = (yF + yB) / 2, (zF + zB) / 2
    f.box((3.2, L, 0.22), (0, cy, cz), 'M_AppleRed', (ang, 0, 0), bevel=0.03)
    # chunky eaves: barge boards on both sides + front fascia ends
    for sx in (-1, 1):
        f.box((0.16, L + 0.2, 0.3), (sx * 1.68, cy - 0.02, cz + 0.05), 'M_Wood', (ang, 0, 0), bevel=0.025)
        # protruding beam ends at front corners
        f.box((0.22, 0.26, 0.26), (sx * 1.68, yF - 0.12, zF + 0.02), 'M_WoodDark', (ang, 0, 0), bevel=0.025)
    # ridge-ish top wooden cap at back
    f.box((3.45, 0.18, 0.12), (0, yB + 0.02, zB + 0.03), 'M_WoodDark', (ang, 0, 0), bevel=0.02)
    roof = f.build('Stall_Roof')
    parent(roof, root)
    # noren rod (arrives with the noren)
    r = MB()
    r.cyl(0.018, 0.018, 2.5, 6, (0, POST_YF - 0.12, BEAM_Z - 0.01), 'M_WoodDark', (0, 90, 0))
    rod = r.build('Noren_Rod')
    parent(rod, root)
    # lantern bracket on left front post (arrives with the lantern)
    k = MB()
    k.box((0.05, 0.44, 0.05), (-POST_X, POST_YF - 0.22, 2.02), 'M_WoodDark', bevel=0.006)
    k.box((0.04, 0.04, 0.18), (-POST_X, POST_YF - 0.08, 1.94), 'M_WoodDark', (-40, 0, 0))
    bracket = k.build('Lantern_Bracket')
    parent(bracket, root)

    # ---------------- counter cloth with emblem
    c = MB()
    cw, ctop, cbot, cy0 = 1.28, 0.86, 0.12, -0.585
    # cloth: front panel slightly wavy bottom (two layers of box)
    c.box((cw, 0.018, ctop - cbot), (0, cy0, (ctop + cbot) / 2), 'M_AppleRed')
    c.box((cw + 0.04, 0.04, 0.05), (0, cy0 + 0.002, ctop + 0.02), 'M_AppleRed', bevel=0.008)  # top fold
    Me = align_z((0, -1, 0), (0, cy0 - 0.009, 0.47))
    emblem(c, Me, 0.36, 0.012, 'M_Cream')
    cloth = c.build('Counter_Cloth')
    parent(cloth, root)

    # ---------------- noren
    for nm, xc in (('Noren_L', -0.78), ('Noren_C', 0.0), ('Noren_R', 0.78)):
        n = MB()
        top, ln, w = BEAM_Z - 0.01, 0.66, 0.74
        yN = POST_YF - 0.13
        n.box((w, 0.02, ln), (xc, yN, top - ln / 2), 'M_AppleRed')
        n.box((w, 0.05, 0.05), (xc, yN, top - 0.01), 'M_AppleRed', bevel=0.01)  # sleeve over rod
        if nm != 'Noren_C':
            Me = align_z((0, -1, 0), (xc, yN - 0.011, top - 0.36))
            emblem(n, Me, 0.3, 0.01, 'M_Cream')
        else:
            Me = align_z((0, -1, 0), (xc, yN - 0.011, top - 0.36))
            emblem(n, Me, 0.3, 0.01, 'M_Cream')
        o = n.build(nm, pivot=(xc, yN, top))
        parent(o, root)

    # ---------------- lantern
    lx, ly, lz = -POST_X, POST_YF - 0.40, 2.0
    l = MB()
    prof = [(0.13, 0.0), (0.21, 0.09), (0.235, 0.26), (0.21, 0.43), (0.13, 0.52)]
    zb = lz - 0.66
    l.lathe(prof, 8, (lx, ly, zb), 'M_Lantern', phase=math.pi / 8)
    l.cyl(0.15, 0.15, 0.06, 8, (lx, ly, zb - 0.02), 'M_WoodDark', bevel=0.01, rot=(0, 0, 22.5))
    l.cyl(0.15, 0.15, 0.06, 8, (lx, ly, zb + 0.54), 'M_WoodDark', bevel=0.01, rot=(0, 0, 22.5))
    l.cyl(0.035, 0.035, 0.05, 6, (lx, ly, zb - 0.07), 'M_WoodDark')
    l.cyl(0.008, 0.008, lz - (zb + 0.57), 4, (lx, ly, (lz + zb + 0.57) / 2), 'M_Black')
    rface = 0.235 * math.cos(math.pi / 8)
    Me = align_z((0, -1, 0), (lx, ly - rface - 0.002, zb + 0.25))
    emblem(l, Me, 0.22, 0.008, 'M_AppleRed', leaf='M_Leaf', stem='M_WoodDark')
    lan = l.build('Lantern', pivot=(lx, ly, lz))
    parent(lan, root)

    # ---------------- crate with apples (left)
    k = MB()
    cx, cyy = -1.32, -0.38
    crate(k, cx, cyy, 0.05, 0.62, 0.48, 0.52)
    k.box((0.56, 0.42, 0.02), (cx, cyy, 0.47), 'M_WoodDark')  # false floor
    apple_heap(k, cx - 0.29, cx + 0.29, cyy - 0.21, cyy + 0.21, 0.475, seed=3, s=1.25)
    cr = k.build('Crate', pivot=(cx, cyy, 0.05))
    parent(cr, root)

    # ---------------- chalkboard (right)
    b = MB()
    bx, by = 1.42, -0.5
    tilt = 12
    Mb = T((bx, by, 0.05), (-tilt, 0, 0))
    hgt = 1.0
    for sx in (-1, 1):
        b.box((0.06, 0.05, hgt), (sx * 0.27, 0, hgt / 2), 'M_Wood', bevel=0.008, M=Mb)
    b.box((0.6, 0.05, 0.06), (0, 0, hgt - 0.03), 'M_Wood', bevel=0.008, M=Mb)
    b.box((0.6, 0.05, 0.06), (0, 0, 0.3), 'M_Wood', bevel=0.008, M=Mb)
    b.box((0.5, 0.03, 0.62), (0, 0, 0.63), 'M_Chalk', M=Mb)
    chalk_apple(b, Mb @ align_z((0, -1, 0), (0, -0.016, 0.62)), 0.36, 0.022, 0.004)
    # back legs
    Mb2 = T((bx, by, 0.05), (tilt + 8, 0, 0))
    for sx in (-1, 1):
        b.box((0.05, 0.045, hgt * 0.95), (sx * 0.24, 0.05, hgt * 0.95 / 2), 'M_WoodDark', bevel=0.006, M=Mb2)
    b.box((0.5, 0.03, 0.04), (0, 0.06, 0.35), 'M_WoodDark', M=Mb2)
    ch = b.build('Chalkboard', pivot=(bx, by, 0.05))
    parent(ch, root)

    # ---------------- greenery (bushes + trees)
    g = MB()
    rnd = random.Random(7)

    def bush(x, y, r, n=3):
        for i in range(n):
            ox, oy = rnd.uniform(-r, r) * 0.6, rnd.uniform(-r, r) * 0.4
            rr = r * rnd.uniform(0.7, 1.0)
            g.ico((rr * 1.1, rr, rr * 0.9), (x + ox, y + oy, rr * 0.75), 'M_Leaf' if i % 2 == 0 else 'M_LeafDark',
                  1, (rnd.uniform(0, 40), rnd.uniform(0, 40), rnd.uniform(0, 90)))

    bush(-1.75, 0.45, 0.42, 3)
    bush(-0.9, 1.25, 0.45, 3)
    bush(0.0, 1.3, 0.4, 2)
    bush(0.95, 1.25, 0.48, 3)
    bush(1.8, 0.35, 0.45, 3)
    bush(2.3, 0.25, 0.3, 2)
    bush(-2.0, -0.45, 0.28, 2)

    def tree(x, y, h, r):
        g.cyl(0.08, 0.06, h, 6, (x, y, 0), 'M_WoodDark', base=True)
        g.ico(r, (x, y, h + r * 0.5), 'M_Leaf', 1, (rnd.uniform(0, 30), 0, rnd.uniform(0, 90)))
        g.ico(r * 0.75, (x + r * 0.55, y + 0.1, h + r * 0.1), 'M_LeafDark', 1, (0, rnd.uniform(0, 30), 20))
        g.ico(r * 0.7, (x - r * 0.5, y - 0.05, h + r * 0.2), 'M_LeafDark', 1, (10, 0, 50))

    tree(-2.9, 2.9, 1.0, 0.6)
    tree(3.0, 2.6, 0.9, 0.55)
    tree(-1.9, 3.5, 0.8, 0.45)
    gr = g.build('Greenery')
    parent(gr, root)

    # ---------------- ground
    gd = MB()
    gd.cyl(4.0, 4.0, 0.06, 28, (0, 0, -0.03), 'M_Ground')
    # stepping-stone path leading to the counter (sides of the customer spot) + a few scattered
    stones = [(-0.75, -1.0, 0.2), (0.8, -1.15, 0.18), (-0.55, -2.75, 0.22), (0.5, -3.1, 0.2),
              (-2.4, -1.3, 0.24), (2.45, -1.6, 0.22), (-2.9, 0.7, 0.2), (3.0, 0.9, 0.18), (-1.6, -3.0, 0.18)]
    for i, (x, y, r) in enumerate(stones):
        gd.cyl(r, r * 0.9, 0.024, 8, (x, y, 0.005), 'M_Stone', (0, 0, i * 23), scale=(1, 0.78, 1))
    # soft grass ring around the plaza
    for i in range(14):
        a = 2 * math.pi * i / 14 + rnd.uniform(-0.1, 0.1)
        rr = rnd.uniform(3.3, 3.8)
        if math.sin(a) < -0.5:
            continue
        gd.ico((0.22, 0.2, 0.13), (rr * math.cos(a), rr * math.sin(a), 0.03), 'M_Leaf', 1, (0, 0, i * 30))
    grd = gd.build('Ground')
    parent(grd, root)
    return root


def build_upgrades():
    # sign hanging from right part of front beam (under right side beam overhang)
    s = MB()
    sx, sy = 1.42, POST_YF - 0.32
    top = BEAM_Z + 0.0
    s.box((0.05, 0.36, 0.05), (POST_X, POST_YF - 0.18, 2.12), 'M_WoodDark', bevel=0.006)  # bracket arm
    sx = POST_X
    for dx in (-0.1, 0.1):
        s.cyl(0.006, 0.006, 0.16, 4, (sx + dx, sy, 2.04), 'M_Black')
    s.box((0.34, 0.04, 0.24), (sx, sy, 1.84), 'M_WoodLight', bevel=0.012)
    s.box((0.38, 0.05, 0.03), (sx, sy, 1.97), 'M_WoodDark', bevel=0.006)
    Me = align_z((0, -1, 0), (sx, sy - 0.021, 1.835))
    emblem(s, Me, 0.15, 0.008, 'M_AppleRed', leaf='M_Leaf', stem='M_WoodDark')
    s.build('Upgrade_Sign')

    k = MB()
    cx, cy = 2.02, -0.35
    crate(k, cx, cy, 0.0, 0.5, 0.4, 0.36, slat='M_WoodLight', frame='M_Wood')
    k.box((0.46, 0.36, 0.02), (cx, cy, 0.3), 'M_WoodDark')
    apple_heap(k, cx - 0.24, cx + 0.24, cy - 0.19, cy + 0.19, 0.3, seed=11, mats=('M_AppleYellow', 'M_AppleRed'), s=1.3)
    ob = k.build('Upgrade_Crate2', pivot=(cx, cy, 0))

    b = MB()
    x0, x1 = -1.62, 1.62
    yb = -0.80
    zt, sag = 2.5, 0.09
    pts = []
    N = 20
    for i in range(N + 1):
        t = i / N
        pts.append((x0 + (x1 - x0) * t, yb, zt - sag * 4 * t * (1 - t)))
    b.tube(pts, 0.007, 4, 'M_WoodDark')
    nf = 13
    for i in range(nf):
        t = (i + 0.5) / nf
        x = x0 + (x1 - x0) * t
        z = zt - sag * 4 * t * (1 - t)
        m = 'M_AppleRed' if i % 2 == 0 else 'M_Cream'
        tri = [(-0.085, 0), (0.085, 0), (0, -0.17)]
        b.prism(tri, 0.008, align_z((0, -1, 0), (x, yb + 0.004, z - 0.005)), m)
    b.build('Upgrade_Banner')

