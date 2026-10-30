"""calibration_tile: one-unit grid tile with an arrow pointing Blender +Y (simulation north,
screen up). Disposable fixture to verify scale, axes and pivots in the browser; excluded
from release builds (exported to art/exports, not public/)."""
import oys_blender as ob

asset = ob.Asset('calibration_tile')
tile = ob.PartBuilder()
# Floor slab occupying [0,1] x [0,1], top at z = 0 (origin at lower-left grid corner).
tile.box((0.98, 0.98, 0.06), center=(0.5, 0.5, -0.03), key='cobalt')
# Arrow: shaft and head pointing +Y.
tile.box((0.12, 0.5, 0.04), center=(0.5, 0.4, 0.02), key='ivory')
tile.prism([(-0.22, 0.0), (0.22, 0.0), (0.0, 0.26)], 0.04, center=(0.5, 0.65, 0.02), key='vermilion', plane='XY')
# Origin post at the min corner so the pivot is visible.
tile.cylinder(0.05, 0.05, 0.3, center=(0.0, 0.0, 0.15), key='gold', segments=6)
asset.mesh('slab', tile)

measured = ob.stats(asset)
export = ob.export_glb(asset, 'art/exports/calibration_tile.glb')
preview = ob.render_preview(asset, size=384)
ob.write_report(asset, measured, export, budget_triangles=200, budget_materials=4,
                notes='Disposable axis/scale fixture. Arrow must point screen-up in the game camera.',
                preview=preview)
ob.save()
print(measured, export, preview)
