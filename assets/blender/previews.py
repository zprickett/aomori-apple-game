"""Preview renders + UI icons. Runs after export (scene changes here are never exported)."""
import os
import math
import bpy
from mathutils import Vector
import render as R
from lib import MB, hex2lin, apple_profile, T
from props import wedge_geo


def obj(n):
    return bpy.data.objects[n]


class Pose:
    """Temporarily move roots / rotate children / hide children; restores on exit."""

    def __init__(self, loc=None, rot=None, hide=()):
        self.loc, self.rot, self.hide = loc or {}, rot or {}, hide
        self.saved = []

    def __enter__(self):
        for n, v in self.loc.items():
            o = obj(n)
            self.saved.append((o, o.location.copy(), o.rotation_euler.copy(), o.scale.copy()))
            if len(v) == 2:
                o.location, o.rotation_euler.z = Vector(v[0]), math.radians(v[1])
            else:
                o.location = Vector(v)
        for n, v in self.rot.items():
            o = obj(n)
            self.saved.append((o, o.location.copy(), o.rotation_euler.copy(), o.scale.copy()))
            o.rotation_euler = [math.radians(a) for a in v]
        self.hidden = []
        for n in self.hide:
            o = obj(n)
            self.hidden.append(o)
            R._set_hidden(o, True)
        bpy.context.view_layer.update()
        return self

    def __exit__(self, *a):
        for o, l, r, s in reversed(self.saved):
            o.location, o.rotation_euler, o.scale = l, r, s
        for o in self.hidden:
            R._set_hidden(o, False)
        bpy.context.view_layer.update()


def _render(roots, path, res=(600, 600), transparent=False, samples=None, hide=()):
    # R.render resets visibility of roots; apply child hides after
    sc = bpy.context.scene
    all_roots = [o for o in sc.objects if o.parent is None and o.type in ('MESH', 'EMPTY')]
    for r in all_roots:
        R._set_hidden(r, r.name not in roots)
    for n in hide:
        R._set_hidden(obj(n), True)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = transparent
    if samples:
        sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for r in all_roots:
        R._set_hidden(r, False)
    print('rendered', os.path.basename(path))


def var_material(name, base, second=None, dirv=(0, 0, 1), lo=-0.5, hi=0.5, streak=0.0, rough=0.5):
    """Icon-only apple skin: `base` colour, `second` colour where dot(objpos, dirv) is high
    (mapped lo..hi -> 0..1); streak=True breaks the second colour into vertical streaks."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    if not second:
        bsdf.inputs['Base Color'].default_value = hex2lin(base) + [1]
        return m
    tc = nt.nodes.new('ShaderNodeTexCoord')
    dotn = nt.nodes.new('ShaderNodeVectorMath')
    dotn.operation = 'DOT_PRODUCT'
    nt.links.new(tc.outputs['Object'], dotn.inputs[0])
    dotn.inputs[1].default_value = Vector(dirv).normalized() * 12.5  # object units ~0.08 -> ~1
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = lo
    mr.inputs['From Max'].default_value = hi
    nt.links.new(dotn.outputs['Value'], mr.inputs['Value'])
    fac = mr.outputs['Result']
    if streak:
        wave = nt.nodes.new('ShaderNodeTexWave')
        wave.wave_type = 'BANDS'
        wave.bands_direction = 'X'
        wave.inputs['Scale'].default_value = 9.0
        wave.inputs['Distortion'].default_value = 1.2
        wave.inputs['Detail'].default_value = 0.0
        nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
        wr = nt.nodes.new('ShaderNodeMapRange')
        wr.inputs['From Min'].default_value = 0.25
        wr.inputs['From Max'].default_value = 0.6
        wr.inputs['To Min'].default_value = 1.0 - streak
        nt.links.new(wave.outputs['Fac'], wr.inputs['Value'])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.use_clamp = True
        nt.links.new(fac, mul.inputs[0])
        nt.links.new(wr.outputs['Result'], mul.inputs[1])
        fac = mul.outputs[0]
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = hex2lin(base) + [1]
    mix.inputs['B'].default_value = hex2lin(second) + [1]
    nt.links.new(fac, mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return m


CAMV = (-0.45, -0.85, 0.35)  # roughly toward the icon camera
APPLES = [
    # id, base, second, dir, lo, hi, streak, scale, extra
    ('a048', '#F2B35A', '#D9473A', CAMV, -1.2, -0.1, 0.4, 1.0, None),        # Fuji: red streaks over yellow
    ('a081', '#D9503F', '#E9C25A', (0.5, -0.4, -0.75), 0.2, 0.95, 0.0, 1.0, None),  # Tsugaru: yellow blush low/back
    ('a023', '#C9C85A', '#DCD87C', (0, 0, 1), 0.2, 1.0, 0.0, 1.0, None),   # Orin
    ('a066', '#F0C04A', '#E0603C', CAMV, -0.7, 0.3, 0.0, 1.0, None),        # Jonagold: red-orange over yellow
    ('a006', '#F2CC4E', '#F0A060', (-0.95, -0.3, 0.1), 0.15, 0.85, 0.0, 1.0, None),  # Toki: pink blush
    ('a094', '#B3202A', None, None, 0, 0, 0.0, 0.88, None),                 # Kogyoku
    ('a091', '#D93A33', None, None, 0, 0, 0.0, 0.62, None),                 # Alps Otome (mini)
    ('a032', '#8DB54A', '#A9C760', (0, 0, 1), 0.2, 1.0, 0.0, 1.15, 'lumpy'),  # Bramley
    ('a058', '#A8182A', None, None, 0, 0, 0.0, 1.0, 'cut'),                 # Kurenai no Yume
    ('a086', '#E8B850', '#CF3A3A', (0, 0, 1), -0.75, 0.15, 0.0, 1.0, None),         # Chiyuki
]


_DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src', 'data')
_SIZE = {'mini': 0.62, 'small': 0.82, 'standard': 1.0, 'large': 1.12}


def _expansion_apples():
    """Icon specs for every apple not hand-tuned above, from src/data/apple_visuals.json."""
    import json
    vis = json.load(open(os.path.join(_DATA, 'apple_visuals.json')))
    exp = {a['id']: a for a in json.load(open(os.path.join(_DATA, 'apples_expansion.json'), encoding='utf-8'))['apples']}
    have = {a[0] for a in APPLES}
    out = []
    for aid, v in vis.items():
        if aid in have:
            continue
        sk = v['skin']
        sc = _SIZE.get(exp.get(aid, {}).get('game_size_class', 'standard'), 1.0)
        extra = 'cut' if v.get('flesh') else None
        if sk['pattern'] == 'streak':
            out.append((aid, sk['second'], sk['base'], CAMV, -1.2, -0.1, 0.4, sc, extra))
        elif sk['pattern'] == 'blush':
            out.append((aid, sk['base'], sk['second'], (0.5, -0.4, -0.75), 0.2, 0.95, 0.0, sc, extra))
        else:
            out.append((aid, sk['base'], sk['second'], (0, 0, 1), 0.2, 1.0, 0.0, sc, extra))
    return out


def apple_icons(cam, out, ids=None):
    body = obj('Apple_Body')
    root = obj('Apple')
    orig = body.data.materials[0]
    orig_mesh = body.data
    import json
    vis_scale = {k: v.get('scale') for k, v in json.load(open(os.path.join(_DATA, 'apple_visuals.json'))).items()}
    for aid, base, second, dirv, lo, hi, streak, sc, extra in APPLES + _expansion_apples():
        if ids is not None and aid not in ids:
            continue
        sc = vis_scale.get(aid) or sc  # weight-based size (S/M/L) so icons show relative size
        m = var_material('ICON_' + aid, base, second, dirv or (0, 0, 1), lo, hi, streak)
        body.data.materials[0] = m
        root.scale = (sc, sc, sc)
        temp = []
        if extra == 'lumpy':
            me = orig_mesh.copy()
            import random
            rnd = random.Random(4)
            for v in me.vertices:
                r = math.hypot(v.co.x, v.co.y)
                if r > 0.01:
                    a = math.atan2(v.co.y, v.co.x)
                    k = 1 + 0.06 * math.sin(5 * a) * min(1, v.co.z / 0.06) + rnd.uniform(-0.015, 0.015)
                    v.co.x *= k
                    v.co.y *= k
            body.data = me
            body.data.materials[0] = m
        cx = 0.0
        if extra == 'cut':
            root.location = (-0.055, 0.03, 0)
            fm = bpy.data.materials.new('ICON_PinkFlesh')
            fm.use_nodes = True
            fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex2lin('#F29AA6') + [1]
            fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.7
            sm = m
            h = MB()
            wedge_geo(h, -90, 90, s=0.95, seg=6, core=0.0005, skin='ICON_SKIN', flesh='ICON_FLESH')
            # core: cream star + two seeds just proud of the cut face (cut plane is y=0, facing +Y)
            h.sphere((0.012, 0.003, 0.03), (0, 0.001, 0.064), 'ICON_CORE', 8, 4)
            import bmesh  # noqa
            me = bpy.data.meshes.new('half')
            me.from_pydata([tuple(v) for v in h.V], [], h.F)
            me.materials.append(sm)
            me.materials.append(fm)
            me.materials.append(var_material('ICON_CORE', '#FBE3E2'))
            me.materials.append(var_material('ICON_SEED', '#4A2A1C'))
            order = {'ICON_SKIN': 0, 'ICON_FLESH': 1, 'ICON_CORE': 2, 'ICON_SEED': 3}
            for p, mm in zip(me.polygons, h.M):
                p.material_index = order[mm]
                p.use_smooth = False
            half = bpy.data.objects.new('IconHalf', me)
            bpy.context.scene.collection.objects.link(half)
            # cut face toward camera, lying slightly tilted
            half.location = (0.075, -0.035, 0.0)
            half.rotation_euler = (0, 0, math.radians(128))
            bpy.context.view_layer.update()
            zmin = min((half.matrix_world @ v.co).z for v in me.vertices)
            half.location.z -= zmin
            temp.append(half)
        R.look(cam, (-0.2, -0.5, 0.27), (0.0, 0, 0.082), 60)
        bpy.context.scene.view_settings.exposure = -0.2
        _render(['Apple'] + [t.name for t in temp], os.path.join(out, f'apple_{aid}.png'), (256, 256), True, 48)
        bpy.context.scene.view_settings.exposure = 0.0
        for t in temp:
            bpy.data.objects.remove(t)
        body.data = orig_mesh
        root.scale = (1, 1, 1)
        root.location = (0, 0, 0)
    body.data.materials[0] = orig


NEW_DISH_HIDE = {
    'Dish_Daifuku': ('Daifuku_Sheet', 'Daifuku_Fill'), 'Dish_Jelly': ('Jelly_Cup', 'Jelly_Cubes', 'Jelly_Liquid'),
    'Dish_WholePie': ('WholePie_Body', 'WholePie_Stem', 'WholePie_Hole', 'WholePie_Pastry'), 'Dish_Shumai': ('Shumai_Raw', 'Shumai_Lid'),
    'Dish_PinkTart': ('PinkTart_Ring', 'PinkTart_MFruit', 'PinkTart_MMousse', 'PinkTart_MBase'), 'Dish_FestivalPie': ('Festival_Top',),
}
NEW_DISHES = (('Dish_Dorayaki', 'apple_dorayaki'), ('Dish_Daifuku', 'apple_daifuku'), ('Dish_Jelly', 'apple_jelly'),
              ('Dish_WholePie', 'whole_apple_pie'), ('Dish_Cheesecake', 'apple_cheesecake'), ('Dish_Kinton', 'apple_kinton'),
              ('Dish_Keema', 'apple_keema'), ('Dish_Shumai', 'apple_shumai'), ('Dish_PorkRolls', 'apple_pork'),
              ('Dish_PinkTart', 'red_flesh_tart'), ('Dish_FestivalPie', 'festival_pie'))
FP_ALL = ('FP_Raw', 'FP_Bubbly', 'FP_Cooked', 'FP_Veg', 'FP_Mince', 'FP_Stew', 'FP_Curry', 'FP_Roux', 'FP_Rolls', 'FP_RollsCooked',
          'FP_Three', 'FP_ThreeCooked', 'FP_Steam')
MB_ALL = ('MixBowl_Lumps', 'MixBowl_Flour', 'MixBowl_Batter', 'MixBowl_Cheese', 'MixBowl_Mochi', 'MixBowl_JuiceRaw', 'MixBowl_Juice', 'MixBowl_KintonRaw',
          'MixBowl_Kinton', 'MixBowl_FillingRaw', 'MixBowl_Filling', 'MixBowl_MousseRaw', 'MixBowl_Mousse')


def _all_but(all_, keep):
    return tuple(x for x in all_ if x not in keep)


def render_all(prev, icons_dir, only=None, icons=True):
    os.makedirs(prev, exist_ok=True)
    os.makedirs(icons_dir, exist_ok=True)
    cam = R.setup_scene(24)

    def want(n):
        return only is None or n in only

    P = lambda n: os.path.join(prev, n + '.png')  # noqa: E731
    chef_on_counter = dict(loc={'Chef': (0, 0.25, 0)}, rot={'Chef_ArmL': (-68, 0, 0), 'Chef_ArmR': (-68, 0, 0)})
    if want('hero'):
        with Pose(**chef_on_counter):
            R.look(cam, (0, -6, 1.3), (0, 0, 1.32), 40)
            _render(['Stall', 'Chef'], P('hero_stall_chef'))
    if want('hero_upgrades'):
        with Pose(loc={'Chef': (0, 0.25, 0), 'Customer_A': ((0.15, -1.45, 0), 180)},
                  rot={'Chef_ArmR': (0, 150, 0), 'Chef_ArmL': (-60, 0, 0)}):
            R.look(cam, (3.4, -6.0, 2.3), (0.1, 0, 1.15), 36)
            _render(['Stall', 'Chef', 'Upgrade_Sign', 'Upgrade_Crate2', 'Upgrade_Banner', 'Customer_A'],
                    P('hero_upgrades_customer'))
    if want('gifts'):
        R.look(cam, (0.4, -3.2, 1.6), (1.25, -0.3, 1.3), 30)
        _render(['Stall', 'Gift_Shelf', 'Gift_Longship', 'Gift_LuckyCat', 'Gift_CopperPan', 'Gift_EarthPhoto', 'Gift_FlyingFox',
                 'Gift_PinkLantern', 'Gift_Teapot', 'Gift_Taxi', 'Gift_Penguin', 'Gift_MoonRabbit', 'Gift_Elephant',
                 'Gift_SambaDrum'], P('gift_shelf'), (700, 700))
    if want('ranks'):
        # The stall at each rank, from the same front view (parts per src/game/stallPieces.ts).
        base = ['Stall_Frame', 'Crate', 'Greenery', 'Ground']
        adds = {1: [], 2: ['Stall_Roof', 'Counter_Cloth'], 3: ['Noren_L', 'Noren_C', 'Noren_R', 'Noren_Rod', 'Lantern', 'Lantern_Bracket'],
                4: ['Chalkboard', 'Upgrade_Crate2', 'Upgrade_Sign'], 5: ['Upgrade_Banner']}
        parts = ['Stall_Frame', 'Stall_Roof', 'Counter_Cloth', 'Noren_L', 'Noren_C', 'Noren_R', 'Noren_Rod', 'Lantern',
                 'Lantern_Bracket', 'Crate', 'Chalkboard', 'Greenery', 'Ground']
        shown = list(base)
        for rank in range(1, 6):
            shown += adds[rank]
            hide = [p for p in parts if p not in shown]
            with Pose(loc={'Chef': (0, 0.36, 0)}, hide=hide):
                R.look(cam, (0.0, -7.6, 2.0), (0.0, 0, 1.2), 34)
                extra = [u for u in ('Upgrade_Crate2', 'Upgrade_Sign', 'Upgrade_Banner') if u in shown]
                _render(['Stall', 'Chef'] + extra, P(f'stall_rank_{rank}'), (700, 600), hide=hide)
    if want('chars'):
        with Pose(loc={'Customer_A': (-1.05, 0, 0), 'Customer_B': (-0.35, 0, 0), 'Customer_C': (0.35, 0, 0),
                       'Customer_D': (1.05, 0, 0), 'Chef': (1.8, 0, 0)}):
            R.look(cam, (0.5, -4.6, 1.0), (0.38, 0, 0.72), 40)
            _render(['Customer_A', 'Customer_B', 'Customer_C', 'Customer_D', 'Chef'], P('characters_lineup'),
                    (900, 500))
        for n in ('Chef', 'Customer_A', 'Customer_B', 'Customer_C', 'Customer_D', 'Customer_O', 'Customer_I', 'Customer_G', 'Customer_F',
                  'Customer_L', 'Customer_M', 'Customer_P', 'Customer_H', 'Customer_R', 'Customer_K', 'Customer_J', 'Customer_N',
                  'Customer_S'):
            R.auto_cam(cam, [n], yaw=-25, pitch=8, fill=0.95, lens=50)
            _render([n], P(n.lower()), (500, 600))
    if want('chef_styles'):
        styles = ('F1', 'F2', 'F3', 'M1', 'M2', 'M3')
        for st in styles:
            hide = tuple(f'Chef_Hair_{o}' for o in styles if o != st)
            with Pose(hide=hide):
                R.look(cam, (-0.55, -1.35, 1.45), (0.0, 0.0, 1.3), 50)
                _render(['Chef'], P(f'chef_hair_{st}'), (360, 360), hide=hide)
    if want('apples'):
        lay = {'Apple': (-0.3, 0, 0), 'Apple_Peeled': (-0.1, 0, 0), 'Apple_Wedges': (0.15, -0.02, 0),
               'Rabbit_Wedges': (0.45, 0.0, 0), 'Apple_Dice': (-0.3, -0.28, 0), 'Apple_Slices': (0.0, -0.3, 0),
               'Apple_Chunks': (0.3, -0.3, 0)}
        with Pose(loc=lay):
            R.look(cam, (0.05, -1.25, 0.75), (0.07, -0.12, 0.03), 40)
            _render(list(lay), P('apples_and_cuts'))
    if want('tools'):
        lay = {'CuttingBoard': (0, 0, 0), 'Knife': (-0.12, -0.05, 0.05), 'Spoon': (0.36, 0.0, 0.01),
               'Stick': (0.3, -0.12, 0), 'CoolingTray': (-0.45, 0.05, 0), 'Sparkle': (0.42, -0.2, 0.12),
               'Steam': (0.5, 0.15, 0.02)}
        with Pose(loc=lay):
            R.auto_cam(cam, list(lay), yaw=-10, pitch=40, fill=0.95, lens=45)
            _render(list(lay), P('tools'))
    jobs = [('Juicer', 'juicer', ()), ('Pot', 'pot_dice', ('Pot_Jam',)), ('Pot', 'pot_jam', ('Pot_Dice',)),
            ('Pan', 'pan_slices', ('Pan_Filling',)), ('Pan', 'pan_filling', ('Pan_Slices',)),
            ('PieTin', 'pietin_raw', ('PieTin_TopBaked',)), ('PieTin', 'pietin_open', ('PieTin_TopBaked', 'PieTin_Top')),
            ('PieTin', 'pietin_baked', ('PieTin_Top',)), ('Oven', 'oven', ()), ('SyrupPan', 'syruppan', ()),
            ('Crate_Delivery', 'crate_delivery', ()),
            ('Dish_Juice', 'dish_juice', ()), ('Dish_Pie', 'dish_pie', ()), ('Dish_Rabbit', 'dish_rabbit', ()),
            ('Dish_Jam', 'dish_jam', ()), ('Dish_CandyApple', 'dish_candyapple', ()),
            ('Dish_Toast', 'dish_toast', ()), ('Dish_Parfait', 'dish_parfait', ('Parfait_Crunch',)),
            ('Dish_BakedApple', 'dish_bakedapple', ('BakedApple_Stem', 'BakedApple_Hole', 'BakedApple_Fill')),
            ('Dish_Compote', 'dish_compote', ('Compote_Raw', 'Compote_Sugar', 'Compote_Lid')),
            ('Microwave', 'microwave', ()), ('Corer', 'corer', ())]
    jobs += [(r, 'new_' + rid, NEW_DISH_HIDE.get(r, ())) for r, rid in NEW_DISHES]
    for keep in (('FP_Raw',), ('FP_Bubbly',), ('FP_Cooked',), ('FP_Veg',), ('FP_Veg', 'FP_Mince'), ('FP_Stew', 'FP_Roux'), ('FP_Curry',),
                 ('FP_Rolls',), ('FP_RollsCooked',), ('FP_Three',), ('FP_ThreeCooked',)):
        jobs.append(('FryPan', 'new_frypan_' + keep[-1][3:].lower(), _all_but(FP_ALL, keep)))
    for k in MB_ALL:
        jobs.append(('MixBowl', 'new_mixbowl_' + k[8:].lower(), _all_but(MB_ALL, (k,))))
    jobs += [('RiceCooker', 'new_ricecooker_open', ('RC_Lid', 'RC_Batter', 'RC_Steam')),
             ('RiceCooker', 'new_ricecooker_closed', ('RC_LidOpen', 'RC_Apples', 'RC_Batter')),
             ('PorkPrep', 'new_porkprep_fill', ('Pork_Rolled',)), ('PorkPrep', 'new_porkprep_rolled', ('Pork_Strips', 'Pork_Fill')),
             ('Dish_WholePie', 'new_wholepie_raw', ('WholePie_Baked', 'WholePie_Stem', 'WholePie_Hole', 'WholePie_Body')),
             ('Dish_PinkTart', 'new_pinktart_mould', ('PinkTart_Done',)), ('Dish_Jelly', 'new_jelly_cup', ('Jelly_Set',)),
             ('Dish_Shumai', 'new_shumai_raw', ('Shumai_Cooked', 'Shumai_Lid')), ('Dish_Daifuku', 'new_daifuku_fill', ('Daifuku_Ball', 'Daifuku_Half'))]
    for root, nm, hide in jobs:
        if not want(nm) and not want('props') and not (nm.startswith('new_') and want('new')):
            continue
        with Pose(hide=hide):
            R.auto_cam(cam, [root], yaw=-28, pitch=24, fill=0.82, lens=50)
            _render([root], P(nm), (600, 600), hide=hide)
    if want('juice_multiview'):
        for nm, yaw, pitch in (('front', 0, 6), ('side', 90, 6), ('top', 0, 85)):
            R.auto_cam(cam, ['Dish_Juice'], yaw=yaw, pitch=pitch, fill=0.82, lens=60)
            _render(['Dish_Juice'], P('dish_juice_' + nm), (400, 400))

    if not icons:
        return
    # ------------------------------------------------------------ icons (transparent 256)
    if want('icons') or want('apple_icons'):
        apple_icons(cam, icons_dir)
    if want('icons') or want('dish_icons'):
        dish_hide = {'Dish_Parfait': ('Parfait_Crunch',), 'Dish_BakedApple': ('BakedApple_Stem', 'BakedApple_Hole', 'BakedApple_Fill'),
                     'Dish_Compote': ('Compote_Raw', 'Compote_Sugar', 'Compote_Lid')}
        for root, rid in (('Dish_Juice', 'fresh_juice'), ('Dish_Rabbit', 'rabbit_apples'), ('Dish_Jam', 'apple_jam'),
                          ('Dish_Pie', 'hirosaki_pie'), ('Dish_CandyApple', 'ringo_ame'),
                          ('Dish_Toast', 'jam_toast'), ('Dish_Parfait', 'yogurt_parfait'),
                          ('Dish_BakedApple', 'baked_apple'), ('Dish_Compote', 'apple_compote')) + NEW_DISHES:
            hide = dish_hide.get(root, NEW_DISH_HIDE.get(root, ()))
            with Pose(hide=hide):
                R.auto_cam(cam, [root], yaw=-28, pitch=26, fill=0.92, lens=50)
                _render([root], os.path.join(icons_dir, f'dish_{rid}.png'), (256, 256), True, 48, hide=hide)
    if want('icons') or want('portraits'):
        ports = {'Chef': (1.37, 0.0), 'Customer_A': (0.87, 0.0), 'Customer_B': (0.86, 0.0),
                 'Customer_C': (1.08, -0.06), 'Customer_D': (0.84, 0.0), 'Customer_O': (1.12, -0.05),
                 'Customer_I': (1.1, -0.05), 'Customer_G': (1.1, -0.05), 'Customer_F': (1.1, -0.05), 'Customer_L': (1.1, -0.05),
                 'Customer_M': (1.1, -0.05), 'Customer_P': (1.1, -0.05), 'Customer_H': (1.16, -0.05), 'Customer_R': (1.1, -0.05),
                 'Customer_K': (1.1, -0.05), 'Customer_J': (1.1, -0.05), 'Customer_N': (1.1, -0.05), 'Customer_S': (1.1, -0.05)}
        for n, (hz, hy) in ports.items():
            fn = 'chef_portrait.png' if n == 'Chef' else f'customer_{n[-1]}_portrait.png'
            s = 1.0 if n == 'Chef' else 0.9
            R.look(cam, (-0.42 * s, hy - 1.45 * s, hz + 0.02), (0.0, hy, hz - 0.08 * s), 50)
            _render([n], os.path.join(icons_dir, fn), (256, 256), True, 48)
