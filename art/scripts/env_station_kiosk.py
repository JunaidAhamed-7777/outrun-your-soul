"""station_kiosk: the "Signal House", the safe railway station between rooms.

Shown behind the draft UI. Origin at the ground centre of the house; faces -Y.
An ivory booth with gold pilasters, an arched ticket/signal window with a counter,
a clock pediment, a cobalt ogee roof, an open gold belfry with a bell, and a
semaphore signal mast on its right (+X).

Parts:
  station_kiosk_house       everything static (house, roof, belfry frame, mast).
  station_kiosk_bell        pivot where it hangs in the belfry; swing about local X
                            (Three.js X) when a draft choice is confirmed.
  station_kiosk_signal_arm  pivot on the mast; exported horizontal ("stop"). Rotate about
                            local Z in Three.js (Blender local Y, the pivot pin) by about
                            -40 degrees to lower it to "clear" when the player departs.
No gameplay colours: ivory, gold, gold_dark and cobalt only (the spectacle glass is ivory).
"""
import math

import oys_blender as ob
import oys_env as env

env.clear_composites()
asset = ob.Asset('station_kiosk')
house = ob.PartBuilder()

BODY_HX, BODY_HY = 0.65, 0.5
BODY_TOP = 1.48
FRONT = -BODY_HY

# Plinth and front step.
env.add(house, env.rect_lathe([(0.95, 0.78, 0.0), (0.95, 0.78, 0.1), (0.9, 0.73, 0.14)]), 'ivory')
house.box((0.86, 0.2, 0.07), center=(0, -0.88, 0.035), key='ivory')
# Booth body, gold corner pilasters with gold capitals.
env.add(house, env.rect_lathe([(BODY_HX, BODY_HY, 0.14), (BODY_HX, BODY_HY, BODY_TOP)], cap_bottom=False), 'ivory')
for sx in (-1, 1):
    for sy in (-1, 1):
        house.box((0.11, 0.11, BODY_TOP - 0.14), center=(sx * BODY_HX, sy * BODY_HY, (BODY_TOP + 0.14) / 2), key='gold')
# Cornice.
env.add(house, env.rect_lathe([(0.68, 0.53, BODY_TOP), (0.73, 0.58, BODY_TOP + 0.05), (0.73, 0.58, BODY_TOP + 0.1)]),
        'gold')
ROOF_Z = BODY_TOP + 0.1
# Arched ticket window: dark recess, gold arch frame, jambs, mullions, counter ledge.
SPRING = 0.98
WIN_R = 0.3
outline = [(-WIN_R, 0.62), (WIN_R, 0.62)] + [
    (WIN_R * math.cos(math.radians(a)), SPRING + WIN_R * math.sin(math.radians(a))) for a in range(0, 181, 18)
] + [(-WIN_R, 0.62)]
outline = outline[:-1]
house.prism(outline, 0.02, center=(0, FRONT - 0.005, 0), key='gold_dark', plane='XZ')
env.add(house, env.arc_band(WIN_R, WIN_R + 0.06, 0.05, 0, 180, 10), 'gold', center=(0, FRONT - 0.02, SPRING))
for sx in (-1, 1):
    house.box((0.06, 0.05, SPRING - 0.6), center=(sx * (WIN_R + 0.03), FRONT - 0.02, (SPRING + 0.6) / 2), key='gold')
house.box((0.025, 0.02, 0.66), center=(0, FRONT - 0.02, 0.95), key='gold')
house.box((2 * WIN_R, 0.02, 0.025), center=(0, FRONT - 0.02, SPRING), key='gold')
house.box((0.86, 0.17, 0.05), center=(0, FRONT - 0.07, 0.6), key='gold')
# Side portholes.
for sx in (-1, 1):
    env.add(house, env.arc_band(0.09, 0.13, 0.03, 0, 360, 12), 'gold', center=(sx * (BODY_HX + 0.01), 0.05, 1.02),
            rot=(0, 0, 90))
    house.cylinder(0.09, 0.09, 0.02, center=(sx * (BODY_HX + 0.005), 0.05, 1.02), key='gold_dark', segments=12,
                   rot=(0, 90, 0))
# Clock pediment standing on the eave, in front of the roof: ivory half-disc, gold edging,
# dark face, gold hands.
PED_Z = ROOF_Z + 0.03
PED_Y = -0.73
house.box((0.86, 0.18, 0.04), center=(0, PED_Y + 0.06, ROOF_Z + 0.01), key='gold')
house.prism([(0.36 * math.cos(math.radians(a)), PED_Z + 0.36 * math.sin(math.radians(a))) for a in range(0, 181, 15)],
            0.08, center=(0, PED_Y, 0), key='ivory', plane='XZ')
env.add(house, env.arc_band(0.36, 0.41, 0.09, 0, 180, 12), 'gold', center=(0, PED_Y, PED_Z))
CLOCK = (0, PED_Y - 0.05, PED_Z + 0.17)
env.add(house, env.arc_band(0.13, 0.165, 0.03, 0, 360, 16), 'gold', center=CLOCK)
house.cylinder(0.13, 0.13, 0.02, center=(CLOCK[0], CLOCK[1] + 0.005, CLOCK[2]), key='gold_dark', segments=16,
               rot=(90, 0, 0))
house.box((0.018, 0.01, 0.1), center=(CLOCK[0], CLOCK[1] - 0.01, CLOCK[2] + 0.045), key='gold')
house.box((0.016, 0.01, 0.075), center=(CLOCK[0] + 0.03, CLOCK[1] - 0.012, CLOCK[2] + 0.02), key='gold', rot=(0, -55, 0))
# Steep cobalt ogee roof (its slopes must catch different light from the high camera) over a
# gold eave band.
env.add(house, env.rect_lathe([(0.84, 0.69, ROOF_Z), (0.84, 0.69, ROOF_Z + 0.04)]), 'gold')
env.add(house, env.rect_lathe([(0.82, 0.67, ROOF_Z + 0.04), (0.7, 0.56, ROOF_Z + 0.22), (0.5, 0.39, ROOF_Z + 0.52),
                               (0.31, 0.23, ROOF_Z + 0.8), (0.24, 0.18, ROOF_Z + 0.88)]), 'cobalt')
env.add(house, env.rect_lathe([(0.715, 0.575, ROOF_Z + 0.19), (0.7, 0.562, ROOF_Z + 0.235)]), 'gold')
BELFRY_Z = ROOF_Z + 0.88
env.add(house, env.rect_lathe([(0.24, 0.2, BELFRY_Z), (0.24, 0.2, BELFRY_Z + 0.04)]), 'gold')
# Open belfry: four posts, gold cupola and finial.
for sx in (-1, 1):
    for sy in (-1, 1):
        house.box((0.035, 0.035, 0.36), center=(sx * 0.19, sy * 0.15, BELFRY_Z + 0.04 + 0.18), key='gold')
CUP_Z = BELFRY_Z + 0.4
env.add_banded_lathe(house, [(0.26, CUP_Z), (0.26, CUP_Z + 0.04), (0.2, CUP_Z + 0.12), (0.11, CUP_Z + 0.2),
                             (0.04, CUP_Z + 0.25), (0.05, CUP_Z + 0.29), (0.0, CUP_Z + 0.44)],
                     ['gold'] * 6, segments=8)
# Signal mast with ladder rungs and finial (static); the arm is a separate part.
MAST_X = 1.2
env.add(house, env.rect_lathe([(0.11, 0.11, 0.0), (0.11, 0.11, 0.12), (0.06, 0.06, 0.18)]), 'gold_dark',
        center=(MAST_X, 0, 0))
house.cylinder(0.04, 0.032, 2.75, center=(MAST_X, 0, 0.18 + 1.375), key='gold_dark', segments=6)
for i in range(9):
    house.box((0.16, 0.02, 0.02), center=(MAST_X, -0.07, 0.45 + i * 0.24), key='gold')
house.sphere(0.06, center=(MAST_X, 0, 2.98), key='gold', subdivisions=1)
asset.mesh('house', house)

# Bell, hanging in the belfry (pivot at its yoke).
bell = ob.PartBuilder()
env.add_banded_lathe(bell, [(0.12, -0.24), (0.105, -0.21), (0.08, -0.14), (0.07, -0.07), (0.045, -0.03),
                            (0.0, -0.015)], ['gold'] * 5, segments=12)
bell.sphere(0.028, center=(0, 0, -0.25), key='gold_dark', subdivisions=0)
bell.box((0.2, 0.03, 0.03), center=(0, 0, 0.0), key='gold_dark')
asset.mesh('bell', bell, location=(0, 0, CUP_Z - 0.02))

# Semaphore arm, pivoting on the mast; horizontal ("stop") in the export.
arm = ob.PartBuilder()
arm.box((0.64, 0.025, 0.11), center=(0.38, 0, 0), key='ivory')
arm.box((0.07, 0.03, 0.115), center=(0.58, 0, 0), key='gold_dark')
env.add(arm, env.arc_band(0.05, 0.075, 0.025, 0, 360, 10), 'gold', center=(-0.12, 0, -0.02))
arm.cylinder(0.05, 0.05, 0.015, center=(-0.12, 0, -0.02), key='ivory', segments=10, rot=(90, 0, 0))
arm.box((0.2, 0.02, 0.03), center=(-0.04, 0, -0.01), key='gold')
arm.cylinder(0.03, 0.03, 0.06, center=(0, 0, 0), key='gold', segments=8, rot=(90, 0, 0))
asset.mesh('signal_arm', arm, location=(MAST_X, -0.07, 2.62))

ob.finish(asset, budget_triangles=3000, budget_materials=4,
          notes='Signal House station kiosk, faces -Y, origin at the house ground centre (mast at x=+1.2). '
                'Animatable parts: station_kiosk_bell (swing about local X) and station_kiosk_signal_arm '
                '(rotate about local Z in Three.js, ~-40 deg to lower to clear).',
          size=640, ortho_scale=3.6, view_transform='Standard')
