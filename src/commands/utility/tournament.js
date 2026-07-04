const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('tournament')
		.setDescription('Tournament system commands')
		.addSubcommand(subcommand =>
			subcommand
				.setName('start')
				.setDescription('Start a quick duel tournament')
				.addStringOption(option =>
					option.setName('format')
						.setDescription('The match format')
						.setRequired(true)
						.addChoices(
							{ name: 'First to 1 (FT1)', value: 'ft1' },
							{ name: 'First to 3 (FT3)', value: 'ft3' },
							{ name: 'First to 5 (FT5)', value: 'ft5' },
						)
				)
		),

	async execute(interaction) {
		const format = interaction.options.getString('format');
		const hostId = interaction.user.id;
		const tourneyId = crypto.randomBytes(4).toString('hex');
        
        const { createTournament } = require('../../tournamentHandler');
        createTournament(tourneyId, hostId, format);

		const embed = {
			color: 0x0099ff,
			title: '🏆 Tournament Registration 🏆',
			description: `A new tournament (${format}) has been created by <@${hostId}>!\n\nClick **Join** to enter, or **Leave** if you changed your mind.\n\nOnly the host can start the tournament when everyone is ready.`,
			fields: [
				{ name: 'Players (0)', value: 'None yet' }
			],
			timestamp: new Date().toISOString(),
		};

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`tourney:join:${tourneyId}`)
				.setLabel('Join')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`tourney:leave:${tourneyId}`)
				.setLabel('Leave')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId(`tourney:start:${tourneyId}`)
				.setLabel('Start Tournament')
				.setStyle(ButtonStyle.Primary)
		);

		await interaction.reply({
			embeds: [embed],
			components: [row]
		});
	},
};
