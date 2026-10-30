"""Shared Blender authoring helpers for OUTRUN YOUR SOUL.

Executed inside the dedicated MCP-bridged Blender instance (see bootstrap.py and
scripts/blender-mcp.mjs). Conventions follow docs/ASSET_CONTRACT.md:

* 1 tile = 1 Blender metre; Z up; ground plane XY; models face -Y.
* Each asset is one root empty named after its asset ID; parts are mesh children
  named ``<asset_id>_<part>`` (object names are global in a .blend file).
* Materials are named after palette keys and take colours from src/content/palette.json.
* Generators only ever delete objects tagged ``oys_asset == <their asset id>``.

Geometry is built with bmesh so results are deterministic and independent of
viewport/operator context.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import math
import pathlib

import bmesh
import bpy
from mathutils import Matrix, Vector

SESSION_MARKER = 'oys_asset_session'
ASSET_TAG = 'oys_asset'
PREVIEW_TAG = 'oys_preview'


def repo_root() -> pathlib.Path:
    scene = bpy.context.scene
    if not scene.get(SESSION_MARKER):
        raise RuntimeError('not an OUTRUN YOUR SOUL authoring file; refusing to modify this scene')
    return pathlib.Path(scene['oys_root'])


ROOT = repo_root()
PALETTE: dict[str, str] = {
    k: v for k, v in json.loads((ROOT / 'src' / 'content' / 'palette.json').read_text(encoding='utf8')).items()
    if not k.startswith('_')
}


# ---------------------------------------------------------------------------
# Colour and materials
# ---------------------------------------------------------------------------

def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def palette_rgba(key: str) -> tuple[float, float, float, float]:
    h = PALETTE[key].lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# Surface response per palette key. Emission only for the soul (it is a light-bearing spirit).
MATERIAL_STYLE = {
    'gold': dict(metallic=0.55, roughness=0.38),
    'gold_dark': dict(metallic=0.45, roughness=0.5),
    'ivory': dict(roughness=0.62),
    'ivory_shadow': dict(roughness=0.7),
    'wall_cap': dict(roughness=0.7),
    'mask_black': dict(roughness=0.4),
    'vermilion': dict(roughness=0.55),
    'vermilion_dark': dict(roughness=0.6),
    'soul_core': dict(roughness=0.3, emission=0.6),
    'soul_glow': dict(roughness=0.3, emission=1.2),
}


def material(key: str) -> bpy.types.Material:
    if key not in PALETTE:
        raise KeyError(f'unknown palette key {key!r}')
    mat = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    style = MATERIAL_STYLE.get(key, {})
    rgba = palette_rgba(key)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = style.get('roughness', 0.75)
    bsdf.inputs['Metallic'].default_value = style.get('metallic', 0.0)
    emission = style.get('emission', 0.0)
    if 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = rgba if emission else (0, 0, 0, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    mat.diffuse_color = rgba
    return mat


# ---------------------------------------------------------------------------
# Asset bookkeeping
# ---------------------------------------------------------------------------

class Asset:
    def __init__(self, asset_id: str):
        self.id = asset_id
        for obj in list(bpy.data.objects):
            if obj.get(ASSET_TAG) == asset_id:
                bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in list(bpy.data.meshes):
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        if bpy.data.objects.get(asset_id) is not None:
            raise RuntimeError(f'an untagged object named {asset_id!r} exists; refusing to overwrite it')
        coll = bpy.data.collections.get(asset_id)
        if coll is None:
            coll = bpy.data.collections.new(asset_id)
            bpy.context.scene.collection.children.link(coll)
        self.collection = coll
        self.root = bpy.data.objects.new(asset_id, None)
        self.root.empty_display_type = 'PLAIN_AXES'
        self.root.empty_display_size = 0.25
        self.root[ASSET_TAG] = asset_id
        coll.objects.link(self.root)
        self.parts: dict[str, bpy.types.Object] = {}

    def part_name(self, part: str) -> str:
        return f'{self.id}_{part}'

    def empty(self, part: str, location=(0, 0, 0), parent: bpy.types.Object | None = None) -> bpy.types.Object:
        """Named socket/pivot without geometry (e.g. a bolt muzzle)."""
        name = self.part_name(part)
        if bpy.data.objects.get(name) is not None:
            raise RuntimeError(f'object {name!r} already exists')
        obj = bpy.data.objects.new(name, None)
        obj.empty_display_type = 'SPHERE'
        obj.empty_display_size = 0.05
        obj[ASSET_TAG] = self.id
        self.collection.objects.link(obj)
        obj.parent = parent or self.root
        obj.location = location
        self.parts[part] = obj
        return obj

    def mesh(self, part: str, builder: 'PartBuilder', location=(0, 0, 0),
             parent: bpy.types.Object | None = None, smooth: bool = False) -> bpy.types.Object:
        """Create a mesh part. Geometry in builder is relative to the part's pivot (location)."""
        name = self.part_name(part)
        if bpy.data.objects.get(name) is not None:
            raise RuntimeError(f'object {name!r} already exists')
        me = bpy.data.meshes.new(name)
        builder.bm.to_mesh(me)
        builder.bm.free()
        for key in builder.material_keys:
            me.materials.append(material(key))
        for poly in me.polygons:
            poly.use_smooth = smooth
        obj = bpy.data.objects.new(name, me)
        obj[ASSET_TAG] = self.id
        self.collection.objects.link(obj)
        obj.parent = parent or self.root
        obj.location = location
        self.parts[part] = obj
        return obj

    def objects(self) -> list[bpy.types.Object]:
        out = [self.root]
        stack = [self.root]
        while stack:
            for child in stack.pop().children:
                out.append(child)
                stack.append(child)
        return out


# ---------------------------------------------------------------------------
# Geometry building (bmesh)
# ---------------------------------------------------------------------------

class PartBuilder:
    """Accumulates primitive pieces, each with a palette material, into one bmesh."""

    def __init__(self):
        self.bm = bmesh.new()
        self.material_keys: list[str] = []

    def _slot(self, key: str) -> int:
        if key not in self.material_keys:
            self.material_keys.append(key)
        return self.material_keys.index(key)

    def add(self, piece: bmesh.types.BMesh, key: str, matrix: Matrix | None = None) -> 'PartBuilder':
        slot = self._slot(key)
        if matrix is not None:
            bmesh.ops.transform(piece, matrix=matrix, verts=piece.verts)
        for face in piece.faces:
            face.material_index = slot
        tmp = bpy.data.meshes.new('_oys_tmp')
        piece.to_mesh(tmp)
        piece.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        return self

    def box(self, size, center=(0, 0, 0), key='ivory', bevel: float = 0.0, rot=None) -> 'PartBuilder':
        return self.add(box(size, bevel=bevel), key, placement(center, rot))

    def cylinder(self, r_bottom, r_top, height, center=(0, 0, 0), key='ivory', segments=8, rot=None) -> 'PartBuilder':
        return self.add(cylinder(r_bottom, r_top, height, segments), key, placement(center, rot))

    def sphere(self, radius, center=(0, 0, 0), key='ivory', subdivisions=1, scale=(1, 1, 1), rot=None) -> 'PartBuilder':
        piece = ico(radius, subdivisions)
        bmesh.ops.scale(piece, vec=Vector(scale), verts=piece.verts)
        return self.add(piece, key, placement(center, rot))

    def lathe(self, profile, center=(0, 0, 0), key='ivory', segments=10, rot=None) -> 'PartBuilder':
        return self.add(lathe(profile, segments), key, placement(center, rot))

    def prism(self, outline, depth, center=(0, 0, 0), key='ivory', plane='XZ', rot=None) -> 'PartBuilder':
        return self.add(prism(outline, depth, plane), key, placement(center, rot))

    def tube(self, path, radii, key='ivory', segments=6, center=(0, 0, 0), rot=None) -> 'PartBuilder':
        return self.add(tube(path, radii, segments), key, placement(center, rot))

    def strip(self, path, widths, thickness, key='vermilion', center=(0, 0, 0), rot=None) -> 'PartBuilder':
        return self.add(strip(path, widths, thickness), key, placement(center, rot))


def placement(center, rot=None) -> Matrix:
    m = Matrix.Translation(Vector(center))
    if rot is not None:
        m = m @ Matrix.Rotation(math.radians(rot[2]), 4, 'Z') @ Matrix.Rotation(math.radians(rot[1]), 4, 'Y') @ Matrix.Rotation(math.radians(rot[0]), 4, 'X')
    return m


def box(size, bevel: float = 0.0) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5, affect='EDGES')
    return bm


def cylinder(r_bottom: float, r_top: float, height: float, segments: int = 8) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r_bottom, radius2=r_top, depth=height)
    return bm


def ico(radius: float, subdivisions: int = 1) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    return bm


def lathe(profile, segments: int = 10) -> bmesh.types.BMesh:
    """Revolve [(radius, z), ...] (bottom to top) around Z. Zero radius ends become poles."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segments),
                                         r * math.sin(2 * math.pi * i / segments), z))
                          for i in range(segments)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prism(outline, depth: float, plane: str = 'XZ') -> bmesh.types.BMesh:
    """Extrude a 2D outline [(u, v), ...] (counter-clockwise) symmetrically by depth.

    plane 'XZ': outline in X/Z, extruded along Y (front-facing masks, gate frames).
    plane 'XY': outline on the ground, extruded along Z (floor inlays, footprints).
    """
    bm = bmesh.new()
    half = depth / 2
    if plane == 'XZ':
        front = [bm.verts.new((u, -half, w)) for u, w in outline]
        back = [bm.verts.new((u, half, w)) for u, w in outline]
    elif plane == 'XY':
        front = [bm.verts.new((u, w, -half)) for u, w in outline]
        back = [bm.verts.new((u, w, half)) for u, w in outline]
    else:
        raise ValueError(plane)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def _path_frames(path, up=(0.0, 0.0, 1.0)):
    """Tangents and parallel-transported normals along a polyline (no sudden twists)."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    tangents = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        t = b - a
        tangents.append(t.normalized() if t.length > 1e-9 else Vector((0, 1, 0)))
    ref = Vector(up)
    if abs(tangents[0].dot(ref)) > 0.95:
        ref = Vector((1, 0, 0))
    normals = [(ref - tangents[0] * tangents[0].dot(ref)).normalized()]
    for t in tangents[1:]:
        prev = normals[-1]
        cand = prev - t * t.dot(prev)
        normals.append(cand.normalized() if cand.length > 1e-9 else prev)
    return pts, tangents, normals


def tube(path, radii, segments: int = 6) -> bmesh.types.BMesh:
    """Tapered tube along a polyline. radii per point; a zero radius end becomes a point."""
    if len(radii) != len(path):
        raise ValueError('tube needs one radius per path point')
    pts, tangents, normals = _path_frames(path)
    bm = bmesh.new()
    rings = []
    for p, t, nrm, r in zip(pts, tangents, normals, radii):
        if r <= 1e-6:
            rings.append([bm.verts.new(p)])
            continue
        b = t.cross(nrm)
        rings.append([bm.verts.new(p + (nrm * math.cos(2 * math.pi * k / segments)
                                        + b * math.sin(2 * math.pi * k / segments)) * r)
                      for k in range(segments)])
    for a, c in zip(rings, rings[1:]):
        for k in range(segments):
            j = (k + 1) % segments
            if len(a) == 1 and len(c) == 1:
                continue
            if len(a) == 1:
                bm.faces.new((a[0], c[j], c[k]))
            elif len(c) == 1:
                bm.faces.new((a[k], a[j], c[0]))
            else:
                bm.faces.new((a[k], a[j], c[j], c[k]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def strip(path, widths, thickness: float, up=(0.0, 0.0, 1.0)) -> bmesh.types.BMesh:
    """Tapered flat ribbon (closed box section) along a polyline; width stays horizontal-ish.

    Useful for scarves, banners and cloth tails. widths per point (0 allowed at the end).
    """
    if len(widths) != len(path):
        raise ValueError('strip needs one width per path point')
    pts = [Vector(p) for p in path]
    n = len(pts)
    upv = Vector(up)
    bm = bmesh.new()
    sections = []
    for i, (p, w) in enumerate(zip(pts, widths)):
        t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        t = t.normalized() if t.length > 1e-9 else Vector((0, 1, 0))
        side = t.cross(upv)
        if side.length < 1e-6:
            side = Vector((1, 0, 0))
        side.normalize()
        normal = side.cross(t).normalized()
        hw = max(w, 1e-4) / 2
        ht = thickness / 2
        sections.append([bm.verts.new(p + side * sx * hw + normal * nz * ht)
                         for sx, nz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, c in zip(sections, sections[1:]):
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((a[k], a[j], c[j], c[k]))
    bm.faces.new(list(reversed(sections[0])))
    bm.faces.new(sections[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def catmull_rom(points, subdivisions: int = 3, closed: bool = True):
    """Smooth a 2D control polygon [(u, v), ...] into a denser outline (passes through the points)."""
    pts = [Vector((p[0], p[1])) for p in points]
    n = len(pts)
    out = []
    last = n if closed else n - 1
    for i in range(last):
        p0 = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)]
        p3 = pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)]
        for s in range(subdivisions):
            t = s / subdivisions
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                       + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((q.x, q.y))
    if not closed:
        out.append((pts[-1].x, pts[-1].y))
    return out


def plate_with_holes(outline, holes, thickness: float, plane: str = 'XZ') -> bmesh.types.BMesh:
    """Solid plate from an outer 2D outline with inner hole outlines (eyes, windows, cut-outs).

    The face is filled with Blender's scanfill (nested loops become holes) and solidified
    toward +Y (plane 'XZ', front face at y = 0) or +Z (plane 'XY', bottom face at z = 0).
    """
    bm = bmesh.new()
    edges = []
    for loop in [outline, *holes]:
        if plane == 'XZ':
            verts = [bm.verts.new((u, 0.0, w)) for u, w in loop]
        elif plane == 'XY':
            verts = [bm.verts.new((u, w, 0.0)) for u, w in loop]
        else:
            raise ValueError(plane)
        for i in range(len(verts)):
            edges.append(bm.edges.new((verts[i], verts[(i + 1) % len(verts)])))
    normal = Vector((0, -1, 0)) if plane == 'XZ' else Vector((0, 0, -1))
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=normal)
    for face in bm.faces:
        if face.normal.dot(normal) < 0:
            face.normal_flip()
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thickness)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def deform(bm: bmesh.types.BMesh, fn) -> bmesh.types.BMesh:
    """Apply fn(Vector) -> Vector to every vertex (bends, tapers, shear) and return bm."""
    for vert in bm.verts:
        vert.co = Vector(fn(vert.co.copy()))
    bm.normal_update()
    return bm


# ---------------------------------------------------------------------------
# Measurement, export, preview, report
# ---------------------------------------------------------------------------

def stats(asset: Asset) -> dict:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tris = 0
    mats: set[str] = set()
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in asset.objects():
        if obj.type != 'MESH':
            continue
        ev = obj.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        tris += len(mesh.loop_triangles)
        for slot in obj.material_slots:
            if slot.material:
                mats.add(slot.material.name)
        for v in mesh.vertices:
            w = obj.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    return {
        'triangles': tris,
        'materials': sorted(mats),
        'material_count': len(mats),
        'bounds_min': [round(c, 4) for c in lo],
        'bounds_max': [round(c, 4) for c in hi],
        'dimensions': [round(h - l, 4) for l, h in zip(lo, hi)],
        'parts': sorted(o.name for o in asset.objects()),
    }


def _gltf_kwargs(**wanted):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    return {k: v for k, v in wanted.items() if k in props}


def export_glb(asset: Asset, rel_path: str | None = None) -> dict:
    rel = rel_path or f'public/assets/models/{asset.id}.glb'
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    keep = set(asset.objects())
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj in keep)
    bpy.context.view_layer.objects.active = asset.root
    bpy.ops.export_scene.gltf(**_gltf_kwargs(
        filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_cameras=False, export_lights=False, export_extras=False,
        export_animations=False, export_materials='EXPORT', export_texcoords=False,
        export_normals=True, export_vertex_color='NONE', export_attributes=False,
    ))
    for obj in keep:
        obj.select_set(False)
    data = path.read_bytes()
    return {'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def exporter_version() -> str:
    try:
        import io_scene_gltf2  # bundled exporter
        return '.'.join(str(p) for p in io_scene_gltf2.bl_info['version'])
    except Exception:  # noqa: BLE001 - informational only
        return 'unknown'


def render_preview(asset: Asset, rel_path: str | None = None, *, size=512, pitch_deg=58.0,
                   ortho_scale: float | None = None, yaw_deg: float = 0.0,
                   view_transform: str | None = None) -> str:
    """Render the asset through the agreed game camera (orthographic, looking north, tilted down).

    Temporary camera/lights are tagged and removed; the source scene keeps no preview state.
    """
    rel = rel_path or f'art/previews/{asset.id}-game-camera.png'
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    st = stats(asset)
    lo, hi = Vector(st['bounds_min']), Vector(st['bounds_max'])
    centre = (lo + hi) / 2
    extent = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 0.5)
    hidden = []
    for obj in scene.objects:
        if obj.get(ASSET_TAG) != asset.id and not obj.hide_render:
            obj.hide_render = True
            hidden.append(obj)
    temp = []
    try:
        cam_data = bpy.data.cameras.new('oys_preview_cam')
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho_scale or extent * 1.5
        cam = bpy.data.objects.new('oys_preview_cam', cam_data)
        cam[PREVIEW_TAG] = True
        scene.collection.objects.link(cam)
        temp.append(cam)
        pitch = math.radians(pitch_deg)
        yaw = math.radians(yaw_deg)
        direction = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))
        cam.location = centre - direction * 20
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        sun_data = bpy.data.lights.new('oys_preview_sun', 'SUN')
        sun_data.energy = 3.2
        sun_data.color = (1.0, 0.93, 0.82)
        sun = bpy.data.objects.new('oys_preview_sun', sun_data)
        sun[PREVIEW_TAG] = True
        sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-35))
        scene.collection.objects.link(sun)
        temp.append(sun)
        prev = dict(camera=scene.camera, engine=scene.render.engine, rx=scene.render.resolution_x,
                    ry=scene.render.resolution_y, pct=scene.render.resolution_percentage,
                    transparent=scene.render.film_transparent, path=scene.render.filepath,
                    view=scene.view_settings.view_transform)
        if view_transform:
            # 'Standard' maps palette sRGB colours 1:1 (closer to the browser) instead of AgX's highlight desaturation.
            scene.view_settings.view_transform = view_transform
        scene.camera = cam
        for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue
        world = scene.world or bpy.data.worlds.new('oys_preview_world')
        scene.world = world
        try:
            world.use_nodes = True
        except AttributeError:
            pass
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs['Color'].default_value = (0.42, 0.48, 0.62, 1)
            bg.inputs['Strength'].default_value = 0.9
        scene.render.resolution_x = size
        scene.render.resolution_y = size
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        scene.camera = prev['camera']
        scene.render.engine = prev['engine']
        scene.render.resolution_x, scene.render.resolution_y = prev['rx'], prev['ry']
        scene.render.resolution_percentage = prev['pct']
        scene.render.film_transparent = prev['transparent']
        scene.render.filepath = prev['path']
        scene.view_settings.view_transform = prev['view']
    finally:
        for obj in temp:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
        for obj in hidden:
            obj.hide_render = False
    return rel


def write_report(asset: Asset, measured: dict, export: dict, *, budget_triangles: int,
                 budget_materials: int, notes: str = '', preview: str | None = None) -> dict:
    report = {
        'asset_id': asset.id,
        'status': 'exported',
        'author': 'original (script-authored in Blender via the pinned Blender MCP bridge)',
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'blender_version': bpy.app.version_string,
        'exporter_version': exporter_version(),
        'source_path': str(pathlib.Path(bpy.data.filepath).relative_to(ROOT)).replace('\\', '/'),
        'export': export,
        'preview': preview,
        'measured': measured,
        'budget': {'triangles': budget_triangles, 'materials': budget_materials},
        'within_budget': measured['triangles'] <= budget_triangles and measured['material_count'] <= budget_materials,
        'notes': notes,
    }
    path = ROOT / 'art' / 'reports' / f'{asset.id}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    return report


def save() -> None:
    bpy.ops.wm.save_mainfile()


def finish(asset: Asset, *, budget_triangles: int, budget_materials: int, notes: str = '',
           preview: bool = True, **preview_kwargs) -> dict:
    """Measure, export, preview, report and save. Prints a one-line JSON summary."""
    measured = stats(asset)
    export = export_glb(asset)
    prev = render_preview(asset, **preview_kwargs) if preview else None
    report = write_report(asset, measured, export, budget_triangles=budget_triangles,
                          budget_materials=budget_materials, notes=notes, preview=prev)
    save()
    print(json.dumps({k: report[k] for k in ('asset_id', 'within_budget', 'export', 'preview')} | {
        'triangles': measured['triangles'], 'materials': measured['materials'], 'dimensions': measured['dimensions']}))
    return report
