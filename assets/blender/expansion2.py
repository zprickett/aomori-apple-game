"""Expansion recipe assets (batch 2): the last 11 recipes and their tools.

Dorayaki, daifuku, jelly, whole apple pie, cheesecake, kinton, keema curry, shumai, pork rolls,
pink tart and Festival Pie, plus a frying pan, mixing bowl, rice cooker and pork-slice prep.
Same conventions as expansion.py: Z-up, fronts face -Y, origins bottom centre, stages are named
children toggled by the game (PropSpec.only / hide). M_AppleSkin and M_Flesh are tinted to the
chosen apple at runtime; M_Jam to its jam colour.
"""
import math
import random
from lib import MB, T, empty, parent, PI, APPLE_PROFILE, PALETTE, ROUGH
from props import wedge_geo, lay_on_cut, centred, apple_body, apple_stem, apple_leaf, stove, steam_puff, dice_pile
from dishes import plate

PALETTE.update({
    'M_Pancake': '#E7B46A', 'M_PancakeTop': '#B46A2C', 'M_PancakeRaw': '#F7E4A6', 'M_Batter': '#F6E1A0',
    'M_Mochi': '#FCF8F1', 'M_Azuki': '#5E2A32', 'M_JellyGold': '#F3BE4A', 'M_SweetPotato': '#F4B63A',
    'M_SweetPotatoSkin': '#8C3B5E', 'M_Curry': '#8E4E1F', 'M_Stew': '#B85B2E', 'M_Mince': '#94583A',
    'M_Carrot': '#EE8A2E', 'M_Onion': '#F3E7C6', 'M_Pea': '#7DB24A', 'M_Roux': '#6A3816',
    'M_Pork': '#F3BBAA', 'M_PorkCooked': '#C98652', 'M_Potato': '#F5E2A0', 'M_Sauce': '#8E4A22',
    'M_Cheese': '#F8E8BC', 'M_CheeseTop': '#E2AE5E', 'M_Bamboo': '#D9B56C', 'M_BambooDark': '#A7803F',
    'M_ShumaiSkin': '#F7EAC6', 'M_Somen': '#FBF3D6', 'M_Biscuit': '#C58C4E', 'M_PinkMousse': '#F5B5C3',
    'M_PinkFlesh': '#F07088', 'M_PinkJam': '#DE5A74', 'M_Corn': '#F6D24A', 'M_RiceCooker': '#FBF7EE',
})
ROUGH.update({'M_JellyGold': 0.15, 'M_Curry': 0.35, 'M_Stew': 0.35, 'M_Sauce': 0.25, 'M_PinkJam': 0.25,
              'M_Mochi': 0.7, 'M_PorkCooked': 0.4})

PLATE_TOP = 0.013


def _parent_all(root, *objs):
    for o in objs:
        parent(o, root)


def _slices_fan(mb, n, R, z, s=0.42, skin='M_AppleSkin', flesh='M_Flesh', spread=300, tilt=0, rnd=None):
    """n thin apple slices laid flat in a fan / ring at radius R."""
    for i in range(n):
        w = MB()
        wedge_geo(w, -9, 9, s=s, seg=2, core=0.012, skin=skin, flesh=flesh)
        centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(9))
        ang = (spread * i / max(1, n - 1) if n > 1 else 0) - spread / 2
        if rnd:
            ang += rnd.uniform(-6, 6)
        M = T((0, 0, z), (0, 0, ang)) @ T((0, -R, 0), (tilt, 0, 90))
        mb.merge(w, M)


def _cubes(mb, n, R, z, rnd, size=0.012, mats=('M_Flesh', 'M_Flesh', 'M_AppleSkin'), zjit=0.006):
    for _ in range(n):
        a = rnd.uniform(0, 2 * PI)
        r = R * math.sqrt(rnd.random())
        mb.box((size, size, size * 0.9), (r * math.cos(a), r * math.sin(a), z + rnd.uniform(0, zjit)), rnd.choice(mats),
               (rnd.uniform(-25, 25), rnd.uniform(-25, 25), rnd.uniform(0, 90)))


# ----------------------------------------------------------------------------- frying pan
FP_Z = 0.095  # pan floor


def build_frypan():
    rnd = random.Random(21)
    root = empty('FryPan')
    sv = MB()
    stove(sv)
    svo = sv.build('FP_Stove')
    p = MB()
    z0 = 0.085
    p.lathe([(0.0, z0), (0.11, z0), (0.14, z0 + 0.045), (0.133, z0 + 0.047), (0.105, z0 + 0.01), (0.0, z0 + 0.01)],
            16, m='M_MetalDark')
    p.tube([(0.135, 0, z0 + 0.03), (0.17, 0, z0 + 0.045), (0.29, 0, z0 + 0.065)], [0.009, 0.012, 0.013], 6, 'M_WoodDark')
    p.cyl(0.013, 0.013, 0.025, 6, (0.155, 0, z0 + 0.038), 'M_Metal', (0, 70, 0))
    po = p.build('FP_Body')
    objs = [svo, po]
    z = FP_Z

    def pancake(mb, top, side, r=0.075, bubbles=False):
        mb.lathe([(0.0, z), (r, z), (r + 0.004, z + 0.006), (r, z + 0.012), (r * 0.7, z + 0.015), (0.0, z + 0.016)], 16,
                 mats=[side, side, top, top, top])
        if bubbles:
            for _ in range(14):
                a = rnd.uniform(0, 2 * PI)
                rr = rnd.uniform(0.01, r * 0.85)
                mb.torus(0.0065, 0.002, 8, 3, (rr * math.cos(a), rr * math.sin(a), z + 0.0155), 'M_PancakeTop')

    for nm, top, side, bub in (('FP_Raw', 'M_PancakeRaw', 'M_PancakeRaw', False), ('FP_Bubbly', 'M_PancakeRaw', 'M_Pancake', True),
                               ('FP_Cooked', 'M_PancakeTop', 'M_Pancake', False)):
        m = MB()
        pancake(m, top, side, bubbles=bub)
        objs.append(m.build(nm, pivot=(0, 0, z)))

    # keema stages
    v = MB()
    _cubes(v, 34, 0.1, z + 0.004, rnd, 0.016, ('M_Flesh', 'M_Flesh', 'M_AppleSkin', 'M_Carrot', 'M_Carrot', 'M_Onion'))
    objs.append(v.build('FP_Veg', pivot=(0, 0, z)))
    mi = MB()
    for _ in range(40):
        a = rnd.uniform(0, 2 * PI)
        rr = 0.1 * math.sqrt(rnd.random())
        mi.ico(rnd.uniform(0.006, 0.01), (rr * math.cos(a), rr * math.sin(a), z + 0.016), 'M_Mince', 1)
    objs.append(mi.build('FP_Mince', pivot=(0, 0, z)))
    for nm, sauce in (('FP_Stew', 'M_Stew'), ('FP_Curry', 'M_Curry')):
        c = MB()
        c.lathe([(0.0, z), (0.11, z), (0.124, z + 0.02), (0.0, z + 0.024)], 16, m=sauce)
        _cubes(c, 22, 0.1, z + 0.02, rnd, 0.014, ('M_Flesh', 'M_AppleSkin', 'M_Carrot', 'M_Pea', 'M_Mince', 'M_Mince'), 0.004)
        objs.append(c.build(nm, pivot=(0, 0, z)))
    rx = MB()
    for i, (x, y) in enumerate(((-0.03, 0.01), (0.03, -0.015))):
        rx.box((0.04, 0.028, 0.014), (x, y, z + 0.035), 'M_Roux', (8, -6, 20 + i * 30), bevel=0.003)
        for k in range(3):
            rx.box((0.002, 0.03, 0.004), (x - 0.012 + k * 0.012, y, z + 0.043), 'M_Curry', (8, -6, 20 + i * 30))
    objs.append(rx.build('FP_Roux', pivot=(0, 0, z)))

    # pork rolls
    for nm, m in (('FP_Rolls', 'M_Pork'), ('FP_RollsCooked', 'M_PorkCooked')):
        r = MB()
        if nm == 'FP_RollsCooked':
            r.cyl(0.11, 0.11, 0.005, 16, (0, 0, z), 'M_Sauce', base=True)
        for i in range(3):
            y = -0.05 + i * 0.05
            r.cyl(0.02, 0.02, 0.1, 10, (0, y, z + 0.02), m, (0, 90, 0))
            for k in range(3):  # wrap lines
                r.torus(0.0205, 0.0025, 10, 3, (-0.03 + k * 0.03, y, z + 0.02), 'M_Sauce' if nm == 'FP_RollsCooked' else 'M_Pork', (0, 90, 0))
        objs.append(r.build(nm, pivot=(0, 0, z)))

    # festival pie fillings: three batches (fixed colours, not tinted)
    batches = (('M_AppleRed', 'M_Cream', 'M_Filling'), ('M_AppleYellow', 'M_Flesh', 'M_Compote'), ('M_AppleRed', 'M_PinkFlesh', 'M_PinkJam'))
    th = MB()
    ck = MB()
    for i, (skin, flesh, cooked) in enumerate(batches):
        a0 = 90 + i * 120
        for k in range(4):
            w = MB()
            wedge_geo(w, -9, 9, s=0.38, seg=2, core=0.012, skin=skin, flesh=flesh if flesh != 'M_Flesh' else 'M_Cream')
            centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(9))
            ang = a0 + rnd.uniform(-35, 35)
            rr = 0.055 + rnd.uniform(-0.015, 0.015)
            th.merge(w, T((rr * math.cos(math.radians(ang)), rr * math.sin(math.radians(ang)), z + 0.002 + k * 0.004), (0, 0, ang + rnd.uniform(-40, 40))))
        ca = math.radians(a0)
        ck.sphere((0.05, 0.045, 0.012), (0.052 * math.cos(ca), 0.052 * math.sin(ca), z + 0.006), cooked, 10, 5, (0, 0, a0))
        for _ in range(5):
            aa = ca + rnd.uniform(-0.6, 0.6)
            rr = rnd.uniform(0.03, 0.08)
            ck.box((0.022, 0.014, 0.01), (rr * math.cos(aa), rr * math.sin(aa), z + 0.016), cooked, (0, 0, rnd.uniform(0, 180)))
    objs.append(th.build('FP_Three', pivot=(0, 0, z)))
    objs.append(ck.build('FP_ThreeCooked', pivot=(0, 0, z)))
    st = MB()
    steam_puff(st, (-0.03, 0, z + 0.12), 0.9)
    steam_puff(st, (0.04, 0.01, z + 0.17), 0.7)
    objs.append(st.build('FP_Steam', pivot=(0, 0, z + 0.1)))
    _parent_all(root, *objs)


# ----------------------------------------------------------------------------- mixing bowl
MB_Z = 0.014  # bowl floor


def build_mixbowl():
    rnd = random.Random(22)
    root = empty('MixBowl')
    b = MB()
    prof = [(0.0, 0.0), (0.055, 0.0), (0.06, 0.006), (0.1, 0.045), (0.118, 0.08), (0.124, 0.084), (0.112, 0.082),
            (0.094, 0.045), (0.05, 0.014), (0.0, 0.014)]
    mats = ['M_Ceramic'] * 9
    mats[3] = 'M_AppleRed'
    b.lathe(prof, 18, mats=mats)
    bo = b.build('MixBowl_Body')
    objs = [bo]

    def fill(mb, top, m, bumps=0.0):
        # liquid/dough surface following the bowl's inside up to height `top`
        def rin(z):
            pts = [(0.05, 0.014), (0.094, 0.045), (0.112, 0.082)]
            for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
                if z0 <= z <= z1:
                    return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
            return pts[-1][0]
        mb.lathe([(0.0, MB_Z), (rin(MB_Z + 0.001) - 0.002, MB_Z + 0.001), (rin(top) - 0.003, top), (0.0, top + bumps)], 18, m=m)

    # unmixed: flour mound, egg yolk, milk
    lu = MB()
    fill(lu, 0.03, 'M_Cream')
    lu.sphere((0.045, 0.04, 0.026), (-0.025, 0.012, 0.03), 'M_White', 10, 5)
    lu.sphere((0.018, 0.018, 0.01), (0.035, -0.015, 0.032), 'M_Butter', 8, 4)
    lu.box((0.022, 0.022, 0.016), (0.03, 0.03, 0.036), 'M_Butter', (0, 0, 25), bevel=0.003)
    objs.append(lu.build('MixBowl_Lumps', pivot=(0, 0, MB_Z)))
    fl = MB()  # rice flour and water (mochi)
    fill(fl, 0.03, 'M_Cream')
    fl.sphere((0.05, 0.045, 0.028), (-0.012, 0.008, 0.03), 'M_White', 10, 5)
    fl.sphere((0.03, 0.028, 0.02), (0.035, -0.02, 0.03), 'M_White', 10, 5)
    objs.append(fl.build('MixBowl_Flour', pivot=(0, 0, MB_Z)))

    def smooth(nm, m, swirl=None, extra=None):
        s = MB()
        fill(s, 0.042, m, 0.004)
        if swirl:
            s.torus(0.045, 0.004, 14, 4, (0, 0, 0.046), swirl)
            s.torus(0.022, 0.0035, 12, 4, (0.006, 0, 0.047), swirl)
        if extra:
            extra(s)
        objs.append(s.build(nm, pivot=(0, 0, MB_Z)))

    smooth('MixBowl_Batter', 'M_Batter', 'M_Pancake')
    smooth('MixBowl_Cheese', 'M_Cheese', 'M_CheeseTop')
    # mochi: a smooth white dome
    mo = MB()
    fill(mo, 0.03, 'M_Mochi')
    mo.sphere((0.065, 0.06, 0.03), (0, 0, 0.032), 'M_Mochi', 14, 6)
    objs.append(mo.build('MixBowl_Mochi', pivot=(0, 0, MB_Z)))
    # jelly: juice with gelatin sprinkles, then clear gold
    jr = MB()
    fill(jr, 0.045, 'M_JellyGold')
    for _ in range(26):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0, 0.08)
        jr.box((0.005, 0.005, 0.003), (r * math.cos(a), r * math.sin(a), 0.047), 'M_White', (0, 0, rnd.uniform(0, 90)))
    objs.append(jr.build('MixBowl_JuiceRaw', pivot=(0, 0, MB_Z)))
    smooth('MixBowl_Juice', 'M_JellyGold', 'M_Butter')
    # kinton: sweet potato chunks + apple pieces, then golden mash
    kr = MB()
    fill(kr, 0.022, 'M_SweetPotato')
    for _ in range(9):
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0.0, 0.06)
        kr.box((0.03, 0.026, 0.022), (r * math.cos(a), r * math.sin(a), 0.036), 'M_SweetPotato', (rnd.uniform(0, 30), 0, rnd.uniform(0, 90)), bevel=0.004)
    _cubes(kr, 12, 0.07, 0.04, rnd, 0.014)
    objs.append(kr.build('MixBowl_KintonRaw', pivot=(0, 0, MB_Z)))

    def apple_bits(mb):
        _cubes(mb, 10, 0.07, 0.044, rnd, 0.011, ('M_Flesh', 'M_Flesh', 'M_AppleSkin'), 0.002)
    smooth('MixBowl_Kinton', 'M_SweetPotato', None, apple_bits)
    # shumai filling: mince, onion, apple, then mixed
    fr = MB()
    fill(fr, 0.025, 'M_Pork')
    fr.sphere((0.05, 0.045, 0.02), (-0.02, 0.01, 0.034), 'M_Pork', 10, 5)
    _cubes(fr, 14, 0.07, 0.04, rnd, 0.012, ('M_Onion', 'M_Onion', 'M_Flesh'))
    objs.append(fr.build('MixBowl_FillingRaw', pivot=(0, 0, MB_Z)))

    def filling_bits(mb):
        _cubes(mb, 14, 0.07, 0.044, rnd, 0.008, ('M_Onion', 'M_Flesh', 'M_Leaf'), 0.002)
    smooth('MixBowl_Filling', 'M_Pork', None, filling_bits)
    # pink mousse: yogurt with a pink swirl, then smooth pink
    mr = MB()
    fill(mr, 0.04, 'M_Yogurt', 0.004)
    mr.torus(0.045, 0.008, 14, 4, (0, 0, 0.045), 'M_PinkJam')
    mr.sphere((0.02, 0.02, 0.008), (0.01, 0.0, 0.046), 'M_PinkJam', 8, 4)
    objs.append(mr.build('MixBowl_MousseRaw', pivot=(0, 0, MB_Z)))
    smooth('MixBowl_Mousse', 'M_PinkMousse', 'M_PinkJam')
    _parent_all(root, *objs)


# ----------------------------------------------------------------------------- rice cooker
RC_H = 0.15


def build_ricecooker():
    rnd = random.Random(23)
    root = empty('RiceCooker')
    b = MB()
    b.lathe([(0.0, 0.0), (0.11, 0.0), (0.125, 0.015), (0.13, 0.09), (0.125, RC_H - 0.005), (0.116, RC_H), (0.098, RC_H),
             (0.098, RC_H - 0.006)], 18, m='M_RiceCooker', cap=False)
    b.torus(0.13, 0.006, 18, 4, (0, 0, 0.03), 'M_AppleRed')
    b.box((0.07, 0.03, 0.045), (0, -0.122, 0.065), 'M_Cream', (8, 0, 0), bevel=0.006)          # panel
    b.box((0.04, 0.006, 0.012), (0, -0.138, 0.075), 'M_Black', (8, 0, 0))                    # display
    for sx in (-1, 1):
        b.box((0.03, 0.02, 0.012), (sx * 0.12, 0.0, RC_H - 0.03), 'M_MetalDark', (0, 0, 90 * 0))
    bo = b.build('RC_Body')
    bt = MB()
    bt.cyl(0.012, 0.011, 0.01, 10, (0, -0.138, 0.052), 'M_AppleRed', (98, 0, 0))
    bto = bt.build('RC_Button', pivot=(0, -0.138, 0.052))
    pz = RC_H - 0.035  # inner pot floor (shallow, so what's inside shows)
    po = MB()
    po.lathe([(0.098, RC_H - 0.006), (0.096, pz), (0.0, pz)], 16, m='M_Metal', cap=False)
    pot = po.build('RC_Pot', pivot=(0, 0, pz))
    ap = MB()
    _slices_fan(ap, 12, 0.055, pz + 0.001, 0.5, 'M_AppleSkin', 'M_Flesh', spread=340, rnd=rnd)
    ap.cyl(0.03, 0.03, 0.006, 12, (0, 0, pz), 'M_Caramel', base=True)
    apo = ap.build('RC_Apples', pivot=(0, 0, pz))
    ba = MB()
    ba.cyl(0.095, 0.095, 0.028, 16, (0, 0, pz), 'M_Cheese', base=True)
    bao = ba.build('RC_Batter', pivot=(0, 0, pz))
    lc = MB()
    lc.lathe([(0.122, RC_H), (0.118, RC_H + 0.03), (0.09, RC_H + 0.05), (0.0, RC_H + 0.056)], 18, m='M_RiceCooker')
    lc.cyl(0.016, 0.016, 0.01, 8, (0, 0, RC_H + 0.056), 'M_AppleRed', base=True)
    lco = lc.build('RC_Lid', pivot=(0, 0, RC_H))
    lo = MB()
    lo.lathe([(0.122, 0.0), (0.118, 0.03), (0.09, 0.05), (0.0, 0.056)], 18, m='M_RiceCooker')
    lo.V = [T((0, 0.122, RC_H), (-100, 0, 0)) @ T((0, -0.122, 0)) @ v for v in lo.V]
    loo = lo.build('RC_LidOpen', pivot=(0, 0.125, RC_H))
    st = MB()
    steam_puff(st, (0.0, 0.0, RC_H + 0.11), 0.8)
    sto = st.build('RC_Steam', pivot=(0, 0, RC_H + 0.1))
    _parent_all(root, bo, bto, pot, apo, bao, lco, loo, sto)


# ----------------------------------------------------------------------------- pork slices on the board
def build_porkprep():
    rnd = random.Random(24)
    root = empty('PorkPrep')
    s = MB()
    for i in range(2):
        x = -0.045 + i * 0.09
        s.box((0.07, 0.15, 0.006), (x, 0.0, 0.003), 'M_Pork', (0, 0, rnd.uniform(-4, 4)), bevel=0.002)
        for k in range(3):
            s.box((0.05, 0.004, 0.0015), (x, -0.05 + k * 0.05, 0.0065), 'M_White', (0, 0, rnd.uniform(-20, 20)))
    so = s.build('Pork_Strips')
    f = MB()
    for i in range(2):
        x = -0.045 + i * 0.09
        f.sphere((0.022, 0.03, 0.012), (x, 0.03, 0.012), 'M_Potato', 8, 4)
        for k in range(3):
            w = MB()
            wedge_geo(w, -9, 9, s=0.34, seg=2, core=0.012)
            centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(9))
            f.merge(w, T((x + (k - 1) * 0.012, -0.02 - k * 0.012, 0.006 + k * 0.003), (0, 0, 90)))
    fo = f.build('Pork_Fill')
    r = MB()
    for i in range(3):
        y = -0.05 + i * 0.05
        r.cyl(0.019, 0.019, 0.085, 10, (0, y, 0.019), 'M_Pork', (0, 90, 0))
        r.cyl(0.012, 0.012, 0.087, 10, (0, y, 0.019), 'M_Potato', (0, 90, 0))
    ro = r.build('Pork_Rolled')
    _parent_all(root, so, fo, ro)


# ----------------------------------------------------------------------------- dishes
def build_dorayaki():
    rnd = random.Random(31)
    root = empty('Dish_Dorayaki')
    p = MB()
    plate(p, r=0.11)
    po = p.build('Dora_Plate')
    z = PLATE_TOP

    def cake(mb, z0, flip=False):
        r = 0.075
        prof = [(0.0, 0.0), (r * 0.8, 0.0), (r, 0.006), (r * 1.01, 0.012), (r * 0.85, 0.018), (0.0, 0.021)]
        mats = ['M_PancakeTop', 'M_Pancake', 'M_Pancake', 'M_PancakeTop', 'M_PancakeTop']
        if flip:
            prof = [(rr, -zz) for rr, zz in reversed(prof)]
            mats = list(reversed(mats))
        mb.lathe(prof, 18, M=T((0, 0, z0)), mats=mats)

    b = MB()
    cake(b, z)
    bo = b.build('Dora_Bottom', pivot=(0, 0, z))
    f = MB()
    fz = z + 0.02
    f.lathe([(0.0, fz), (0.06, fz), (0.062, fz + 0.012), (0.045, fz + 0.022), (0.0, fz + 0.026)], 16, m='M_Whip')
    for i in range(7):
        a = 2 * PI * i / 7 + 0.3
        w = MB()
        wedge_geo(w, -10, 10, s=0.36, seg=2, core=0.012)
        centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(10))
        f.merge(w, T((0.058 * math.cos(a), 0.058 * math.sin(a), fz + 0.006), (0, 0, math.degrees(a) + 90)))
    fo = f.build('Dora_Fill', pivot=(0, 0, fz))
    t = MB()
    cake(t, fz + 0.048, flip=True)
    t.V = [T((0, 0.0, 0), (6, 0, 0)) @ v for v in t.V]
    to = t.build('Dora_Top', pivot=(0, 0, fz + 0.03))
    _parent_all(root, po, bo, fo, to)


def build_daifuku():
    rnd = random.Random(32)
    root = empty('Dish_Daifuku')
    p = MB()
    plate(p, r=0.1)
    po = p.build('Daifuku_Plate')
    z = PLATE_TOP
    s = MB()
    s.lathe([(0.0, z), (0.07, z), (0.075, z + 0.004), (0.068, z + 0.008), (0.0, z + 0.009)], 16, m='M_Mochi')
    so = s.build('Daifuku_Sheet', pivot=(0, 0, z))
    f = MB()
    f.sphere((0.035, 0.035, 0.028), (0, 0, z + 0.03), 'M_Azuki', 12, 6)
    _cubes(f, 6, 0.025, z + 0.05, rnd, 0.014, ('M_Flesh', 'M_Flesh', 'M_AppleSkin'), 0.004)
    fo = f.build('Daifuku_Fill', pivot=(0, 0, z))
    b = MB()
    b.lathe([(0.0, z), (0.05, z), (0.06, z + 0.012), (0.058, z + 0.03), (0.045, z + 0.05), (0.02, z + 0.06), (0.0, z + 0.062)],
            16, m='M_Mochi')
    for _ in range(18):  # potato-starch dusting
        a = rnd.uniform(0, 2 * PI)
        r = rnd.uniform(0, 0.04)
        b.box((0.004, 0.004, 0.002), (r * math.cos(a), r * math.sin(a), z + 0.06 - r * 0.4), 'M_White', (0, 0, rnd.uniform(0, 90)))
    w = MB()  # a little apple slice on top
    wedge_geo(w, -12, 12, s=0.3, seg=2, core=0.012)
    centred(w, T((0, 0, 0), (0, 0, 90)) @ lay_on_cut(12))
    b.merge(w, T((0.0, 0.0, z + 0.058), (0, -10, 30)))
    bo = b.build('Daifuku_Ball', pivot=(0, 0, z))
    h = MB()  # a cut half beside, showing the filling
    hx, hy = 0.062, -0.042
    h.lathe([(0.0, 0.0), (0.04, 0.0), (0.046, 0.01), (0.043, 0.025), (0.03, 0.038), (0.0, 0.042)], 12, m='M_Mochi',
            M=T((hx, hy, z)) @ T((0, 0, 0), (0, 0, 0), (1, 0.5, 1)))
    h.sphere((0.024, 0.004, 0.02), (hx, hy - 0.02, z + 0.02), 'M_Azuki', 10, 5)
    h.box((0.014, 0.004, 0.012), (hx + 0.004, hy - 0.022, z + 0.022), 'M_Flesh')
    h.box((0.042, 0.002, 0.04), (hx, hy - 0.019, z + 0.02), 'M_Mochi')
    ho = h.build('Daifuku_Half', pivot=(hx, hy, z))
    _parent_all(root, po, so, fo, bo, ho)


def build_jelly():
    rnd = random.Random(33)
    root = empty('Dish_Jelly')
    p = MB()
    plate(p, r=0.1)
    po = p.build('Jelly_Plate')
    z = PLATE_TOP
    c = MB()
    c.lathe([(0.0, z), (0.042, z), (0.045, z + 0.004), (0.06, z + 0.075), (0.056, z + 0.075), (0.041, z + 0.006), (0.0, z + 0.006)],
            16, m='M_Glass', cap=False)
    co = c.build('Jelly_Cup', pivot=(0, 0, z))
    cu = MB()
    _cubes(cu, 10, 0.03, z + 0.008, rnd, 0.014)
    cuo = cu.build('Jelly_Cubes', pivot=(0, 0, z))
    li = MB()
    li.lathe([(0.0, z + 0.006), (0.04, z + 0.006), (0.054, z + 0.062), (0.0, z + 0.062)], 16, m='M_JellyGold')
    lio = li.build('Jelly_Liquid', pivot=(0, 0, z))
    s = MB()  # turned out: the cup shape upside down
    s.lathe([(0.0, z), (0.054, z), (0.052, z + 0.02), (0.04, z + 0.055), (0.0, z + 0.058)], 16, m='M_JellyGold')
    for i in range(8):
        a = 2 * PI * i / 8 + rnd.uniform(-0.2, 0.2)
        zz = z + rnd.uniform(0.035, 0.05)
        rr = 0.054 - (zz - z) * 0.33
        s.box((0.014, 0.012, 0.013), (rr * math.cos(a), rr * math.sin(a), zz), rnd.choice(['M_Flesh', 'M_Flesh', 'M_AppleSkin']),
              (0, 20, math.degrees(a)))
    s.box((0.02, 0.003, 0.012), (-0.006, 0.0, z + 0.062), 'M_Mint', (20, 0, 35))
    s.box((0.018, 0.003, 0.011), (0.008, 0.004, z + 0.061), 'M_Mint', (-15, 0, -30))
    so = s.build('Jelly_Set', pivot=(0, 0, z))
    _parent_all(root, po, co, cuo, lio, so)


def build_whole_pie():
    root = empty('Dish_WholePie')
    p = MB()
    plate(p, r=0.105)
    po = p.build('WholePie_Plate')
    base = PLATE_TOP
    body = MB()
    apple_body(body, M=T((0, 0, base)))
    bo = body.build('WholePie_Body')
    st = MB()
    apple_stem(st, M=T((0, 0, base)))
    apple_leaf(st, M=T((0, 0, base)))
    so = st.build('WholePie_Stem', pivot=(0, 0, base + 0.112))
    zt = base + 0.128
    h = MB()
    h.cyl(0.02, 0.02, 0.004, 10, (0, 0, zt + 0.004), 'M_CoreHole', base=True)
    ho = h.build('WholePie_Hole', pivot=(0, 0, zt))
    for nm, m, dots in (('WholePie_Pastry', 'M_Pastry', None), ('WholePie_Baked', 'M_PastryBaked', 'M_Sugar')):
        pa = MB()
        prof = [(r * 1.08 + 0.003, z * 1.05 + 0.001) for r, z in APPLE_PROFILE[1:]]
        pa.lathe([(0.0, 0.0)] + prof, 14, m=m, M=T((0, 0, base)))
        # lattice-like crimped bands
        for zz, rr in ((0.04, 0.083), (0.075, 0.087), (0.105, 0.079)):
            pa.torus(rr * 1.02, 0.006, 16, 4, (0, 0, base + zz * 1.05), m)
        # pastry leaves on top + a pastry 'stem'
        for k, ang in enumerate((20, 150)):
            from lib import leaf_poly
            lf = leaf_poly(0.05, 0.026, 5)
            pa.prism(lf, 0.005, T((0, 0, base + 0.145), (-12, 0, ang)), m)
        pa.cyl(0.008, 0.006, 0.03, 6, (0, 0, base + 0.14), m, base=True)
        if dots:
            rnd = random.Random(40)
            for _ in range(24):
                a = rnd.uniform(0, 2 * PI)
                zz = rnd.uniform(0.06, 0.13)
                rr = 0.085 if zz < 0.11 else 0.06
                pa.box((0.004, 0.004, 0.003), (rr * math.cos(a), rr * math.sin(a), base + zz), dots, (0, 0, rnd.uniform(0, 90)))
        pao = pa.build(nm, pivot=(0, 0, base))
        parent(pao, root)
    _parent_all(root, po, bo, so, ho)


def build_cheesecake():
    rnd = random.Random(34)
    root = empty('Dish_Cheesecake')
    p = MB()
    plate(p, r=0.12)
    po = p.build('Cheesecake_Plate')
    z = PLATE_TOP
    c = MB()
    c.lathe([(0.0, z), (0.088, z), (0.092, z + 0.006), (0.092, z + 0.05), (0.088, z + 0.055), (0.0, z + 0.055)], 18,
            mats=['M_CheeseTop', 'M_Cheese', 'M_Cheese', 'M_CheeseTop', 'M_CheeseTop'])
    co = c.build('Cheesecake_Cake', pivot=(0, 0, z))
    a = MB()
    _slices_fan(a, 10, 0.05, z + 0.055, 0.42, spread=330, rnd=rnd)
    a.cyl(0.02, 0.02, 0.006, 10, (0, 0, z + 0.057), 'M_Caramel', base=True)
    ao = a.build('Cheesecake_Apples', pivot=(0, 0, z + 0.055))
    _parent_all(root, po, co, ao)


def build_kinton():
    rnd = random.Random(35)
    root = empty('Dish_Kinton')
    p = MB()
    plate(p, r=0.1)
    po = p.build('Kinton_Plate')
    z = PLATE_TOP
    b = MB()
    for i, (x, y) in enumerate(((-0.035, 0.02), (0.035, 0.02), (0.0, -0.035))):
        b.sphere((0.03, 0.03, 0.026), (x, y, z + 0.024), 'M_SweetPotato', 12, 6)
        for k in range(5):  # cloth-twist creases on top
            a = 2 * PI * k / 5 + i
            b.box((0.016, 0.003, 0.004), (x + 0.008 * math.cos(a), y + 0.008 * math.sin(a), z + 0.047), 'M_Caramel', (0, 0, math.degrees(a)))
        _cubes(b, 2, 0.006, z + 0.05, rnd, 0.01, ('M_Flesh', 'M_AppleSkin'), 0.002)
        b.box((0.006, 0.006, 0.004), (x - 0.012, y - 0.02, z + 0.03), 'M_SweetPotatoSkin', (0, 0, 20))
    bo = b.build('Kinton_Balls', pivot=(0, 0, z))
    _parent_all(root, po, bo)


def build_keema():
    rnd = random.Random(36)
    root = empty('Dish_Keema')
    p = MB()
    plate(p, r=0.12)
    p.V = [T((0, 0, 0), (0, 0, 0), (1.15, 0.92, 1)) @ v for v in p.V]
    po = p.build('Keema_Plate')
    z = PLATE_TOP
    r = MB()
    r.sphere((0.06, 0.055, 0.035), (-0.045, 0.01, z + 0.004), 'M_White', 14, 6)
    for _ in range(30):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0, 0.05)
        r.box((0.006, 0.003, 0.003), (-0.045 + rr * math.cos(a), 0.01 + rr * math.sin(a), z + 0.035 - rr * 0.5), 'M_White',
              (rnd.uniform(0, 40), 0, rnd.uniform(0, 180)))
    ro = r.build('Keema_Rice', pivot=(0, 0, z))
    c = MB()
    c.sphere((0.065, 0.075, 0.016), (0.04, -0.005, z + 0.003), 'M_Curry', 14, 6)
    _cubes(c, 20, 0.055, z + 0.014, rnd, 0.012, ('M_Flesh', 'M_AppleSkin', 'M_Carrot', 'M_Pea', 'M_Mince', 'M_Mince'), 0.004)
    c.box((0.022, 0.004, 0.012), (-0.03, 0.03, z + 0.04), 'M_Mint', (20, 0, 35))
    co = c.build('Keema_Curry', pivot=(0, 0, z))
    _parent_all(root, po, ro, co)


def build_shumai():
    rnd = random.Random(37)
    root = empty('Dish_Shumai')
    b = MB()
    b.lathe([(0.0, 0.0), (0.105, 0.0), (0.11, 0.006), (0.11, 0.05), (0.102, 0.05), (0.102, 0.008), (0.0, 0.008)], 18, m='M_Bamboo')
    for zz in (0.012, 0.028, 0.044):
        b.torus(0.11, 0.003, 18, 3, (0, 0, zz), 'M_BambooDark')
    for i in range(8):  # slats
        b.box((0.19, 0.008, 0.002), (0, -0.07 + i * 0.02, 0.009), 'M_BambooDark')
    bo = b.build('Shumai_Basket')
    spots = [(-0.042, 0.03), (0.042, 0.03), (-0.042, -0.035), (0.042, -0.035)]

    def dumplings(mb, skin, top, glossy):
        for x, y in spots:
            z = 0.01
            mb.lathe([(0.0, z), (0.026, z), (0.03, z + 0.012), (0.027, z + 0.034), (0.03, z + 0.04), (0.02, z + 0.041), (0.0, z + 0.042)],
                     12, m=skin, M=T((x, y, 0)))
            for k in range(12):  # somen coat
                a = 2 * PI * k / 12
                mb.box((0.0025, 0.0025, 0.03), (x + 0.0295 * math.cos(a), y + 0.0295 * math.sin(a), z + 0.022), 'M_Somen',
                       (rnd.uniform(-15, 15), rnd.uniform(-15, 15), 0))
            mb.ico(0.017, (x, y, z + 0.042), top, 1)
            if glossy:
                mb.box((0.012, 0.012, 0.01), (x, y, z + 0.056), 'M_Flesh', (20, 15, rnd.uniform(0, 90)))
    r = MB()
    dumplings(r, 'M_ShumaiSkin', 'M_Pork', False)
    ro = r.build('Shumai_Raw')
    c = MB()
    dumplings(c, 'M_ShumaiSkin', 'M_PorkCooked', True)
    cof = c.build('Shumai_Cooked')
    l = MB()
    l.lathe([(0.112, 0.05), (0.112, 0.07), (0.09, 0.09), (0.0, 0.095)], 18, m='M_Bamboo')
    l.torus(0.112, 0.003, 18, 3, (0, 0, 0.062), 'M_BambooDark')
    l.box((0.05, 0.012, 0.01), (0, 0, 0.098), 'M_BambooDark')
    lo = l.build('Shumai_Lid', pivot=(0, 0, 0.05))
    _parent_all(root, bo, ro, cof, lo)


def build_pork_rolls():
    rnd = random.Random(38)
    root = empty('Dish_PorkRolls')
    p = MB()
    plate(p, r=0.11)
    po = p.build('PorkRolls_Plate')
    z = PLATE_TOP
    l = MB()
    from lib import leaf_poly
    l.prism(leaf_poly(0.09, 0.06, 6), 0.003, T((-0.04, 0.03, z + 0.002), (0, 0, 120)), 'M_Leaf')
    lo = l.build('PorkRolls_Leaf', pivot=(0, 0, z))
    r = MB()
    for i, (x, y, ang) in enumerate(((0.0, 0.02, 10), (0.0, -0.03, -5), (0.05, -0.005, 80))):
        M = T((x, y, z + 0.021), (0, 90, ang))
        r.cyl(0.02, 0.02, 0.07, 10, (0, 0, 0), 'M_PorkCooked', M=M)
        # cut face showing potato + apple
        r.cyl(0.013, 0.013, 0.002, 10, (0, 0, 0.035), 'M_Potato', M=M)
        r.box((0.01, 0.012, 0.002), (0.0, 0.0, 0.0365), 'M_Flesh', M=M)
    ro = r.build('PorkRolls_Rolls', pivot=(0, 0, z))
    s = MB()
    for _ in range(6):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.0, 0.05)
        s.sphere((0.02, 0.016, 0.004), (rr * math.cos(a), rr * math.sin(a) - 0.005, z + 0.042), 'M_Sauce', 8, 4)
    _cubes(s, 8, 0.05, z + 0.045, rnd, 0.008, ('M_Corn', 'M_Flesh'), 0.002)
    so = s.build('PorkRolls_Sauce', pivot=(0, 0, z))
    _parent_all(root, po, lo, ro, so)


def build_pink_tart():
    rnd = random.Random(39)
    root = empty('Dish_PinkTart')
    p = MB()
    plate(p, r=0.11)
    po = p.build('PinkTart_Plate')
    z = PLATE_TOP
    R = 0.07
    ring = MB()
    ring.lathe([(R + 0.003, z), (R + 0.003, z + 0.06), (R, z + 0.06), (R, z)], 18, m='M_Metal', cap=False)
    rio = ring.build('PinkTart_Ring', pivot=(0, 0, z))
    f = MB()
    f.cyl(R - 0.002, R - 0.002, 0.014, 18, (0, 0, z), 'M_Jam', base=True)
    _cubes(f, 14, R - 0.015, z + 0.012, rnd, 0.014, ('M_Jam', 'M_Flesh'), 0.002)
    fo = f.build('PinkTart_MFruit', pivot=(0, 0, z))
    m = MB()
    m.cyl(R - 0.002, R - 0.002, 0.026, 18, (0, 0, z + 0.014), 'M_PinkMousse', base=True)
    mo = m.build('PinkTart_MMousse', pivot=(0, 0, z))
    b = MB()
    b.cyl(R - 0.002, R - 0.002, 0.014, 18, (0, 0, z + 0.04), 'M_Biscuit', base=True)
    for _ in range(14):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0, R - 0.01)
        b.ico(0.004, (rr * math.cos(a), rr * math.sin(a), z + 0.054), 'M_Biscuit', 1)
    bo = b.build('PinkTart_MBase', pivot=(0, 0, z))
    d = MB()  # turned out: biscuit base, mousse, glossy fruit top
    d.cyl(R, R, 0.014, 18, (0, 0, z), 'M_Biscuit', base=True)
    d.cyl(R, R, 0.026, 18, (0, 0, z + 0.014), 'M_PinkMousse', base=True)
    d.cyl(R, R, 0.01, 18, (0, 0, z + 0.04), 'M_Jam', base=True)
    _slices_fan(d, 9, 0.042, z + 0.05, 0.36, 'M_AppleSkin', 'M_Jam', spread=320, rnd=rnd)
    d.box((0.02, 0.003, 0.012), (-0.004, 0.0, z + 0.066), 'M_Mint', (20, 0, 35))
    d.box((0.018, 0.003, 0.011), (0.01, 0.004, z + 0.065), 'M_Mint', (-15, 0, -30))
    do = d.build('PinkTart_Done', pivot=(0, 0, z))
    _parent_all(root, po, rio, fo, mo, bo, do)


def build_festival_pie():
    rnd = random.Random(41)
    root = empty('Dish_FestivalPie')
    t = MB()
    t.lathe([(0.0, 0.0), (0.095, 0.0), (0.112, 0.035), (0.122, 0.038), (0.122, 0.042), (0.109, 0.04),
             (0.09, 0.006), (0.0, 0.006)], 16, m='M_Metal')
    to = t.build('Festival_Tin')
    sh = MB()
    sh.lathe([(0.0, 0.006), (0.09, 0.006), (0.108, 0.04), (0.118, 0.046), (0.112, 0.05), (0.1, 0.044),
              (0.082, 0.014), (0.0, 0.014)], 16, m='M_Pastry')
    for i in range(16):
        a = 2 * PI * (i + 0.5) / 16
        sh.sphere((0.012, 0.012, 0.008), (0.113 * math.sin(a), -0.113 * math.cos(a), 0.049), 'M_Pastry', 6, 4)
    sho = sh.build('Festival_Shell')
    fi = MB()
    for i, m in enumerate(('M_Filling', 'M_Compote', 'M_PinkJam')):
        a0 = 2 * PI * i / 3
        verts = [(0, 0, 0.05)]
        n = 8
        for k in range(n + 1):
            a = a0 + 2 * PI / 3 * k / n
            verts.append((0.098 * math.cos(a), 0.098 * math.sin(a), 0.042))
        faces = [[0, k + 1, k + 2] for k in range(n)]
        fi.add_raw(verts, faces, m)
        for _ in range(5):
            a = a0 + rnd.uniform(0.2, 2 * PI / 3 - 0.2)
            rr = rnd.uniform(0.03, 0.08)
            fi.box((0.022, 0.014, 0.01), (rr * math.cos(a), rr * math.sin(a), 0.048), m, (0, 0, rnd.uniform(0, 180)))
    fi.lathe([(0.0, 0.014), (0.084, 0.014), (0.1, 0.042), (0.0, 0.042)], 16, m='M_Filling')
    fio = fi.build('Festival_Fill')
    for nm, m in (('Festival_Top', 'M_Pastry'), ('Festival_TopBaked', 'M_PastryBaked')):
        tp = MB()
        tp.torus(0.11, 0.01, 16, 5, (0, 0, 0.05), m)
        for k in range(5):  # lattice
            off = -0.064 + k * 0.032
            L = 2 * math.sqrt(max(0.0, 0.105 ** 2 - off ** 2))
            tp.box((L, 0.012, 0.005), (0, off, 0.056), m)
            tp.box((0.012, L, 0.005), (off, 0, 0.06), m)
        # star cut-out on top
        star = []
        for k in range(10):
            a = PI / 2 + PI * k / 5
            rr = 0.03 if k % 2 == 0 else 0.013
            star.append((rr * math.cos(a), rr * math.sin(a)))
        tp.prism(star, 0.006, T((0, 0, 0.062)), m)
        tpo = tp.build(nm)
        parent(tpo, root)
    fl = MB()  # a little festival flag
    fl.cyl(0.0025, 0.0025, 0.09, 6, (0.05, 0.03, 0.06), 'M_WoodLight', base=True)
    fl.prism([(0, 0), (0.045, -0.012), (0, -0.026)], 0.002, T((0.0525, 0.03, 0.148), (90, 0, 0)), 'M_AppleRed')
    fl.box((0.012, 0.0025, 0.012), (0.064, 0.0295, 0.136), 'M_White')
    flo = fl.build('Festival_Flag')
    _parent_all(root, to, sho, fio, flo)


ROOTS = ['FryPan', 'MixBowl', 'RiceCooker', 'PorkPrep', 'Dish_Dorayaki', 'Dish_Daifuku', 'Dish_Jelly', 'Dish_WholePie',
         'Dish_Cheesecake', 'Dish_Kinton', 'Dish_Keema', 'Dish_Shumai', 'Dish_PorkRolls', 'Dish_PinkTart', 'Dish_FestivalPie']


def build_expansion2():
    build_frypan()
    build_mixbowl()
    build_ricecooker()
    build_porkprep()
    build_dorayaki()
    build_daifuku()
    build_jelly()
    build_whole_pie()
    build_cheesecake()
    build_kinton()
    build_keema()
    build_shumai()
    build_pork_rolls()
    build_pink_tart()
    build_festival_pie()
