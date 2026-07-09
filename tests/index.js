// Entry point so `node --test tests/` works on Node versions (e.g. v26 on
// Windows) where the test runner does not expand a directory argument and
// executes it as a module instead. Importing every suite here registers all
// tests with the runner. Running `node --test tests/*.test.js` (per-file
// processes) works too and does not pick up this file.
import './rng.test.js';
import './bag.test.js';
import './srs.test.js';
import './board.test.js';
import './scoring.test.js';
import './game.test.js';
import './integration.test.js';
import './features.test.js';
import './network.test.js';
import './ga.test.js';
