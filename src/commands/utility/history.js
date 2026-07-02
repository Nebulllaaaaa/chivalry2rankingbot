const { SlashCommandBuilder } = require('discord.js');
const { getPlayer, getMatchHistory, getMMR } = require('../../database');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('history')
		.setDescription("View a player's recent match history and rating changes.")
		.addUserOption(option =>
			option.setName('player')
				.setDescription('The player whose match history you want to view')
				.setRequired(false)
		),
	async execute(interaction) {
		const targetUser = interaction.options.getUser('player') || interaction.user;

		if (targetUser.bot) {
			return interaction.reply({
				content: '❌ Bots do not have match history!',
				ephemeral: true
			});
		}

		// Ensure player is initialized/exists
		const player = getPlayer(targetUser.id, targetUser.username);
		const matches = getMatchHistory(targetUser.id, 10);

		if (matches.length === 0) {
			return interaction.reply({
				content: `ℹ️ <@${targetUser.id}> has not played any ranked duels yet!`,
				ephemeral: false
			});
		}

		let description = '';
		matches.forEach((match) => {
			const isPlayer1 = match.player1_id === targetUser.id;
			const opponentName = isPlayer1 ? match.player2_username : match.player1_username;
			
			// Calculate old and new MMR for the target user
			const oldMu = isPlayer1 ? match.player1_old_mu : match.player2_old_mu;
			const oldSigma = isPlayer1 ? match.player1_old_sigma : match.player2_old_sigma;
			const newMu = isPlayer1 ? match.player1_new_mu : match.player2_new_mu;
			const newSigma = isPlayer1 ? match.player1_new_sigma : match.player2_new_sigma;

			const oldMmr = getMMR(oldMu, oldSigma);
			const newMmr = getMMR(newMu, newSigma);
			const mmrDiff = newMmr - oldMmr;
			const formattedDiff = mmrDiff >= 0 ? `+${mmrDiff}` : `${mmrDiff}`;

			// Determine match outcome
			let outcomeEmoji = '🤝';
			let outcomeText = 'Draw';
			if (match.winner_id) {
				if (match.winner_id === targetUser.id) {
					outcomeEmoji = '🏆';
					outcomeText = 'Won against';
				} else {
					outcomeEmoji = '💀';
					outcomeText = 'Lost to';
				}
			}

			// Format timestamp
			const date = new Date(match.timestamp);
			const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

			description += `• **${formattedDate}**: ${outcomeEmoji} ${outcomeText} **${opponentName}**\n   \`${oldMmr}\` ➔ \`${newMmr}\` (${formattedDiff})\n\n`;
		});

		const embed = {
			color: 0x00aaff,
			title: `⚔️ Match History: ${targetUser.username}`,
			description: description,
			thumbnail: {
				url: targetUser.displayAvatarURL({ dynamic: true })
			},
			timestamp: new Date().toISOString(),
			footer: {
				text: `Showing last ${matches.length} matches | Current MMR: ${player.mmr}`
			}
		};

		await interaction.reply({ embeds: [embed] });
	},
};
