"""lamp_post: gold railway lamp with an ivory (lit) globe (decor kit).

Origin at ground centre; ~1.75 m tall. Nonblocking; place only outside the playable
bounds or on perimeter tiles (gate sides look best). The tilted game camera sees lamps
mostly from above, where a boxed lantern's roof hides its glass, so the light is an
open ivory globe held by a gold crown. The ladder crossarm is a railway lamp detail.
The globe is ivory, never a gameplay colour.
"""
import math

import oys_blender as ob
import oys_env as env

env.clear_composites()
asset = ob.Asset('lamp_post')
pb = ob.PartBuilder()
# Base, post, collar and globe tray in one banded lathe.
env.add_banded_lathe(pb, [
    (0.13, 0.0), (0.13, 0.05), (0.08, 0.1), (0.06, 0.2),   # gold_dark base
    (0.035, 1.34),                                         # gold post
    (0.06, 1.38), (0.09, 1.42), (0.075, 1.44),             # gold cup holding the globe
], ['gold_dark', 'gold_dark', 'gold_dark', 'gold', 'gold', 'gold', 'gold'], segments=6)
# Ladder crossarm.
pb.box((0.4, 0.03, 0.03), center=(0, 0, 1.28), key='gold_dark')
# Ivory globe and an open gold crown over it.
GLOBE_Z = 1.54
pb.sphere(0.115, center=(0, 0, GLOBE_Z), key='ivory', subdivisions=1)
for i in range(4):
    a = math.radians(45 + i * 90)
    pb.box((0.018, 0.018, 0.17), center=(math.cos(a) * 0.1, math.sin(a) * 0.1, GLOBE_Z + 0.06), key='gold',
           rot=(0, 0, 45 + i * 90))
env.add_banded_lathe(pb, [(0.07, GLOBE_Z + 0.14), (0.09, GLOBE_Z + 0.16), (0.03, GLOBE_Z + 0.19), (0.0, GLOBE_Z + 0.23)],
                     ['gold', 'gold', 'gold'], segments=6)
asset.mesh('lamp', pb)

ob.finish(asset, budget_triangles=300, budget_materials=3,
          notes='Nonblocking decor: gold railway lamp with an ivory globe in an open gold crown (readable from the '
                'tilted camera), ladder crossarm. Origin ground centre.',
          size=320, ortho_scale=2.1, view_transform='Standard')
