"""banner_post: tall ivory post with a hanging cobalt pennant edged in ivory (decor kit).

Origin at ground centre; ~2.1 m tall. Nonblocking; place only outside the playable
bounds or on perimeter tiles, preferably on the east/west/north sides: a tall post on
the south edge would rise over the bottom rows in the tilted game camera.

Parts:
  banner_post_post   ivory pole on a gold base, gold collar, crossbar and finial.
  banner_post_cloth  the pennant; its pivot is where it hangs from the crossbar, so the
                     runtime sways it by rotating about local X (Three.js X) a few degrees.
"""
import math

import oys_blender as ob
import oys_env as env

env.clear_composites()
asset = ob.Asset('banner_post')

post = ob.PartBuilder()
env.add_banded_lathe(post, [
    (0.14, 0.0), (0.14, 0.05), (0.095, 0.09), (0.05, 0.12),   # gold base
    (0.04, 1.86),                                               # ivory pole
    (0.065, 1.9), (0.065, 1.95), (0.03, 1.99),                  # gold collar
    (0.05, 2.04), (0.0, 2.12),                                  # gold finial
], ['gold', 'gold', 'gold', 'ivory', 'gold', 'gold', 'gold', 'gold', 'gold'], segments=8)
CROSS_Z = 1.82
post.cylinder(0.018, 0.018, 0.62, center=(0.27, 0, CROSS_Z), key='gold', segments=6, rot=(0, 90, 0))
post.sphere(0.035, center=(0.6, 0, CROSS_Z), key='gold', subdivisions=0)
asset.mesh('post', post)

# Pennant: ivory backing strip slightly wider and thinner than the cobalt face, so an
# ivory edge reads on both sides; a gentle wave makes it cloth rather than a board.
cloth = ob.PartBuilder()
LENGTH = 0.92
n = 8
path = [(0.0, 0.035 * math.sin(i / (n - 1) * math.pi * 1.6), -LENGTH * i / (n - 1)) for i in range(n)]
def widths(w_top: float) -> list[float]:
    return [w_top if i < n - 3 else w_top * (n - 1 - i) / 3 for i in range(n)]
cloth.add(ob.strip(path, widths(0.46), 0.014), 'ivory')
cloth.add(ob.strip(path, widths(0.4), 0.022), 'cobalt')
# Ivory diamond emblem on both faces.
diamond = [(0.0, -0.09), (0.07, 0.0), (0.0, 0.09), (-0.07, 0.0)]
for y in (-0.013, 0.013):
    cloth.prism(diamond, 0.006, center=(0.0, y + 0.035 * math.sin(0.45 / LENGTH * math.pi * 1.6), -0.42), key='ivory',
                plane='XZ')
asset.mesh('cloth', cloth, location=(0.33, 0.0, CROSS_Z - 0.02))

ob.finish(asset, budget_triangles=400, budget_materials=3,
          notes='Nonblocking decor. Pennant part banner_post_cloth hangs from its pivot on the crossbar; sway it '
                'about local X. Prefer east/west/north placements (tall posts on the south edge cover the bottom rows).',
          size=384, ortho_scale=2.6, view_transform='Standard')
