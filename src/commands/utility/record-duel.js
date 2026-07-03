const { SlashCommandBuilder } = require('discord.js');
const { getPlayer, updatePlayerRating, recordMatch } = require('../../database');
const { rate } = require('openskill');

const ALLOWED_ADMIN_IDS = ['497629563145158657', '195723867065417728'];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('record-duel')
		.setDescription('Manually record a duel result (Admin only).')
		.addUserOption(option =>
			option.setName('player1')
				.setDescription('The first player')
				.setRequired(true)
		)
		.addUserOption(option =>
			option.setName('player2')
				.setDescription('The second player')
				.setRequired(true)
		)
		.addUserOption(option =>
			option.setName('winner')
				.setDescription('The winner of the duel')
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
		// Enforce admin permission lock
		if (!ALLOWED_ADMIN_IDS.includes(interaction.user.id)) {
			return interaction.reply({
				content: '❌ You do not have permission to run this command.',
				ephemeral: true
			});
		}

		const p1User = interaction.options.getUser('player1');
		const p2User = interaction.options.getUser('player2');
		const winnerUser = interaction.options.getUser('winner');
		const format = interaction.options.getString('format');

		if (p1User.id === p2User.id) {
			return interaction.reply({
				content: '❌ Player 1 and Player 2 must be different users!',
				ephemeral: true
			});
		}

		if (p1User.bot || p2User.bot) {
			return interaction.reply({
				content: '❌ Bots cannot participate in duels!',
				ephemeral: true
			});
		}

		if (winnerUser.id !== p1User.id && winnerUser.id !== p2User.id) {
			return interaction.reply({
				content: '❌ The winner must be one of the two players involved!',
				ephemeral: true
			});
		}

		const loserUser = winnerUser.id === p1User.id ? p2User : p1User;

		// Fetch current player data from the DB
		const p1 = getPlayer(p1User.id, p1User.username);
		const p2 = getPlayer(p2User.id, p2User.username);

		// Calculate MMR changes
		const oldP1Rating = { mu: p1.mu, sigma: p1.sigma };
		const oldP2Rating = { mu: p2.mu, sigma: p2.sigma };

		let newP1Rating;
		let newP2Rating;

		const betaValues = {
			ft1: 4.25,
			ft3: 2.25,
			ft5: 1.25
		};
		const betaValue = betaValues[format] || 4.25;

		const formatLabels = {
			ft1: 'First to 1 (FT1)',
			ft3: 'First to 3 (FT3)',
			ft5: 'First to 5 (FT5)'
		};

		if (winnerUser.id === p1User.id) {
			// Player 1 won, Player 2 lost
			const [updatedP1, updatedP2] = rate([[oldP1Rating], [oldP2Rating]], { beta: betaValue });
			newP1Rating = updatedP1[0];
			newP2Rating = updatedP2[0];

			updatePlayerRating(p1User.id, newP1Rating.mu, newP1Rating.sigma, 'win');
			updatePlayerRating(p2User.id, newP2Rating.mu, newP2Rating.sigma, 'loss');
		} else {
			// Player 2 won, Player 1 lost
			const [updatedP2, updatedP1] = rate([[oldP2Rating], [oldP1Rating]], { beta: betaValue });
			newP1Rating = updatedP1[0];
			newP2Rating = updatedP2[0];

			updatePlayerRating(p2User.id, newP2Rating.mu, newP2Rating.sigma, 'win');
			updatePlayerRating(p1User.id, newP1Rating.mu, newP1Rating.sigma, 'loss');
		}

		// Record the match in matches table
		recordMatch(
			p1User.id,
			p2User.id,
			winnerUser.id,
			oldP1Rating,
			newP1Rating,
			oldP2Rating,
			newP2Rating,
			format
		);

		// Fetch updated data for display
		const finalP1 = getPlayer(p1User.id, p1User.username);
		const finalP2 = getPlayer(p2User.id, p2User.username);

		const p1Diff = finalP1.mmr - p1.mmr;
		const p2Diff = finalP2.mmr - p2.mmr;

		const formatDiff = (diff) => (diff >= 0 ? `+${diff}` : `${diff}`);

		const embed = {
			color: 0xff3300,
			title: '🛠️ Admin Match Override Recorded 🛠️',
			description: `Admin <@${interaction.user.id}> has manually recorded a match result:\n🎉 **<@${winnerUser.id}>** defeated **<@${loserUser.id}>**!\n**Format:** ${formatLabels[format]}`,
			fields: [
				{
					name: `🛡️ ${p1User.username}`,
					value: `**MMR:** \`${p1.mmr}\` ➔ \`${finalP1.mmr}\` (${formatDiff(p1Diff)})\n**Record:** ${finalP1.wins}W - ${finalP1.losses}L`,
					inline: true
				},
				{
					name: `⚔️ ${p2User.username}`,
					value: `**MMR:** \`${p2.mmr}\` ➔ \`${finalP2.mmr}\` (${formatDiff(p2Diff)})\n**Record:** ${finalP2.wins}W - ${finalP2.losses}L`,
					inline: true
				}
			],
			timestamp: new Date().toISOString()
		};

		await interaction.reply({ embeds: [embed] });
	}
};
