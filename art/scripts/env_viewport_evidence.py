"""Frame the live Blender viewport on the courtyard composite for an MCP screenshot.

mode=show: hide the source assets in the viewport, reveal the composite, and set an
orthographic view matching the game camera (58 degree pitch looking +Y), Material
Preview shading. mode=restore: hide the composite again and reveal the sources.
Viewport visibility only; nothing is exported or rendered.
"""
import math

import bpy
from mathutils import Euler

import oys_blender as ob
import oys_env as env

MODE = MCP_ARGS.get('mode', 'show')  # noqa: F821
TAG = 'courtyard_composite'

for obj in bpy.context.view_layer.objects:
    is_composite = obj.get(env.COMPOSITE_TAG) == TAG
    is_source = obj.get(ob.ASSET_TAG) is not None
    if MODE == 'show':
        if is_composite:
            obj.hide_set(False)
        elif is_source:
            obj.hide_set(True)
    else:
        if is_composite:
            obj.hide_set(True)
        elif is_source:
            obj.hide_set(False)

framed = 0
if MODE == 'show':
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != 'VIEW_3D':
                continue
            space = area.spaces.active
            r3d = space.region_3d
            r3d.view_perspective = 'ORTHO'
            r3d.view_rotation = Euler((math.radians(90 - 58), 0, 0)).to_quaternion()
            r3d.view_location = (4.0, 9.5, 0.0)
            r3d.view_distance = 13.5
            space.shading.type = 'MATERIAL'
            space.overlay.show_floor = False
            space.overlay.show_axis_x = False
            space.overlay.show_axis_y = False
            framed += 1
print({'mode': MODE, 'framed_viewports': framed})
