"""Python formatting preserves executable code and embedded literal payloads."""

import ast
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

from format_python import format_python, python_files


class PythonFormattingTests(unittest.TestCase):
	def check_format(self, source):
		output = format_python(source)
		self.assertEqual(ast.dump(ast.parse(source)),
			ast.dump(ast.parse(output)))
		self.assertEqual(output, format_python(output))
		compile(output, "<test>", "exec")

		return output

	def test_tabs_and_logical_groups(self):
		source = (
			'def read(value):\n'
			'    result = []\n'
			'    if value is None:\n'
			'        return result\n'
			'    for item in value:\n'
			'        result.append(item)\n'
			'    return result\n'
		)
		expected = (
			'def read(value):\n'
			'\tresult = []\n'
			'\n'
			'\tif value is None:\n'
			'\t\treturn result\n'
			'\n'
			'\tfor item in value:\n'
			'\t\tresult.append(item)\n'
			'\n'
			'\treturn result\n'
		)
		self.assertEqual(self.check_format(source), expected)

	def test_multiline_literals_and_fstrings(self):
		source = '''def page(value):
    text = r"""<pre>
    # This indentation is payload, not Python.
        if (value) { return "literal"; }

    </pre>"""
    result = f"""line {value}
    preserved spaces
{value + 1}
"""
    return text, result
'''
		output = self.check_format(source)
		before, after = {}, {}
		exec(source, before)
		exec(output, after)
		self.assertEqual(before["page"](3), after["page"](3))

	def test_decorators_comments_and_clauses(self):
		source = '''class Reader:
    # Keep this with the decorated method.
    @staticmethod
    def read(items):
        result = []
        # Validate before collecting.
        if not items:
            return result
        try:
            for item in items:
                result.append(item)
        except ValueError:
            raise
        else:
            result.append(None)
        finally:
            items.clear()
        return result
'''
		output = self.check_format(source)
		self.assertIn("\n\n\t\t# Validate before collecting.\n\t\tif",
			output)
		self.assertIn("\n\t@staticmethod\n\tdef", output)
		self.assertIn("\n\t\texcept ValueError:", output)

	def test_nested_continuations_and_explicit_backslash(self):
		source = (
			'def values():\n'
			'    result = dict(\n'
			'                  items=[\n'
			'                      (1, 2),\n'
			'                      (3, 4),\n'
			'                  ])\n'
			'    total = 1 + \\\n'
			'            2\n'
			'    return result, total\n'
		)
		output = self.check_format(source)
		self.assertIn("\n\t\titems=[\n\t\t\t(1, 2),", output)
		self.assertIn("\n\t\t2\n", output)

	def test_closing_delimiters_match_their_opening_line(self):
		source = (
			"def run():\n"
			"    call([\n"
			"        1,\n"
			"    ], flag=True)\n"
		)
		expected = (
			"def run():\n"
			"\tcall([\n"
			"\t\t1,\n"
			"\t], flag=True)\n"
		)
		self.assertEqual(self.check_format(source), expected)

	def test_long_literals_are_not_wrapped(self):
		literal = "x" * 100
		source = "value = '" + literal + "'\n"
		output = self.check_format(source)
		self.assertIn("value = '" + literal + "'", output)

	def test_check_mode_needs_no_clang_format(self):
		with tempfile.TemporaryDirectory() as temporary:
			path = Path(temporary) / "example.py"
			source = "if True:\n    value = 1\n"
			path.write_text(source)
			command = [sys.executable,
				str(ROOT / "tools/format.py"),
				"--clang-format", "/nonexistent/clang-format",
				str(path)]
			before = subprocess.run(command + ["--check"],
				capture_output=True)
			self.assertEqual(before.returncode, 1, before.stderr)
			self.assertEqual(path.read_text(), source)
			subprocess.run(command, check=True)
			subprocess.run(command + ["--check"], check=True)

	def test_discovery_excludes_generated_output(self):
		with tempfile.TemporaryDirectory() as temporary:
			root = Path(temporary)

			for name in ("tools/a.py", "docker/b.py",
				"tests/unit/c.py",
				"build/downloads/vendor.py"):
				path = root / name
				path.parent.mkdir(parents=True, exist_ok=True)
				path.touch()

			self.assertEqual([str(path.relative_to(root)) for path in python_files(root)],
				["docker/b.py", "tests/unit/c.py",
					"tools/a.py"])


if __name__ == "__main__":
	unittest.main()
