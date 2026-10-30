"""warden: frontal guard with announced openings. A broad armoured ivory/gold statue-sentry
on a heavy plinth, holding a tall curved tower shield in front (-Y) and a gold glaive at
its right side. Behind the shield, a vermilion-dark core sits in the chest: hidden from
the front while the shield is up, exposed when the runtime lowers the shield.

Origin at ground centre (sim radius ~0.5). Parts:
  warden_base   static plinth
  warden_body   rotates about Z toward the warden's facing (pivot on the axis at plinth top)
  warden_shield child of body; pivot on its lower hinge. Runtime lowers it by rotating
                about local X with a POSITIVE angle (top swings forward/down, -Y then -Z).
  warden_core   child of body; the chest core (visible when the shield is lowered)
  warden_muzzle empty child of body at the frontal sweep origin
Materials: ivory, gold, vermilion_dark (visor slit + core).
"""
import math

import oys_blender as ob
from mathutils import Vector

BODY_Z = 0.14            # plinth top: body pivot height
HINGE = (0.0, -0.37, 0.2)  # world position of the shield's lower hinge
SEG = 8

asset = ob.Asset('warden')


def rel(p, origin):
    return (p[0] - origin[0], p[1] - origin[1], p[2] - origin[2])


BODY_O = (0.0, 0.0, BODY_Z)

# --- base (static) -------------------------------------------------------------------
base = ob.PartBuilder()
base.cylinder(0.47, 0.44, 0.1, center=(0, 0, 0.05), key='ivory', segments=SEG, rot=(0, 0, 22.5))
base.cylinder(0.475, 0.475, 0.022, center=(0, 0, 0.045), key='gold', segments=SEG, rot=(0, 0, 22.5))
base.cylinder(0.33, 0.31, 0.045, center=(0, 0, 0.12), key='ivory', segments=SEG, rot=(0, 0, 22.5))
asset.mesh('base', base)

# --- body (rotates) --------------------------------------------------------------------
body = ob.PartBuilder()
armour = ob.lathe([(0.31, 0.14), (0.3, 0.28), (0.25, 0.42), (0.27, 0.55), (0.285, 0.68), (0.235, 0.79),
                   (0.12, 0.845)], SEG)
ob.deform(armour, lambda c: Vector((c.x, c.y * 0.86, c.z - BODY_Z)))
body.add(armour, 'ivory', ob.placement((0, 0, 0), (0, 0, 22.5)))
body.cylinder(0.262, 0.255, 0.04, center=rel((0, 0, 0.43), BODY_O), key='gold', segments=SEG, rot=(0, 0, 22.5))
# Faulds: overlapping skirt plates give the lower armour rhythm.
for k in range(SEG):
    a = math.radians(22.5 + 45 * k)
    body.box((0.17, 0.035, 0.15), center=rel((math.cos(a) * 0.3, math.sin(a) * 0.3 * 0.86, 0.22), BODY_O),
             key='gold' if k % 2 else 'ivory', rot=(-8, 0, math.degrees(a) + 90))
# Pauldrons with gold rims.
for sx in (-1, 1):
    paul = ob.ico(1.0, 2)
    ob.deform(paul, lambda c: Vector((c.x * 0.15, c.y * 0.14, max(c.z, -0.3) * 0.075)))
    body.add(paul, 'ivory', ob.placement(rel((sx * 0.29, 0.0, 0.775), BODY_O), (0, sx * -18, 0)))
    body.box((0.27, 0.24, 0.022), center=rel((sx * 0.3, 0.0, 0.752), BODY_O), key='gold', rot=(0, sx * -18, 0))
# Arms: left reaches to the shield grip, right holds the glaive.
body.tube([rel((-0.3, 0.0, 0.73), BODY_O), rel((-0.31, -0.12, 0.58), BODY_O), rel((-0.2, -0.27, 0.5), BODY_O)],
          [0.075, 0.07, 0.065], key='ivory', segments=6)
body.tube([rel((0.3, 0.0, 0.73), BODY_O), rel((0.36, -0.04, 0.6), BODY_O), rel((0.37, -0.11, 0.5), BODY_O)],
          [0.075, 0.07, 0.065], key='ivory', segments=6)
body.sphere(0.06, center=rel((0.37, -0.12, 0.49), BODY_O), key='gold', subdivisions=1)
# Glaive: gold shaft and a curved blade.
body.tube([rel((0.37, -0.12, 0.16), BODY_O), rel((0.37, -0.12, 0.98), BODY_O)], [0.02, 0.018], key='gold', segments=6)
blade = ob.prism(ob.catmull_rom([(0.0, 0.0), (0.06, 0.05), (0.08, 0.16), (0.04, 0.28), (0.0, 0.33),
                                 (0.015, 0.2), (0.0, 0.1)], subdivisions=2), 0.016, 'XZ')
body.add(blade, 'gold', ob.placement(rel((0.37, -0.12, 0.95), BODY_O), (0, 0, 90)))
# Helm: crested, with a narrow vermilion-dark visor slit facing -Y.
helm = ob.lathe([(0.11, 0.84), (0.14, 0.88), (0.145, 0.95), (0.12, 1.0), (0.06, 1.03), (0.0, 1.04)], SEG)
ob.deform(helm, lambda c: Vector((c.x, c.y * 1.05, c.z - BODY_Z)))
body.add(helm, 'ivory', ob.placement((0, 0, 0), (0, 0, 22.5)))
body.box((0.19, 0.04, 0.03), center=rel((0.0, -0.13, 0.94), BODY_O), key='vermilion_dark')
body.box((0.03, 0.04, 0.08), center=rel((0.0, -0.135, 0.9), BODY_O), key='gold')
crest = ob.prism(ob.catmull_rom([(-0.1, 0.0), (-0.02, 0.07), (0.1, 0.12), (0.22, 0.08), (0.16, 0.03),
                                 (0.08, -0.01)], subdivisions=2), 0.03, 'XZ')
body.add(crest, 'gold', ob.placement(rel((0.0, 0.0, 1.0), BODY_O), (0, 0, 90)))
# Gold frame ring around the chest recess (the core part sits inside it).
ring = ob.plate_with_holes(ob.catmull_rom([(0.12 * math.cos(a), 0.13 * math.sin(a)) for a in
                                           [2 * math.pi * i / 10 for i in range(10)]], 2),
                           [list(reversed(ob.catmull_rom([(0.08 * math.cos(a), 0.09 * math.sin(a)) for a in
                                                          [2 * math.pi * i / 10 for i in range(10)]], 2)))], 0.04)
body.add(ring, 'gold', ob.placement(rel((0.0, -0.255, 0.62), BODY_O)))
body_obj = asset.mesh('body', body, location=BODY_O)

# --- core (child of body; exposed when the shield lowers) ------------------------------
core = ob.PartBuilder()
gem = ob.ico(1.0, 0)
ob.deform(gem, lambda c: Vector((c.x * 0.075, c.y * 0.04, c.z * 0.095)))
core.add(gem, 'vermilion_dark')
core.sphere(0.028, center=(0.0, -0.03, 0.0), key='gold', subdivisions=1)
asset.mesh('core', core, location=rel((0.0, -0.24, 0.62), BODY_O), parent=body_obj)

# --- shield (child of body; pivot at the lower hinge) ---------------------------------
shield = ob.PartBuilder()
outline = ob.catmull_rom([(0.0, -0.02), (0.18, 0.04), (0.31, 0.18), (0.335, 0.42), (0.315, 0.64), (0.22, 0.77),
                          (0.0, 0.82), (-0.22, 0.77), (-0.315, 0.64), (-0.335, 0.42), (-0.31, 0.18),
                          (-0.18, 0.04)], subdivisions=3)
CURVE = 0.75


def curve(c):
    return Vector((c.x, c.y + c.x * c.x * CURVE, c.z))


# The face is a grid panel (interior vertices) so the curvature bends the whole surface.
right = ob.catmull_rom([(0.02, -0.02), (0.18, 0.04), (0.31, 0.18), (0.335, 0.42), (0.315, 0.64), (0.22, 0.77),
                        (0.02, 0.82)], subdivisions=3, closed=False)
plate = ob.deform(ob.symmetric_panel(right, 8, 0.045), curve)
shield.add(plate, 'ivory')
inner = [(x * 0.86, 0.06 + z * 0.86) for x, z in outline]
rim = ob.deform(ob.plate_with_holes(outline, [list(reversed(inner))], 0.06),
                lambda c: Vector((c.x, c.y - 0.012 + c.x * c.x * CURVE, c.z)))
shield.add(rim, 'gold')
# Sun emblem: disc and eight rays, proud of the face.
shield.add(ob.deform(ob.plate_with_holes(ob.catmull_rom([(0.075 * math.cos(a), 0.075 * math.sin(a)) for a in
                                                         [2 * math.pi * i / 8 for i in range(8)]], 2), [], 0.03),
                     lambda c: Vector((c.x, c.y - 0.02, c.z + 0.42))), 'gold')
for k in range(8):
    a = 2 * math.pi * k / 8
    shield.box((0.028, 0.025, 0.11), center=(math.cos(a) * 0.135, -0.022 + (math.cos(a) * 0.135) ** 2 * CURVE,
                                             0.42 + math.sin(a) * 0.135),
               key='gold', rot=(0, -math.degrees(a) + 90, 0))
# Back grip straps follow the curve; when the shield is lowered the camera sees this side.
for z in (0.3, 0.55):
    path = [(x, 0.06 + x * x * CURVE, z) for x in (-0.21, -0.105, 0.0, 0.105, 0.21)]
    shield.add(ob.strip(path, [0.05] * 5, 0.03, up=(0.0, 1.0, 0.0)), 'gold')
shield.box((0.06, 0.04, 0.32), center=(0.0, 0.075, 0.43), key='gold')
shield_obj = asset.mesh('shield', shield, location=rel(HINGE, BODY_O), parent=body_obj)
asset.empty('muzzle', location=rel((0.0, -0.5, 0.26), BODY_O), parent=body_obj)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/warden_front.png', size=512, pitch_deg=8.0, view_transform='Standard')
    ob.render_preview(asset, 'art/logs/warden_side.png', size=512, pitch_deg=8.0, yaw_deg=90.0,
                      view_transform='Standard')
if MCP_ARGS.get('lowered') == '1':  # noqa: F821 - preview the exposed window, then restore
    shield_obj.rotation_euler = (math.radians(80), 0, 0)
    ob.render_preview(asset, 'art/previews/warden-exposed-game-camera.png', size=512, pitch_deg=58.0,
                      view_transform='Standard')
    shield_obj.rotation_euler = (0, 0, 0)

if MCP_ARGS.get('dry') == '1':  # noqa: F821
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=4000, budget_materials=3, pitch_deg=58.0, view_transform='Standard',
              notes=('Warden: broad armoured ivory/gold statue-sentry on a heavy plinth; tall curved tower shield '
                     'with gold rim and sun emblem in front (-Y); crested helm with a vermilion_dark visor slit; gold '
                     'glaive at the right side. warden_shield pivots on its lower hinge (world 0, -0.37, 0.20): a '
                     'POSITIVE local-X rotation lowers it forward (80 deg shown in warden-exposed-game-camera.png). '
                     'warden_core (vermilion_dark gem in a gold ring, chest height 0.62) is hidden from the game '
                     'camera by the raised shield and exposed when it lowers. warden_muzzle at the frontal sweep '
                     'origin (0, -0.5, 0.26).'))
