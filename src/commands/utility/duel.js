const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('duel')
		.setDescription('Challenge another player to a ranked duel.')
		.addUserOption(option =>
			option.setName('opponent')
				.setDescription('The player you want to challenge')
				.setRequired(true)
		)
		.addStringOption(option =>
			option.setName('format')
				.setDescription('The duel format')
				.setRequired(true)
				.addChoices(
					{ name: 'First to 1 (FT1)', value: 'ft1' },
					{ name: 'First to 3 (FT3)', value: 'ft3' },
					{ name: 'First to 5 (FT5)', value: 'ft5' }
				)
		),
	async execute(interaction) {
		const opponent = interaction.options.getUser('opponent');
		const format = interaction.options.getString('format');
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

		const formatLabels = {
			ft1: 'First to 1 (FT1)',
			ft3: 'First to 3 (FT3)',
			ft5: 'First to 5 (FT5)'
		};

		const embed = {
			color: 0xaa00ff,
			title: '⚔️ Duel Challenge! ⚔️',
			description: `<@${challenger.id}> has challenged <@${opponent.id}> to a ranked duel!\n\n**Format:** ${formatLabels[format]}\n\nDo you accept?`,
			timestamp: new Date().toISOString(),
		};

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`duel:accept:${challenger.id}:${opponent.id}:${format}`)
				.setLabel('Accept')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`duel:decline:${challenger.id}:${opponent.id}:${format}`)
				.setLabel('Decline')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId(`duel:cancel-challenge:${challenger.id}:${opponent.id}:${format}`)
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Secondary)
		);

		await interaction.reply({
			content: `<@${opponent.id}>`,
			embeds: [embed],
			components: [row]
		});
	},
};
