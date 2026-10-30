"""floor_tile: one cobalt courtyard flagstone, instanced across every room.

Origin at the lower-left grid corner; occupies [0,1] x [0,1]; top surface at z = 0.
A chamfered top edge plus a 0.02 m gap between neighbours draws fine grout lines
without textures. One material (cobalt); the renderer varies tone per tile.
"""
import oys_blender as ob
import oys_env as env

env.clear_composites()
asset = ob.Asset('floor_tile')
pb = ob.PartBuilder()
# Slab body down to z=-0.1 (hidden below neighbours), chamfer 0.035 wide over the top 0.03.
env.add(pb, env.rect_lathe([
    (0.49, 0.49, -0.10),
    (0.49, 0.49, -0.03),
    (0.455, 0.455, 0.0),
]), 'cobalt', center=(0.5, 0.5, 0.0))
asset.mesh('slab', pb)

ob.finish(asset, budget_triangles=60, budget_materials=1,
          notes='Chamfered flagstone; neighbours leave a 0.02 m V-groove grout line. Renderer should place a '
                'dark cobalt_deep base plane slightly below z=-0.03 so grout reads at phone size.',
          size=384, ortho_scale=1.6)
