"""courier_body: the stolen body. Compact ivory hooded courier with a black-framed ivory
mask, dark boots, a satchel strap and a long vermilion scarf streaming back (+Y) and out.

Faces -Y (toward the game camera). Origin at ground centre under the 0.30 sim radius.
Parts (pivots at hinges): courier_body_body (hips), courier_body_head (neck, child of body),
courier_body_mask (child of head, face centre), courier_body_scarf (neck, child of body).

Proportions are deliberately chibi: the game camera looks down ~58 degrees and the figure
is ~40 px tall on a phone, so the mask is enlarged and tilted up toward the camera.
"""
import math

import oys_blender as ob
from mathutils import Vector

HIP_Z = 0.27
NECK_Z = 0.5
SEG = 8
MASK_TILT = -36.0  # degrees about X; negative tips the face up toward the camera


def rel(p, origin_z):
    return (p[0], p[1], p[2] - origin_z)


asset = ob.Asset('courier_body')

# --- body (pivot at hips) ---------------------------------------------------
body = ob.PartBuilder()
robe = ob.lathe([(0.232, 0.045), (0.222, 0.11), (0.178, 0.235), (0.152, 0.315),
                 (0.165, 0.405), (0.142, 0.47), (0.08, 0.515)], SEG)
ob.deform(robe, lambda c: Vector((c.x, c.y * (0.9 if c.z > 0.28 else 1.0), c.z - HIP_Z)))
body.add(robe, 'ivory', ob.placement((0, 0, 0), (0, 0, 22.5)))
body.cylinder(0.172, 0.165, 0.038, center=rel((0, 0, 0.29), HIP_Z), key='mask_black', segments=SEG,
              rot=(0, 0, 22.5))
for sx in (-1, 1):
    body.box((0.09, 0.17, 0.075), center=rel((sx * 0.078, -0.13, 0.0375), HIP_Z), key='mask_black', bevel=0.014)
for sx in (-1, 1):
    body.tube([(sx * 0.125, 0.0, 0.46), (sx * 0.18, -0.012, 0.37), (sx * 0.198, -0.04, 0.29)],
              [0.05, 0.058, 0.064], key='ivory', segments=6, center=(0, 0, -HIP_Z))
    body.sphere(0.043, center=rel((sx * 0.202, -0.05, 0.255), HIP_Z), key='mask_black', subdivisions=1)
# Courier satchel strap across the chest to a bag on the right hip.
body.box((0.032, 0.024, 0.3), center=rel((0.0, -0.142, 0.37), HIP_Z), key='mask_black', rot=(0, 40, 0))
body.box((0.07, 0.15, 0.11), center=rel((0.205, 0.03, 0.235), HIP_Z), key='mask_black', bevel=0.016)
body_obj = asset.mesh('body', body, location=(0, 0, HIP_Z))

# --- head (pivot at neck) ---------------------------------------------------
head = ob.PartBuilder()
hood = ob.lathe([(0.1, 0.0), (0.176, 0.05), (0.192, 0.12), (0.172, 0.19), (0.115, 0.245), (0.0, 0.275)], SEG)


def hood_shape(c):
    # Cowl: peak pulled back (+Y) and flopped down slightly; hood seated behind the face.
    back = max(0.0, c.z - 0.11) * 0.5
    drop = max(0.0, c.z - 0.2) * 0.3
    return Vector((c.x, c.y + 0.05 + back, c.z - drop))


ob.deform(hood, hood_shape)
head.add(hood, 'ivory', ob.placement((0, 0, 0), (0, 0, 22.5)))
head_obj = asset.mesh('head', head, location=(0, 0, NECK_Z - HIP_Z), parent=body_obj)

# --- mask (child of head, pivot at face centre) -----------------------------
mask = ob.PartBuilder()
outline = [(0.0, -0.125), (0.055, -0.098), (0.088, -0.05), (0.104, 0.008), (0.098, 0.062), (0.066, 0.102),
           (0.0, 0.117), (-0.066, 0.102), (-0.098, 0.062), (-0.104, 0.008), (-0.088, -0.05), (-0.055, -0.098)]
CURVE = 2.2


def curve(c):
    return Vector((c.x, c.y + (c.x * c.x) * CURVE, c.z))


plate = ob.deform(ob.prism(outline, 0.03, 'XZ'), curve)
mask.add(plate, 'ivory')
# Black hood-shadow rim: the same outline 22% larger, just behind the plate.
rim = ob.deform(ob.prism([(u * 1.22, w * 1.18 + 0.006) for u, w in outline], 0.02, 'XZ'),
                lambda c: Vector((c.x, c.y + 0.022 + (c.x * c.x) * CURVE, c.z)))
mask.add(rim, 'mask_black')
for sx in (-1, 1):
    ex = sx * 0.045
    mask.box((0.058, 0.016, 0.024), center=(ex, -0.016 + ex * ex * CURVE, 0.022), key='mask_black', rot=(0, sx * 16, 0))
mask_obj = asset.mesh('mask', mask, location=(0, -0.136, 0.14), parent=head_obj)
mask_obj.rotation_euler = (math.radians(MASK_TILT), 0, 0)

# --- scarf (pivot at neck) ---------------------------------------------------
scarf = ob.PartBuilder()
# Shawl wrapped over the shoulders: overhangs the robe so a vermilion ring shows around the
# mask from the high game camera.
shawl = ob.lathe([(0.105, 0.035), (0.15, 0.0), (0.205, -0.06), (0.215, -0.085), (0.19, -0.1), (0.12, -0.05)], SEG)
ob.deform(shawl, lambda c: Vector((c.x, c.y * 0.94, c.z)))
scarf.add(shawl, 'vermilion', ob.placement((0, 0, 0), (0, 0, 22.5)))
scarf.box((0.085, 0.075, 0.075), center=(0.04, 0.165, -0.04), key='vermilion', bevel=0.016)
# Broad faces turned toward the camera (which looks down ~58 deg from the south) so the
# tails read as cloth, not sticks.
TOWARD_CAMERA = (0.0, -0.53, 0.85)


def tail(side, length, droop, spread, width):
    """A fluttering tail fanning back (+Y), out to one side and down, with a gentle wave."""
    pts, widths = [], []
    n = 7
    for i in range(n):
        f = i / (n - 1)
        pts.append((side * (0.05 + spread * f),
                    0.165 + length * f,
                    -0.045 - droop * f + 0.03 * math.sin(f * math.pi * 2.0)))
        widths.append(width * (1.0 - 0.7 * f) + 0.012)
    return pts, widths


for side, length, droop, spread, width in ((1, 0.2, 0.36, 0.26, 0.13), (-1, 0.14, 0.3, 0.16, 0.115)):
    pts, widths = tail(side, length, droop, spread, width)
    scarf.add(ob.strip(pts, widths, 0.016, up=TOWARD_CAMERA), 'vermilion')
scarf_obj = asset.mesh('scarf', scarf, location=(0, 0, NECK_Z - HIP_Z), parent=body_obj)

if MCP_ARGS.get('views') == '1':  # noqa: F821 - debug renders, not committed
    ob.render_preview(asset, 'art/logs/courier_front.png', size=512, pitch_deg=8.0, view_transform='Standard')
    ob.render_preview(asset, 'art/logs/courier_side.png', size=512, pitch_deg=8.0, yaw_deg=90.0, view_transform='Standard')

if MCP_ARGS.get('dry') == '1':  # noqa: F821 - injected by scripts/blender-mcp.mjs
    print(ob.stats(asset))
else:
    ob.finish(asset, budget_triangles=2000, budget_materials=3, pitch_deg=58.0, view_transform='Standard',
              notes=('Stolen courier body. Ivory robe and cowl, black hood opening framing an enlarged ivory mask '
                     'tilted 36 deg up toward the game camera, slanted eye slits, dark boots/belt/satchel, '
                     'vermilion shawl over the shoulders (rings the mask from above) with two broad tails falling back and out, flat faces turned to the camera so they read as cloth at ~40 px. '
                     'Deviation: 3 materials (ivory, vermilion, mask_black) vs the 1-2 slot guideline; mask_black '
                     'frames the face and breaks the silhouette. Parts: body pivot at hips (z 0.27), head pivot at '
                     'neck (world z 0.50, child of body), mask child of head at the face centre, scarf pivot at the '
                     'neck (child of body) for runtime sway.'))
