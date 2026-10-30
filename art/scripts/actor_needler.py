"""needler: body-targeting sentry. A ceremonial heron-like station guard: a stepped ivory
plinth with gold bands (static) and a rotating ivory skull-head carrying a long gold
needle forward (-Y), with a swept crest and fins behind so it reads as an arrow from the
high game camera. The bolt socket needler_muzzle sits at the needle tip.

Origin at ground centre (sim radius 0.42). Parts: needler_base (static), needler_head
(pivot on the vertical rotation axis at head height), needler_muzzle (empty child of head).
"""
import math

import oys_blender as ob
from mathutils import Vector

HEAD_Z = 0.62
HEAD_SCALE = 1.25
SEG = 8

asset = ob.Asset('needler')

# --- base (static) -------------------------------------------------------------
base = ob.PartBuilder()
base.cylinder(0.33, 0.31, 0.07, center=(0, 0, 0.035), key='ivory', segments=SEG, rot=(0, 0, 22.5))
# Thin gold band on the plinth's side (not its top) so the base stays quiet from above.
base.cylinder(0.335, 0.335, 0.018, center=(0, 0, 0.03), key='gold', segments=SEG, rot=(0, 0, 22.5))
base.cylinder(0.23, 0.2, 0.07, center=(0, 0, 0.105), key='ivory', segments=SEG, rot=(0, 0, 22.5))
base.cylinder(0.1, 0.07, 0.37, center=(0, 0, 0.325), key='ivory', segments=6)
base.cylinder(0.108, 0.1, 0.035, center=(0, 0, 0.165), key='gold', segments=6)
base.cylinder(0.09, 0.115, 0.05, center=(0, 0, 0.52), key='gold', segments=6)
asset.mesh('base', base)

# --- head (rotates about Z) ------------------------------------------------------
head = ob.PartBuilder()
skull = ob.ico(1.0, 1)
ob.deform(skull, lambda c: Vector((c.x * 0.1, c.y * 0.15 + (0.02 if c.y > 0 else 0.0), c.z * 0.085)))
head.add(skull, 'ivory')
# Black visor band wraps the front of the skull: the "eye" that tracks the courier.
visor = ob.ico(1.0, 1)
ob.deform(visor, lambda c: Vector((c.x * 0.104, c.y * 0.12 - 0.035, c.z * 0.03 + 0.012)))
head.add(visor, 'mask_black')
# Needle: gold collar, long tapering barrel pointing -Y.
head.cylinder(0.05, 0.04, 0.05, center=(0, -0.145, -0.005), key='gold', segments=6, rot=(90, 0, 0))
head.cylinder(0.04, 0.005, 0.4, center=(0, -0.37, -0.005), key='gold', segments=6, rot=(90, 0, 0))
head.cylinder(0.043, 0.043, 0.018, center=(0, -0.18, -0.005), key='mask_black', segments=6, rot=(90, 0, 0))
# Swept crest (in the YZ plane) and two fins angled back: arrow silhouette from above.
crest = ob.prism([(-0.02, 0.06), (0.05, 0.07), (0.27, 0.23), (0.2, 0.13), (0.12, 0.04)], 0.022, 'XZ')
head.add(crest, 'gold', ob.placement((0, 0, 0), (0, 0, 90)))
for sx in (-1, 1):
    fin = ob.prism([(0.0, -0.02), (0.05, 0.01), (0.2, 0.05), (0.16, -0.01)], 0.016, 'XZ')
    head.add(fin, 'gold', ob.placement((sx * 0.07, 0.04, -0.01), (0, 0, 90 + sx * 28)))
# Read at phone size: the head (the part that aims) is scaled up as a whole, baked into the
# mesh so the exported node keeps unit scale.
ob.bmesh.ops.scale(head.bm, vec=Vector((HEAD_SCALE,) * 3), verts=head.bm.verts)
head_obj = asset.mesh('head', head, location=(0, 0, HEAD_Z))
asset.empty('muzzle', location=(0, -0.57 * HEAD_SCALE, -0.005 * HEAD_SCALE), parent=head_obj)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/needler_front.png', size=512, pitch_deg=8.0, view_transform='Standard')
    ob.render_preview(asset, 'art/logs/needler_side.png', size=512, pitch_deg=8.0, yaw_deg=90.0,
                      view_transform='Standard')
    ob.render_preview(asset, 'art/logs/needler_top.png', size=512, pitch_deg=89.0, view_transform='Standard')

if MCP_ARGS.get('dry') == '1':  # noqa: F821
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=2500, budget_materials=3, pitch_deg=58.0, view_transform='Standard',
              notes=('Needler: heron-like ceremonial sentry. Static stepped ivory plinth with thin gold bands; rotating ivory skull head with a black visor band, a long gold needle along -Y '
                     '(art direction == locked attack direction) and a swept crest plus fins behind, so the head '
                     'reads as an arrow from the high game camera. Head scaled 1.25x as a whole (baked into the mesh; node scale 1) '
                     'for phone readability. Bolts spawn visually at needler_muzzle on the needle tip (~0.71 m ahead '
                     'of the rotation axis after scale; the needle intentionally exceeds the 1.3x radius guideline '
                     'because it IS the direction cue).'))
