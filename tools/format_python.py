"""Whitespace-only Python formatting shared by the project formatting tools."""

import ast
import io
import tokenize


TAB_WIDTH = 8
COMPOUND = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With,
	ast.AsyncWith, ast.Try, ast.Match)
DEFINITIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
IMPORTS = (ast.Import, ast.ImportFrom)
EXITS = (ast.Return, ast.Raise)


def python_files(root):
	"""Discover owned Python sources without entering builds or dependencies."""

	return sorted(path for tree in ("tools", "docker", "scripts", "src",
		"tests")
		for path in (root / tree).rglob("*.py") if path.is_file())


def literal_lines(tokens):
	"""Preserve continuation lines inside strings, including embedded programs."""

	protected = set()

	for token in tokens:
		kind = tokenize.tok_name[token.type]

		if kind in ("STRING", "FSTRING_MIDDLE", "TSTRING_MIDDLE"):
			protected.update(range(token.start[0] + 1,
				token.end[0] + 1))

			if kind != "STRING" and token.start[1] == 0:
				protected.add(token.start[0])

	return protected


def tab_indentation(source):
	lines = source.splitlines(keepends=True)
	tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
	protected = literal_lines(tokens)
	indents = [0]
	brackets = []
	logical_level = None
	visited = set()

	for token in tokens:
		if token.type == tokenize.INDENT:
			indents.append(len(token.string.expandtabs(TAB_WIDTH)))
			continue

		if token.type == tokenize.DEDENT:
			indents.pop()
			continue

		if token.type == tokenize.NEWLINE:
			logical_level = None
			continue

		if token.type in (tokenize.NL, tokenize.ENDMARKER):
			continue

		row = token.start[0]
		closing = token.type == tokenize.OP and token.string in ")]}"

		if closing:
			opening_row = brackets.pop()

		if row not in visited and row not in protected:
			line = lines[row - 1]
			prefix = line[:len(line) - len(line.lstrip(" \t"))]
			level = len(indents) - 1

			if logical_level is not None:
				level = logical_level + len(set(brackets))

				if closing:
					# Match the opening line, including calls like run([.
					level = logical_level + len({start for start in brackets
						if start < opening_row})

				# Explicit backslash continuation has no bracket token.
				if not brackets and not closing:
					level += 1
			elif token.type == tokenize.COMMENT:
				width = len(prefix.expandtabs(TAB_WIDTH))
				level = sum(width >= indent for indent in indents[1:])

				if width > indents[-1]:
					level += 1

			lines[row - 1] = "\t" * level + line[len(prefix):]
			visited.add(row)

		if token.type != tokenize.COMMENT and logical_level is None:
			logical_level = len(indents) - 1

		if token.type == tokenize.OP and token.string in "([{":
			brackets.append(row)

	return "".join(lines)


def statement_start(statement):
	decorators = getattr(statement, "decorator_list", ())

	return min([statement.lineno] + [item.lineno for item in decorators])


def separate_groups(source, tree):
	lines = source.splitlines(keepends=True)
	tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
	protected = literal_lines(tokens)
	gaps = {}

	def before(row, count=1):
		# Comments belong to the following statement, including decorators.
		while (row > 1 and row - 1 not in protected and
			lines[row - 2].lstrip().startswith("#")):
			row -= 1

		if row > 1 and row not in protected:
			gaps[row] = max(gaps.get(row, 0), count)

	for parent in ast.walk(tree):
		for _, value in ast.iter_fields(parent):
			if not isinstance(value, list):
				continue

			statements = [item for item in value if isinstance(item,
				ast.stmt)]

			for previous, current in zip(statements,
				statements[1:]):
				row = statement_start(current)

				if row <= previous.end_lineno:
					continue

				if (isinstance(previous, DEFINITIONS) or
					isinstance(current, DEFINITIONS)):
					before(row, 2 if isinstance(parent,
						ast.Module) else 1)
				elif (isinstance(previous, COMPOUND) or
					isinstance(current, COMPOUND + EXITS) or
					isinstance(previous,
						IMPORTS) != isinstance(current,
						IMPORTS)):
					before(row)
				elif (isinstance(previous, ast.Expr) and
					isinstance(previous.value, ast.Constant) and
					isinstance(previous.value.value, str)):
					before(row)

	# Separate comment-led groups without inserting space inside comment blocks.
	for token in tokens:
		row = token.start[0]

		if (token.type == tokenize.COMMENT and row > 1 and
			row not in protected and lines[row - 1].lstrip().startswith("#") and
			lines[row - 2].strip() and not lines[row - 2].lstrip().startswith("#") and
			not lines[row - 2].rstrip().endswith((":", "(", "[",
				"{"))):
			before(row)

	output = []

	for row, line in enumerate(lines, 1):
		if row in gaps:
			existing = 0

			for previous in reversed(output):
				if previous.strip():
					break

				existing += 1

			output.extend("\n" for _ in range(max(0,
				gaps[row] - existing)))

		output.append(line if row in protected else line.rstrip() + "\n")

	return "".join(output)


def format_python(source):
	"""Change whitespace only; reject any change to Python's parsed meaning."""

	original = ast.parse(source)
	indented = tab_indentation(source)
	formatted = separate_groups(indented, ast.parse(indented))
	updated = ast.parse(formatted)

	if ast.dump(original) != ast.dump(updated):
		raise ValueError("Python formatting changed the syntax tree")

	compile(formatted, "<formatted Python>", "exec")

	return formatted
