"""Trusted X11 input for browser fixtures running on an isolated display."""

from contextlib import contextmanager
import subprocess
import time

from tests.checks.support.x11 import xdo


@contextmanager
def browser_window_manager():
	process = subprocess.Popen(['wmaker', '--static', '--no-dock', '--no-clip',
		'--no-drawer', '--dont-restore', '--no-autolaunch'],
		stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

	try:
		time.sleep(.5)

		if process.poll() is not None:
			raise RuntimeError('Cannot start the test window manager; use an isolated X display')

		yield
	finally:
		if process.poll() is None:
			process.terminate()

			try:
				process.wait(timeout=5)
			except subprocess.TimeoutExpired:
				process.kill()
				process.wait(timeout=5)


class BrowserInput:
	def __init__(self, assets, output):
		self.assets = str(assets.resolve())
		self.output = output.resolve()

	def select_file(self):
		window = xdo('getwindowfocus').strip()
		xdo('windowsize', window, '1000', '800')
		xdo('windowmove', window, '100', '100')
		time.sleep(.3)
		xdo('key', '--clearmodifiers', 'ctrl+l')
		time.sleep(.3)
		xdo('type', '--clearmodifiers', '--delay', '1', self.assets)
		time.sleep(.5)

		# Use the visible Open button in the fixed-size GTK chooser.
		xdo('mousemove', '--window', window, '950', '780')
		xdo('click', '1')
		time.sleep(.5)

	def __call__(self, action):
		kind = action['kind']

		if kind == 'focus':
			window = xdo('search', '--onlyvisible', '--name', '^OpenMH').splitlines()[-1]
			xdo('windowsize', window, '1200', '950')
			xdo('windowmove', window, '20', '20')
			xdo('windowactivate', '--sync', window)
		elif kind in ('move', 'click'):
			x, y = int(action['x']), int(action['y'])

			if not 0 <= x < 1280 or not 0 <= y < 1024:
				raise ValueError('Pointer target is outside the test display')

			xdo('mousemove', x, y)

			if kind == 'click':
				xdo('mousedown', '1')

				try:
					time.sleep(.12)
				finally:
					xdo('mouseup', '1')
		elif kind == 'key':
			name = action['key']
			duration = float(action.get('seconds', .12))

			if not .01 <= duration <= 3:
				raise ValueError('Invalid key hold duration')

			if name not in ('Return', 'Escape', 'Left', 'Right', 'Up', 'Down',
				'Control_L+l', 'Control_L+t', 'Control_L+w'):
				raise ValueError('Unsupported browser fixture key')

			xdo('keydown', name)

			try:
				time.sleep(duration)
			finally:
				xdo('keyup', name)
		elif kind == 'file':
			self.select_file()
		elif kind == 'capture':
			name = action['name']

			if name not in ('menu', 'fullscreen_main', 'fullscreen_race', 'race', 'failure'):
				raise ValueError('Unsupported browser capture')

			subprocess.run(['scrot', str(self.output / (name + '.png'))],
				check=True, timeout=10)
		else:
			raise ValueError('Unsupported browser input action')
