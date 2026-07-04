const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer, updatePlayerRating, recordMatch } = require('./database');
const { rate } = require('openskill');

const tournaments = new Map();

const FORMAT_LABELS = {
	ft1: 'First to 1 (FT1)',
	ft3: 'First to 3 (FT3)',
	ft5: 'First to 5 (FT5)'
};

const BETA_VALUES = {
	ft1: 4.25,
	ft3: 2.25,
	ft5: 1.25
};

function createTournament(id, hostId, format) {
    tournaments.set(id, {
        hostId,
        format,
        players: new Set(),
        matches: [],
        state: 'registration'
    });
}

async function handleTournamentButton(interaction) {
	const customId = interaction.customId;
	if (!customId.startsWith('tourney:')) return;

	const parts = customId.split(':');
	const action = parts[1];
	const tourneyId = parts[2];
    
    const tourney = tournaments.get(tourneyId);
    if (!tourney) {
        return interaction.reply({ content: '❌ This tournament has expired or does not exist.', ephemeral: true });
    }

    if (action === 'join') {
        if (tourney.state !== 'registration') return interaction.reply({ content: '❌ Registration is closed.', ephemeral: true });
        tourney.players.add(interaction.user.id);
        
        await updateRegistrationEmbed(interaction, tourney);
    } 
    else if (action === 'leave') {
        if (tourney.state !== 'registration') return interaction.reply({ content: '❌ Registration is closed.', ephemeral: true });
        tourney.players.delete(interaction.user.id);
        
        await updateRegistrationEmbed(interaction, tourney);
    }
    else if (action === 'start') {
        if (interaction.user.id !== tourney.hostId) {
            return interaction.reply({ content: '❌ Only the host can start the tournament.', ephemeral: true });
        }
        if (tourney.state !== 'registration') {
            return interaction.reply({ content: '❌ Tournament has already started.', ephemeral: true });
        }
        if (tourney.players.size < 2) {
            return interaction.reply({ content: '❌ Need at least 2 players to start.', ephemeral: true });
        }

        tourney.state = 'active';

        const playersData = [];
        for (const pid of tourney.players) {
            const user = await interaction.client.users.fetch(pid);
            const p = getPlayer(pid, user.username);
            playersData.push(p);
        }

        playersData.sort((a, b) => b.mmr - a.mmr);

        const pairings = [];
        let left = 0;
        let right = playersData.length - 1;
        while (left < right) {
            pairings.push([playersData[left], playersData[right]]);
            left++;
            right--;
        }
        if (left === right) {
            tourney.matches.push({ type: 'bye', player: playersData[left] });
        }

        tourney.matches = pairings.map((pair, index) => ({
            id: index,
            p1: pair[0].discord_id,
            p2: pair[1].discord_id,
            winner: null,
            reportedBy: null
        }));

        let description = `The tournament has started! Here are the round 1 pairings:\n\n`;
        tourney.matches.forEach(m => {
            description += `⚔️ <@${m.p1}> vs <@${m.p2}>\n`;
        });
        if (left === right) {
            description += `\n🚶 <@${playersData[left].discord_id}> gets a bye this round.`;
        }

        const embed = {
            color: 0xffaa00,
            title: `⚔️ Tournament Started (${FORMAT_LABELS[tourney.format]}) ⚔️`,
            description,
            timestamp: new Date().toISOString(),
        };

        const components = [];
        let currentRow = new ActionRowBuilder();
        
        tourney.matches.forEach((m, idx) => {
            if (currentRow.components.length === 5) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`tourney:report:${tourneyId}:${idx}`)
                    .setLabel(`Report Match ${idx+1}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
        if (currentRow.components.length > 0) {
            components.push(currentRow);
        }

        await interaction.update({ embeds: [embed], components });
    }
    else if (action === 'report') {
        const matchIdx = parseInt(parts[3], 10);
        const match = tourney.matches[matchIdx];
        
        if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
        if (match.winner) return interaction.reply({ content: '❌ Match already reported.', ephemeral: true });
        
        if (interaction.user.id !== match.p1 && interaction.user.id !== match.p2) {
            return interaction.reply({ content: '❌ You are not in this match.', ephemeral: true });
        }

        const opponentId = interaction.user.id === match.p1 ? match.p2 : match.p1;

        const user1 = await interaction.client.users.fetch(match.p1);
        const user2 = await interaction.client.users.fetch(match.p2);

        const embed = {
			color: 0x3399ff,
			title: `🏆 Report Match ${matchIdx+1}`,
			description: `Who won the match between <@${match.p1}> and <@${match.p2}>?`,
		};

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`tourney:confirm:${tourneyId}:${matchIdx}:${match.p1}`)
				.setLabel(`${user1.username} Won`)
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`tourney:confirm:${tourneyId}:${matchIdx}:${match.p2}`)
				.setLabel(`${user2.username} Won`)
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId(`tourney:forfeit:${tourneyId}:${matchIdx}`)
				.setLabel('Forfeit Match')
				.setStyle(ButtonStyle.Danger)
		);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    else if (action === 'confirm') {
        const matchIdx = parseInt(parts[3], 10);
        const winnerId = parts[4];
        const match = tourney.matches[matchIdx];
        
        if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
        if (match.winner) return interaction.reply({ content: '❌ Match already reported.', ephemeral: true });
        if (interaction.user.id !== match.p1 && interaction.user.id !== match.p2) {
            return interaction.reply({ content: '❌ You are not in this match.', ephemeral: true });
        }

        match.winner = winnerId;
        
        await interaction.reply({ content: `✅ <@${winnerId}> has been reported as the winner of match ${matchIdx+1}!`, ephemeral: false });
        await checkAndGenerateNextRound(tourney, interaction, tourneyId);
    }
    else if (action === 'forfeit') {
        const matchIdx = parseInt(parts[3], 10);
        const match = tourney.matches[matchIdx];
        
        if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
        if (match.winner) return interaction.reply({ content: '❌ Match already reported.', ephemeral: true });
        if (interaction.user.id !== match.p1 && interaction.user.id !== match.p2) {
            return interaction.reply({ content: '❌ You are not in this match.', ephemeral: true });
        }

        const winnerId = interaction.user.id === match.p1 ? match.p2 : match.p1;
        match.winner = winnerId;
        
        await interaction.reply({ content: `✅ <@${interaction.user.id}> has forfeited match ${matchIdx+1}. <@${winnerId}> wins by default!`, ephemeral: false });
        await checkAndGenerateNextRound(tourney, interaction, tourneyId);
    }
}

async function updateRegistrationEmbed(interaction, tourney) {
    const playersList = Array.from(tourney.players).map(id => `<@${id}>`).join('\n') || 'None yet';
    const embed = {
        color: 0x0099ff,
        title: '🏆 Tournament Registration 🏆',
        description: `A new tournament (${FORMAT_LABELS[tourney.format]}) has been created by <@${tourney.hostId}>!\n\nClick **Join** to enter, or **Leave** if you changed your mind.\n\nOnly the host can start the tournament when everyone is ready.`,
        fields: [
            { name: `Players (${tourney.players.size})`, value: playersList }
        ],
        timestamp: new Date().toISOString(),
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tourney:join:${interaction.customId.split(':')[2]}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`tourney:leave:${interaction.customId.split(':')[2]}`)
            .setLabel('Leave')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`tourney:start:${interaction.customId.split(':')[2]}`)
            .setLabel('Start Tournament')
            .setStyle(ButtonStyle.Primary)
    );

    await interaction.update({ embeds: [embed], components: [row] });
}

async function checkAndGenerateNextRound(tourney, interaction, tourneyId) {
    const pendingMatches = tourney.matches.filter(m => !m.winner);
    if (pendingMatches.length > 0) return;

    const losers = new Set(tourney.matches.filter(m => m.p1 !== m.p2).map(m => (m.winner === m.p1 ? m.p2 : m.p1)));
    const activePlayers = Array.from(tourney.players).filter(p => !losers.has(p));
    
    if (activePlayers.length <= 1) {
        tourney.state = 'completed';
        if (activePlayers.length === 1) {
            await interaction.followUp({ content: `🏆 **TOURNAMENT COMPLETE!** 🏆\n<@${activePlayers[0]}> is the grand champion of the ${FORMAT_LABELS[tourney.format]} tournament!`, embeds: [], components: [] });
        }
        return;
    }

    const playersData = [];
    for (const pid of activePlayers) {
        const user = await interaction.client.users.fetch(pid);
        playersData.push(getPlayer(pid, user.username));
    }
    playersData.sort((a, b) => b.mmr - a.mmr);

    const pairings = [];
    let left = 0;
    let right = playersData.length - 1;
    while (left < right) {
        pairings.push([playersData[left], playersData[right]]);
        left++;
        right--;
    }

    const newMatches = [];
    const startIndex = tourney.matches.length;
    let byePlayer = null;

    if (left === right) {
        byePlayer = playersData[left].discord_id;
        tourney.matches.push({ id: startIndex, p1: byePlayer, p2: byePlayer, winner: byePlayer });
    }

    pairings.forEach((pair, idx) => {
        newMatches.push({
            id: startIndex + (byePlayer ? 1 : 0) + idx,
            p1: pair[0].discord_id,
            p2: pair[1].discord_id,
            winner: null,
            reportedBy: null
        });
    });
    
    tourney.matches.push(...newMatches);

    if (newMatches.length === 0 && byePlayer) {
        return checkAndGenerateNextRound(tourney, interaction, tourneyId);
    }

    let description = `A new round has started! Here are the next pairings:\n\n`;
    newMatches.forEach(m => {
        description += `⚔️ <@${m.p1}> vs <@${m.p2}>\n`;
    });
    if (byePlayer) {
        description += `\n🚶 <@${byePlayer}> gets a bye this round.`;
    }

    const embed = {
        color: 0xffaa00,
        title: `⚔️ Next Round (${FORMAT_LABELS[tourney.format]}) ⚔️`,
        description,
        timestamp: new Date().toISOString(),
    };

    const components = [];
    let currentRow = new ActionRowBuilder();
    
    newMatches.forEach(m => {
        if (currentRow.components.length === 5) {
            components.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`tourney:report:${tourneyId}:${m.id}`)
                .setLabel(`Report Match ${m.id+1}`)
                .setStyle(ButtonStyle.Secondary)
        );
    });
    if (currentRow.components.length > 0) {
        components.push(currentRow);
    }

    await interaction.followUp({ content: `**Tournament Update**`, embeds: [embed], components });
}

module.exports = {
    createTournament,
    handleTournamentButton
};
