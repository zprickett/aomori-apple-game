"""Preview / icon rendering helpers (Cycles CPU, soft daylight, cream background)."""
import math
import bpy
from mathutils import Vector
from lib import hex2lin

BG = '#F4ECDD'


def setup_scene(samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.max_bounces = 4
    sc.cycles.transparent_max_bounces = 16
    try:
        sc.cycles.use_denoising = True
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        sc.cycles.use_denoising = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    # world: cream background for camera rays, softer warm ambient for lighting
    w = bpy.data.worlds.new('W')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    mix = nt.nodes.new('ShaderNodeMixShader')
    lp = nt.nodes.new('ShaderNodeLightPath')
    bg_cam = nt.nodes.new('ShaderNodeBackground')
    bg_cam.inputs[0].default_value = hex2lin(BG) + [1]
    bg_cam.inputs[1].default_value = 1.0
    bg_amb = nt.nodes.new('ShaderNodeBackground')
    bg_amb.inputs[0].default_value = hex2lin('#E8EEF5') + [1]
    bg_amb.inputs[1].default_value = 0.85
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(bg_amb.outputs[0], mix.inputs[1])
    nt.links.new(bg_cam.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    # key sun (front-left-top, warm) + weak fill sun
    def sun(name, rot, strength, color, angle):
        l = bpy.data.lights.new(name, 'SUN')
        l.energy = strength
        l.color = color
        l.angle = math.radians(angle)
        o = bpy.data.objects.new(name, l)
        o.rotation_euler = [math.radians(a) for a in rot]
        sc.collection.objects.link(o)
        return o
    sun('Key', (50, 0, -35), 2.6, (1.0, 0.95, 0.86), 12)
    sun('Fill', (70, 0, 140), 0.5, (0.85, 0.9, 1.0), 30)
    cam = bpy.data.cameras.new('Cam')
    co = bpy.data.objects.new('Cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    return co


def look(cam, loc, target, lens=50, ortho=None):
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = lens
    cam.data.clip_start = 0.01
    cam.data.clip_end = 200


def _set_hidden(ob, hide):
    ob.hide_render = hide
    for c in ob.children:
        _set_hidden(c, hide)


def render(roots, path, res=(600, 600), transparent=False, samples=None, keep_hidden=()):
    sc = bpy.context.scene
    all_roots = [o for o in sc.objects if o.parent is None and o.type in ('MESH', 'EMPTY')]
    for r in all_roots:
        _set_hidden(r, r.name not in roots)
    for n in keep_hidden:
        o = bpy.data.objects.get(n)
        if o:
            _set_hidden(o, True)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    if samples:
        sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for r in all_roots:
        _set_hidden(r, False)


def frame_bbox(names):
    """World-space bbox of the given roots (recursively)."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    def walk(o):
        nonlocal lo, hi
        if o.type == 'MESH' and not o.hide_render:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
        for c in o.children:
            walk(c)
    for n in names:
        walk(bpy.data.objects[n])
    return lo, hi


def auto_cam(cam, names, yaw=-30, pitch=22, fill=0.8, lens=50, aspect=1.0):
    """Frame roots from a 3/4 front view (front = -Y)."""
    bpy.context.view_layer.update()
    lo, hi = frame_bbox(names)
    c = (lo + hi) / 2
    radius = (hi - lo).length / 2
    fov = 2 * math.atan(18 / lens)  # 36mm sensor
    dist = radius / math.sin(fov / 2) / fill
    y, p = math.radians(yaw), math.radians(pitch)
    d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    look(cam, c + d * dist, c, lens)
