const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('duel')
		.setDescription('Challenge another player to a ranked duel.')
		.addUserOption(option =>
			option.setName('opponent')
				.setDescription('The player you want to challenge')
				.setRequired(true)
		),
	async execute(interaction) {
		const opponent = interaction.options.getUser('opponent');
		const challenger = interaction.user;

		if (opponent.id === challenger.id) {
			return interaction.reply({
				content: '❌ You cannot challenge yourself to a duel!',
				ephemeral: true
			});
		}

		if (opponent.bot) {
			return interaction.reply({
				content: '❌ You cannot challenge bots!',
				ephemeral: true
			});
		}

		const embed = {
			color: 0xaa00ff,
			title: '⚔️ Duel Challenge! ⚔️',
			description: `<@${challenger.id}> has challenged <@${opponent.id}> to a ranked duel!\n\nDo you accept?`,
			timestamp: new Date().toISOString(),
		};

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`duel:accept:${challenger.id}:${opponent.id}`)
				.setLabel('Accept')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`duel:decline:${challenger.id}:${opponent.id}`)
				.setLabel('Decline')
				.setStyle(ButtonStyle.Danger)
		);

		await interaction.reply({
			content: `<@${opponent.id}>`,
			embeds: [embed],
			components: [row]
		});
	},
};
