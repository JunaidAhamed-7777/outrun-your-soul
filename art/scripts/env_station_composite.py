"""Station composition proof: the Signal House on its platform, through the game camera.

The safe station between rooms (shown behind the draft UI). A 6 x 5 cobalt platform with
a parapet, the station_kiosk facing the camera, lamps, urns and banners, the threshold
inlay as the departure mark, the reunited courier and soul (imported actor GLBs when
present), and the distant engine beyond. Renders
art/previews/station-composite-game-camera.png at 720 x 1280. Composite-only objects
are tagged and never exported.
"""
import math

import bpy

import oys_blender as ob
import oys_env as env

TAG = 'station_composite'
W, H = 6, 5
WALL_TOP = 0.55
ENGINE_AT = tuple(float(v) for v in MCP_ARGS.get('engine_at', '9.4,8.5,-3.1').split(','))  # noqa: F821
OUT = MCP_ARGS.get('out', 'art/previews/station-composite-game-camera.png')  # noqa: F821

coll = env.composite_collection(TAG)
has = lambda asset_id: bpy.data.objects.get(asset_id) is not None  # noqa: E731

base = ob.PartBuilder()
base.box((W + 2.4, H + 2.4, 0.05), center=(W / 2, H / 2, -0.06), key='cobalt_deep')
env.composite_mesh(coll, TAG, 'grout_base', base)
env.floor_grid(coll, TAG, 0, 0, W, H, label='s')

# Parapet: north row and the two sides; the south edge stays open toward the camera.
walls = {(x, H) for x in range(-1, W + 1)} | {(-1, y) for y in range(H)} | {(W, y) for y in range(H)}
for x, y in sorted(walls):
    env.instance_asset('wall_block', coll, TAG, f'w{x}_{y}', location=(x, y, 0))

if has('station_kiosk'):
    env.instance_asset('station_kiosk', coll, TAG, 'kiosk', location=(2.6, 3.0, 0))
if has('threshold_inlay'):
    env.instance_asset('threshold_inlay', coll, TAG, 'departure', location=(1.6, 0, 0))
decor = [
    ('lamp_post', (0.7, 1.4, 0.0), 0), ('lamp_post', (5.3, 1.4, 0.0), 0),
    ('urn', (0.8, 4.2, 0.0), 0), ('urn', (5.2, 4.3, 0.0), 0),
    ('banner_post', (-0.5, H + 0.5, WALL_TOP), 0), ('banner_post', (W + 0.5, H + 0.5, WALL_TOP), 180),
    ('urn', (1.5, H + 0.5, WALL_TOP), 0), ('urn', (4.5, H + 0.5, WALL_TOP), 0),
]
for i, (asset_id, loc, yaw) in enumerate(decor):
    if has(asset_id):
        env.instance_asset(asset_id, coll, TAG, f'd{i}', location=loc, rot_z_deg=yaw)
if has('distant_engine'):
    env.instance_asset('distant_engine', coll, TAG, 'engine', location=ENGINE_AT)

# Reunited pair resting at the station (side by side for legibility of both models).
for asset_id, (x, y), yaw in (('courier_body', (2.25, 1.55), 0), ('soul_mask', (2.75, 1.7), 0)):
    env.import_glb_composite(ob.ROOT / 'public' / 'assets' / 'models' / f'{asset_id}.glb', coll, TAG, (x, y, 0), yaw)

for obj in coll.objects:
    obj.hide_set(True)

pitch = 58.0
ortho_w = 7.2
visible_h = ortho_w * 1280 / 720
v_min = -1.4
target = (W / 2, (v_min + visible_h / 2) / math.sin(math.radians(pitch)), 0.0)
env.render_composite(TAG, OUT, width=720, height=1280, ortho_width=ortho_w, target=target, pitch_deg=pitch,
                     sun_dir=(0.5, 0.62, -0.6), sun_energy=4.2, world_strength=0.55)
ob.save()
print({'rendered': OUT, 'objects': len(coll.objects), 'target': target})
