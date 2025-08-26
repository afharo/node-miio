#!/usr/bin/env node
'use strict';

const path = require('path');
const yargs = require('yargs');
// eslint-disable-next-line node/no-missing-require
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
	.commandDir(path.join(__dirname, 'commands'))
	.recommendCommands()
	.demandCommand()
	.argv;
