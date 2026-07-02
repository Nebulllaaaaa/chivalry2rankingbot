const { Events } = require('discord.js');
const { startLeaderboardScheduler } = require('../leaderboardScheduler');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);
		startLeaderboardScheduler(client);
	},
};
