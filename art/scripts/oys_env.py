"""Environment-kit helpers (courtyard modules, gate, distant machinery, composites).

Additive companion to oys_blender.py: kept in its own module so the actors and
environment kits can extend shared tooling without editing the same file.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import oys_blender as ob

COMPOSITE_TAG = 'oys_composite'


# ---------------------------------------------------------------------------
# Geometry primitives
# ---------------------------------------------------------------------------

def rect_lathe(rings, cap_bottom: bool = True, cap_top: bool = True, recalc: bool = True) -> bmesh.types.BMesh:
    """Stack of axis-aligned rectangles [(hx, hy, z), ...] bottom->top, centred on the Z axis.

    Gives chamfers, tapers, plinths and copings with exactly 8 triangles per band.
    Rings may step inward at constant z (a flat ledge) or downward (an inner lip); face
    winding then already points outward/upward, so pass recalc=False for open shells.
    """
    bm = bmesh.new()
    loops = []
    for hx, hy, z in rings:
        loops.append([bm.verts.new((-hx, -hy, z)), bm.verts.new((hx, -hy, z)),
                      bm.verts.new((hx, hy, z)), bm.verts.new((-hx, hy, z))])
    for a, b in zip(loops, loops[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_bottom:
        bm.faces.new(list(reversed(loops[0])))
    if cap_top:
        bm.faces.new(loops[-1])
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def arc_band(r_inner: float, r_outer: float, depth: float, a0_deg: float, a1_deg: float,
             segments: int) -> bmesh.types.BMesh:
    """Annular sector in the XZ plane (angle 0 = +X, 90 = +Z), extruded along Y by depth.

    A full 360 degree band is closed without end caps. r_inner must be > 0.
    """
    if r_inner <= 0 or r_outer <= r_inner:
        raise ValueError('arc_band needs 0 < r_inner < r_outer')
    bm = bmesh.new()
    full = abs((a1_deg - a0_deg) % 360) < 1e-6 and a1_deg != a0_deg
    n = segments if full else segments + 1
    half = depth / 2
    ring = []
    for i in range(n):
        a = math.radians(a0_deg + (a1_deg - a0_deg) * i / segments)
        c, s = math.cos(a), math.sin(a)
        ring.append((
            bm.verts.new((r_inner * c, -half, r_inner * s)),
            bm.verts.new((r_outer * c, -half, r_outer * s)),
            bm.verts.new((r_outer * c, half, r_outer * s)),
            bm.verts.new((r_inner * c, half, r_inner * s)),
        ))
    for i in range(segments):
        a, b = ring[i], ring[(i + 1) % n]
        bm.faces.new((a[0], a[1], b[1], b[0]))  # front (-Y)
        bm.faces.new((a[3], b[3], b[2], a[2]))  # back (+Y)
        bm.faces.new((a[1], a[2], b[2], b[1]))  # outer
        bm.faces.new((a[0], b[0], b[3], a[3]))  # inner
    if not full:
        bm.faces.new(ring[0])
        bm.faces.new(tuple(reversed(ring[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def scale_about(bm: bmesh.types.BMesh, factors, origin=(0, 0, 0)) -> bmesh.types.BMesh:
    """Non-uniform scale about a point (e.g. squash a semicircular arch into a segmental one)."""
    o = Vector(origin)
    for v in bm.verts:
        d = v.co - o
        v.co = o + Vector((d.x * factors[0], d.y * factors[1], d.z * factors[2]))
    return bm


def gear(r_root: float, r_tip: float, teeth: int, depth: float, *, rim_inner: float,
         spokes: int = 6, hub_r: float = 0.0, segments: int | None = None) -> bmesh.types.BMesh:
    """Spur gear facing -Y (disc in XZ, axle along Y) centred at the origin.

    Rim band, trapezoid teeth, box spokes and a hub; each piece is a closed solid.
    """
    segs = segments or max(teeth, 16)
    bm = arc_band(rim_inner, r_root, depth, 0, 360, segs)
    pitch = 2 * math.pi / teeth
    for i in range(teeth):
        a = i * pitch
        base_half = pitch * 0.28
        tip_half = pitch * 0.17
        outline = []
        for ang, r in ((a - base_half, r_root - 0.02), (a + base_half, r_root - 0.02),
                       (a + tip_half, r_tip), (a - tip_half, r_tip)):
            outline.append((r * math.cos(ang), r * math.sin(ang)))
        _merge(bm, ob.prism(outline, depth * 0.92, plane='XZ'))
    for i in range(spokes):
        a = 2 * math.pi * i / spokes
        spoke = ob.box((rim_inner + 0.05, depth * 0.6, max(0.12, r_root * 0.11)))
        bmesh.ops.translate(spoke, vec=Vector(((rim_inner + 0.05) / 2, 0, 0)), verts=spoke.verts)
        bmesh.ops.rotate(spoke, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(-a, 3, 'Y'), verts=spoke.verts)
        _merge(bm, spoke)
    if hub_r > 0:
        hub = ob.cylinder(hub_r, hub_r, depth * 1.3, 10)
        bmesh.ops.rotate(hub, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=hub.verts)
        _merge(bm, hub)
    return bm


def _merge(dst: bmesh.types.BMesh, src: bmesh.types.BMesh) -> None:
    tmp = bpy.data.meshes.new('_oys_env_tmp')
    src.to_mesh(tmp)
    src.free()
    dst.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def add(pb: ob.PartBuilder, piece: bmesh.types.BMesh, key: str, center=(0, 0, 0), rot=None) -> ob.PartBuilder:
    """Place a raw bmesh piece into a PartBuilder with a palette material."""
    return pb.add(piece, key, ob.placement(center, rot))


def add_banded_lathe(pb: ob.PartBuilder, profile, keys, center=(0, 0, 0), segments: int = 10,
                     rot=None) -> ob.PartBuilder:
    """Revolve [(radius, z), ...] around Z with palette key keys[i] on the band from profile[i]
    to profile[i + 1] (len(keys) == len(profile) - 1). End caps take the adjacent band's key;
    zero-radius ends become poles. One closed surface, so material changes cost no extra caps.
    """
    if len(keys) != len(profile) - 1:
        raise ValueError('add_banded_lathe needs one key per band')
    slots = [pb._slot(k) for k in keys]  # noqa: SLF001 - same toolkit
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segments),
                                         r * math.sin(2 * math.pi * i / segments), z))
                          for i in range(segments)])
    for band, (a, b) in enumerate(zip(rings, rings[1:])):
        for i in range(segments):
            j = (i + 1) % segments
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                face = bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                face = bm.faces.new((a[i], b[0], a[j]))
            else:
                face = bm.faces.new((a[i], a[j], b[j], b[i]))
            face.material_index = slots[band]
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0]))).material_index = slots[0]
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1]).material_index = slots[-1]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return merge_preassigned(pb, bm, ob.placement(center, rot))


def merge_preassigned(pb: ob.PartBuilder, bm: bmesh.types.BMesh, matrix: Matrix | None = None) -> ob.PartBuilder:
    """Merge a bmesh whose faces already carry PartBuilder slot indices (see add_banded_lathe)."""
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    _merge(pb.bm, bm)
    return pb


# ---------------------------------------------------------------------------
# Composites (never exported: tagged and kept out of every asset hierarchy)
# ---------------------------------------------------------------------------

def clear_composites() -> int:
    """Remove every composite-only object (they share asset meshes via linked copies).

    Generators call this first: otherwise a composite copy keeps the previous mesh
    datablock alive, the regenerated mesh is renamed '<part>.001', and the exported
    GLB bytes change between otherwise identical runs.
    """
    doomed = [obj for obj in bpy.data.objects if obj.get(COMPOSITE_TAG)]
    for obj in doomed:
        bpy.data.objects.remove(obj, do_unlink=True)
    return len(doomed)


def composite_collection(name: str) -> bpy.types.Collection:
    """Fresh collection for a preview composite; removes only objects it previously tagged."""
    for obj in list(bpy.data.objects):
        if obj.get(COMPOSITE_TAG) == name:
            bpy.data.objects.remove(obj, do_unlink=True)
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def instance_asset(asset_id: str, coll: bpy.types.Collection, tag: str, label: str,
                   location=(0, 0, 0), rot_z_deg: float = 0.0) -> bpy.types.Object:
    """Linked-data copy of an asset hierarchy (shares meshes; tagged as composite-only)."""
    src_root = bpy.data.objects.get(asset_id)
    if src_root is None or src_root.get(ob.ASSET_TAG) != asset_id:
        raise RuntimeError(f'asset {asset_id!r} has not been generated in this file')

    def clone(src: bpy.types.Object, parent: bpy.types.Object | None) -> bpy.types.Object:
        obj = bpy.data.objects.new(f'{tag}.{label}.{src.name}'[:63], src.data)
        obj[COMPOSITE_TAG] = tag
        coll.objects.link(obj)
        obj.parent = parent
        obj.matrix_parent_inverse = src.matrix_parent_inverse.copy()
        obj.location = src.location.copy()
        obj.rotation_euler = src.rotation_euler.copy()
        obj.scale = src.scale.copy()
        if src.type == 'EMPTY':
            obj.empty_display_type = src.empty_display_type
            obj.empty_display_size = src.empty_display_size
        for child in src.children:
            clone(child, obj)
        return obj

    root = clone(src_root, None)
    root.location = Vector(location)
    root.rotation_euler = (0, 0, math.radians(rot_z_deg))
    return root


def tone_materials(key: str = 'cobalt', factors=(0.86, 0.93, 1.0, 1.07, 1.14)) -> list[bpy.types.Material]:
    """Composite-only tonal variants of a palette colour (stand-in for the renderer's per-tile tint)."""
    r, g, b, _ = ob.palette_rgba(key)
    mats = []
    for i, k in enumerate(factors):
        name = f'composite_{key}_{i}'
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        try:
            mat.use_nodes = True
        except AttributeError:
            pass
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (r * k, g * k, b * k, 1)
        bsdf.inputs['Roughness'].default_value = 0.8
        mats.append(mat)
    return mats


def floor_grid(coll: bpy.types.Collection, tag: str, x0: int, y0: int, w: int, h: int, label: str = 'f') -> None:
    """Toned floor_tile copies over [x0, x0+w) x [y0, y0+h)."""
    tones = tone_materials()
    for x in range(x0, x0 + w):
        for y in range(y0, y0 + h):
            tile = instance_asset('floor_tile', coll, tag, f'{label}{x}_{y}', location=(x, y, 0))
            for child in tile.children:
                slot = child.material_slots[0]
                slot.link = 'OBJECT'
                slot.material = tones[(x * 7 + y * 13 + (x * y) % 5) % len(tones)]


def import_glb_composite(path, coll: bpy.types.Collection, tag: str, location, yaw_deg: float = 0.0):
    """Import a GLB (e.g. an actor from another kit) as composite-only objects; returns its root or None."""
    if not path.exists():
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    for obj in new:
        obj[COMPOSITE_TAG] = tag
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        coll.objects.link(obj)
    root = next(o for o in new if o.parent is None)
    root.location = location
    root.rotation_mode = 'XYZ'
    root.rotation_euler = (0, 0, math.radians(yaw_deg))
    return root


def composite_mesh(coll: bpy.types.Collection, tag: str, name: str, pb: ob.PartBuilder,
                   location=(0, 0, 0)) -> bpy.types.Object:
    """One-off composite-only mesh (ground plates, preview dressing)."""
    me = bpy.data.meshes.new(f'{tag}.{name}')
    pb.bm.to_mesh(me)
    pb.bm.free()
    for key in pb.material_keys:
        me.materials.append(ob.material(key))
    obj = bpy.data.objects.new(f'{tag}.{name}', me)
    obj[COMPOSITE_TAG] = tag
    coll.objects.link(obj)
    obj.location = location
    return obj


def _set_engine(scene) -> None:
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
        try:
            scene.render.engine = engine
            return
        except TypeError:
            continue


def render_composite(tag: str, rel_path: str, *, width: int, height: int, ortho_width: float,
                     target, pitch_deg: float = 58.0, sky_key: str = 'sky_top',
                     sun_dir=(0.42, 0.62, -0.66), sun_energy: float = 3.6,
                     sun_color=(1.0, 0.9, 0.76), world_strength: float = 0.85) -> str:
    """Render only objects tagged with `tag` through an orthographic game camera.

    Camera looks along +Y tilted down by pitch, aimed at `target`; horizontal extent
    `ortho_width`. Temporary camera/light/world/colour settings are restored afterwards.
    """
    out = ob.ROOT / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    hidden = []
    for obj in scene.objects:
        if obj.get(COMPOSITE_TAG) != tag and not obj.hide_render:
            obj.hide_render = True
            hidden.append(obj)
    temp = []
    prev = dict(camera=scene.camera, engine=scene.render.engine, rx=scene.render.resolution_x,
                ry=scene.render.resolution_y, pct=scene.render.resolution_percentage,
                transparent=scene.render.film_transparent, path=scene.render.filepath,
                view=scene.view_settings.view_transform, look=scene.view_settings.look,
                world=scene.world)
    try:
        cam_data = bpy.data.cameras.new(f'{tag}_cam')
        cam_data.type = 'ORTHO'
        cam_data.sensor_fit = 'HORIZONTAL'
        cam_data.ortho_scale = ortho_width
        cam_data.clip_start = 0.1
        cam_data.clip_end = 400
        cam = bpy.data.objects.new(f'{tag}_cam', cam_data)
        cam[ob.PREVIEW_TAG] = True
        scene.collection.objects.link(cam)
        temp.append(cam)
        pitch = math.radians(pitch_deg)
        direction = Vector((0.0, math.cos(pitch), -math.sin(pitch)))
        cam.location = Vector(target) - direction * 60
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

        sun_data = bpy.data.lights.new(f'{tag}_sun', 'SUN')
        sun_data.energy = sun_energy
        sun_data.color = sun_color
        sun_data.angle = math.radians(3.0)
        sun = bpy.data.objects.new(f'{tag}_sun', sun_data)
        sun[ob.PREVIEW_TAG] = True
        sun.rotation_euler = Vector(sun_dir).normalized().to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(sun)
        temp.append(sun)

        world = bpy.data.worlds.new(f'{tag}_world')
        try:
            world.use_nodes = True
        except AttributeError:
            pass
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs['Color'].default_value = ob.palette_rgba(sky_key)
            bg.inputs['Strength'].default_value = world_strength
        scene.world = world

        scene.camera = cam
        _set_engine(scene)
        try:
            scene.view_settings.view_transform = 'Standard'
            scene.view_settings.look = 'None'
        except TypeError:
            pass
        scene.render.resolution_x = width
        scene.render.resolution_y = height
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = False
        scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
    finally:
        scene.camera = prev['camera']
        scene.render.engine = prev['engine']
        scene.render.resolution_x, scene.render.resolution_y = prev['rx'], prev['ry']
        scene.render.resolution_percentage = prev['pct']
        scene.render.film_transparent = prev['transparent']
        scene.render.filepath = prev['path']
        scene.view_settings.view_transform = prev['view']
        scene.view_settings.look = prev['look']
        made_world = scene.world
        scene.world = prev['world']
        if made_world is not None and made_world is not prev['world'] and made_world.name.startswith(tag):
            bpy.data.worlds.remove(made_world)
        for obj in temp:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
        for obj in hidden:
            obj.hide_render = False
    return rel_path
