"""last_warden_body: the final boss, a dark-gold armoured mirror of the courier. Same
grammar as the player (cowl, ivory mask, cloth accent) inverted in value: a tall gold_dark
robe with gold armour, a crowned cowl, an ivory mask framed in gold with vermilion_dark eye
slits, and a vast vermilion_dark mantle falling from the shoulders. A gold funeral staff in
the right hand.

Faces -Y. Origin at ground centre (sim radius ~0.55). Parts:
  last_warden_body_body   pivot at the hips
  last_warden_body_head   pivot at the neck (child of body)
  last_warden_body_mask   child of head, face centre
  last_warden_body_mantle pivot at the shoulders (child of body), for runtime sway
Materials (4): gold_dark, gold, ivory, vermilion_dark.
"""
import math

import oys_blender as ob
from mathutils import Vector

HIP_Z = 0.6
NECK_Z = 1.08
SHOULDER_Z = 1.0
SEG = 10
MASK_TILT = -32.0

asset = ob.Asset('last_warden_body')


def rel(p, z0):
    return (p[0], p[1], p[2] - z0)


# --- body (pivot at hips) -----------------------------------------------------------------
body = ob.PartBuilder()
robe = ob.lathe([(0.43, 0.05), (0.415, 0.18), (0.34, 0.42), (0.27, 0.6), (0.285, 0.78), (0.31, 0.93),
                 (0.235, 1.03), (0.12, 1.09)], SEG)
ob.deform(robe, lambda c: Vector((c.x, c.y * (0.86 if c.z > 0.55 else 1.0), c.z - HIP_Z)))
body.add(robe, 'gold_dark', ob.placement((0, 0, 0), (0, 0, 18)))
# Gold armour: belt, layered breastplate, hem band and a front seam.
body.cylinder(0.282, 0.275, 0.05, center=rel((0, 0, 0.6), HIP_Z), key='gold', segments=SEG, rot=(0, 0, 18))
body.cylinder(0.43, 0.43, 0.035, center=rel((0, 0, 0.06), HIP_Z), key='gold', segments=SEG, rot=(0, 0, 18))
breast = ob.ico(1.0, 2)
ob.deform(breast, lambda c: Vector((c.x * 0.22, min(c.y, 0.2) * 0.12, c.z * 0.17)))
body.add(breast, 'gold', ob.placement(rel((0.0, -0.17, 0.84), HIP_Z)))
body.box((0.05, 0.03, 0.5), center=rel((0.0, -0.355, 0.3), HIP_Z), key='gold', rot=(-17, 0, 0))
# Pauldrons, arms and gauntlets.
for sx in (-1, 1):
    paul = ob.ico(1.0, 2)
    ob.deform(paul, lambda c: Vector((c.x * 0.16, c.y * 0.15, max(c.z, -0.25) * 0.08)))
    body.add(paul, 'gold', ob.placement(rel((sx * 0.29, 0.0, 1.0), HIP_Z), (0, sx * -20, 0)))
    body.tube([rel((sx * 0.29, 0.0, 0.97), HIP_Z), rel((sx * 0.35, -0.03, 0.8), HIP_Z),
               rel((sx * 0.37, -0.09, 0.64), HIP_Z)], [0.075, 0.07, 0.07], key='gold_dark', segments=6)
    body.cylinder(0.08, 0.085, 0.07, center=rel((sx * 0.37, -0.1, 0.62), HIP_Z), key='gold', segments=6)
    body.sphere(0.06, center=rel((sx * 0.37, -0.11, 0.56), HIP_Z), key='gold', subdivisions=1)
    body.box((0.11, 0.2, 0.08), center=rel((sx * 0.11, -0.3, 0.04), HIP_Z), key='gold', bevel=0.02)
# Funeral staff: tall gold shaft topped with a ring and a hanging bell.
body.tube([rel((0.37, -0.11, 0.08), HIP_Z), rel((0.37, -0.11, 1.42), HIP_Z)], [0.024, 0.02], key='gold', segments=6)
staff_ring = ob.plate_with_holes(ob.catmull_rom([(0.11 * math.cos(a), 0.11 * math.sin(a)) for a in
                                                 [2 * math.pi * i / 10 for i in range(10)]], 2),
                                 [list(reversed(ob.catmull_rom([(0.08 * math.cos(a), 0.08 * math.sin(a)) for a in
                                                                [2 * math.pi * i / 10 for i in range(10)]], 2)))],
                                 0.03)
body.add(staff_ring, 'gold', ob.placement(rel((0.37, -0.095, 1.5), HIP_Z)))
body.lathe([(0.0, 0.0), (0.05, 0.005), (0.045, 0.04), (0.03, 0.075), (0.0, 0.085)],
           center=rel((0.37, -0.11, 1.4), HIP_Z), key='gold_dark', segments=8)
body_obj = asset.mesh('body', body, location=(0, 0, HIP_Z))

# --- head (pivot at neck) -----------------------------------------------------------------
head = ob.PartBuilder()
hood = ob.lathe([(0.13, 0.0), (0.2, 0.06), (0.215, 0.14), (0.195, 0.22), (0.13, 0.28), (0.0, 0.305)], SEG)
ob.deform(hood, lambda c: Vector((c.x, c.y + 0.06 + max(0.0, c.z - 0.13) * 0.35, c.z)))
head.add(hood, 'gold_dark', ob.placement((0, 0, 0), (0, 0, 18)))
# Crown: a gold band seated on the cowl with a full ring of spikes, tallest at the front,
# so it reads as a crown from the high game camera.
CROWN_Y, CROWN_Z, CROWN_R = 0.1, 0.25, 0.168
head.cylinder(CROWN_R + 0.012, CROWN_R, 0.05, center=(0.0, CROWN_Y, CROWN_Z), key='gold', segments=SEG,
              rot=(0, 0, 18))
for k in range(7):
    a = math.radians(-90 + k * 360 / 7)
    front = math.cos(math.radians(k * 360 / 7))  # 1 at the front spike, -1 behind
    height = 0.09 + 0.06 * max(front, 0.0)
    x, y = math.cos(a) * CROWN_R, math.sin(a) * CROWN_R + CROWN_Y
    spike = ob.cylinder(0.034, 0.0, height, 4)
    head.add(spike, 'gold', ob.placement((x, y, CROWN_Z + 0.025 + height / 2), (0, 0, 45 + math.degrees(a))))
head_obj = asset.mesh('head', head, location=(0, 0, NECK_Z - HIP_Z), parent=body_obj)

# --- mask (child of head) -------------------------------------------------------------------
mask = ob.PartBuilder()
outline = ob.catmull_rom([(0.0, -0.165), (0.07, -0.13), (0.112, -0.06), (0.128, 0.01), (0.12, 0.08), (0.085, 0.13),
                          (0.0, 0.15), (-0.085, 0.13), (-0.12, 0.08), (-0.128, 0.01), (-0.112, -0.06),
                          (-0.07, -0.13)], subdivisions=2)
CURVE = 1.8


def curve(c):
    return Vector((c.x, c.y + (c.x * c.x) * CURVE, c.z))


# Grid panel (interior vertices) so the face curvature is real, not just at the outline.
face = ob.catmull_rom([(0.006, -0.165), (0.07, -0.13), (0.112, -0.06), (0.128, 0.01), (0.12, 0.08), (0.085, 0.13),
                       (0.006, 0.15)], subdivisions=3, closed=False)
mask.add(ob.deform(ob.symmetric_panel(face, 6, 0.035), curve), 'ivory')
frame = [(x * 1.16, z * 1.13 + 0.005) for x, z in outline]
mask.add(ob.deform(ob.plate_with_holes(frame, [list(reversed(outline))], 0.03),
                   lambda c: Vector((c.x, c.y + 0.012 + (c.x * c.x) * CURVE, c.z))), 'gold')
for sx in (-1, 1):
    ex = sx * 0.062
    mask.box((0.066, 0.02, 0.026), center=(ex, -0.012 + ex * ex * CURVE, 0.03), key='vermilion_dark',
             rot=(0, -sx * 14, 0))
mask.box((0.05, 0.02, 0.012), center=(0.0, -0.012, -0.085), key='vermilion_dark')
mask_obj = asset.mesh('mask', mask, location=(0, -0.16, 0.15), parent=head_obj)
mask_obj.rotation_euler = (math.radians(MASK_TILT), 0, 0)

# --- mantle (pivot at shoulders) ------------------------------------------------------------
mantle = ob.PartBuilder()
mantle.lathe([(0.15, 0.1), (0.25, 0.04), (0.33, -0.03), (0.32, -0.06), (0.2, -0.02)],
             center=(0.0, 0.0, 0.0), key='vermilion_dark', segments=SEG)
mantle.cylinder(0.05, 0.05, 0.03, center=(0.0, -0.3, 0.02), key='gold', segments=8, rot=(90, 0, 0))
# The cape: a curved grid panel that wraps the back and flares out toward the ground.
profile = ob.catmull_rom([(0.27, 0.02), (0.33, -0.25), (0.41, -0.55), (0.5, -0.85), (0.54, -0.95)],
                         subdivisions=3, closed=False)


def cape_shape(c):
    drop = -c.z
    return Vector((c.x, 0.22 + c.y - c.x * c.x * 1.15 + drop * 0.2 + 0.03 * math.sin(c.x * 14) * drop, c.z))


mantle.add(ob.deform(ob.symmetric_panel(profile, 10, 0.03), cape_shape), 'vermilion_dark')
asset.mesh('mantle', mantle, location=(0, 0, SHOULDER_Z - HIP_Z), parent=body_obj)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/lw_front.png', size=512, pitch_deg=8.0, view_transform='Standard')
    ob.render_preview(asset, 'art/logs/lw_side.png', size=512, pitch_deg=8.0, yaw_deg=90.0, view_transform='Standard')

if MCP_ARGS.get('dry') == '1':  # noqa: F821
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=4000, budget_materials=4, pitch_deg=58.0, view_transform='Standard',
              notes=('Last Warden boss body: a dark mirror of the courier. Tall gold_dark robe with gold armour '
                     '(belt, breastplate, pauldrons, gauntlets, sabatons), crowned gold_dark cowl (seven-spike ring), ivory mask in a '
                     'gold frame with vermilion_dark eye slits tipped 32 deg toward the camera, a vermilion_dark '
                     'mantle (curved grid cape) pivoting at the shoulders, and a gold funeral staff with ring and '
                     'bell. Parts: body pivot at hips (z 0.60), head pivot at neck (z 1.08), mask child of head, '
                     'mantle pivot at shoulders (z 1.00).'))
