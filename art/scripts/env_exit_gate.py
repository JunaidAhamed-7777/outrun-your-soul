"""exit_gate: ceremonial funeral-railway gate that opens only for the reunited pair.

Origin at the ground centre of the 2-tile opening (x in [-1, 1]); the opening faces -Y.
Parts:
  exit_gate_frame       ivory pillars with gold capitals, squashed elliptical arch,
                        recessed tympanum with a gold sun-wheel, keystone and finials.
  exit_gate_door_left   leaf hinged at x = -1 (pivot), spanning to the centre line.
  exit_gate_door_right  leaf hinged at x = +1 (pivot), spanning to the centre line.
Doors are closed in the export; the runtime rotates each leaf about its pivot's
vertical axis. Each leaf carries half of a gold ring emblem (the left half filled,
the right half open), so the sign is only whole when both leaves meet.
"""
import math

import oys_blender as ob
import oys_env as env

DOOR_H = 1.34
CAP_LO, CAP_HI = 1.26, 1.4
ARCH_SQUASH = 0.46
PX = 1.23  # pillar centre |x|

asset = ob.Asset('exit_gate')

# ---------------------------------------------------------------- frame
fr = ob.PartBuilder()
for sx in (-1, 1):
    px = sx * PX
    env.add(fr, env.rect_lathe([(0.21, 0.19, 0.0), (0.21, 0.19, 0.11), (0.185, 0.165, 0.15)]), 'ivory', center=(px, 0, 0))
    env.add(fr, env.rect_lathe([(0.165, 0.145, 0.15), (0.15, 0.13, CAP_LO)], cap_bottom=False), 'ivory', center=(px, 0, 0))
    # Gold inlay strip on the camera-facing shaft face.
    fr.box((0.05, 0.012, 0.86), center=(px, -0.142, 0.7), key='gold')
    env.add(fr, env.rect_lathe([(0.15, 0.13, CAP_LO), (0.2, 0.17, CAP_LO + 0.07), (0.2, 0.17, CAP_HI - 0.025),
                                (0.18, 0.15, CAP_HI)]), 'gold', center=(px, 0, 0))
    # Pillar finials: small gold urn + orb.
    fr.cylinder(0.07, 0.11, 0.08, center=(px, 0, CAP_HI + 0.04), key='gold', segments=8)
    fr.sphere(0.075, center=(px, 0, CAP_HI + 0.15), key='gold', subdivisions=1)
# Lintel over the doors.
fr.box((2.06, 0.16, 0.07), center=(0, 0, DOOR_H + 0.035), key='gold')
# Squashed elliptical arch springing from the capitals.
arch = env.arc_band(1.0, 1.2, 0.18, 0, 180, 16)
env.scale_about(arch, (1, 1, ARCH_SQUASH))
env.add(fr, arch, 'ivory', center=(0, 0, CAP_HI))
# Recessed tympanum (shadowed gold) filling the arch above the lintel.
tymp = [(math.cos(math.radians(a)) * 1.0, CAP_HI + math.sin(math.radians(a)) * 1.0 * ARCH_SQUASH)
        for a in range(0, 181, 15)]
tymp = [(1.0, DOOR_H + 0.07)] + tymp + [(-1.0, DOOR_H + 0.07)]
fr.prism(tymp, 0.06, center=(0, 0.05, 0), key='gold_dark', plane='XZ')
# Sun-wheel emblem in the tympanum.
wheel_c = (0, 0.0, CAP_HI + 0.17)
env.add(fr, env.arc_band(0.07, 0.105, 0.04, 0, 360, 16), 'gold', center=wheel_c)
for i in range(8):
    a = i * 45
    ray = ob.box((0.06, 0.03, 0.02))
    env.add(fr, ray, 'gold', center=(wheel_c[0] + math.cos(math.radians(a)) * 0.15, wheel_c[1],
                                       wheel_c[2] + math.sin(math.radians(a)) * 0.15), rot=(0, -a, 0))
# Keystone and crowning finial.
arch_top = CAP_HI + 1.2 * ARCH_SQUASH
env.add(fr, env.rect_lathe([(0.1, 0.1, arch_top - 0.14), (0.13, 0.12, arch_top + 0.06)]), 'gold', center=(0, 0, 0))
fr.cylinder(0.05, 0.09, 0.06, center=(0, 0, arch_top + 0.09), key='gold', segments=8)
fr.sphere(0.085, center=(0, 0, arch_top + 0.2), key='gold', subdivisions=1)
fr.cylinder(0.025, 0.0, 0.14, center=(0, 0, arch_top + 0.33), key='gold', segments=6)
# Threshold sill flush with the floor.
fr.box((2.0, 0.3, 0.025), center=(0, 0, 0.0125), key='ivory')
asset.mesh('frame', fr)


# ---------------------------------------------------------------- doors
def leaf(side: int) -> ob.PartBuilder:
    """side -1: left leaf (pivot at x=-1, geometry towards +x); +1: right leaf."""
    pb = ob.PartBuilder()
    d = -side  # direction from hinge towards the centre line
    mid = d * 0.5
    pb.box((0.975, 0.05, DOOR_H - 0.03), center=(mid, 0, 0.015 + (DOOR_H - 0.03) / 2), key='ivory')
    front = -0.029
    # Gold rails and stiles on the camera-facing side.
    for z in (0.06, DOOR_H * 0.5, DOOR_H - 0.05):
        pb.box((0.93, 0.014, 0.045), center=(mid, front, z), key='gold')
    for x in (d * 0.045, d * 0.955):
        pb.box((0.045, 0.014, DOOR_H - 0.07), center=(x, front, DOOR_H / 2), key='gold')
    # Half of the emblem, centred on the meeting line (local x = d * 1.0).
    centre = (d * 1.0, front - 0.006, DOOR_H * 0.72)
    if side < 0:
        env.add(pb, env.arc_band(0.11, 0.17, 0.02, 90, 270, 8), 'gold', center=centre)
        half_disc = [(-math.sin(math.radians(a)) * 0.075, math.cos(math.radians(a)) * 0.075) for a in range(0, 181, 30)]
        pb.prism(half_disc, 0.02, center=centre, key='gold', plane='XZ')
    else:
        env.add(pb, env.arc_band(0.11, 0.17, 0.02, -90, 90, 8), 'gold', center=centre)
    # Ring pull near the meeting edge.
    env.add(pb, env.arc_band(0.035, 0.05, 0.015, 0, 360, 10), 'gold_dark', center=(d * 0.86, front - 0.012, DOOR_H * 0.42))
    return pb


asset.mesh('door_left', leaf(-1), location=(-1.0, 0, 0))
asset.mesh('door_right', leaf(1), location=(1.0, 0, 0))

ob.finish(asset, budget_triangles=2500, budget_materials=3,
          notes='Gate origin at the ground centre of the 2-tile opening; doors closed, hinged at x=-1/+1 '
                '(rotate about the pivot vertical axis to open). Frame pillars occupy |x| in [1.02, 1.44], '
                'depth |y| <= 0.19, so they stand on the perimeter wall tiles beside the opening. '
                'Each leaf carries half of the ring emblem (left filled, right open).',
          size=512, ortho_scale=3.4)
