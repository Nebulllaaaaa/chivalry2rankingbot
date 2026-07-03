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

		let description = '';
		topPlayers.forEach((player, index) => {
			const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
			description += `${emoji} **${player.username}** — **${player.mmr} MMR** (\`${player.wins}W - ${player.losses}L\`)\n`;
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
