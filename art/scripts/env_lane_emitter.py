"""lane_emitter: gold funeral machinery that projects a persistent violet lane.

Mounted in place of one perimeter wall tile. Origin at the lower-left grid corner,
footprint exactly [0,1] x [0,1] (like wall_block), height <= 0.9 m. The lane leaves
through the open trough on the -Y face; `lane_emitter_aperture` (an empty) marks where
the runtime-drawn lane emerges. Rotate the model about the tile centre (0.5, 0.5) so
the aperture faces along the lane.

The violet glass rod is the only gameplay colour here: it IS the lane signal. It sits
in an open-topped trough so the fixed, tilted camera sees it at every yaw (a slot in a
vertical face would vanish whenever the emitter faces sideways). Everything else is
architecture gold: a gold_dark housing and a drum with toothed gear flanges, so the
device reads as part of the funeral railway rather than an enemy.
"""
import math

import oys_blender as ob
import oys_env as env

env.clear_composites()
asset = ob.Asset('lane_emitter')
pb = ob.PartBuilder()
C = (0.5, 0.5, 0.0)

# Plinth over the full footprint.
env.add(pb, env.rect_lathe([(0.5, 0.5, 0.0), (0.5, 0.5, 0.05), (0.485, 0.485, 0.065)]), 'gold_dark', center=C)
# Trough: low gold front lip and cheeks; the glass rod lies between lip and housing.
pb.box((0.94, 0.08, 0.15), center=(0.5, 0.06, 0.065 + 0.075), key='gold')
for x in (0.055, 0.945):
    pb.box((0.08, 0.3, 0.25), center=(x, 0.17, 0.065 + 0.125), key='gold')
pb.cylinder(0.075, 0.075, 0.8, center=(0.5, 0.19, 0.2), key='lane_violet', segments=8, rot=(0, 90, 0))
# Gold reflector plate on the housing front, behind the rod.
pb.box((0.82, 0.03, 0.3), center=(0.5, 0.315, 0.065 + 0.17), key='gold')
# Rear housing with a chamfered top.
env.add(pb, env.rect_lathe([(0.46, 0.32, 0.065), (0.46, 0.32, 0.4), (0.43, 0.29, 0.43)]), 'gold_dark',
        center=(0.5, 0.65, 0.0))
# Drum on top of the housing, axle along X, with two gold straps.
DRUM_Z = 0.6
pb.cylinder(0.17, 0.17, 0.66, center=(0.5, 0.65, DRUM_Z), key='gold', segments=12, rot=(0, 90, 0))
for x in (0.34, 0.66):
    pb.cylinder(0.185, 0.185, 0.035, center=(x, 0.65, DRUM_Z), key='gold_dark', segments=12, rot=(0, 90, 0))
# Toothed gear flanges at both drum ends.
for x in (0.13, 0.87):
    pb.cylinder(0.22, 0.22, 0.05, center=(x, 0.65, DRUM_Z), key='gold_dark', segments=12, rot=(0, 90, 0))
    for i in range(8):
        a = 22.5 + i * 45
        dy, dz = math.cos(math.radians(a)) * 0.235, math.sin(math.radians(a)) * 0.235
        pb.box((0.05, 0.06, 0.05), center=(x, 0.65 + dy, DRUM_Z + dz), key='gold_dark', rot=(a, 0, 0))
# Crown finial on the drum.
env.add_banded_lathe(pb, [(0.0, DRUM_Z + 0.16), (0.06, DRUM_Z + 0.18), (0.045, DRUM_Z + 0.23), (0.07, DRUM_Z + 0.26),
                          (0.0, DRUM_Z + 0.3)], ['gold', 'gold', 'gold', 'gold'], center=(0.5, 0.65, 0.0), segments=6)
asset.mesh('body', pb)
asset.empty('aperture', location=(0.5, 0.0, 0.2))

ob.finish(asset, budget_triangles=600, budget_materials=3,
          notes='Replaces one perimeter wall tile; footprint exactly [0,1]^2, height <= 0.9 m. Aperture empty at the '
                'front (-Y) face, rod height 0.2 m; rotate about the tile centre (0.5, 0.5) so it faces the lane. '
                'lane_violet glass rod sits in an open-topped trough so the tilted camera sees it at any yaw.',
          size=384, ortho_scale=1.7, view_transform='Standard')
