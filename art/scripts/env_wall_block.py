"""wall_block: one low courtyard wall module (1 x 1 footprint, ~0.55 m tall).

Origin at the lower-left grid corner. Nothing protrudes outside [0,1] x [0,1], so
rows and columns tile seamlessly and the visual edge equals the collision rect.
Kept low on purpose: the tilted game camera looks north, so tall walls would hide
actors standing behind them (an actor kept 0.3 m away by its collision radius loses
at most ~0.07 m of its feet behind a 0.55 m wall at a 58 degree camera pitch).

Readability first: the camera sees mostly a wall's top, and walls are the one thing
the player must never misjudge, so the top is a light coping stone that separates
sharply from the cobalt floor ("cobalt walls, ivory coping"). Chamfered coping edges
catch the sun and a slight crown gives the top two tones, so a run of blocks reads as
dressed stone rather than flat slabs; the inset navy body shows joints between blocks.
"""
import oys_blender as ob
import oys_env as env

STYLE = MCP_ARGS.get('style', 'coping')  # noqa: F821 - provided by scripts/blender-mcp.mjs

H_PLINTH = 0.06
H_BODY = 0.44
H_TOP = 0.55

env.clear_composites()
asset = ob.Asset('wall_block')
pb = ob.PartBuilder()
c = (0.5, 0.5, 0.0)
# Plinth: full footprint with a small chamfer.
env.add(pb, env.rect_lathe([(0.5, 0.5, 0.0), (0.5, 0.5, H_PLINTH - 0.012), (0.488, 0.488, H_PLINTH)]),
        'wall_body', center=c)
# Body: inset 0.02 so neighbouring blocks show a fine vertical joint.
env.add(pb, env.rect_lathe([(0.48, 0.48, H_PLINTH), (0.48, 0.48, H_BODY)], cap_bottom=False, cap_top=False),
        'wall_body', center=c)
# Coping stone: full footprint, chamfered all round, gently crowned towards the centre.
env.add(pb, env.rect_lathe([
    (0.484, 0.484, H_BODY),
    (0.5, 0.5, H_BODY + 0.016),
    (0.5, 0.5, H_TOP - 0.035),
    (0.468, 0.468, H_TOP - 0.012),
    (0.30, 0.30, H_TOP),
], cap_bottom=True, cap_top=True), 'wall_cap', center=c)
asset.mesh('block', pb)

ob.finish(asset, budget_triangles=150, budget_materials=2,
          notes='Low wall module, visual footprint exactly [0,1]^2. Navy wall_body plinth/body (inset 0.02 for '
                'joints) under a chamfered, slightly crowned ivory wall_cap coping stone. Chosen after composite '
                'iterations: navy tops blended into the floor; framed tops read as UI tiles.',
          size=384, ortho_scale=1.8)
