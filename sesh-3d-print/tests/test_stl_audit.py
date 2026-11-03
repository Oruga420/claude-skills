"""Synthetic offline regression cases. Run with unittest from the skill folder."""

import contextlib
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import stl_audit as audit

POINTS = [(0., 0., 0.), (10., 0., 0.), (0., 10., 0.), (0., 0., 10.)]
TETRA = [tuple(POINTS[i] for i in face) for face in [(0, 2, 1), (0, 1, 3), (0, 3, 2), (1, 2, 3)]]


def binary(triangles, header=b"synthetic"):
    return header.ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(
        struct.pack("<12fH", 0, 0, 0, *(v for p in tri for v in p), 0) for tri in triangles)


def ascii_stl(triangles):
    text = "solid synthetic\n"
    for tri in triangles:
        text += "facet normal 0 0 0\nouter loop\n"
        text += "".join("vertex " + " ".join(str(v) for v in p) + "\n" for p in tri)
        text += "endloop\nendfacet\n"
    return (text + "endsolid synthetic\n").encode("ascii")


class GeometryTests(unittest.TestCase):
    def test_closed_tetra_known_measurements(self):
        result = audit.audit(TETRA, 1)
        self.assertEqual(result["dimensions_mm"], [10, 10, 10])
        self.assertEqual(result["unique_exact_vertices"], 4)
        self.assertFalse(result["has_topology_findings"])
        self.assertAlmostEqual(result["components"][0]["signed_volume_mm3"], 1000 / 6)
        self.assertIn("wall_thickness", result["not_checked"])

    def test_scale_and_bed(self):
        result = audit.audit(TETRA, 25.4, [254, 254, 253])
        self.assertEqual(result["dimensions_mm"], [254, 254, 254])
        self.assertFalse(result["axis_aligned_box_fits_bed"])
        self.assertTrue(audit.audit(TETRA, 1, [10, 10, 10])["axis_aligned_box_fits_bed"])

    def test_open_surface_has_no_volume(self):
        result = audit.audit(TETRA[:-1], 1)
        self.assertEqual(result["boundary_edges"], 3)
        self.assertTrue(result["has_topology_findings"])
        self.assertIsNone(result["components"][0]["signed_volume_mm3"])

    def test_flipped_face(self):
        result = audit.audit([tuple(reversed(TETRA[0]))] + TETRA[1:], 1)
        self.assertEqual(result["inconsistent_winding_edges"], 3)
        self.assertIsNone(result["components"][0]["signed_volume_mm3"])

    def test_inward_component_signed_volume(self):
        result = audit.audit([tuple(reversed(t)) for t in TETRA], 1)
        self.assertLess(result["components"][0]["signed_volume_mm3"], 0)
        self.assertFalse(result["has_topology_findings"])

    def test_duplicate_and_nonmanifold(self):
        result = audit.audit(TETRA + [TETRA[0]], 1)
        self.assertEqual(result["duplicate_triangles"], 1)
        self.assertEqual(result["edges_over_two_faces"], 3)

    def test_degenerate_collinear_and_collapsed(self):
        for triangle in [((0, 0, 0), (1, 0, 0), (2, 0, 0)), ((0, 0, 0),) * 3]:
            with self.subTest(triangle=triangle):
                self.assertEqual(audit.audit([triangle], 1)["degenerate_triangles"], 1)

    def test_multiple_bodies_and_translation(self):
        offset = [tuple(tuple(v + 1e6 for v in p) for p in t) for t in TETRA]
        result = audit.audit(TETRA + offset, 1)
        self.assertEqual(result["edge_component_count"], 2)
        self.assertAlmostEqual(result["components"][1]["signed_volume_mm3"], 1000 / 6)

    def test_no_implicit_welding_or_repair(self):
        cracked = list(TETRA)
        cracked[0] = ((0.000001, 0., 0.),) + TETRA[0][1:]
        result = audit.audit(cracked, 1)
        self.assertGreater(result["boundary_edges"], 0)
        self.assertEqual(cracked[0][0][0], .000001)

    def test_invalid_arguments(self):
        for scale in [0, -1, float("inf"), float("nan")]:
            with self.subTest(scale=scale), self.assertRaises(ValueError):
                audit.audit(TETRA, scale)
        for bed in [[1, 2], [1, 2, 0]]:
            with self.subTest(bed=bed), self.assertRaises(ValueError):
                audit.audit(TETRA, 1, bed)
        for tris in [[], [((0, 0, 0),)], [((float("inf"), 0, 0),) * 3]]:
            with self.subTest(tris=tris), self.assertRaises(ValueError):
                audit.audit(tris, 1)


class FileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "input.stl"

    def test_binary_ascii_and_solid_binary_header(self):
        for data, expected in [(binary(TETRA), "binary"), (binary(TETRA, b"solid binary"), "binary"), (ascii_stl(TETRA), "ascii")]:
            with self.subTest(encoding=expected):
                self.path.write_bytes(data)
                triangles, encoding = audit.read_stl(self.path)
                self.assertEqual(encoding, expected)
                self.assertEqual(triangles, TETRA)
                self.assertEqual(self.path.read_bytes(), data)

    def test_reject_truncated_trailing_empty_and_bad_format(self):
        samples = [binary(TETRA)[:-1], binary(TETRA) + b"junk", binary([]), b"solid x\nendsolid x\n", b"junk", b"\xff"]
        for data in samples:
            with self.subTest(data=data[:10]), self.assertRaises(ValueError):
                self.path.write_bytes(data)
                audit.read_stl(self.path)
        with self.assertRaises(ValueError):
            audit.read_stl(self.path.with_suffix(".obj"))

    def test_ascii_structure_and_nonfinite(self):
        good = ascii_stl(TETRA)
        for old, new in [(b"facet normal", b"broken normal"), (b"outer loop", b"outer wrong"), (b"vertex", b"wrong"), (b"vertex 0.0", b"vertex nan"), (b"endfacet", b"endfacet\nextra")]:
            with self.subTest(old=old), self.assertRaises(ValueError):
                self.path.write_bytes(good.replace(old, new, 1))
                audit.read_stl(self.path)

    def test_binary_nonfinite_coordinates(self):
        self.path.write_bytes(binary([((float("nan"), 0, 0), (0, 1, 0), (0, 0, 1))]))
        with self.assertRaises(ValueError):
            audit.read_stl(self.path)

    def test_resource_limits_without_large_allocations(self):
        self.path.write_bytes(binary(TETRA))
        with mock.patch.object(audit, "MAX_BYTES", 10), self.assertRaises(ValueError):
            audit.read_stl(self.path)
        with mock.patch.object(audit, "MAX_TRIANGLES", 2), self.assertRaises(ValueError):
            audit.read_stl(self.path)
        self.path.write_bytes(ascii_stl(TETRA))
        with mock.patch.object(audit, "MAX_TRIANGLES", 2), self.assertRaises(ValueError):
            audit.read_stl(self.path)

    def test_cli_exit_codes_and_stdout(self):
        for triangles, code in [(TETRA, 0), (TETRA[:-1], 2)]:
            self.path.write_bytes(binary(triangles))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(audit.main([str(self.path), "--mm-per-unit", "1"]), code)
            self.assertEqual(json.loads(output.getvalue())["triangles"], len(triangles))

    def test_cli_new_output_and_no_overwrite(self):
        content = binary(TETRA)
        self.path.write_bytes(content)
        output = self.path.with_suffix(".json")
        args = [str(self.path), "--mm-per-unit", "1", "--output", str(output)]
        self.assertEqual(audit.main(args), 0)
        saved = output.read_bytes()
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(audit.main(args), 1)
            self.assertEqual(audit.main(args[:-1] + [str(self.path)]), 1)
        self.assertEqual(self.path.read_bytes(), content)
        self.assertEqual(output.read_bytes(), saved)

    def test_cli_invalid_and_missing_input(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(audit.main([str(self.path), "--mm-per-unit", "1"]), 1)
            self.assertEqual(audit.main([str(self.path), "--mm-per-unit", "nan"]), 1)


if __name__ == "__main__":
    unittest.main()
