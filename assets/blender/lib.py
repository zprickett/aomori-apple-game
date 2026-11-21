"""Helper library for procedural low-poly asset building (Aomori Apple Kitchen).

Blender is Z-up; assets are built facing -Y so that after glTF export (+Y up)
fronts face +Z.  Character's own LEFT is +X.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

PI = math.pi


# ---------------------------------------------------------------- materials
def hex2lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


PALETTE = {
    'M_AppleRed': '#D94232', 'M_Cream': '#FFF3D9', 'M_Wood': '#A96F43',
    'M_WoodDark': '#68452E', 'M_WoodLight': '#C8915C', 'M_Leaf': '#6A8C42',
    'M_LeafDark': '#4E7034', 'M_JuiceGold': '#F4C954', 'M_Glass': '#FFFFFF',
    'M_Skin': '#F6CFA8', 'M_Blush': '#F29A8A', 'M_Hair': '#5A3424',
    'M_White': '#FBF7EE', 'M_Black': '#2B211C', 'M_EyeWhite': '#FFFFFF',
    'M_Metal': '#B9BEC4', 'M_MetalDark': '#6F767D', 'M_Flesh': '#FFF1C9',
    'M_AppleSkin': '#D94232', 'M_Jam': '#C8463A', 'M_Candy': '#D3202B',
    'M_Pastry': '#EDC27A', 'M_PastryBaked': '#D9953F', 'M_Filling': '#E7B04A',
    'M_Chalk': '#2F3A35', 'M_ChalkLine': '#F2EEE2', 'M_Lantern': '#FFE9B8',
    'M_Stone': '#D8CFC0', 'M_Ground': '#E9DFCC', 'M_Plate': '#FFFFFF',
    'M_Straw': '#FFFFFF', 'M_Paper': '#F7F1E3', 'M_Fabric': '#E9E2D0',
    # extra (character / scene) colours
    'M_AppleYellow': '#F2C64E', 'M_HairBlack': '#2E2A2B', 'M_HairGrey': '#C9C6C0', 'M_Mouth': '#9E3B33',
    'M_OvenWindow': '#5A3A2A', 'M_Grass': '#B9C98A',
    'M_Cloth_Green': '#4F9A5A', 'M_Cloth_Mustard': '#E8B64A', 'M_Cloth_Blue': '#4A78B8',
    'M_Cloth_Yellow': '#F6CD3E', 'M_Cloth_Brown': '#8A5A3B', 'M_Cloth_Tweed': '#8E8574',
    'M_Cloth_Shirt': '#F2E6CC', 'M_Cloth_Navy': '#34466B', 'M_Cloth_LightBlue': '#8CC6E8',
    'M_Cloth_Charcoal': '#4A4440', 'M_Cloth_Red': '#C9463A', 'M_Cloth_Pink': '#F2A7B5',
    'M_Cloth_Khaki': '#B9A57E', 'M_Cloth_White': '#F4F1EA',
    # expansion recipes
    'M_Toast': '#EDC57F', 'M_Crust': '#B5703A', 'M_Butter': '#FFE08A', 'M_Yogurt': '#FBF8F1',
    'M_Granola': '#C98F4E', 'M_Caramel': '#C77A2C', 'M_Sugar': '#FFFFFF', 'M_Compote': '#F2C25E',
    'M_CompoteSyrup': '#E8A23A', 'M_Mint': '#5FA65A', 'M_Ceramic': '#F6EFE2', 'M_CoreHole': '#7A4A2A', 'M_Whip': '#FFFDF6',
    # rank upgrades
    'M_Gold': '#E8B230', 'M_Brick': '#B8664A',
    # Golden Request visitors
    'M_HairBlonde': '#E9C46E', 'M_Cloth_Captain': '#22385F',
    # player chef (recoloured at runtime)
    'M_ChefIris': '#6B3E26', 'M_ChefButton': '#D94232', 'M_ChefSkirt': '#D94232', 'M_ChefHat': '#D94232',
}

ROUGH = {'M_Caramel': 0.25, 'M_Compote': 0.25, 'M_CompoteSyrup': 0.2, 'M_Yogurt': 0.6, 'M_Candy': 0.15, 'M_Filling': 0.35, 'M_Jam': 0.3, 'M_Glass': 0.1,
         'M_Metal': 0.45, 'M_MetalDark': 0.5, 'M_JuiceGold': 0.45, 'M_OvenWindow': 0.2, 'M_Gold': 0.3,
         'M_EyeWhite': 0.5, 'M_Black': 0.6}

_mats = {}


def mat(name):
    if name in _mats and _mats[name].name == name:
        return _mats[name]
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        col = hex2lin(PALETTE[name]) + [1.0]
        bsdf.inputs['Base Color'].default_value = col
        bsdf.inputs['Roughness'].default_value = ROUGH.get(name, 0.8)
        bsdf.inputs['Metallic'].default_value = 0.0
        m.diffuse_color = col
        if name == 'M_Glass':
            bsdf.inputs['Alpha'].default_value = 0.28
            bsdf.inputs['Specular IOR Level'].default_value = 0.15
            for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
                try:
                    setattr(m, attr, val)
                except Exception:
                    pass
            m.diffuse_color = (1, 1, 1, 0.28)
        if name == 'M_Lantern':
            bsdf.inputs['Emission Color'].default_value = col
            bsdf.inputs['Emission Strength'].default_value = 0.6
        if name == 'M_OvenWindow':
            bsdf.inputs['Emission Color'].default_value = hex2lin('#8A4A20') + [1]
            bsdf.inputs['Emission Strength'].default_value = 0.15
    _mats[name] = m
    return m


# ---------------------------------------------------------------- transforms
def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if not hasattr(scale, '__len__'):
        scale = (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler([math.radians(a) for a in rot]), Vector(scale))


def align_z(normal, loc=(0, 0, 0), spin=0.0):
    """Matrix mapping local +Z onto `normal` (local +Y kept as close to world +Z)."""
    n = Vector(normal).normalized()
    if abs(n.z) > 0.999:
        q = n.to_track_quat('Z', 'X')
    else:
        q = n.to_track_quat('Z', 'Y')
    return Matrix.Translation(Vector(loc)) @ q.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(spin), 4, 'Z')


# ---------------------------------------------------------------- mesh builder
class MB:
    """Accumulates low-poly parts (each with a material) into one mesh object."""

    def __init__(self):
        self.V, self.F, self.M, self.UV = [], [], [], []

    # -- core
    def add_bm(self, bm, m, M=None, uv=False):
        M = M or Matrix()
        off = len(self.V)
        bm.verts.index_update()
        for v in bm.verts:
            self.V.append(M @ v.co)
        uvl = bm.loops.layers.uv.active if uv else None
        for f in bm.faces:
            self.F.append([off + v.index for v in f.verts])
            self.M.append(m)
            self.UV.append([tuple(l[uvl].uv) for l in f.loops] if uvl else None)
        bm.free()
        return self

    def add_raw(self, verts, faces, m, M=None, uvs=None):
        M = M or Matrix()
        off = len(self.V)
        for v in verts:
            self.V.append(M @ Vector(v))
        for i, f in enumerate(faces):
            self.F.append([off + j for j in f])
            self.M.append(m)
            self.UV.append(uvs[i] if uvs else None)
        return self

    def merge(self, other, M=None):
        M = M or Matrix()
        off = len(self.V)
        self.V += [M @ v for v in other.V]
        self.F += [[off + j for j in f] for f in other.F]
        self.M += other.M
        self.UV += other.UV
        return self

    # -- primitives
    def box(self, size, loc=(0, 0, 0), m='M_Wood', rot=(0, 0, 0), bevel=0.0, M=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=1,
                            affect='EDGES', profile=0.5, clamp_overlap=True)
        return self.add_bm(bm, m, (M or Matrix()) @ T(loc, rot))

    def cyl(self, r1, r2, depth, seg=8, loc=(0, 0, 0), m='M_Wood', rot=(0, 0, 0), scale=(1, 1, 1),
            M=None, bevel=0.0, base=False):
        """Cone/cylinder along local Z. base=True => bottom at loc instead of centred."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1,
                              radius2=r2, depth=depth)
        if base:
            for v in bm.verts:
                v.co.z += depth / 2
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=1,
                            affect='EDGES', profile=0.5, clamp_overlap=True)
        return self.add_bm(bm, m, (M or Matrix()) @ T(loc, rot, scale))

    def sphere(self, r, loc=(0, 0, 0), m='M_Wood', seg=12, rings=8, rot=(0, 0, 0), M=None):
        if not hasattr(r, '__len__'):
            r = (r, r, r)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
        return self.add_bm(bm, m, (M or Matrix()) @ T(loc, rot, r))

    def ico(self, r, loc=(0, 0, 0), m='M_Leaf', sub=1, rot=(0, 0, 0), M=None):
        if not hasattr(r, '__len__'):
            r = (r, r, r)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        return self.add_bm(bm, m, (M or Matrix()) @ T(loc, rot, r))

    def lathe(self, prof, seg=12, loc=(0, 0, 0), m='M_Wood', rot=(0, 0, 0), scale=(1, 1, 1),
              M=None, uv=False, mats=None, cap=True, phase=0.0):
        """prof: list of (r, z) from bottom to top. r==0 -> pole vertex.
        mats: optional per-band material list (len(prof)-1)."""
        verts, faces, uvs, fm = [], [], [], []
        rings = []
        for (r, z) in prof:
            if r <= 1e-6:
                rings.append([len(verts)])
                verts.append((0, 0, z))
            else:
                ring = []
                for i in range(seg):
                    a = 2 * PI * i / seg + phase
                    ring.append(len(verts))
                    verts.append((r * math.sin(a), -r * math.cos(a), z))
                rings.append(ring)
        n = len(prof)
        for k in range(n - 1):
            A, B = rings[k], rings[k + 1]
            v0, v1 = 1 - k / (n - 1), 1 - (k + 1) / (n - 1)
            for i in range(seg):
                j = (i + 1) % seg
                u0, u1 = i / seg, (i + 1) / seg
                if len(A) == 1 and len(B) == 1:
                    continue
                if len(A) == 1:
                    f = [A[0], B[j], B[i]]
                    fu = [((u0 + u1) / 2, v0), (u1, v1), (u0, v1)]
                elif len(B) == 1:
                    f = [A[i], A[j], B[0]]
                    fu = [(u0, v0), (u1, v0), ((u0 + u1) / 2, v1)]
                else:
                    f = [A[i], A[j], B[j], B[i]]
                    fu = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
                faces.append(f)
                uvs.append(fu)
                fm.append(mats[k] if mats else m)
        if cap:
            if len(rings[0]) > 1:
                faces.append(list(reversed(rings[0])))
                uvs.append([(0.5, 1.0)] * seg)
                fm.append(mats[0] if mats else m)
            if len(rings[-1]) > 1:
                faces.append(list(rings[-1]))
                uvs.append([(0.5, 0.0)] * seg)
                fm.append(mats[-1] if mats else m)
        MM = (M or Matrix()) @ T(loc, rot, scale)
        off = len(self.V)
        for v in verts:
            self.V.append(MM @ Vector(v))
        for f, u, mm in zip(faces, uvs, fm):
            self.F.append([off + j for j in f])
            self.M.append(mm)
            self.UV.append(u if uv else None)
        return self

    def prism(self, poly, depth, M=None, m='M_Cream', bevel=False):
        """Extrude a 2D polygon (XY, any winding) from z=0 to z=depth, transformed by M."""
        p = list(poly)
        area = sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))
        if area < 0:
            p = p[::-1]
        n = len(p)
        verts = [(x, y, 0) for x, y in p] + [(x, y, depth) for x, y in p]
        faces = [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append([i, j, n + j, n + i])
        return self.add_raw(verts, faces, m, M)

    def ring2d(self, poly, width, depth, M=None, m='M_ChalkLine', closed=True):
        """Outline strip of a 2D polyline, extruded by depth."""
        p = list(poly)
        if closed:
            area = sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))
            if area < 0:
                p = p[::-1]
        n = len(p)
        outer, inner = [], []
        for i in range(n):
            a = Vector(p[i - 1] if (closed or i > 0) else p[i])
            b = Vector(p[i])
            c = Vector(p[(i + 1) % n] if (closed or i < n - 1) else p[i])
            t = (c - a)
            if t.length < 1e-9:
                t = Vector((1, 0))
            t.normalize()
            nrm = Vector((t.y, -t.x))  # right of travel (outward for CCW)
            outer.append(b + nrm * width / 2)
            inner.append(b - nrm * width / 2)
        segs = n if closed else n - 1
        for i in range(segs):
            j = (i + 1) % n
            quad = [tuple(outer[i]), tuple(outer[j]), tuple(inner[j]), tuple(inner[i])]
            self.prism(quad, depth, M, m)
        return self

    def tube(self, pts, r, seg=6, m='M_Wood', mats=None, cap=True, M=None):
        """Tube along a polyline of 3D points. mats: per-segment materials."""
        pts = [Vector(p) for p in pts]
        verts, faces, fm = [], [], []
        n = len(pts)
        prev_side = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            if prev_side is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                side = t.cross(ref).normalized()
            else:
                side = (prev_side - t * prev_side.dot(t)).normalized()
            prev_side = side
            up = t.cross(side)
            rr = r[i] if hasattr(r, '__len__') else r
            for k in range(seg):
                a = 2 * PI * k / seg
                verts.append(p + (side * math.cos(a) + up * math.sin(a)) * rr)
        for i in range(n - 1):
            for k in range(seg):
                kk = (k + 1) % seg
                faces.append([i * seg + k, i * seg + kk, (i + 1) * seg + kk, (i + 1) * seg + k])
                fm.append(mats[i] if mats else m)
        if cap:
            faces.append(list(range(seg - 1, -1, -1)))
            fm.append(mats[0] if mats else m)
            faces.append([(n - 1) * seg + k for k in range(seg)])
            fm.append(mats[-1] if mats else m)
        MM = M or Matrix()
        off = len(self.V)
        for v in verts:
            self.V.append(MM @ v)
        for f, mm in zip(faces, fm):
            self.F.append([off + j for j in f])
            self.M.append(mm)
            self.UV.append(None)
        return self

    def torus(self, R, r, seg=12, segr=6, loc=(0, 0, 0), m='M_Black', rot=(0, 0, 0), scale=(1, 1, 1), M=None):
        verts, faces = [], []
        for i in range(seg):
            a = 2 * PI * i / seg
            c, s = math.cos(a), math.sin(a)
            for k in range(segr):
                b = 2 * PI * k / segr
                rr = R + r * math.cos(b)
                verts.append((rr * c, rr * s, r * math.sin(b)))
        for i in range(seg):
            ii = (i + 1) % seg
            for k in range(segr):
                kk = (k + 1) % segr
                faces.append([i * segr + k, ii * segr + k, ii * segr + kk, i * segr + kk])
        return self.add_raw(verts, faces, m, (M or Matrix()) @ T(loc, rot, scale))

    # -- output
    def build(self, name, pivot=(0, 0, 0), coll=None):
        pv = Vector(pivot)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v - pv) for v in self.V], [], self.F)
        names = []
        for mm in self.M:
            if mm not in names:
                names.append(mm)
        for nme in names:
            me.materials.append(mat(nme))
        idx = {n: i for i, n in enumerate(names)}
        for p, mm in zip(me.polygons, self.M):
            p.material_index = idx[mm]
            p.use_smooth = False
        if any(u is not None for u in self.UV):
            uvl = me.uv_layers.new(name='UVMap')
            li = 0
            for p, u in zip(me.polygons, self.UV):
                for k in range(p.loop_total):
                    uvl.data[p.loop_start + k].uv = u[k] if u else (0.0, 0.0)
        me.validate(clean_customdata=False)
        me.update()
        ob = bpy.data.objects.new(name, me)
        ob.location = pv
        (coll or bpy.context.scene.collection).objects.link(ob)
        return ob


def empty(name, loc=(0, 0, 0), coll=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.2
    ob.location = Vector(loc)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def parent(child, par):
    """Parent keeping world transform; bakes the parent-inverse into the local transform."""
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = par
    child.matrix_parent_inverse = Matrix()
    child.matrix_world = mw
    return child


def set_origin(ob, pivot_world):
    """Move object origin to pivot (world) without moving geometry (no rotation assumed)."""
    pv = Vector(pivot_world)
    d = pv - ob.matrix_world.translation
    for v in ob.data.vertices:
        v.co -= d
    ob.location = ob.location + d


# ---------------------------------------------------------------- 2D shapes
def apple_outline(w=1.0, n=30):
    """Apple silhouette (no leaf), width w, centred at origin, Y up. Returns CCW list."""
    pts = []
    for i in range(n):
        t = 2 * PI * i / n
        x, y = math.sin(t), math.cos(t)
        x *= 1.0 + 0.06 * y
        y *= 0.90
        if y > 0:
            y -= 0.26 * math.exp(-(x / 0.24) ** 2)
        else:
            y += 0.10 * math.exp(-(x / 0.20) ** 2)
        pts.append((x * 0.5 * w, y * 0.5 * w))
    return pts[::-1]


def leaf_poly(length=1.0, width=0.45, n=6):
    """Pointed leaf along +X starting at origin."""
    top, bot = [], []
    for i in range(n + 1):
        t = i / n
        x = t * length
        y = math.sin(PI * t) ** 0.8 * width / 2
        top.append((x, y))
        bot.append((x, -y * 0.8))
    return top + bot[-2:0:-1]


def rot2d(pts, ang, off=(0, 0), s=1.0):
    c, sn = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return [(off[0] + s * (x * c - y * sn), off[1] + s * (x * sn + y * c)) for x, y in pts]


def emblem(mb, M, w, depth, body='M_Cream', leaf=None, stem=None):
    """Thin extruded apple emblem in local XY facing +Z (placed by M)."""
    mb.prism(apple_outline(w), depth, M, body)
    lf = rot2d(leaf_poly(0.42 * w, 0.24 * w), 30, (0.05 * w, 0.40 * w))
    mb.prism(lf, depth, M, leaf or body)
    st = [(-0.025 * w, 0.28 * w), (0.02 * w, 0.28 * w), (0.035 * w, 0.52 * w), (-0.01 * w, 0.52 * w)]
    mb.prism(st, depth, M, stem or leaf or body)
    return mb


def chalk_apple(mb, M, w, lw, depth, m='M_ChalkLine'):
    mb.ring2d(apple_outline(w, 26), lw, depth, M, m)
    lf = rot2d(leaf_poly(0.38 * w, 0.22 * w, 5), 30, (0.06 * w, 0.42 * w))
    mb.ring2d(lf, lw * 0.9, depth, M, m)
    mb.ring2d([(0.0, 0.28 * w), (0.02 * w, 0.40 * w), (0.035 * w, 0.52 * w)], lw * 0.9, depth, M, m, closed=False)
    return mb


# ---------------------------------------------------------------- apple shape
APPLE_PROFILE = [  # (r, z) for 0.16 dia apple, bottom dimple -> top dimple
    (0.0, 0.010), (0.022, 0.004), (0.045, 0.002), (0.064, 0.012), (0.077, 0.034),
    (0.080, 0.062), (0.078, 0.090), (0.070, 0.115), (0.054, 0.132), (0.030, 0.136),
    (0.012, 0.128), (0.0, 0.118)]


APPLE_PROFILE_LO = [(0.0, 0.010), (0.04, 0.002), (0.07, 0.022), (0.08, 0.062), (0.074, 0.105),
                    (0.05, 0.133), (0.018, 0.132), (0.0, 0.118)]


def apple_profile(scale=1.0, lo=False):
    return [(r * scale, z * scale) for r, z in (APPLE_PROFILE_LO if lo else APPLE_PROFILE)]


def stats():
    tris = 0
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    return tris
