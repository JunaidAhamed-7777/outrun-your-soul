"""Phone-composition proof: an 8 x 12 sample courtyard rendered through the game camera.

Assembles linked copies of the generated kit (floor_tile, wall_block, exit_gate,
distant_engine when present) plus a dark grout base and actor-sized scale markers,
then renders art/previews/courtyard-composite-game-camera.png at 720 x 1280.
Every object is tagged as composite-only, so it is never part of an exported asset.

Sample layout (simulation/Blender XY): playable [0,8] x [0,12]; perimeter walls just
outside it with a 2-tile opening at x in [3,5] on the north row for the gate; inner
cover at (2..3, 4) and (5, 7..8).
"""
import math

import bpy

import oys_blender as ob
import oys_env as env

TAG = 'courtyard_composite'
W, H = 8, 12
INNER_WALLS = [(2, 4), (3, 4), (5, 7), (5, 8)]
GATE_X0, GATE_X1 = 3, 5
ENGINE_AT = tuple(float(v) for v in MCP_ARGS.get('engine_at', '4,15.5,-3.1').split(','))  # noqa: F821
OUT = MCP_ARGS.get('out', 'art/previews/courtyard-composite-game-camera.png')  # noqa: F821

coll = env.composite_collection(TAG)

# Dark base below the flagstones so the chamfer gaps read as grout.
base = ob.PartBuilder()
base.box((W + 2.4, H + 2.4, 0.05), center=(W / 2, H / 2, -0.06), key='cobalt_deep')
env.composite_mesh(coll, TAG, 'grout_base', base)


def tone_materials():
    """Composite-only tonal variants of cobalt, standing in for the renderer's per-tile tint."""
    r, g, b, _ = ob.palette_rgba('cobalt')
    mats = []
    for i, k in enumerate((0.86, 0.93, 1.0, 1.07, 1.14)):
        name = f'composite_cobalt_{i}'
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (r * k, g * k, b * k, 1)
        bsdf.inputs['Roughness'].default_value = 0.8
        mats.append(mat)
    return mats


tones = tone_materials()
for x in range(W):
    for y in range(H):
        tile = env.instance_asset('floor_tile', coll, TAG, f'f{x}_{y}', location=(x, y, 0))
        for child in tile.children:
            slot = child.material_slots[0]
            slot.link = 'OBJECT'
            slot.material = tones[(x * 7 + y * 13 + (x * y) % 5) % len(tones)]

walls = set(INNER_WALLS)
for x in range(-1, W + 1):
    walls.add((x, -1))
    if not (GATE_X0 <= x < GATE_X1):
        walls.add((x, H))
for y in range(0, H):
    walls.add((-1, y))
    walls.add((W, y))
for x, y in sorted(walls):
    env.instance_asset('wall_block', coll, TAG, f'w{x}_{y}', location=(x, y, 0))

# Floor under the gate opening so the threshold is continuous.
for x in range(GATE_X0, GATE_X1):
    env.instance_asset('floor_tile', coll, TAG, f'g{x}', location=(x, H, 0))

if bpy.data.objects.get('exit_gate') is not None:
    env.instance_asset('exit_gate', coll, TAG, 'gate', location=((GATE_X0 + GATE_X1) / 2, H + 0.5, 0))
if bpy.data.objects.get('distant_engine') is not None:
    env.instance_asset('distant_engine', coll, TAG, 'engine', location=ENGINE_AT)

# Actor-scale stand-ins (not exported, not final art): an ivory body pillar with vermilion
# scarf, a cyan soul orb, and a ground ring each, to judge contrast against the kit.
markers = ob.PartBuilder()
markers.cylinder(0.3, 0.3, 0.02, center=(3.5, 2.5, 0.01), key='ivory', segments=20)
markers.cylinder(0.17, 0.2, 0.62, center=(3.5, 2.5, 0.33), key='ivory', segments=8)
markers.sphere(0.15, center=(3.5, 2.5, 0.74), key='ivory', subdivisions=1)
markers.box((0.08, 0.36, 0.06), center=(3.5, 2.75, 0.6), key='vermilion')
markers.cylinder(0.3, 0.3, 0.02, center=(5.2, 5.6, 0.01), key='soul_glow', segments=20)
markers.sphere(0.2, center=(5.2, 5.6, 0.58), key='soul_core', subdivisions=2)
env.composite_mesh(coll, TAG, 'scale_markers', markers)

for obj in coll.objects:
    obj.hide_set(True)  # keep the authoring viewport uncluttered; render visibility is unaffected

pitch = 58.0
ortho_w = 9.4
visible_h = ortho_w * 1280 / 720
v_min = -1.7
v_centre = v_min + visible_h / 2
target = (W / 2, v_centre / math.sin(math.radians(pitch)), 0.0)
env.render_composite(TAG, OUT, width=720, height=1280, ortho_width=ortho_w, target=target, pitch_deg=pitch,
                     sun_dir=(0.5, 0.62, -0.6), sun_energy=4.2, world_strength=0.55)
ob.save()
print({'rendered': OUT, 'objects': len(coll.objects), 'engine_at': ENGINE_AT, 'target': target})
