"""Run browser fixtures with private profiles and bounded loopback servers."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import subprocess
import time
from urllib.parse import urlsplit


class Handler(BaseHTTPRequestHandler):
	def do_GET(self):
		resource = self.server.resources.get(urlsplit(self.path).path)

		if resource is None:
			self.send_error(404)

			return

		content, mime = resource
		self.send_response(200)
		self.send_header('Content-Type', mime)
		self.send_header('Content-Length', str(len(content)))
		self.end_headers()
		self.wfile.write(content)

	def do_POST(self):
		length = int(self.headers.get('Content-Length', '0'))

		if self.path == '/input' and self.server.input_handler and 0 < length < 4096:
			try:
				self.server.input_handler(json.loads(self.rfile.read(length)))
				result = {'ok': True}
			except Exception as error:
				result = {'ok': False, 'error': str(error)}

			data = json.dumps(result).encode()
			self.send_response(200)
			self.send_header('Content-Type', 'application/json')
			self.send_header('Content-Length', str(len(data)))
			self.end_headers()
			self.wfile.write(data)

			return

		if self.path == '/capture.png' and 0 < length < 4 * 1024 * 1024:
			self.server.capture_path.write_bytes(self.rfile.read(length))
			self.send_response(204)
			self.end_headers()

			return

		if self.path not in ('/report', '/progress') or not 0 < length < 65536:
			self.send_error(400)

			return

		report = json.loads(self.rfile.read(length))

		if self.path == '/progress':
			self.server.progress_path.write_text(json.dumps(report, indent=2) + '\n')
		else:
			self.server.report = report

		self.send_response(204)
		self.end_headers()

	def log_message(self, *args):
		pass


def run_browser(content, output, browser, executable=None, timeout=90, audio=False,
	headless=True, input_handler=None):
	root = output.resolve()
	root.mkdir(parents=True, exist_ok=False)
	profile = root / 'profile'
	profile.mkdir()
	executable = executable or ('google-chrome' if browser == 'chrome' else 'firefox')

	if browser == 'chrome':
		# Chrome's update prompt can take keyboard focus from a running fixture.
		command = [executable, '--no-first-run', '--disable-background-networking',
			'--no-default-browser-check', '--disable-dev-shm-usage',
			'--use-angle=swiftshader', '--enable-unsafe-swiftshader',
			'--user-data-dir=' + str(profile)]

		if headless:
			command.append('--headless=new')
		else:
			command.append('--window-size=1280,1000')

		if audio:
			command.append('--autoplay-policy=no-user-gesture-required')
	else:
		command = [executable, '--no-remote', '--profile', str(profile)]

		if headless:
			command.append('--headless')
		else:
			command.extend(['--width', '1280', '--height', '1000'])

		# Background thumbnail pages must not execute the fixture a second time.
		(profile / 'user.js').write_text(
			'user_pref("browser.pagethumbnails.capturing_disabled", true);\n'
			'user_pref("browser.shell.checkDefaultBrowser", false);\n'
			'user_pref("browser.aboutwelcome.enabled", false);\n'
			'user_pref("datareporting.policy.dataSubmissionEnabled", false);\n' +
			('user_pref("media.autoplay.default", 0);\n'
				'user_pref("media.autoplay.block-webaudio", false);\n' if audio else ''))

	with HTTPServer(('127.0.0.1', 0), Handler) as server:
		server.resources, server.report, server.timeout = content, None, 0.5
		server.input_handler = input_handler
		server.progress_path = root / 'progress.json'
		server.capture_path = root / 'capture.png'
		url = f'http://127.0.0.1:{server.server_port}/'
		environment = dict(os.environ)

		if not headless:
			# Native file dialogs must not update the developer's GTK settings.
			for variable, folder in (('XDG_CONFIG_HOME', 'config'), ('XDG_DATA_HOME', 'data')):
				directory = profile / folder
				directory.mkdir()
				environment[variable] = str(directory)

		with (root / 'browser.log').open('w') as log:
			process = subprocess.Popen(command + [url], stdout=log, stderr=log, env=environment)

			try:
				deadline = time.monotonic() + timeout

				while server.report is None and time.monotonic() < deadline:
					if process.poll() is not None:
						raise RuntimeError(f'Browser exited before reporting; see {root}/browser.log')

					server.handle_request()

				if server.report is None:
					raise RuntimeError(f'Browser did not report within {timeout} seconds; see {root}/browser.log')
			finally:
				if process.poll() is None:
					process.terminate()

					try:
						process.wait(timeout=10)
					except subprocess.TimeoutExpired:
						process.kill()
						process.wait(timeout=10)

	report = server.report
	(root / 'report.json').write_text(json.dumps(report, indent=2) + '\n')

	return report
