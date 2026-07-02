const Database = require('better-sqlite3');
const path = require('node:path');
const { getMMR } = require('./database');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

try {
	console.log('\n==================== 🛡️ PLAYERS 🛡️ ====================');
	const players = db.prepare('SELECT discord_id, username, mu, sigma, wins, losses, draws FROM players').all();
	
	if (players.length === 0) {
		console.log('No players registered in the database yet.');
	} else {
		// Calculate visible MMR representation for the printout table
		const playersWithMmr = players.map(p => ({
			ID: p.discord_id,
			Username: p.username,
			MMR: getMMR(p.mu, p.sigma),
			'W-L-D': `${p.wins}-${p.losses}-${p.draws}`,
			Mu: p.mu.toFixed(2),
			Sigma: p.sigma.toFixed(2)
		}));
		console.table(playersWithMmr);
	}

	console.log('\n==================== ⚔️ RECENT MATCHES ⚔️ ====================');
	const matches = db.prepare(`
		SELECT 
			m.id AS MatchID,
			p1.username AS Challenger,
			p2.username AS Opponent,
			CASE 
				WHEN m.winner_id IS NULL THEN 'Draw'
				WHEN m.winner_id = m.player1_id THEN p1.username
				ELSE p2.username
			END AS Winner,
			m.timestamp AS Time
		FROM matches m
		LEFT JOIN players p1 ON m.player1_id = p1.discord_id
		LEFT JOIN players p2 ON m.player2_id = p2.discord_id
		ORDER BY m.timestamp DESC 
		LIMIT 15
	`).all();

	if (matches.length === 0) {
		console.log('No matches recorded in the database yet.');
	} else {
		console.table(matches);
	}
	console.log('');
} catch (error) {
	console.error('Error reading the database:', error.message);
}
