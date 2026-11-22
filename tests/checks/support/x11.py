"""X11 input, graceful close and frame synchronization for live checks."""

import ctypes
import ctypes.util
import subprocess
import time

INPUT_TIMEOUT = 10
FRAME_TIMEOUT = 30


class _ClientData(ctypes.Union):
	_fields_ = [('bytes', ctypes.c_char * 20),
		('shorts', ctypes.c_short * 10),
		('longs', ctypes.c_long * 5)]


class _ClientMessage(ctypes.Structure):
	_fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong),
		('send_event', ctypes.c_int), ('display', ctypes.c_void_p),
		('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong),
		('format', ctypes.c_int), ('data', _ClientData)]


class _Event(ctypes.Union):
	_fields_ = [('client', _ClientMessage), ('padding', ctypes.c_long * 24)]


def close_window(window):
	"""Send WM_DELETE_WINDOW, the same request as a title-bar close button."""

	window = int(window)
	x11 = ctypes.CDLL(ctypes.util.find_library('X11'))
	x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
	x11.XOpenDisplay.restype = ctypes.c_void_p
	x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
	x11.XInternAtom.restype = ctypes.c_ulong
	x11.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int,
		ctypes.c_long, ctypes.POINTER(_Event)]
	x11.XFlush.argtypes = [ctypes.c_void_p]
	x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
	display = x11.XOpenDisplay(None)

	if not display:
		raise RuntimeError('cannot open X11 display to close the window')

	try:
		event = _Event()
		event.client.type = 33  # X11 ClientMessage.
		event.client.display = display
		event.client.window = window
		event.client.format = 32
		event.client.message_type = x11.XInternAtom(display, b'WM_PROTOCOLS', 0)
		event.client.data.longs[0] = x11.XInternAtom(display, b'WM_DELETE_WINDOW', 0)

		if not x11.XSendEvent(display, window, 0, 0, ctypes.byref(event)):
			raise RuntimeError('cannot send X11 window-close request')

		x11.XFlush(display)
	finally:
		x11.XCloseDisplay(display)


def xdo(*arguments):
	return subprocess.run(['xdotool', *map(str, arguments)],
		capture_output=True, text=True, check=True,
		timeout=INPUT_TIMEOUT).stdout


def frames(log):
	return log.read_bytes().count(b'\ncamera-frame ')


def wait_frames(process, log, previous, count=1):
	deadline = time.monotonic() + FRAME_TIMEOUT

	while frames(log) < previous + count:
		if process.poll() is not None or time.monotonic() >= deadline:
			raise RuntimeError('race frames stopped advancing:\n' + log.read_text())

		time.sleep(.005)


def key(window, name, process, log):
	xdo('windowfocus', '--sync', window)

	# Poll-based input can miss both edges within a slow sanitizer frame.
	# Keep each edge until another frame observes it, even for repeated keys.
	xdo('keydown', name)

	try:
		wait_frames(process, log, frames(log))
	finally:
		xdo('keyup', name)

	wait_frames(process, log, frames(log))
