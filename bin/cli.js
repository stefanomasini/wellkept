#!/usr/bin/env node
require('../dist/cli').main()
	.catch(err => {
		console.error(err);
	});
