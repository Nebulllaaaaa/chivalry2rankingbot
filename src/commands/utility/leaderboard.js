const { SlashCommandBuilder } = require('discord.js');
const { getLeaderboard } = require('../../database');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('View the top ranked duelists.'),
	async execute(interaction) {
		const topPlayers = getLeaderboard(10);

		if (topPlayers.length === 0) {
			return interaction.reply({
				content: 'ℹ️ No duels have been played yet. The leaderboard is empty!',
				ephemeral: true
			});
		}

		// Fetch members in batch to resolve server nicknames
		const memberIds = topPlayers.map(p => p.discord_id);
		let members;
		try {
			members = await interaction.guild.members.fetch({ user: memberIds });
		} catch (error) {
			console.error('Failed to fetch guild members for leaderboard:', error);
			members = new Map();
		}

		let description = '';
		topPlayers.forEach((player, index) => {
			const member = members.get(player.discord_id);
			const displayName = member ? member.displayName : player.username;

			const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
			description += `${emoji} **${displayName}** — **${player.mmr} MMR** (\`${player.wins}W - ${player.losses}L\`)\n`;
		});

		const embed = {
			color: 0xffd700,
			title: '🏆 Duel Leaderboard 🏆',
			description: description,
			timestamp: new Date().toISOString(),
			footer: {
				text: 'Chivalry 2 Duelist Standings'
			}
		};

		await interaction.reply({ embeds: [embed] });
	},
};
