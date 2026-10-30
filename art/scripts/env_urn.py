"""urn: nonblocking ivory funeral urn with gold bands (decor kit).

Origin at ground centre; ~0.84 m tall. Placed only outside the playable bounds or on
perimeter wall tops by the renderer, never as collision. One banded lathe keeps the
silhouette smooth and the triangle count low.
"""
import oys_blender as ob
import oys_env as env

env.clear_composites()
asset = ob.Asset('urn')
pb = ob.PartBuilder()
# Tall, narrow-necked proportions: the 58 degree camera compresses height, so a squat urn
# would read as a stack of lids.
profile = [
    (0.12, 0.0), (0.13, 0.03), (0.07, 0.08), (0.08, 0.11),   # gold foot and stem
    (0.19, 0.24), (0.22, 0.36),                             # ivory belly
    (0.215, 0.39),                                          # gold belt
    (0.16, 0.5), (0.09, 0.6), (0.085, 0.68),                # ivory shoulder and neck
    (0.13, 0.71), (0.12, 0.74),                             # gold rim
    (0.05, 0.78),                                           # ivory lid
    (0.0, 0.84),                                            # gold knob
]
keys = [
    'gold', 'gold', 'gold',
    'ivory', 'ivory',
    'gold',
    'ivory', 'ivory', 'ivory',
    'gold', 'gold',
    'ivory',
    'gold',
]
env.add_banded_lathe(pb, profile, keys, segments=10)
asset.mesh('vessel', pb)

ob.finish(asset, budget_triangles=300, budget_materials=2,
          notes='Nonblocking decor: ivory urn with gold foot, belt, rim and knob. Origin ground centre.',
          size=320, ortho_scale=1.0, view_transform='Standard')
