const { Events } = require('discord.js');
const { handleButtonInteraction } = require('../duelHandler');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
				} else {
					await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
				}
			}
		} else if (interaction.isButton()) {
			try {
				if (interaction.customId.startsWith('tourney:')) {
					const { handleTournamentButton } = require('../tournamentHandler');
					await handleTournamentButton(interaction);
				} else {
					await handleButtonInteraction(interaction);
				}
			} catch (error) {
				console.error('Error handling button interaction:', error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: 'There was an error processing this button interaction.', ephemeral: true });
				} else {
					await interaction.reply({ content: 'There was an error processing this button interaction.', ephemeral: true });
				}
			}
		}
	},
};
