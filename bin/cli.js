#!/usr/bin/env node
require('../dist/index').main()
	.catch(err => {
		console.error(err);
	});
