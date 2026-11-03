"""Export one evaluated Blender mesh to a NEW binary STL in mm. Offline. MIT.

blender --background --factory-startup --disable-autoexec --python-exit-code 1
  --python blender_export_stl.py -- --input model.blend --object Part
  --mm-per-unit 1 --output part.stl
"""

import argparse
import json
import math
from pathlib import Path
import struct
import sys

import bpy


def export_object(obj, output, mm_per_unit):
    if obj.type != "MESH":
        raise ValueError("Export requires one named MESH object")
    if not math.isfinite(mm_per_unit) or mm_per_unit <= 0:
        raise ValueError("mm-per-unit must be finite and positive")
    output = Path(output)
    if output.suffix.lower() != ".stl" or output.exists():
        raise ValueError("Output must be a new .stl file")
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for instance in depsgraph.object_instances:
        if instance.is_instance and instance.parent and instance.parent.original == obj:
            raise ValueError("Realize procedural instances on a copy before exporting")
    evaluated = obj.evaluated_get(depsgraph)
    matrix = evaluated.matrix_world.copy()
    determinant = matrix.to_3x3().determinant()
    if not math.isfinite(determinant) or determinant == 0:
        raise ValueError("Singular/non-finite transform")
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        count = len(mesh.loop_triangles)
        if not 0 < count <= 500_000:
            raise ValueError("Require 1..500000 triangles; export per part or review resolution")
        # Prepare fully before opening output; STL rounds coordinates to float32.
        vertices = []
        for vertex in mesh.vertices:
            point = tuple(float(v) * mm_per_unit for v in (matrix @ vertex.co))
            if any(not math.isfinite(v) or abs(v) > 1e12 for v in point):
                raise ValueError("Non-finite/out-of-range transformed coordinates")
            vertices.append(struct.unpack("<3f", struct.pack("<3f", *point)))
        records = []
        used = set()
        for triangle in mesh.loop_triangles:
            ids = list(triangle.vertices)
            if determinant < 0:
                ids[1], ids[2] = ids[2], ids[1]
            used.update(ids)
            a, b, c = (vertices[i] for i in ids)
            u = tuple(b[i] - a[i] for i in range(3))
            v = tuple(c[i] - a[i] for i in range(3))
            normal = (u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0])
            length = math.hypot(*normal)
            unit_normal = tuple(n / length for n in normal) if length else (0., 0., 0.)
            records.append(struct.pack("<12fH", *unit_normal, *a, *b, *c, 0))
        with output.open("xb") as stream:
            stream.write(b"sesh-3d-print; binary STL; coordinates in mm".ljust(80, b"\0"))
            stream.write(struct.pack("<I", count))
            for record in records:
                stream.write(record)
        dimensions = [max(vertices[i][axis] for i in used) - min(vertices[i][axis] for i in used) for axis in range(3)]
        return {"output": str(output), "object": obj.name, "triangles": count,
                "dimensions_mm": dimensions, "mm_per_unit": mm_per_unit,
                "blender_version": bpy.app.version_string, "source_saved": False,
                "evaluation": "viewport modifiers/current frame; no repair; re-audit STL"}
    finally:
        evaluated.to_mesh_clear()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--object", required=True)
    parser.add_argument("--mm-per-unit", type=float, required=True)
    parser.add_argument("--output", type=Path, required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if not bpy.app.background or "--disable-autoexec" not in sys.argv or "--factory-startup" not in sys.argv:
        raise ValueError("Run in a separate background process with factory-startup and disable-autoexec")
    if args.input.suffix.lower() != ".blend" or not args.input.is_file():
        raise ValueError("Input must be an existing .blend file")
    if args.output.exists() or args.input.resolve() == args.output.resolve():
        raise ValueError("Output already exists or matches input")
    if not math.isfinite(args.mm_per_unit) or args.mm_per_unit <= 0:
        raise ValueError("mm-per-unit must be finite and positive")
    bpy.ops.wm.open_mainfile(filepath=str(args.input.resolve()), load_ui=False, use_scripts=False)
    obj = bpy.context.scene.objects.get(args.object)
    if obj is None:
        raise ValueError("Named object not present in the active scene")
    print(json.dumps(export_object(obj, args.output, args.mm_per_unit), allow_nan=False))


if __name__ == "__main__":
    main()
