const Database = require('better-sqlite3');
const path = require('node:path');
const { rating, rate } = require('openskill');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

/**
 * Rebuilds the leaderboard ratings and match history from scratch,
 * optionally excluding a list of blacklisted player IDs (e.g., cheaters).
 * 
 * @param {string[]} blacklist - Array of Discord IDs to exclude
 */
function rebuildRatings(blacklist = []) {
	const rebuildTx = db.transaction(() => {
		console.log(`Starting rating rebuild...`);
		if (blacklist.length > 0) {
			console.log(`Excluding/Blacklisting players: ${blacklist.join(', ')}`);

			// 1. Delete all matches involving blacklisted players
			const placeholders = blacklist.map(() => '?').join(',');
			
			// Delete matches where either player is blacklisted
			const deleteMatchesStmt = db.prepare(`
				DELETE FROM matches 
				WHERE player1_id IN (${placeholders}) OR player2_id IN (${placeholders})
			`);
			// We pass the blacklist twice because of the two IN clauses
			const matchDeleteResult = deleteMatchesStmt.run(...blacklist, ...blacklist);
			console.log(`Deleted ${matchDeleteResult.changes} matches involving blacklisted players.`);

			// 2. Delete blacklisted players from the players database
			const deletePlayersStmt = db.prepare(`
				DELETE FROM players WHERE discord_id IN (${placeholders})
			`);
			const playerDeleteResult = deletePlayersStmt.run(...blacklist);
			console.log(`Deleted ${playerDeleteResult.changes} blacklisted players from database.`);
		}

		// 3. Reset all remaining players to default stats
		db.prepare(`
			UPDATE players 
			SET mu = ?, sigma = ?, wins = 0, losses = 0, draws = 0
		`).run(25.0, 8.333333333333334);
		console.log('Reset all remaining player ratings to default starting values.');

		// 4. Fetch all remaining matches chronologically
		// Order by timestamp ASC, then id ASC to ensure perfect deterministic replay
		const matches = db.prepare('SELECT * FROM matches ORDER BY timestamp ASC, id ASC').all();
		console.log(`Found ${matches.length} matches to replay.`);

		// Keep in-memory cache of current player ratings to avoid excessive DB reads during replay
		// We'll update the cache and write to DB at each match step, or at the end.
		// Updating the players table on each match ensures consistency.
		const playerCache = {};

		const getOrInitPlayer = (id) => {
			if (!playerCache[id]) {
				const row = db.prepare('SELECT mu, sigma, wins, losses, draws FROM players WHERE discord_id = ?').get(id);
				if (row) {
					playerCache[id] = { ...row };
				} else {
					// Fallback if player doesn't exist (e.g. if they were deleted/renamed somehow)
					playerCache[id] = { mu: 25.0, sigma: 8.333333333333334, wins: 0, losses: 0, draws: 0 };
				}
			}
			return playerCache[id];
		};

		// 5. Replay matches one-by-one
		for (const match of matches) {
			const p1 = getOrInitPlayer(match.player1_id);
			const p2 = getOrInitPlayer(match.player2_id);

			const oldP1Mu = p1.mu;
			const oldP1Sigma = p1.sigma;
			const oldP2Mu = p2.mu;
			const oldP2Sigma = p2.sigma;

			// Calculate new ratings
			let newP1Rating;
			let newP2Rating;

			const p1RatingObj = { mu: oldP1Mu, sigma: oldP1Sigma };
			const p2RatingObj = { mu: oldP2Mu, sigma: oldP2Sigma };

			let outcomeP1 = 'draw';
			let outcomeP2 = 'draw';

			// Resolve beta value based on match format
			const betaValues = {
				ft1: 4.25,
				ft3: 2.25,
				ft5: 1.25
			};
			const betaValue = betaValues[match.format] || 4.25;

			if (match.winner_id === match.player1_id) {
				// Player 1 won
				const [updatedP1, updatedP2] = rate([[p1RatingObj], [p2RatingObj]], { beta: betaValue });
				newP1Rating = updatedP1[0];
				newP2Rating = updatedP2[0];
				outcomeP1 = 'win';
				outcomeP2 = 'loss';
			} else if (match.winner_id === match.player2_id) {
				// Player 2 won
				const [updatedP2, updatedP1] = rate([[p2RatingObj], [p1RatingObj]], { beta: betaValue });
				newP1Rating = updatedP1[0];
				newP2Rating = updatedP2[0];
				outcomeP1 = 'loss';
				outcomeP2 = 'win';
			} else {
				// Draw
				const [updatedP1, updatedP2] = rate([[p1RatingObj], [p2RatingObj]], { rank: [1, 1], beta: betaValue });
				newP1Rating = updatedP1[0];
				newP2Rating = updatedP2[0];
			}

			// Update cache
			p1.mu = newP1Rating.mu;
			p1.sigma = newP1Rating.sigma;
			p2.mu = newP2Rating.mu;
			p2.sigma = newP2Rating.sigma;

			if (outcomeP1 === 'win') p1.wins++;
			else if (outcomeP1 === 'loss') p1.losses++;
			else p1.draws++;

			if (outcomeP2 === 'win') p2.wins++;
			else if (outcomeP2 === 'loss') p2.losses++;
			else p2.draws++;

			// Update match history details in the database so `/history` remains completely consistent
			db.prepare(`
				UPDATE matches
				SET player1_old_mu = ?, player1_old_sigma = ?,
				    player1_new_mu = ?, player1_new_sigma = ?,
				    player2_old_mu = ?, player2_old_sigma = ?,
				    player2_new_mu = ?, player2_new_sigma = ?
				WHERE id = ?
			`).run(
				oldP1Mu, oldP1Sigma,
				p1.mu, p1.sigma,
				oldP2Mu, oldP2Sigma,
				p2.mu, p2.sigma,
				match.id
			);
		}

		// 6. Bulk save final player stats to the database
		const updatePlayerStmt = db.prepare(`
			UPDATE players 
			SET mu = ?, sigma = ?, wins = ?, losses = ?, draws = ?
			WHERE discord_id = ?
		`);

		for (const [discordId, stats] of Object.entries(playerCache)) {
			updatePlayerStmt.run(stats.mu, stats.sigma, stats.wins, stats.losses, stats.draws, discordId);
		}

		console.log('Successfully replayed matches and updated database!');
	});

	try {
		rebuildTx();
	} catch (error) {
		console.error('❌ Failed to rebuild ratings. Database rolled back.', error);
		throw error;
	}
}

// Support running directly from the command line: node src/rebuild-ratings.js <cheater_id1> <cheater_id2>...
if (require.main === module) {
	const args = process.argv.slice(2);
	rebuildRatings(args);
}

module.exports = {
	rebuildRatings
};
