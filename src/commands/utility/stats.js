const { SlashCommandBuilder } = require('discord.js');
const { getPlayer } = require('../../database');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stats')
		.setDescription('View MMR and rank stats for yourself or another player.')
		.addUserOption(option =>
			option.setName('player')
				.setDescription('The player whose stats you want to view')
				.setRequired(false)
		),
	async execute(interaction) {
		const targetUser = interaction.options.getUser('player') || interaction.user;

		if (targetUser.bot) {
			return interaction.reply({
				content: '❌ Bots do not have rank statistics!',
				ephemeral: true
			});
		}

		const player = getPlayer(targetUser.id, targetUser.username);

		const embed = {
			color: 0x33cc33,
			title: `📊 Rank Stats: ${targetUser.username}`,
			thumbnail: {
				url: targetUser.displayAvatarURL({ dynamic: true })
			},
			fields: [
				{
					name: '🛡️ Rating (MMR)',
					value: `**\`${player.mmr}\`**`,
					inline: true
				},
				{
					name: '🎯 Record (W - L - D)',
					value: `\`${player.wins}W - ${player.losses}L - ${player.draws}D\``,
					inline: true
				},
				{
					name: '📈 Confidence Metrics',
					value: `**Mu:** \`${player.mu.toFixed(2)}\`\n**Sigma:** \`${player.sigma.toFixed(2)}\``,
					inline: false
				}
			],
			timestamp: new Date().toISOString()
		};

		await interaction.reply({ embeds: [embed] });
	},
};
