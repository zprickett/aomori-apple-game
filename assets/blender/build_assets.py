"""Aomori Apple Kitchen - procedural asset build.

Usage:  python3 build_assets.py [--no-render] [--no-icons] [--only-render=name,name]
Builds every asset, exports /assets/aomori.glb, verifies it, renders previews + UI icons.
Blender is Z-up and assets face -Y; glTF export (+Y up) makes them face +Z.
"""
import os
import sys
import json
import math
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ASSETS = os.path.dirname(HERE)
PROJECT = os.path.dirname(ASSETS)
GLB = os.path.join(ASSETS, 'aomori.glb')
PREV = os.path.join(ASSETS, 'previews')
ICONS = os.path.join(ASSETS, 'icons-png')

import bpy  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)

import lib  # noqa: E402
import stall  # noqa: E402
import chars  # noqa: E402
import props  # noqa: E402
import dishes  # noqa: E402
import expansion  # noqa: E402
import expansion2  # noqa: E402

ROOTS = ['Stall', 'Upgrade_Sign', 'Upgrade_Crate2', 'Upgrade_Banner', 'Chef',
         'Customer_A', 'Customer_B', 'Customer_C', 'Customer_D', 'Customer_O',
         'Apple', 'Apple_Peeled', 'Apple_Wedges', 'Rabbit_Wedges', 'Apple_Dice', 'Apple_Slices', 'Apple_Chunks',
         'CuttingBoard', 'Knife', 'Juicer', 'Pot', 'Pan', 'Spoon', 'PieTin', 'Oven', 'SyrupPan', 'CoolingTray',
         'Stick', 'Dish_Juice', 'Dish_Pie', 'Dish_Rabbit', 'Dish_Jam', 'Dish_CandyApple', 'Crate_Delivery',
         'Sparkle', 'Steam'] + expansion.ROOTS + expansion2.ROOTS


def build_all():
    stall.build_stall()
    stall.build_upgrades()
    chars.build_chef()
    chars.build_customer_A()
    chars.build_customer_B()
    chars.build_customer_C()
    chars.build_customer_D()
    chars.build_customer_O()
    props.build_apple()
    props.build_cut_pieces()
    props.build_tools()
    props.build_appliances()
    dishes.build_dishes()
    expansion.build_expansion()
    expansion2.build_expansion2()
    props.build_misc()
    bpy.context.view_layer.update()
    names = {o.name for o in bpy.data.objects if o.parent is None}
    missing = [r for r in ROOTS if r not in names]
    extra = sorted(names - set(ROOTS))
    assert not missing, f'missing roots {missing}'
    assert not extra, f'unexpected roots {extra}'
    print('built; triangles =', lib.stats())


def export():
    for o in bpy.context.scene.objects:
        o.select_set(o.type in ('MESH', 'EMPTY'))
    kw = dict(filepath=GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_extras=False, export_animations=False, export_cameras=False, export_lights=False,
              export_texcoords=True, export_normals=True, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_lights')
        bpy.ops.export_scene.gltf(**kw)
    print('exported', GLB, os.path.getsize(GLB) // 1024, 'KB')


def verify():
    """Parse the GLB directly: root names, front direction, material names, triangle count."""
    with open(GLB, 'rb') as f:
        data = f.read()
    ln = struct.unpack('<I', data[12:16])[0]
    js = json.loads(data[20:20 + ln])
    nodes = js['nodes']
    roots = [nodes[i]['name'] for i in js['scenes'][0]['nodes']]
    assert sorted(roots) == sorted(ROOTS), (sorted(set(ROOTS) - set(roots)), sorted(set(roots) - set(ROOTS)))
    byname = {n['name']: n for n in nodes}
    # front check: eyes sit in front (+Z) of the head pivot in glTF space
    for ch in ('Chef', 'Customer_A', 'Customer_B', 'Customer_C', 'Customer_D', 'Customer_O'):
        t = byname[f'{ch}_Eyes'].get('translation', [0, 0, 0])
        assert t[2] > 0.05, (ch, t)
    t = byname['Juice_Emblem'].get('translation', [0, 0, 0])
    assert t[2] > 0.03, t
    tris = 0
    for m in js['meshes']:
        for p in m['primitives']:
            tris += js['accessors'][p['indices']]['count'] // 3
    mats = sorted(m['name'] for m in js['materials'])
    glass = [m for m in js['materials'] if m['name'] == 'M_Glass'][0]
    print('verify OK: roots', len(roots), '| tris', tris, '| materials', len(mats), '| glass alphaMode',
          glass.get('alphaMode'), glass['pbrMetallicRoughness'].get('baseColorFactor'))
    return js


if __name__ == '__main__':
    args = sys.argv[1:]
    build_all()
    export()
    verify()
    if '--no-render' not in args:
        import previews
        only = None
        for a in args:
            if a.startswith('--only-render='):
                only = a.split('=', 1)[1].split(',')
        previews.render_all(PREV, ICONS, only=only, icons='--no-icons' not in args)
    import manifest
    manifest.write(GLB, os.path.join(ASSETS, 'ASSETS.md'), ROOTS)
