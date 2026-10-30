"""threshold_inlay: 2 x 1 ground inlay marking the exit zone in front of the gate.

Origin at the lower-left corner; occupies [0,2] x [0,1]; top at z = 0.002 (bottom at
z = 0) so it sits just above the floor tiles without z-fighting. All regions are
coplanar and NON-overlapping (each emblem piece exactly fills a hole cut in the ivory
field), so the inlay never z-fights with itself either.

Pattern: gold border frame; ivory field; at the centre the gate's ring emblem (gold
ring, left half filled gold_dark, right half open: the sign of body and soul that only
completes at the gate); a pair of gold_dark double chevrons on each side pointing
north (+Y) toward the gate. It makes the exit read differently from interior walls.
"""
import math

import oys_blender as ob
import oys_env as env

T = 0.002
CX, CY = 1.0, 0.5
R_OUT, R_IN, R_DISC = 0.27, 0.19, 0.12
SEG = 20

env.clear_composites()
asset = ob.Asset('threshold_inlay')
pb = ob.PartBuilder()


def circle(r: float, n: int = SEG, cx: float = CX, cy: float = CY):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def left_half_disc(r: float, n: int = SEG // 2):
    pts = [(CX + r * math.cos(math.radians(90 + 180 * i / n)), CY + r * math.sin(math.radians(90 + 180 * i / n)))
           for i in range(n + 1)]
    return pts


def chevron(cx: float, y0: float):
    return [(cx - 0.22, y0 - 0.1), (cx, y0 + 0.1), (cx + 0.22, y0 - 0.1),
            (cx + 0.22, y0), (cx, y0 + 0.2), (cx - 0.22, y0)]


outer = [(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)]
inner = [(0.07, 0.07), (1.93, 0.07), (1.93, 0.93), (0.07, 0.93)]
chevrons = [chevron(cx, y0) for cx in (0.45, 1.55) for y0 in (0.28, 0.55)]
ring_out, ring_in, disc = circle(R_OUT), circle(R_IN), left_half_disc(R_DISC)

pb.add(ob.plate_with_holes(outer, [inner], T, plane='XY'), 'gold')
pb.add(ob.plate_with_holes(inner, [ring_out, ring_in, disc, *chevrons], T, plane='XY'), 'ivory')
pb.add(ob.plate_with_holes(ring_out, [ring_in], T, plane='XY'), 'gold')
pb.add(ob.plate_with_holes(disc, [], T, plane='XY'), 'gold_dark')
for c in chevrons:
    pb.add(ob.plate_with_holes(c, [], T, plane='XY'), 'gold_dark')
asset.mesh('inlay', pb)

ob.finish(asset, budget_triangles=800, budget_materials=3,
          notes='Exit-zone ground inlay, [0,2]x[0,1], bottom z=0, top z=0.002; coplanar non-overlapping regions '
                '(holes cut in the ivory field are filled exactly by the emblem pieces). Gate ring emblem plus '
                'north-pointing double chevrons.',
          size=512, ortho_scale=2.4, view_transform='Standard')
