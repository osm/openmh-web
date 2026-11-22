'use strict';

// Acceptance fixtures deliberately observe the matching instrumented runtime.
// Production page code uses only OpenMHSession and OpenMH public methods.
let game;
let lifecycle;
let checkpoints;
const createSession = OpenMHSession.create;
OpenMHSession.create = async (options) => {
	const session = await createSession(options);
	game = session.engine;
	lifecycle = session.lifecycle;
	checkpoints = game.saves.checkpoints;
	return session;
};
