const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer, updatePlayerRating, recordMatch } = require('./database');
const { rate } = require('openskill');

const BETA_VALUES = {
	ft1: 4.25,
	ft3: 2.25,
	ft5: 1.25
};

const FORMAT_LABELS = {
	ft1: 'First to 1 (FT1)',
	ft3: 'First to 3 (FT3)',
	ft5: 'First to 5 (FT5)'
};

async function handleButtonInteraction(interaction) {
	const customId = interaction.customId;
	if (!customId.startsWith('duel:')) return;

	const parts = customId.split(':');
	const [_, action, challengerId, opponentId] = parts;

	// Permissions check: Only players involved in the duel can interact
	if (interaction.user.id !== challengerId && interaction.user.id !== opponentId) {
		return interaction.reply({
			content: '❌ You are not part of this duel!',
			ephemeral: true
		});
	}

	// 1. Accept Challenge
	if (action === 'accept') {
		if (interaction.user.id !== opponentId) {
			return interaction.reply({
				content: '❌ Only the challenged player can accept this duel.',
				ephemeral: true
			});
		}

		const format = parts[4] || 'ft1';
		const challengerUser = await interaction.client.users.fetch(challengerId);
		const opponentUser = interaction.user;

		const embed = {
			color: 0xffaa00,
			title: '⚔️ Duel Active! ⚔️',
			description: `A duel has started between <@${challengerId}> and <@${opponentId}>!\n\n**Format:** ${FORMAT_LABELS[format]}\n\n**Instructions:**\nFight your duel, and once finished, click the button below corresponding to who won.`,
			timestamp: new Date().toISOString(),
		};

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`duel:report:${challengerId}:${opponentId}:${format}:${challengerId}`)
				.setLabel(`${challengerUser.username} Won`)
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`duel:report:${challengerId}:${opponentId}:${format}:${opponentId}`)
				.setLabel(`${opponentUser.username} Won`)
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`duel:cancel:${challengerId}:${opponentId}:${format}`)
				.setLabel('Cancel Duel')
				.setStyle(ButtonStyle.Danger)
		);

		await interaction.update({
			embeds: [embed],
			components: [row]
		});
	}

	// 2. Decline Challenge
	else if (action === 'decline') {
		if (interaction.user.id !== opponentId) {
			return interaction.reply({
				content: '❌ Only the challenged player can decline this duel.',
				ephemeral: true
			});
		}

		const embed = {
			color: 0xff0000,
			title: '❌ Duel Declined',
			description: `<@${opponentId}> has declined the challenge from <@${challengerId}>.`,
			timestamp: new Date().toISOString(),
		};

		await interaction.update({
			embeds: [embed],
			components: []
		});
	}

	// Cancel Challenge (Rescind offer before acceptance)
	else if (action === 'cancel-challenge') {
		if (interaction.user.id !== challengerId) {
			return interaction.reply({
				content: '❌ Only the challenger can rescind this duel offer.',
				ephemeral: true
			});
		}

		const embed = {
			color: 0x555555,
			title: '🚫 Challenge Rescinded',
			description: `<@${challengerId}> has cancelled their duel challenge to <@${opponentId}>.`,
			timestamp: new Date().toISOString(),
		};

		await interaction.update({
			embeds: [embed],
			components: []
		});
	}

	// 3. Cancel Duel
	else if (action === 'cancel') {
		const embed = {
			color: 0x555555,
			title: '🚫 Duel Cancelled',
			description: `The duel between <@${challengerId}> and <@${opponentId}> has been cancelled by <@${interaction.user.id}>.`,
			timestamp: new Date().toISOString(),
		};

		await interaction.update({
			embeds: [embed],
			components: []
		});
	}

	// 4. Report Result
	else if (action === 'report') {
		const format = parts[4] || 'ft1';
		const winnerId = parts[5];
		const reporter = interaction.user.id;
		const otherPlayerId = reporter === challengerId ? opponentId : challengerId;

		const embed = {
			color: 0x3399ff,
			title: '🏆 Duel Outcome Reported',
			description: `<@${reporter}> has reported that <@${winnerId}> won the duel (${FORMAT_LABELS[format]}).\n\n<@${otherPlayerId}>, please confirm or dispute this result.`,
			timestamp: new Date().toISOString(),
		};

		// Confirm custom ID format: duel:confirm:<challengerId>:<opponentId>:<format>:<winnerId>:<reporterId>
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`duel:confirm:${challengerId}:${opponentId}:${format}:${winnerId}:${reporter}`)
				.setLabel('Confirm Result')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`duel:dispute:${challengerId}:${opponentId}:${format}:${winnerId}:${reporter}`)
				.setLabel('Dispute Result')
				.setStyle(ButtonStyle.Danger)
		);

		await interaction.update({
			embeds: [embed],
			components: [row]
		});
	}

	// 5. Confirm Result
	else if (action === 'confirm') {
		const format = parts[4] || 'ft1';
		const winnerId = parts[5];
		const reporterId = parts[6];

		// Only the non-reporting player can confirm/dispute to prevent self-confirmation
		if (interaction.user.id === reporterId) {
			return interaction.reply({
				content: '❌ You cannot confirm your own report! The other player must confirm it.',
				ephemeral: true
			});
		}

		// Fetch current players data
		const challengerUser = await interaction.client.users.fetch(challengerId);
		const opponentUser = await interaction.client.users.fetch(opponentId);

		const challenger = getPlayer(challengerId, challengerUser.username);
		const opponent = getPlayer(opponentId, opponentUser.username);

		// Calculate MMR changes
		const oldChallengerRating = { mu: challenger.mu, sigma: challenger.sigma };
		const oldOpponentRating = { mu: opponent.mu, sigma: opponent.sigma };

		let newChallengerRating;
		let newOpponentRating;
		let winnerUser;
		let loserUser;

		// Map format to beta value (default to FT1 = 4.25 if not matched)
		const betaValue = BETA_VALUES[format] || 4.25;

		if (winnerId === challengerId) {
			winnerUser = challengerUser;
			loserUser = opponentUser;
			// Challenger won, opponent lost
			const [updatedChallenger, updatedOpponent] = rate([[oldChallengerRating], [oldOpponentRating]], { beta: betaValue });
			newChallengerRating = updatedChallenger[0];
			newOpponentRating = updatedOpponent[0];

			updatePlayerRating(challengerId, newChallengerRating.mu, newChallengerRating.sigma, 'win');
			updatePlayerRating(opponentId, newOpponentRating.mu, newOpponentRating.sigma, 'loss');
		} else {
			winnerUser = opponentUser;
			loserUser = challengerUser;
			// Opponent won, challenger lost
			const [updatedOpponent, updatedChallenger] = rate([[oldOpponentRating], [oldChallengerRating]], { beta: betaValue });
			newOpponentRating = updatedOpponent[0];
			newChallengerRating = updatedChallenger[0];

			updatePlayerRating(opponentId, newOpponentRating.mu, newOpponentRating.sigma, 'win');
			updatePlayerRating(challengerId, newChallengerRating.mu, newChallengerRating.sigma, 'loss');
		}

		// Record the match in the database
		recordMatch(
			challengerId,
			opponentId,
			winnerId,
			oldChallengerRating,
			newChallengerRating,
			oldOpponentRating,
			newOpponentRating,
			format
		);

		// Get updated MMRs for announcement
		const finalChallenger = getPlayer(challengerId, challengerUser.username);
		const finalOpponent = getPlayer(opponentId, opponentUser.username);

		const challengerDiff = finalChallenger.mmr - challenger.mmr;
		const opponentDiff = finalOpponent.mmr - opponent.mmr;

		const formatDiff = (diff) => (diff >= 0 ? `+${diff}` : `${diff}`);

		const embed = {
			color: 0x00ff00,
			title: '🏁 Duel Result Confirmed! 🏁',
			description: `🎉 **<@${winnerId}>** has defeated **<@${winnerId === challengerId ? opponentId : challengerId}>**!\n**Format:** ${FORMAT_LABELS[format]}`,
			fields: [
				{
					name: `🛡️ ${challengerUser.username} (Challenger)`,
					value: `**MMR:** \`${challenger.mmr}\` ➔ \`${finalChallenger.mmr}\` (${formatDiff(challengerDiff)})\n**Record:** ${finalChallenger.wins}W - ${finalChallenger.losses}L`,
					inline: true
				},
				{
					name: `⚔️ ${opponentUser.username} (Opponent)`,
					value: `**MMR:** \`${opponent.mmr}\` ➔ \`${finalOpponent.mmr}\` (${formatDiff(opponentDiff)})\n**Record:** ${finalOpponent.wins}W - ${finalOpponent.losses}L`,
					inline: true
				}
			],
			timestamp: new Date().toISOString(),
		};

		await interaction.update({
			embeds: [embed],
			components: []
		});
	}

	// 6. Dispute Result
	else if (action === 'dispute') {
		const reporterId = parts[6];
		if (interaction.user.id === reporterId) {
			return interaction.reply({
				content: '❌ You cannot dispute your own report!',
				ephemeral: true
			});
		}

		const embed = {
			color: 0xff0000,
			title: '⚠️ Duel Dispute ⚠️',
			description: `<@${interaction.user.id}> disputed the reported result from <@${reporterId}>.\n\nThis duel record has been cancelled. Please talk it out and challenge again or contact an admin if necessary!`,
			timestamp: new Date().toISOString(),
		};

		await interaction.update({
			embeds: [embed],
			components: []
		});
	}
}

module.exports = {
	handleButtonInteraction
};
