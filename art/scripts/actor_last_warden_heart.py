"""last_warden_heart: the Last Warden's slower, vulnerable heart, the boss's mirror of the
player's soul. A faceted vermilion heart held in a floating gold birdcage-lantern, with
ember sparks and a gold_dark chain falling to a small ground anchor that marks its true
position. Warm ember-gold, never the cyan of the player's soul.

Faces -Y. Origin on the ground. Parts:
  last_warden_heart_cage  pivot at the heart centre (~0.70 m), includes chain and anchor
  last_warden_heart_core  child of cage, pivot at the heart centre (pulse/spin at runtime)
Materials (4): gold, gold_dark, vermilion, vermilion_dark.
"""
import math

import oys_blender as ob
from mathutils import Vector

HEART_Z = 0.7
BARS = 8
TILT = -34.0

asset = ob.Asset('last_warden_heart')

# --- cage (pivot at heart centre) --------------------------------------------------------
cage = ob.PartBuilder()
cage.lathe([(0.0, 0.29), (0.03, 0.28), (0.062, 0.245), (0.07, 0.225), (0.05, 0.215), (0.0, 0.218)],
           key='gold', segments=BARS)                                            # small crown cap (heart visible from above)
cage.lathe([(0.0, -0.215), (0.1, -0.2), (0.115, -0.185), (0.08, -0.165), (0.0, -0.17)],
           key='gold', segments=BARS)                                            # bottom cap
for k in range(BARS):
    a = 2 * math.pi * (k + 0.5) / BARS
    path = []
    for i in range(7):
        f = i / 6
        z = 0.225 - 0.41 * f
        r = 0.06 + 0.035 * f + 0.11 * math.sin(math.pi * f)
        path.append((math.cos(a) * r, math.sin(a) * r, z))
    cage.tube(path, [0.012] * 7, key='gold', segments=4)
equator = [(0.19 * math.cos(2 * math.pi * i / 24), 0.19 * math.sin(2 * math.pi * i / 24)) for i in range(24)]
cage.add(ob.plate_with_holes(equator, [list(reversed([(x * 0.9, y * 0.9) for x, y in equator]))], 0.02,
                             plane='XY'), 'gold', ob.placement((0.0, 0.0, 0.0)))
cage.cylinder(0.02, 0.0, 0.12, center=(0.0, 0.0, 0.36), key='gold', segments=4)     # finial
# Ember sparks orbiting the cage.
for (x, y, z), r in (((0.24, -0.04, 0.12), 0.022), ((-0.22, 0.05, -0.05), 0.018), ((0.15, 0.12, -0.2), 0.015),
                     ((-0.12, -0.1, 0.24), 0.014)):
    cage.sphere(r, center=(x, y, z), key='vermilion_dark', subdivisions=1)
# Chain to a ground anchor (true position marker).
top = -0.215
n_links = 7
for i in range(n_links):
    z = top - 0.03 - i * (HEART_Z + top - 0.06) / (n_links - 1) * 1.0
    if z < -HEART_Z + 0.05:
        break
    size = (0.014, 0.04, 0.055) if i % 2 == 0 else (0.04, 0.014, 0.055)
    cage.box(size, center=(0.0, 0.0, z), key='gold_dark')
cage.cylinder(0.075, 0.06, 0.025, center=(0.0, 0.0, -HEART_Z + 0.0125), key='gold_dark', segments=BARS)
cage.cylinder(0.03, 0.03, 0.05, center=(0.0, 0.0, -HEART_Z + 0.05), key='gold_dark', segments=6)
cage_obj = asset.mesh('cage', cage, location=(0.0, 0.0, HEART_Z))

# --- core: the heart (child of cage) ---------------------------------------------------------
core = ob.PartBuilder()
for sx in (-1, 1):
    core.sphere(0.084, center=(sx * 0.058, 0.0, 0.035), key='vermilion', subdivisions=1, scale=(1.0, 0.75, 1.0))
point = ob.cylinder(0.003, 0.136, 0.17, 8)
ob.deform(point, lambda c: Vector((c.x, c.y * 0.72, c.z)))
core.add(point, 'vermilion', ob.placement((0.0, 0.0, -0.05), (0, 0, 22.5)))
# A darker cleft and a gold rivet: reads as a sealed reliquary heart.
core.box((0.022, 0.05, 0.06), center=(0.0, -0.032, 0.07), key='vermilion_dark')
core.sphere(0.02, center=(0.0, -0.075, 0.0), key='gold', subdivisions=1)
core_obj = asset.mesh('core', core, location=(0.0, 0.0, 0.0), parent=cage_obj)
core_obj.rotation_euler = (math.radians(TILT), 0, 0)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/lwh_front.png', size=512, pitch_deg=8.0, view_transform='Standard')

if MCP_ARGS.get('dry') == '1':  # noqa: F821
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=2000, budget_materials=4, pitch_deg=58.0, view_transform='Standard',
              notes=('Last Warden heart: floating gold birdcage-lantern (small crown cap so the heart reads from above, domed base, eight bowed bars, equator '
                     'ring, finial) holding a faceted vermilion heart with a vermilion_dark cleft and gold rivet, '
                     'four vermilion_dark ember sparks, and a gold_dark chain to a ground anchor that marks the '
                     'true position (the boss counterpart of the player soul wisp, in warm ember-gold, never cyan). '
                     'Cage pivot at the heart centre (z 0.70); core is a child at the same pivot for pulse/spin.'))
