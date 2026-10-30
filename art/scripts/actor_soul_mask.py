"""soul_mask: the slower soul. Not a second courier: a floating, hollow, crescent-horned
pale-cyan mask with empty almond eyes, over a curling teardrop wisp that reaches down to
the ground.

Faces -Y (toward the game camera). Origin on the ground under the 0.30 sim radius; the
mask floats as a child offset in +Z. Parts: soul_mask_mask (pivot at the mask centre,
~0.64 m), soul_mask_wisp (pivot under the chin, so it can sway).
Materials: soul_glow (mask, saturated emissive cyan), soul_core (wisp and motes, pale emissive).
"""
import math

import oys_blender as ob
from mathutils import Vector

MASK_Z = 0.64
TILT = -30.0  # face tipped up toward the camera

asset = ob.Asset('soul_mask')

# --- mask --------------------------------------------------------------------
right = [(0.0, -0.19), (0.062, -0.17), (0.118, -0.115), (0.152, -0.04), (0.168, 0.035), (0.172, 0.11),
         (0.162, 0.18), (0.14, 0.236), (0.112, 0.272)]  # chin up the right cheek to the inward-curling horn tip
crescent = [(0.1, 0.214), (0.074, 0.156), (0.04, 0.122)]  # concave crescent cut between the horns
control = right + crescent + [(0.0, 0.112)] + [(-x, z) for x, z in reversed(crescent)] + \
    [(-x, z) for x, z in reversed(right[1:])]
outline = ob.catmull_rom(control, subdivisions=3)


def almond(cx, cz, half_w, half_h, tilt_deg, n=14):
    """Almond eye: pointed corners, outer corner drooping for a melancholy look."""
    pts = []
    t = math.radians(tilt_deg)
    for i in range(n):
        a = 2 * math.pi * i / n
        x = half_w * math.cos(a)
        z = half_h * math.sin(a) * (1 - 0.35 * abs(math.cos(a)) ** 3)
        pts.append((cx + x * math.cos(t) - z * math.sin(t), cz + x * math.sin(t) + z * math.cos(t)))
    return pts


eyes = [almond(sx * 0.066, 0.025, 0.046, 0.027, -sx * 12) for sx in (1, -1)]
# Holes must wind opposite to the outline for scanfill; reverse them.
plate = ob.plate_with_holes(outline, [list(reversed(e)) for e in eyes], 0.024)
# Curvature: cheeks sweep back, brow and chin curl back a touch.
ob.deform(plate, lambda c: Vector((c.x, c.y + (c.x * c.x) * 2.6 + (c.z * c.z) * 0.9, c.z)))
mask = ob.PartBuilder()
mask.add(plate, 'soul_glow')
mask_obj = asset.mesh('mask', mask, location=(0, 0, MASK_Z), smooth=False)
mask_obj.rotation_euler = (math.radians(TILT), 0, 0)

# --- wisp ---------------------------------------------------------------------
wisp = ob.PartBuilder()
# A curling teardrop of light hangs from under the chin to the ground point: from the high
# game camera it shows below the mask and ties the floating face to its true ground position.
PIVOT = Vector((0.0, 0.05, MASK_Z - 0.08))
world_path = [(0.0, 0.07, 0.56), (0.03, 0.075, 0.46), (0.05, 0.07, 0.36), (0.022, 0.06, 0.26),
              (-0.035, 0.05, 0.175), (-0.046, 0.04, 0.105), (-0.012, 0.028, 0.042), (0.028, 0.018, 0.006)]
radii = [0.066, 0.09, 0.088, 0.072, 0.054, 0.035, 0.016, 0.0]
wisp.tube([tuple(Vector(p) - PIVOT) for p in world_path], radii, key='soul_core', segments=7)
# Three motes of light drift around the wisp.
for (mx, my, mz), r in (((0.13, 0.02, 0.4), 0.022), ((-0.125, 0.06, 0.27), 0.018), ((0.1, 0.0, 0.13), 0.014)):
    wisp.sphere(r, center=tuple(Vector((mx, my, mz)) - PIVOT), key='soul_core', subdivisions=1)
wisp_obj = asset.mesh('wisp', wisp, location=tuple(PIVOT), smooth=True)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/soul_front.png', size=512, pitch_deg=8.0, view_transform='Standard')
    ob.render_preview(asset, 'art/logs/soul_side.png', size=512, pitch_deg=8.0, yaw_deg=90.0, view_transform='Standard')

if MCP_ARGS.get('dry') == '1':  # noqa: F821
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=2000, budget_materials=2, pitch_deg=58.0, view_transform='Standard',
              notes=('Soul: floating hollow mask with inward-curling crescent horns (soul_glow, saturated cyan, '
                     'emissive 1.2) and open almond eye holes, tipped 30 deg up toward the game camera, over a '
                     'curling teardrop wisp plus three motes (soul_core, pale, emissive 0.6) that reaches down to '
                     'the ground point. Cyan (cool) vs the courier ivory (warm) keeps body and soul apart even at '
                     'a few pixels. Deliberately no body/limbs so it never '
                     'reads as a second courier. Origin on the ground; mask pivot at z 0.64, wisp pivot just under '
                     'and behind the chin for runtime sway; the wisp tip touches the ground at the true soul position. Holes are real geometry (scanfill + solidify), so bolts and '
                     'floor show through the eyes.'))
