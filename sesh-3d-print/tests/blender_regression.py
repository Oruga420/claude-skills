"""Offline Blender integration: synthetic organic figurine and mounting plate.

Run only in a separate factory-startup background Blender process.
Writes a NEW explicitly named directory, never a user's current scene.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from blender_export_stl import export_object
from stl_audit import read_stl, audit


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def exported(obj, path, expected_dims):
    before = len(obj.modifiers)
    exported_info = export_object(obj, path, 1)
    triangles, _ = read_stl(path)
    report = audit(triangles, 1)
    check(len(obj.modifiers) == before, "Export changed modifier stack")
    check(not report["has_topology_findings"], "Unexpected topology findings")
    check(report["edge_component_count"] == 1, "Expected one connected surface")
    check(report["components"][0]["signed_volume_mm3"] > 0, "Expected outward surface")
    check(all(abs(a-b) < .001 for a, b in zip(report["dimensions_mm"], expected_dims)), "Dimensions changed")
    check(report["dimensions_mm"] == exported_info["dimensions_mm"], "Export report does not match bytes")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    check(bpy.app.background and "--factory-startup" in sys.argv and "--disable-autoexec" in sys.argv,
          "Separate background factory process with autoexec disabled required")
    args.output_dir.mkdir(parents=False, exist_ok=False)
    # Only this fresh test scene is cleared; the script rejects interactive mode.
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # Organic revolved mushroom: contiguous surface, printable-looking only.
    # No claim about supports, wall strength or physical fabrication is made.
    import math
    rings = [(0, 9), (2, 10), (22, 7), (28, 8), (28, 22), (32, 24), (40, 20), (47, 10)]
    n = 64
    verts = [(0, 0, 0)]
    for z, radius in rings:
        verts.extend((radius * math.cos(2*math.pi*i/n), radius * math.sin(2*math.pi*i/n), z) for i in range(n))
    verts.append((0, 0, 50))
    faces = [(0, 1 + (i+1) % n, 1+i) for i in range(n)]
    for ring in range(len(rings)-1):
        first, nxt = 1+ring*n, 1+(ring+1)*n
        faces.extend((first+i, first+(i+1)%n, nxt+(i+1)%n, nxt+i) for i in range(n))
    top = len(verts)-1
    last = 1+(len(rings)-1)*n
    faces.extend((last+i, last+(i+1)%n, top) for i in range(n))
    mesh = bpy.data.meshes.new("MushroomGeometry")
    mesh.from_pydata(verts, [], faces)
    figure = bpy.data.objects.new("Figure", mesh)
    bpy.context.collection.objects.link(figure)
    figure_report = exported(figure, args.output_dir / "figure.stl", [48, 48, 50])

    # Functional plate, explicit synthetic dimensions, through hole via modifier.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(80, 0, 2))
    plate = bpy.context.object
    plate.name = "MountingPlate"
    plate.scale = (40, 24, 4)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=3, depth=10, location=(80, 0, 2))
    cutter = bpy.context.object
    cutter.name = "HoleCutter"
    boolean = plate.modifiers.new("ThroughHole", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    cutter.hide_render = True
    cutter.display_type = "WIRE"
    plate_report = exported(plate, args.output_dir / "plate.stl", [40, 24, 4])
    expected_volume = 40*24*4 - (64 * 3*3 * math.sin(2*math.pi/64)/2) * 4
    check(abs(plate_report["components"][0]["signed_volume_mm3"] - expected_volume) < .01,
          "Boolean hole missing or dimensions changed")
    # Confirm the centre line passes through the hole with Blender's evaluated ray cast.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    from mathutils import Vector
    hit, _, _, _ = plate.evaluated_get(depsgraph).ray_cast(Vector((0, 0, 10)), Vector((0, 0, -1)))
    check(not hit, "Through hole was capped")

    # Mirrored/nonuniform transform must keep orientation and world dimensions.
    plate.scale = (-2, 1, .5)
    mirrored = exported(plate, args.output_dir / "mirrored.stl", [80, 24, 2])
    plate.scale = (1, 1, 1)
    blend = args.output_dir / "fixtures.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()))
    original_hash = hashlib.sha256(blend.read_bytes()).hexdigest()
    export_object(plate, args.output_dir / "source-preserved.stl", 1)
    check(hashlib.sha256(blend.read_bytes()).hexdigest() == original_hash, "Source was rewritten")
    for obj, target, scale in [(plate, args.output_dir / "plate.stl", 1),
                                (plate, args.output_dir / "bad-scale.stl", 0)]:
        try:
            export_object(obj, target, scale)
        except ValueError:
            pass
        else:
            raise AssertionError("Expected refusal")
    plate.scale = (0, 1, 1)
    try:
        export_object(plate, args.output_dir / "singular.stl", 1)
    except ValueError:
        pass
    else:
        raise AssertionError("Singular transform accepted")
    result = {"blender_version": bpy.app.version_string, "figure": figure_report, "plate": plate_report,
              "mirror": mirrored, "source_sha256": original_hash, "status": "regressions_passed",
              "not_tested": ["slicer", "3MF roundtrip", "AMS mapping", "physical printing", "wall thickness", "strength"]}
    (args.output_dir / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"status": result["status"], "output_dir": str(args.output_dir)}))


if __name__ == "__main__":
    main()
