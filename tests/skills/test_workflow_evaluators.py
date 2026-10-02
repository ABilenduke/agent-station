"""Exercise evaluator path guards without model calls."""

import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent


class TemporaryRootGuards(unittest.TestCase):
    def test_cli_guards_survive_optimization_and_resolve_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            allowed = base / "allowed"
            allowed.mkdir()
            outside = base / "outside"
            outside.mkdir()
            (outside / "sentinel").write_text("unchanged")
            (allowed / "escape").symlink_to(outside, target_is_directory=True)
            env = {**os.environ, "TMPDIR": str(allowed), "TEMP": str(allowed), "TMP": str(allowed)}
            for skill in ("bugfix",):
                for flags in ([], ["-O"]):
                    for root in (outside / "new", allowed, allowed / "escape/new"):
                        with self.subTest(skill=skill, flags=flags, root=root):
                            result = subprocess.run(
                                [sys.executable, *flags, str(HERE / skill / "evaluate.py"),
                                 "prepare", "--root", str(root)],
                                env=env, capture_output=True, text=True,
                            )
                            self.assertNotEqual(result.returncode, 0)
                            self.assertIn("dedicated child directory", result.stderr)
                            self.assertFalse((outside / "new").exists())
                            self.assertEqual((outside / "sentinel").read_text(), "unchanged")


if __name__ == "__main__":
    unittest.main()
