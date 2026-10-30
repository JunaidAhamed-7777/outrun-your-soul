"""distant_engine: gold funeral machinery beyond the courtyard's north wall.

One backdrop GLB, about 30 m wide, ~7 m tall above its origin and ~7 m deep.
Origin: ground centre at the foot of the railway. Far-layer towers continue down to
z = -4 because the machinery rises out of a valley below the courtyard platform;
those lower parts are hidden behind the room in the game view.

An orthographic camera cannot shrink distant things, so distance and size are told
by relative scale, haze and layering:
  * near/middle: a MINIATURE two-tier gold aqueduct railway carrying a tiny funeral
    train, with a procession of hooded specks and lantern dots on the lower tier
    (the courtyard's courier is twice the size of a hearse carriage, so the railway
    reads as far away);
  * behind it: two colossal gold gear wheels (gear_a, gear_b) that frame the top
    corners of a portrait screen and turn slowly;
  * furthest: a hazy cobalt_mist domed station, bell tower, chimneys and a hanging
    funeral bell; the tallest are cropped by the top of a portrait screen on purpose.

Animated parts (procedural at runtime):
  distant_engine_gear_a, distant_engine_gear_b  pivots at their axles; each disc is
      tilted back 30 degrees towards the game camera, so rotate the part about its
      LOCAL Z axis in Three.js (Blender local Y, the axle). Opposite directions read
      as meshing machinery even though the wheels are far apart.
  distant_engine_train  slides along X on the aqueduct rails (pivot on the rail top);
      wrap it between x = -17 and +17 so it re-enters off-screen.
Everything else lives in distant_engine_body.

Recommended placement (used by env_composite.py for the phone proof): origin at
simulation (room_width / 2, room_height + 3.5) and z = -3.1 relative to the floor.
"""
import math

import bmesh

import oys_blender as ob
import oys_env as env

GEAR_TILT = -30.0
TRAIN_SCALE = 0.42
# Miniature two-tier aqueduct railway.
VIA_Y = -1.0
SPAN = 1.25
TIER1_Z = 1.7
TIER2_Z = 2.62
DECK_T = 0.12
RAIL_Z = TIER2_Z + DECK_T + 0.02
# Far layer.
FAR_Y = 2.2

asset = ob.Asset('distant_engine')
body = ob.PartBuilder()

# ----------------------------------------------------------------- far layer (misty)
# Domed station rising from the valley, centred between the gears.
DX = 0.6
body.lathe([(2.3, -3.0), (2.3, 0.9), (2.45, 1.0), (2.45, 1.15), (2.2, 1.2), (2.05, 1.9), (1.7, 2.55),
            (1.15, 3.0), (0.5, 3.25), (0.4, 3.3)], center=(DX, FAR_Y, 0), key='cobalt_mist', segments=16)
body.cylinder(0.4, 0.34, 0.5, center=(DX, FAR_Y, 3.55), key='cobalt_mist', segments=8)
body.lathe([(0.42, 3.8), (0.25, 4.05), (0.0, 4.2)], center=(DX, FAR_Y, 0), key='cobalt_mist', segments=8)
body.cylinder(0.03, 0.0, 0.7, center=(DX, FAR_Y, 4.55), key='cobalt_mist', segments=4)
for i in range(8):  # buttress ribs on the drum
    a = math.radians(22.5 + i * 45)
    body.box((0.16, 0.16, 3.9), center=(DX + math.cos(a) * 2.36, FAR_Y + math.sin(a) * 2.36, -1.0),
             key='cobalt_mist', rot=(0, 0, i * 45 + 22.5))
# Bell tower (left of the dome), cropped by the top of a portrait screen on purpose.
TX = -3.3
env.add(body, env.rect_lathe([(0.62, 0.55, -4.0), (0.55, 0.48, 4.6), (0.68, 0.6, 4.75), (0.68, 0.6, 5.0)]),
        'cobalt_mist', center=(TX, FAR_Y + 0.3, 0))
for z in (1.6, 3.0, 4.2):
    body.box((1.36, 1.2, 0.1), center=(TX, FAR_Y + 0.3, z), key='cobalt_mist')
body.lathe([(0.62, 5.0), (0.62, 5.4), (0.48, 5.9), (0.26, 6.3), (0.06, 6.6), (0.0, 6.65)], center=(TX, FAR_Y + 0.3, 0),
           key='cobalt_mist', segments=10)
# Chimney pair (right of the dome) with banding.
for cx, top, r in ((3.5, 6.4, 0.36), (4.5, 5.2, 0.3)):
    h = top + 4.0
    body.cylinder(r * 1.18, r, h, center=(cx, FAR_Y + 0.5, top - h / 2), key='cobalt_mist', segments=10)
    for z in (top - 3.0, top - 1.5, top - 0.1):
        body.cylinder(r * 1.25, r * 1.25, 0.14, center=(cx, FAR_Y + 0.5, z), key='cobalt_mist', segments=10)
# Gallows mast with a great hanging funeral bell (far left).
MX = -7.6
env.add(body, env.rect_lathe([(0.18, 0.18, -4.0), (0.13, 0.13, 6.2)]), 'cobalt_mist', center=(MX, FAR_Y, 0))
body.box((2.0, 0.22, 0.22), center=(MX + 0.85, FAR_Y, 6.05), key='cobalt_mist')
body.lathe([(0.0, 3.6), (0.8, 3.75), (0.66, 4.3), (0.47, 4.9), (0.19, 5.2), (0.0, 5.25)],
           center=(MX + 1.6, FAR_Y, 0), key='cobalt_mist', segments=12)
body.cylinder(0.03, 0.03, 0.75, center=(MX + 1.6, FAR_Y, 5.65), key='cobalt_mist', segments=4)
# Far side of the valley: low misty blocks across the whole width.
for x, w, h in ((-12.5, 5.0, 1.4), (-9.6, 2.6, 2.2), (8.6, 4.6, 1.9), (12.8, 4.4, 1.2)):
    env.add(body, env.rect_lathe([(w / 2, 0.8, -4.0), (w / 2, 0.8, h - 0.35), (w / 2 - 0.35, 0.5, h)]), 'cobalt_mist',
            center=(x, FAR_Y + 0.9, 0))

# ----------------------------------------------------------------- miniature two-tier aqueduct (gold)
n_bays = int(30 / SPAN)
x0 = -n_bays * SPAN / 2
for i in range(n_bays + 1):
    x = x0 + i * SPAN
    env.add(body, env.rect_lathe([(0.09, 0.17, -1.2), (0.09, 0.17, TIER1_Z)], cap_bottom=False), 'gold_dark',
            center=(x, VIA_Y, 0))
    env.add(body, env.rect_lathe([(0.07, 0.13, TIER1_Z + 0.08), (0.07, 0.13, TIER2_Z)], cap_bottom=False), 'gold_dark',
            center=(x, VIA_Y, 0))
    if i < n_bays:
        cx = x + SPAN / 2
        env.add(body, env.arc_band(0.53, 0.62, 0.3, 0, 180, 6), 'gold_dark', center=(cx, VIA_Y, TIER1_Z - 0.62))
        env.add(body, env.arc_band(0.55, 0.62, 0.24, 0, 180, 6), 'gold_dark', center=(cx, VIA_Y, TIER2_Z - 0.62))
body.box((n_bays * SPAN + 0.2, 0.38, 0.08), center=(0, VIA_Y, TIER1_Z + 0.04), key='gold')
body.box((n_bays * SPAN + 0.2, 0.42, DECK_T), center=(0, VIA_Y, TIER2_Z + DECK_T / 2), key='gold')
for y in (-0.07, 0.07):
    body.box((n_bays * SPAN + 0.2, 0.02, 0.02), center=(0, VIA_Y + y, RAIL_Z - 0.01), key='ivory')
# Procession specks walking along the lower tier, every other one with a gold lantern dot; a small ivory bier.
WALK_Z = TIER1_Z + 0.08
for i in range(13):
    x = -1.2 + i * 0.22 + (0.05 if i % 3 == 1 else 0.0)
    body.cylinder(0.035, 0.01, 0.12, center=(x, VIA_Y - 0.1, WALK_Z + 0.06), key='cobalt_mist', segments=5)
    body.sphere(0.022, center=(x, VIA_Y - 0.1, WALK_Z + 0.135), key='cobalt_mist', subdivisions=0)
    if i % 2 == 0:
        body.sphere(0.02, center=(x + 0.04, VIA_Y - 0.13, WALK_Z + 0.09), key='gold', subdivisions=0)
body.box((0.22, 0.07, 0.04), center=(0.15, VIA_Y - 0.1, WALK_Z + 0.18), key='ivory')

asset.mesh('body', body)

# ----------------------------------------------------------------- miniature funeral train
train = ob.PartBuilder()
# Locomotive at the +X end (authored at 1/TRAIN_SCALE, scaled down below).
train.cylinder(0.19, 0.19, 1.0, center=(2.6, 0, 0.36), key='gold', segments=10, rot=(0, 90, 0))
for x in (2.25, 2.95):
    train.cylinder(0.205, 0.205, 0.04, center=(x, 0, 0.36), key='gold_dark', segments=10, rot=(0, 90, 0))
train.cylinder(0.06, 0.1, 0.3, center=(3.0, 0, 0.66), key='gold_dark', segments=6)
env.add(train, env.rect_lathe([(0.22, 0.22, 0.12), (0.22, 0.22, 0.66), (0.26, 0.25, 0.7)]), 'ivory',
        center=(1.95, 0, 0))
train.box((1.4, 0.38, 0.12), center=(2.45, 0, 0.12), key='gold_dark')
for x in (2.2, 2.65, 3.05):
    train.cylinder(0.12, 0.12, 0.42, center=(x, 0, 0.12), key='gold_dark', segments=8, rot=(90, 0, 0))


def hearse(cx: float) -> None:
    """Ivory hearse carriage: gold canopy, corner plumes, dark windows."""
    train.box((1.0, 0.36, 0.08), center=(cx, 0, 0.12), key='gold_dark')
    env.add(train, env.rect_lathe([(0.46, 0.19, 0.16), (0.46, 0.19, 0.52), (0.5, 0.22, 0.55)]), 'ivory',
            center=(cx, 0, 0))
    for wx in (-0.27, 0.0, 0.27):
        train.box((0.15, 0.01, 0.18), center=(cx + wx, -0.195, 0.36), key='gold_dark')
    canopy = env.arc_band(0.19, 0.23, 1.0, 0, 180, 6)
    env.scale_about(canopy, (1, 1, 0.6))
    env.add(train, canopy, 'gold', center=(cx, 0, 0.55), rot=(0, 0, 90))
    for px in (-0.45, 0.45):
        train.sphere(0.035, center=(cx + px, 0, 0.67), key='gold', subdivisions=0)
    train.lathe([(0.0, 0.66), (0.06, 0.69), (0.04, 0.76), (0.0, 0.8)], center=(cx, 0, 0), key='gold', segments=6)
    for wx in (-0.3, 0.3):
        train.cylinder(0.1, 0.1, 0.4, center=(cx + wx, 0, 0.1), key='gold_dark', segments=8, rot=(90, 0, 0))


for cx in (0.95, -0.15, -1.25, -2.35):
    hearse(cx)
bmesh.ops.scale(train.bm, vec=(TRAIN_SCALE, TRAIN_SCALE, TRAIN_SCALE), verts=train.bm.verts)
asset.mesh('train', train, location=(0, VIA_Y, RAIL_Z))

# ----------------------------------------------------------------- colossal gears (behind the railway)
gear_a = ob.PartBuilder()
env.add(gear_a, env.gear(3.3, 3.75, 28, 0.55, rim_inner=2.7, spokes=6, hub_r=0.55), 'gold')
env.add(gear_a, env.arc_band(0.6, 0.95, 0.7, 0, 360, 12), 'gold_dark')
for i in range(6):  # dark bosses between the spokes
    a = math.radians(30 + i * 60)
    env.add(gear_a, env.arc_band(0.18, 0.32, 0.62, 0, 360, 8), 'gold_dark',
            center=(math.cos(a) * 1.75, 0, math.sin(a) * 1.75))
obj_a = asset.mesh('gear_a', gear_a, location=(-6.4, 1.0, 2.6))
obj_a.rotation_euler = (math.radians(GEAR_TILT), 0, 0)

gear_b = ob.PartBuilder()
env.add(gear_b, env.gear(2.6, 2.98, 22, 0.5, rim_inner=2.1, spokes=5, hub_r=0.45), 'gold')
env.add(gear_b, env.arc_band(0.5, 0.78, 0.62, 0, 360, 12), 'gold_dark')
obj_b = asset.mesh('gear_b', gear_b, location=(6.6, 1.4, 3.4))
obj_b.rotation_euler = (math.radians(GEAR_TILT), 0, 0)

ob.finish(asset, budget_triangles=8000, budget_materials=4,
          notes='Backdrop outside the playable area. Miniature two-tier gold aqueduct/train/procession in front of '
                'two colossal gold gears and a misty cobalt far layer (dome, tower, chimneys, bell) whose bases run '
                'down to z=-4. Gears tilted back 30 deg; rotate each gear part about its local Z (Three.js). '
                'Train slides along X (pivot at rail top z=%.2f, wrap within x=[-17, 17]). Recommended placement: '
                'origin at sim (room_w/2, room_h+3.5), z=-3.1.' % RAIL_Z,
          size=768, ortho_scale=31, pitch_deg=58.0)
