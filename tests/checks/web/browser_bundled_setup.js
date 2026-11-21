'use strict';

// Install before the host starts its automatic download and runtime.
const bundledRuntime = createOpenMH;
createOpenMH = async (options) => {
	const engine = await bundledRuntime(options);
	const main = engine.callMain;
	engine.callMain = (args) =>
		main([...args, '--audio', '0', '--unlock-all']);
	return engine;
};
