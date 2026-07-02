const { getLeaderboard } = require('./database');

function startLeaderboardScheduler(client) {
	const channelId = process.env.LEADERBOARD_CHANNEL_ID;

	if (!channelId || channelId === 'your_leaderboard_channel_id_here' || channelId.trim() === '') {
		console.warn('[WARNING] LEADERBOARD_CHANNEL_ID is not configured in .env. Auto-updating leaderboard is disabled.');
		return;
	}

	console.log(`[INFO] Starting leaderboard auto-scheduler for channel ID: ${channelId}`);

	// Run once immediately on startup
	updateLeaderboard(client, channelId);

	// Run every 3 minutes
	setInterval(() => {
		updateLeaderboard(client, channelId);
	}, 3 * 60 * 1000);
}

async function updateLeaderboard(client, channelId) {
	try {
		const channel = await client.channels.fetch(channelId);
		if (!channel) {
			console.error(`[ERROR] Could not find leaderboard channel with ID: ${channelId}`);
			return;
		}

		if (!channel.isTextBased()) {
			console.error(`[ERROR] Leaderboard channel (${channelId}) is not a text channel.`);
			return;
		}

		const topPlayers = getLeaderboard(50);

		let description = '';
		if (topPlayers.length === 0) {
			description = '*No duels have been played yet. The leaderboard is empty!*';
		} else {
			topPlayers.forEach((player, index) => {
				const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
				description += `${emoji} <@${player.discord_id}> — **${player.mmr} MMR** (\`${player.wins}W - ${player.losses}L\`)\n`;
			});
		}

		const embed = {
			color: 0xffd700,
			title: '🏆 Duel Leaderboard 🏆',
			description: description,
			timestamp: new Date().toISOString(),
			footer: {
				text: 'Chivalry 2 Duelist Standings • Automatically updates every 3m'
			}
		};

		// Fetch messages in the channel to locate any prior leaderboard message sent by this bot
		const messages = await channel.messages.fetch({ limit: 50 });
		const existingMessage = messages.find(
			m => m.author.id === client.user.id && m.embeds[0]?.title === '🏆 Duel Leaderboard 🏆'
		);

		if (existingMessage) {
			await existingMessage.edit({ embeds: [embed] });
			console.log('[INFO] Leaderboard message updated successfully.');
		} else {
			await channel.send({ embeds: [embed] });
			console.log('[INFO] New leaderboard message posted.');
		}
	} catch (error) {
		console.error('[ERROR] Failed to update scheduled leaderboard:', error);
	}
}

module.exports = {
	startLeaderboardScheduler
};
