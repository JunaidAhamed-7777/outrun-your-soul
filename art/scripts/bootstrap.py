"""Open a dedicated authoring file and start the pinned official Blender MCP bridge.

Run in a NEW Blender GUI process (the bridge cannot serve commands in --background):

  blender --factory-startup --python art/scripts/bootstrap.py -- \
      --root <repo or worktree root> --addon <path to pinned addon.py> \
      --port 9876 --blend actors.blend

Safety: verifies the add-on SHA-256 against the pinned upstream, binds to 127.0.0.1
only, leaves telemetry consent off (the add-on fails closed without preferences),
and disables every third-party asset/generation integration. Never run this in a
user's existing scene: it refuses a process that already has a file open or edits.
"""
import argparse
import hashlib
import importlib.util
import pathlib
import sys

import bpy

PINNED_ADDON_SHA256 = '8e193a249e2ed1262f3e794ee2254efd8e3d1f0224385245f2b989154c837083'
PINNED_UPSTREAM = 'ahujasid/blender-mcp@febcd90ece59c3416d7c55fd3723cea46bcaa59d (add-on 1.8)'
SESSION_MARKER = 'oys_asset_session'

parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True, help='Repository or worktree root')
parser.add_argument('--addon', required=True, help='Pinned upstream addon.py')
parser.add_argument('--port', type=int, default=9876)
parser.add_argument('--blend', default='outrun_assets.blend', help='Plain file name under art/source')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

root = pathlib.Path(args.root).resolve()
addon_path = pathlib.Path(args.addon).resolve()
if bpy.data.filepath or bpy.data.is_dirty:
    raise RuntimeError('bootstrap needs an untouched --factory-startup process; refusing to touch an open scene')
digest = hashlib.sha256(addon_path.read_bytes()).hexdigest()
if digest != PINNED_ADDON_SHA256:
    raise RuntimeError(f'add-on hash {digest} does not match pinned {PINNED_UPSTREAM}')
if pathlib.Path(args.blend).name != args.blend or not args.blend.endswith('.blend'):
    raise RuntimeError('--blend must be a plain .blend file name (stored under art/source)')
if not 1024 <= args.port <= 65535:
    raise RuntimeError('--port must be an unprivileged TCP port')

blend_path = root / 'art' / 'source' / args.blend
blend_path.parent.mkdir(parents=True, exist_ok=True)
if blend_path.exists():
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    if not bpy.context.scene.get(SESSION_MARKER):
        raise RuntimeError(f'{blend_path} lacks the {SESSION_MARKER} marker; refusing to author into it')
else:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.name = 'OutrunAssetAuthoring'
    scene[SESSION_MARKER] = True
    scene['oys_root'] = str(root)
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.context.scene['oys_root'] = str(root)

spec = importlib.util.spec_from_file_location('oys_blender_mcp_addon', addon_path)
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
addon.register()
scene = bpy.context.scene
scene.blendermcp_auto_start_server = False
for name in (
    'blendermcp_use_polyhaven', 'blendermcp_use_hyper3d', 'blendermcp_use_sketchfab',
    'blendermcp_use_hunyuan3d', 'blendermcp_use_polypizza', 'blendermcp_use_meshy',
    'blendermcp_use_tripo',
):
    if hasattr(scene, name):
        setattr(scene, name, False)
server = addon.BlenderMCPServer(host='127.0.0.1', port=args.port)
bpy.types.blendermcp_server = server
server.start()
print('OYS_BLENDER_MCP_READY', bpy.app.version_string, str(blend_path), args.port, flush=True)
