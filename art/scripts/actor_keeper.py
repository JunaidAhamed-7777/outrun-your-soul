"""keeper: soul-targeting sentry. A crooked bone-white gallows post stands behind (+Y) the
enemy's position; its arm reaches over the centre where a broad hexagonal gold-framed
lantern with pale cobalt glass hangs from a hook. A gold lens spout on the lantern's
front (-Y) shows where it is aiming; keeper_muzzle sits in that spout.

Silhouette is deliberately unlike the needler (wide, hanging, roofed vs narrow, pointed).
Origin at ground centre (sim radius 0.42). Parts: keeper_base (static post, arm, hook),
keeper_head (lantern; pivot on the vertical rotation axis at lantern centre),
keeper_muzzle (empty child of head).
"""
import math

import oys_blender as ob
from mathutils import Vector

LANTERN_Z = 0.5
LANTERN_SCALE = 1.25
FOOT = (0.14, 0.3)
HEX = 6

asset = ob.Asset('keeper')

# --- base: foot, crooked post, arm, chain (static) ---------------------------------
base = ob.PartBuilder()
fx, fy = FOOT
base.cylinder(0.15, 0.12, 0.07, center=(fx, fy, 0.035), key='ivory', segments=8, rot=(0, 0, 22.5))
base.cylinder(0.155, 0.155, 0.016, center=(fx, fy, 0.03), key='gold', segments=8, rot=(0, 0, 22.5))
# Crooked post stands back-right so it peeks out beside the lantern from the high camera.
post = [(fx, fy, 0.05), (fx + 0.03, fy + 0.01, 0.3), (fx - 0.02, fy, 0.56), (fx + 0.01, fy - 0.04, 0.82),
        (fx - 0.02, fy - 0.1, 0.97), (0.07, 0.11, 1.03), (0.02, 0.03, 1.04), (0.0, 0.0, 1.0)]
base.tube(post, [0.058, 0.052, 0.048, 0.044, 0.04, 0.036, 0.032, 0.03], key='ivory', segments=6)
# A knuckle where the arm bends, and a gold strut bracing it.
base.sphere(0.058, center=(fx - 0.02, fy - 0.1, 0.96), key='ivory', subdivisions=1)
base.tube([(fx, fy - 0.05, 0.76), (0.05, 0.08, 1.02)], [0.016, 0.016], key='gold', segments=5)
# Hook from the arm tip down to the lantern's finial ring (static: the lantern turns beneath it).
base.cylinder(0.022, 0.022, 0.05, center=(0.0, 0.0, 0.975), key='gold', segments=5)
asset.mesh('base', base)

# --- head: the lantern (rotates about Z) ------------------------------------------------
head = ob.PartBuilder()
head.cylinder(0.14, 0.18, 0.05, center=(0, 0, -0.16), key='gold', segments=HEX)         # base cap
head.cylinder(0.15, 0.15, 0.25, center=(0, 0, -0.01), key='cobalt_mist', segments=HEX)  # glass body
for k in range(HEX):                                                                 # frame bars
    a = 2 * math.pi * k / HEX
    head.box((0.03, 0.03, 0.27), center=(math.cos(a) * 0.152, math.sin(a) * 0.152, -0.01), key='gold',
             rot=(0, 0, math.degrees(a)))
head.cylinder(0.17, 0.17, 0.03, center=(0, 0, 0.125), key='gold', segments=HEX)         # top band
head.cylinder(0.21, 0.02, 0.13, center=(0, 0, 0.205), key='gold', segments=HEX)         # flared roof
head.cylinder(0.03, 0.03, 0.05, center=(0, 0, 0.29), key='gold', segments=5)           # finial stem
ring = ob.tube([(0.0, 0.0, 0.31), (0.025, 0.0, 0.335), (0.0, 0.0, 0.36), (-0.025, 0.0, 0.335), (0.0, 0.0, 0.31)],
               [0.009] * 5, segments=4)
head.add(ring, 'gold')
# Lens spout on the front face: the aiming cue. A hood with a darker recessed lens.
head.cylinder(0.075, 0.06, 0.1, center=(0, -0.185, -0.01), key='gold', segments=8, rot=(90, 0, 0))
head.cylinder(0.05, 0.05, 0.02, center=(0, -0.232, -0.01), key='cobalt_mist', segments=8, rot=(90, 0, 0))
# Broad silhouette at phone size: scale baked into the mesh so the node keeps unit scale.
ob.bmesh.ops.scale(head.bm, vec=Vector((LANTERN_SCALE,) * 3), verts=head.bm.verts)
head_obj = asset.mesh('head', head, location=(0, 0, LANTERN_Z))
asset.empty('muzzle', location=(0, -0.25 * LANTERN_SCALE, -0.01 * LANTERN_SCALE), parent=head_obj)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/keeper_front.png', size=512, pitch_deg=8.0, view_transform='Standard')
    ob.render_preview(asset, 'art/logs/keeper_side.png', size=512, pitch_deg=8.0, yaw_deg=90.0,
                      view_transform='Standard')

if MCP_ARGS.get('dry') == '1':  # noqa: F821
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=2500, budget_materials=3, pitch_deg=58.0, view_transform='Standard',
              notes=('Keeper: soul-hunting lantern sentry. Static bone-white crooked gallows post standing back-right '
                     '(+X/+Y) of the enemy position with a gold brace and hook; the rotating head is a broad '
                     'hexagonal lantern (gold frame, flared roof, pale cobalt_mist glass; 1.25x baked) hung over the centre, with '
                     'a gold lens spout on its -Y face as the aim cue and keeper_muzzle inside it. Glass uses '
                     'cobalt_mist (non-emissive periwinkle) so it never matches the emissive cyan soul. Wide/hanging/'
                     'roofed silhouette vs the narrow pointed needler.'))
