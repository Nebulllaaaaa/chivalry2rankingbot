const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../../database');
const { rebuildRatings } = require('../../rebuild-ratings');

const ALLOWED_ADMIN_IDS = ['497629563145158657', '195723867065417728'];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('manage-match')
		.setDescription('Edit or delete a match and recalculate MMR (Admin only).')
		.addSubcommand(subcommand =>
			subcommand
				.setName('delete')
				.setDescription('Delete a match by its ID')
				.addIntegerOption(option =>
					option.setName('match_id')
						.setDescription('The ID of the match to delete')
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('edit')
				.setDescription('Edit a match by its ID')
				.addIntegerOption(option =>
					option.setName('match_id')
						.setDescription('The ID of the match to edit')
						.setRequired(true)
				)
				.addUserOption(option =>
					option.setName('winner')
						.setDescription('The new winner of the match (must be one of the original players)')
						.setRequired(false)
				)
				.addStringOption(option =>
					option.setName('format')
						.setDescription('The new duel format')
						.setRequired(false)
						.addChoices(
							{ name: 'First to 1 (FT1)', value: 'ft1' },
							{ name: 'First to 3 (FT3)', value: 'ft3' },
							{ name: 'First to 5 (FT5)', value: 'ft5' }
						)
				)
		),
	async execute(interaction) {
		// Enforce admin permission lock
		if (!ALLOWED_ADMIN_IDS.includes(interaction.user.id)) {
			return interaction.reply({
				content: '❌ You do not have permission to run this command.',
				ephemeral: true
			});
		}

		const subcommand = interaction.options.getSubcommand();
		const matchId = interaction.options.getInteger('match_id');

		// Check if match exists
		const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
		if (!match) {
			return interaction.reply({
				content: `❌ Match with ID \`${matchId}\` not found.`,
				ephemeral: true
			});
		}

		await interaction.deferReply(); // Since recalculating might take a moment

		try {
			if (subcommand === 'delete') {
				db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);
				rebuildRatings();
				return interaction.editReply(`✅ Successfully deleted match \`${matchId}\` and recalculated all ratings!`);
			} else if (subcommand === 'edit') {
				const winnerUser = interaction.options.getUser('winner');
				const format = interaction.options.getString('format');

				if (!winnerUser && !format) {
					return interaction.editReply('❌ You must provide at least one option to edit (winner or format).');
				}

				let newWinnerId = match.winner_id;
				if (winnerUser) {
					if (winnerUser.id !== match.player1_id && winnerUser.id !== match.player2_id) {
						return interaction.editReply('❌ The new winner must be one of the two original players in the match!');
					}
					newWinnerId = winnerUser.id;
				}

				let newFormat = match.format;
				if (format) {
					newFormat = format;
				}

				db.prepare('UPDATE matches SET winner_id = ?, format = ? WHERE id = ?').run(newWinnerId, newFormat, matchId);
				rebuildRatings();
				return interaction.editReply(`✅ Successfully edited match \`${matchId}\` and recalculated all ratings!`);
			}
		} catch (error) {
			console.error(error);
			return interaction.editReply(`❌ An error occurred while managing the match: ${error.message}`);
		}
	}
};
