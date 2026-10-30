"""Phone-composition proof: an 8 x 12 sample courtyard rendered through the game camera.

Assembles linked copies of the generated kit (floor, walls, gate, threshold inlay,
lane emitter, decor and distant engine when present) plus a dark grout base. When the
actor kit's GLBs exist in public/assets/models they are imported as composite-only
objects (courier, soul, needler, keeper); otherwise actor-sized stand-ins are used.
A composite-only violet band stands in for the runtime-drawn lane. Renders
art/previews/courtyard-composite-game-camera.png at 720 x 1280. Every object is tagged
composite-only, so it is never part of an exported asset.

Sample layout (simulation/Blender XY): playable [0,8] x [0,12]; perimeter walls just
outside it with a 2-tile opening at x in [3,5] on the north row for the gate; exit zone
[3,5] x [11,12]; inner cover at (2..3, 4) and (5, 7..8); a lane across [0,6] x [5,6]
fed by an emitter in the west wall tile (-1, 5).
"""
import math

import bpy

import oys_blender as ob
import oys_env as env

TAG = 'courtyard_composite'
W, H = 8, 12
INNER_WALLS = [(2, 4), (3, 4), (5, 7), (5, 8)]
GATE_X0, GATE_X1 = 3, 5
LANE = (0.0, 5.0, 6.0, 1.0)
EMITTER_TILE = (-1, 5)
WALL_TOP = 0.55
ENGINE_AT = tuple(float(v) for v in MCP_ARGS.get('engine_at', '4,15.5,-3.1').split(','))  # noqa: F821
OUT = MCP_ARGS.get('out', 'art/previews/courtyard-composite-game-camera.png')  # noqa: F821

coll = env.composite_collection(TAG)

# Dark base below the flagstones so the chamfer gaps read as grout.
base = ob.PartBuilder()
base.box((W + 2.4, H + 2.4, 0.05), center=(W / 2, H / 2, -0.06), key='cobalt_deep')
env.composite_mesh(coll, TAG, 'grout_base', base)
env.floor_grid(coll, TAG, 0, 0, W, H)

walls = set(INNER_WALLS)
for x in range(-1, W + 1):
    walls.add((x, -1))
    if not (GATE_X0 <= x < GATE_X1):
        walls.add((x, H))
for y in range(0, H):
    walls.add((-1, y))
    walls.add((W, y))
has = lambda asset_id: bpy.data.objects.get(asset_id) is not None  # noqa: E731
if has('lane_emitter'):
    walls.discard(EMITTER_TILE)
    # Aperture faces -Y; yaw +90 turns it to +X (into the room). Rotating a corner-origin
    # module by +90 maps [0,1]^2 to [-1,0]x[0,1], so the root goes one tile east.
    env.instance_asset('lane_emitter', coll, TAG, 'emitter', location=(EMITTER_TILE[0] + 1, EMITTER_TILE[1], 0),
                       rot_z_deg=90)
for x, y in sorted(walls):
    env.instance_asset('wall_block', coll, TAG, f'w{x}_{y}', location=(x, y, 0))

# Floor under the gate opening so the threshold is continuous.
for x in range(GATE_X0, GATE_X1):
    env.instance_asset('floor_tile', coll, TAG, f'g{x}', location=(x, H, 0))

if has('exit_gate'):
    env.instance_asset('exit_gate', coll, TAG, 'gate', location=((GATE_X0 + GATE_X1) / 2, H + 0.5, 0))
if has('threshold_inlay'):
    env.instance_asset('threshold_inlay', coll, TAG, 'threshold', location=(GATE_X0, H - 1, 0))
if has('distant_engine'):
    env.instance_asset('distant_engine', coll, TAG, 'engine', location=ENGINE_AT)

# Decor on perimeter wall tops only (nonblocking): lamps beside the gate, urns at the
# corners, banners on the side walls (never on the south edge, where height covers play).
decor = [
    ('lamp_post', (1.5, H + 0.5), 0), ('lamp_post', (W - 1.5, H + 0.5), 0),
    ('urn', (-0.5, H + 0.5), 0), ('urn', (W + 0.5, H + 0.5), 0),
    ('urn', (-0.5, -0.5), 0), ('urn', (W + 0.5, -0.5), 0),
    ('banner_post', (-0.5, 9.5), 0), ('banner_post', (W + 0.5, 9.5), 180),
]
for i, (asset_id, (x, y), yaw) in enumerate(decor):
    if has(asset_id):
        env.instance_asset(asset_id, coll, TAG, f'd{i}', location=(x, y, WALL_TOP), rot_z_deg=yaw)

# Composite-only stand-in for the runtime-drawn lane: violet band with pale stripes.
lane = ob.PartBuilder()
lx, ly, lw, lh = LANE
lane.box((lw, lh * 0.9, 0.004), center=(lx + lw / 2, ly + lh / 2, 0.004), key='lane_violet')
for i in range(int(lw / 0.5)):
    lane.box((0.12, lh * 0.9, 0.004), center=(lx + 0.25 + i * 0.5, ly + lh / 2, 0.006), key='lane_stripe', rot=(0, 0, 0))
env.composite_mesh(coll, TAG, 'lane_band', lane)

# Actors: import the real actor GLBs when present, else actor-sized stand-ins.
ACTORS = [('courier_body', (3.5, 2.5), 0), ('soul_mask', (5.6, 3.4), 0), ('needler', (6.5, 9.5), 200),
          ('keeper', (1.5, 8.5), 160)]
rings = ob.PartBuilder()
rings.cylinder(0.3, 0.3, 0.012, center=(3.5, 2.5, 0.006), key='ivory', segments=24)
rings.cylinder(0.3, 0.3, 0.012, center=(5.6, 3.4, 0.006), key='soul_glow', segments=24)
env.composite_mesh(coll, TAG, 'actor_rings', rings)
imported = 0
for asset_id, (x, y), yaw in ACTORS:
    path = ob.ROOT / 'public' / 'assets' / 'models' / f'{asset_id}.glb'
    if env.import_glb_composite(path, coll, TAG, (x, y, 0), yaw) is not None:
        imported += 1
if imported == 0:
    markers = ob.PartBuilder()
    markers.cylinder(0.17, 0.2, 0.62, center=(3.5, 2.5, 0.33), key='ivory', segments=8)
    markers.sphere(0.15, center=(3.5, 2.5, 0.74), key='ivory', subdivisions=1)
    markers.sphere(0.2, center=(5.6, 3.4, 0.58), key='soul_core', subdivisions=2)
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
