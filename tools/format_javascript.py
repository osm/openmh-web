"""JavaScript formatting without C-specific source rewriting."""

from format_clang import format_clang


def format_javascript(source, path, executable):
	# clang-format preserves templates, regular expressions and SDK property names.
	return format_clang(source, path, executable)
