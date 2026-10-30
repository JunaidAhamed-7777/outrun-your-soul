"""Render the four actors side by side through the game camera, with the calibration tile
(appended from art/source/calibration.blend) and each actor's true simulation radius drawn
as a ground ring, on a temporary checker floor. Evidence of relative scale and footprint.

Everything temporary is tagged and removed afterwards; actor roots are restored; the
source file is not saved by this script.
"""
import math

import bpy
import oys_blender as ob
from mathutils import Vector

ACTORS = [  # asset id, x position, simulation radius, ring colour key
    ('courier_body', 0.0, 0.30, 'ivory'),
    ('soul_mask', 1.05, 0.30, 'soul_glow'),
    ('needler', 2.25, 0.42, 'warning_amber'),
    ('keeper', 3.55, 0.42, 'warning_amber'),
]
OUT = 'art/previews/actors-lineup-game-camera.png'
TAG = ob.PREVIEW_TAG

scene = bpy.context.scene
temp_objects = []
moved = []


def link_temp(obj):
    obj[TAG] = True
    scene.collection.objects.link(obj)
    temp_objects.append(obj)
    return obj


def temp_mesh(name, builder):
    me = bpy.data.meshes.new(name)
    builder.bm.to_mesh(me)
    builder.bm.free()
    for key in builder.material_keys:
        me.materials.append(ob.material(key))
    return link_temp(bpy.data.objects.new(name, me))


def circle(r, n=40):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]


hidden = []
try:
    # Calibration tile from its own source file (not re-authored here).
    calib_path = str(ob.ROOT / 'art' / 'source' / 'calibration.blend')
    with bpy.data.libraries.load(calib_path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith('calibration_tile')]
    calib_root = None
    for obj in dst.objects:
        link_temp(obj)
        if obj.name.startswith('calibration_tile') and obj.parent is None:
            calib_root = obj
    if calib_root is not None:
        calib_root.location = (-1.75, -0.5, 0.0)

    # Checker floor (one tile = one unit) and simulation-radius rings.
    floor = ob.PartBuilder()
    for ix in range(-3, 6):
        for iy in range(-2, 2):
            floor.box((1.0, 1.0, 0.04), center=(ix + 0.5, iy + 0.5, -0.02),
                      key='cobalt' if (ix + iy) % 2 == 0 else 'cobalt_light')
    temp_mesh('oys_lineup_floor', floor)
    for asset_id, x, radius, ring_key in ACTORS:
        ring = ob.PartBuilder()
        ring.add(ob.plate_with_holes(circle(radius + 0.012), [list(reversed(circle(radius - 0.012)))], 0.006,
                                     plane='XY'), ring_key, ob.placement((x, 0.0, 0.001)))
        temp_mesh(f'oys_lineup_ring_{asset_id}', ring)
        root = bpy.data.objects[asset_id]
        moved.append((root, root.location.copy()))
        root.location = (x, 0.0, 0.0)

    for obj in scene.objects:
        if obj.get(TAG) or obj.get(ob.ASSET_TAG) in {a[0] for a in ACTORS}:
            continue
        if not obj.hide_render:
            obj.hide_render = True
            hidden.append(obj)

    cam_data = bpy.data.cameras.new('oys_lineup_cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 6.6
    cam = link_temp(bpy.data.objects.new('oys_lineup_cam', cam_data))
    pitch = math.radians(58.0)
    direction = Vector((0.0, math.cos(pitch), -math.sin(pitch)))
    target = Vector((0.95, 0.0, 0.3))
    cam.location = target - direction * 20
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    sun_data = bpy.data.lights.new('oys_lineup_sun', 'SUN')
    sun_data.energy = 3.0
    sun_data.color = (1.0, 0.93, 0.82)
    sun = link_temp(bpy.data.objects.new('oys_lineup_sun', sun_data))
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-35))

    prev = dict(camera=scene.camera, engine=scene.render.engine, rx=scene.render.resolution_x,
                ry=scene.render.resolution_y, transparent=scene.render.film_transparent,
                path=scene.render.filepath, view=scene.view_settings.view_transform)
    scene.camera = cam
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    scene.render.filepath = str(ob.ROOT / OUT)
    bpy.ops.render.render(write_still=True)
    scene.camera = prev['camera']
    scene.render.engine = prev['engine']
    scene.render.resolution_x, scene.render.resolution_y = prev['rx'], prev['ry']
    scene.render.film_transparent = prev['transparent']
    scene.render.filepath = prev['path']
    scene.view_settings.view_transform = prev['view']
finally:
    for root, loc in moved:
        root.location = loc
    for obj in hidden:
        obj.hide_render = False
    for obj in temp_objects:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
        elif isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
print(OUT)
