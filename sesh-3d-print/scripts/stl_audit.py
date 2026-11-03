#!/usr/bin/env python3
"""Offline STL measurements; no repair and no printability certification. MIT."""

import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import struct
import sys

MAX_TRIANGLES = 500_000
MAX_BYTES = 128 * 1024 * 1024


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError("Expected a finite positive number")
    return number


def _point(values):
    point = tuple(float(v) for v in values)
    if len(point) != 3 or any(not math.isfinite(v) or abs(v) > 1e12 for v in point):
        raise ValueError("Invalid vertex: require three finite coordinates within +/-1e12")
    return point


def read_stl(path):
    """Read strict ASCII or exact-length binary STL; normals are not trusted."""
    path = Path(path)
    if path.suffix.lower() != ".stl":
        raise ValueError("Expected .stl; export other formats to STL first")
    with path.open("rb") as stream:
        data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("STL exceeds 128 MiB; inspect per part without auto-decimation")
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if len(data) == 84 + 50 * count:
            if not 0 < count <= MAX_TRIANGLES:
                raise ValueError("Binary triangle count must be 1..500000")
            triangles = []
            for offset in range(84, len(data), 50):
                row = struct.unpack_from("<12fH", data, offset)
                triangles.append(tuple(_point(row[i:i + 3]) for i in (3, 6, 9)))
            return triangles, "binary"
    try:
        lines = [line.strip().split() for line in data.decode("ascii").splitlines() if line.strip()]
    except UnicodeDecodeError as exc:
        raise ValueError("Not valid ASCII STL or exact-length binary STL") from exc
    if len(lines) < 2 or lines[0][0].lower() != "solid" or lines[-1][0].lower() != "endsolid":
        raise ValueError("ASCII STL requires solid/endsolid; binary may be truncated")
    triangles = []
    i = 1
    while i < len(lines) - 1:
        block = lines[i:i + 7]
        if len(block) != 7 or [s.lower() for s in block[0][:2]] != ["facet", "normal"] or len(block[0]) != 5:
            raise ValueError("Invalid facet header")
        _point(block[0][2:])
        if [s.lower() for s in block[1]] != ["outer", "loop"] or [s.lower() for s in block[5]] != ["endloop"] or [s.lower() for s in block[6]] != ["endfacet"]:
            raise ValueError("Invalid facet structure")
        if any(len(line) != 4 or line[0].lower() != "vertex" for line in block[2:5]):
            raise ValueError("Each facet must have exactly three vertices")
        triangles.append(tuple(_point(line[1:]) for line in block[2:5]))
        if len(triangles) > MAX_TRIANGLES:
            raise ValueError("ASCII STL exceeds 500000 triangles")
        i += 7
    if i != len(lines) - 1 or not triangles:
        raise ValueError("Empty or malformed ASCII STL")
    return triangles, "ascii"


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def audit(triangles, mm_per_unit, bed_mm=None):
    scale = positive(mm_per_unit)
    if not triangles:
        raise ValueError("No triangles")
    vertices = {}
    coords = []
    faces = []
    for triangle in triangles:
        if len(triangle) != 3:
            raise ValueError("Each triangle needs three vertices")
        face = []
        for point in triangle:
            point = _point(point)
            if point not in vertices:
                vertices[point] = len(coords)
                coords.append(_point(v * scale for v in point))
            face.append(vertices[point])
        faces.append(tuple(face))
    lower = [min(p[axis] for p in coords) for axis in range(3)]
    upper = [max(p[axis] for p in coords) for axis in range(3)]
    extents = [upper[axis] - lower[axis] for axis in range(3)]
    counts = Counter(tuple(sorted(face)) for face in faces)
    duplicates = sum(count - 1 for count in counts.values())
    edges = defaultdict(list)
    degenerate = 0
    areas = []
    parent = list(range(len(faces)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for index, face in enumerate(faces):
        a, b, c = (coords[v] for v in face)
        normal = cross(sub(b, a), sub(c, a))
        area = math.hypot(*normal) / 2
        areas.append(area)
        if len(set(face)) < 3 or area == 0:
            degenerate += 1
        for a_id, b_id in zip(face, face[1:] + face[:1]):
            edge = (min(a_id, b_id), max(a_id, b_id))
            if edges[edge]:
                parent[root(index)] = root(edges[edge][0][0])
            edges[edge].append((index, a_id < b_id))
    boundaries = sum(len(users) == 1 for users in edges.values())
    nonmanifold = sum(len(users) > 2 for users in edges.values())
    inconsistent = sum(len(users) == 2 and users[0][1] == users[1][1] for users in edges.values())
    groups = defaultdict(list)
    for index in range(len(faces)):
        groups[root(index)].append(index)
    bad_groups = set()
    for users in edges.values():
        if len(users) != 2 or users[0][1] == users[1][1]:
            bad_groups.add(root(users[0][0]))
    components = []
    for group, indices in groups.items():
        # Local origin reduces cancellation for objects translated far from zero.
        origin = coords[faces[indices[0]][0]]
        volume_terms = []
        for index in indices:
            a, b, c = (sub(coords[v], origin) for v in faces[index])
            volume_terms.append(dot(a, cross(b, c)) / 6)
        consistent = group not in bad_groups and all(areas[i] > 0 and counts[tuple(sorted(faces[i]))] == 1 for i in indices)
        components.append({"triangles": len(indices), "closed_consistent_edges": consistent,
                           "signed_volume_mm3": math.fsum(volume_terms) if consistent else None})
    findings = any((boundaries, nonmanifold, inconsistent, degenerate, duplicates))
    report = {
        "schema_version": 1, "mm_per_unit": scale, "triangles": len(faces),
        "unique_exact_vertices": len(coords), "bounds_mm": {"min": lower, "max": upper},
        "dimensions_mm": extents, "surface_area_mm2": math.fsum(areas),
        "boundary_edges": boundaries, "edges_over_two_faces": nonmanifold,
        "inconsistent_winding_edges": inconsistent, "degenerate_triangles": degenerate,
        "duplicate_triangles": duplicates, "edge_component_count": len(components),
        "components": components, "has_topology_findings": findings,
        "not_checked": ["self_intersections", "vertex_manifoldness", "wall_thickness", "clearances",
                        "overhangs_and_supports", "bed_exclusions", "material_strength", "physical_printability"],
    }
    if bed_mm is not None:
        if len(bed_mm) != 3:
            raise ValueError("Bed needs X Y Z")
        bed = [positive(v) for v in bed_mm]
        report["axis_aligned_box_fits_bed"] = all(size <= available for size, available in zip(extents, bed))
        report["bed_mm"] = bed
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--mm-per-unit", type=float, required=True)
    parser.add_argument("--bed-mm", type=float, nargs=3)
    parser.add_argument("--output", type=Path, help="New JSON file; never overwrite. Default: stdout.")
    args = parser.parse_args(argv)
    try:
        positive(args.mm_per_unit)
        triangles, encoding = read_stl(args.input)
        report = audit(triangles, args.mm_per_unit, args.bed_mm)
        report["encoding"] = encoding
        serialized = json.dumps(report, indent=2, allow_nan=False)
        if args.output:
            with args.output.open("x", encoding="utf-8") as stream:
                stream.write(serialized + "\n")
        else:
            print(serialized)
        return 2 if report["has_topology_findings"] else 0
    except (OSError, ValueError, OverflowError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
