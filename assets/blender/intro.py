"""Opening intro models: Ojiichan's little propeller plane and his letter.

Intro_Plane  root empty; Intro_Plane_Body (fuselage, wings, tail, open cockpit) and Intro_Prop
             (propeller, pivot on the hub, spins about the plane's forward axis = glTF +Z).
             Faces -Y in Blender (+Z after export). Ojiichan (Customer_O) is seated in it at
             runtime: the cockpit rim is at SEAT_RIM_Z, his feet go at SEAT_Z.
Intro_Letter the folded letter with an apple wax seal, lying flat, pivot at its centre.
"""
import math
from lib import MB, T, empty, parent, emblem, align_z

AXIS_Z = 0.45        # fuselage centre line height
LENGTH = 2.6         # tail to nose
SEAT_Y = 0.05        # cockpit centre along the body (Blender Y; nose is -Y)
SEAT_RIM_Z = 0.86    # top of the hull at the cockpit
SEAT_Z = 0.22        # where Ojiichan's feet go (keeps his chest above the rim)


def build_plane():
    root = empty('Intro_Plane')
    b = MB()
    # Fuselage: a lathe from tail (z=0) to nose (z=LENGTH), turned so the nose points -Y.
    prof = [(0.0, 0.0), (0.07, 0.02), (0.2, 0.55), (0.36, 1.2), (0.42, 1.75), (0.41, 2.2),
            (0.36, 2.42), (0.33, 2.5), (0.2, 2.6), (0.0, 2.63)]
    mats = ['M_AppleRed'] * 6 + ['M_JuiceGold', 'M_JuiceGold', 'M_JuiceGold']
    b.lathe(prof, 14, loc=(0, LENGTH / 2, AXIS_Z), rot=(90, 0, 0), mats=mats)
    # A cream belly stripe along each side.
    for s in (-1, 1):
        b.box((0.03, 1.7, 0.09), (s * 0.405, -0.25, AXIS_Z - 0.05), 'M_Cream')
    # Open cockpit: a padded rim and a little windscreen.
    b.torus(0.3, 0.05, 14, 6, (0, SEAT_Y, SEAT_RIM_Z - 0.03), 'M_WoodDark', scale=(1, 1.15, 0.6))
    b.box((0.46, 0.03, 0.2), (0, SEAT_Y - 0.42, SEAT_RIM_Z + 0.06), 'M_Glass', rot=(-25, 0, 0))
    # Wings: low, chunky, cream with red tips.
    b.box((3.4, 0.72, 0.08), (0, -0.25, AXIS_Z - 0.26), 'M_Cream', bevel=0.025)
    for s in (-1, 1):
        b.box((0.3, 0.74, 0.09), (s * 1.62, -0.25, AXIS_Z - 0.26), 'M_AppleRed', bevel=0.025)
    # Tail: stabiliser and fin, with the stall's apple on both sides of the fin.
    b.box((1.2, 0.36, 0.05), (0, 1.12, AXIS_Z + 0.04), 'M_Cream', bevel=0.015)
    b.box((0.06, 0.5, 0.6), (0, 1.12, AXIS_Z + 0.36), 'M_Cream', rot=(-18, 0, 0), bevel=0.015)
    for s in (-1, 1):
        emblem(b, align_z((s, 0, 0), (s * 0.032, 1.16, AXIS_Z + 0.42)), 0.3, 0.012, 'M_AppleRed', 'M_Leaf', 'M_WoodDark')
    # Wheels on struts.
    for s in (-1, 1):
        b.box((0.05, 0.05, 0.3), (s * 0.45, -0.3, 0.2), 'M_WoodDark', rot=(0, s * 15, 0))
        b.cyl(0.12, 0.12, 0.08, 10, (s * 0.5, -0.3, 0.12), 'M_Black', rot=(0, 90, 0))
        b.cyl(0.05, 0.05, 0.09, 8, (s * 0.5, -0.3, 0.12), 'M_Cream', rot=(0, 90, 0))
    b.cyl(0.05, 0.05, 0.05, 8, (0, 1.25, AXIS_Z - 0.12), 'M_Black', rot=(0, 90, 0))
    body = b.build('Intro_Plane_Body')
    parent(body, root)
    # Propeller: two blades and a spinner, pivot on the hub.
    hub = (0, -LENGTH / 2 - 0.06, AXIS_Z)
    p = MB()
    p.box((0.09, 0.025, 1.24), hub, 'M_WoodDark', rot=(0, 20, 0))
    p.cyl(0.1, 0.0, 0.18, 10, (hub[0], hub[1] - 0.06, hub[2]), 'M_JuiceGold', rot=(90, 0, 0))
    prop = p.build('Intro_Prop', pivot=hub)
    parent(prop, root)
    return root


def build_letter():
    l = MB()
    w, h = 0.5, 0.34
    l.box((w, h, 0.012), (0, 0, 0.006), 'M_Paper', bevel=0.003)
    # Envelope flap, a shade warmer, folded down to the seal.
    l.prism([(-w / 2, h / 2), (w / 2, h / 2), (0, -0.03)], 0.004, T((0, 0, 0.012)), 'M_Cream')
    # Red wax seal with the stall's cream apple pressed in it.
    l.cyl(0.055, 0.055, 0.01, 12, (0, -0.03, 0.017), 'M_AppleRed')
    emblem(l, T((0, -0.032, 0.022)), 0.07, 0.004, 'M_Cream')
    # The same on the back, so it reads whichever way it lands while it tumbles.
    l.cyl(0.055, 0.055, 0.008, 12, (0, 0.0, -0.004), 'M_AppleRed')
    return l.build('Intro_Letter')


def build_intro():
    build_plane()
    build_letter()


ROOTS = ['Intro_Plane', 'Intro_Letter']
