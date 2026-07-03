const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { setGuildLeaderboardChannel } = require('../../database');
const { updateLeaderboard } = require('../../leaderboardScheduler');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('set-leaderboard-channel')
		.setDescription('Set the text channel where the live leaderboard will be displayed in this server.')
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The text channel to display the leaderboard')
				.addChannelTypes(ChannelType.GuildText)
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
	async execute(interaction) {
		if (!interaction.guildId) {
			return interaction.reply({
				content: '❌ This command can only be used inside a server!',
				ephemeral: true
			});
		}

		const channel = interaction.options.getChannel('channel');

		try {
			// Save config in database
			setGuildLeaderboardChannel(interaction.guildId, channel.id);

			// Acknowledge the command
			await interaction.reply({
				content: `✅ Leaderboard channel successfully set to <#${channel.id}>! Generating initial leaderboard...`,
				ephemeral: true
			});

			// Trigger an immediate update of the leaderboard in that channel
			await updateLeaderboard(interaction.client, channel.id);
		} catch (error) {
			console.error('Error setting leaderboard channel:', error);
			
			// Safe followUp since we already replied above, or check if we need to reply/followUp
			try {
				await interaction.followUp({
					content: '❌ There was an error generating the leaderboard message. Make sure the bot has permission to view, read, and write messages in that channel.',
					ephemeral: true
				});
			} catch (err) {
				console.error('Failed to send error followUp:', err);
			}
		}
	},
};
