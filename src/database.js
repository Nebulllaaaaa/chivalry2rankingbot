const Database = require('better-sqlite3');
const path = require('node:path');
const { rating } = require('openskill');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    mu REAL NOT NULL,
    sigma REAL NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    winner_id TEXT,
    player1_old_mu REAL NOT NULL,
    player1_old_sigma REAL NOT NULL,
    player1_new_mu REAL NOT NULL,
    player1_new_sigma REAL NOT NULL,
    player2_old_mu REAL NOT NULL,
    player2_old_sigma REAL NOT NULL,
    player2_new_mu REAL NOT NULL,
    player2_new_sigma REAL NOT NULL,
    format TEXT DEFAULT 'ft1',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(player1_id) REFERENCES players(discord_id),
    FOREIGN KEY(player2_id) REFERENCES players(discord_id)
  );

  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    leaderboard_channel_id TEXT NOT NULL
  );
`);

// Safe migration: Add format column to matches if it doesn't already exist
try {
	db.exec("ALTER TABLE matches ADD COLUMN format TEXT DEFAULT 'ft1'");
} catch (e) {
	// Column already exists, ignore error
}

// Helper to calculate visible MMR representation
function getMMR(mu, sigma) {
	// Standard TrueSkill/OpenSkill ordinal rating is mu - 3 * sigma.
	// We scale it to start at 1000 for a more user-friendly MMR display.
	const score = mu - 3 * sigma;
	return Math.max(0, Math.round(score * 100 + 1000));
}

// Get player or create them with default ratings
function getPlayer(discordId, username) {
	const selectStmt = db.prepare('SELECT * FROM players WHERE discord_id = ?');
	let player = selectStmt.get(discordId);

	if (!player) {
		const defaultRating = rating(); // mu: 25, sigma: 8.333333333333334
		const insertStmt = db.prepare(
			'INSERT INTO players (discord_id, username, mu, sigma, wins, losses, draws) VALUES (?, ?, ?, ?, 0, 0, 0)'
		);
		insertStmt.run(discordId, username, defaultRating.mu, defaultRating.sigma);
		player = {
			discord_id: discordId,
			username: username,
			mu: defaultRating.mu,
			sigma: defaultRating.sigma,
			wins: 0,
			losses: 0,
			draws: 0
		};
	} else if (player.username !== username) {
		// Update username in db if it changed on discord
		const updateUsernameStmt = db.prepare('UPDATE players SET username = ? WHERE discord_id = ?');
		updateUsernameStmt.run(username, discordId);
		player.username = username;
	}

	return {
		...player,
		mmr: getMMR(player.mu, player.sigma)
	};
}

// Update player rating and stats
function updatePlayerRating(discordId, mu, sigma, outcome) {
	let winsInc = 0;
	let lossesInc = 0;
	let drawsInc = 0;

	if (outcome === 'win') winsInc = 1;
	else if (outcome === 'loss') lossesInc = 1;
	else if (outcome === 'draw') drawsInc = 1;

	const stmt = db.prepare(`
		UPDATE players
		SET mu = ?, sigma = ?, wins = wins + ?, losses = losses + ?, draws = draws + ?
		WHERE discord_id = ?
	`);
	stmt.run(mu, sigma, winsInc, lossesInc, drawsInc, discordId);
}

// Record a completed match
function recordMatch(player1Id, player2Id, winnerId, oldP1, newP1, oldP2, newP2, format = 'ft1') {
	const stmt = db.prepare(`
		INSERT INTO matches (
			player1_id, player2_id, winner_id,
			player1_old_mu, player1_old_sigma, player1_new_mu, player1_new_sigma,
			player2_old_mu, player2_old_sigma, player2_new_mu, player2_new_sigma,
			format
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	stmt.run(
		player1Id,
		player2Id,
		winnerId,
		oldP1.mu,
		oldP1.sigma,
		newP1.mu,
		newP1.sigma,
		oldP2.mu,
		oldP2.sigma,
		newP2.mu,
		newP2.sigma,
		format
	);
}

// Get leaderboard sorted by MMR
function getLeaderboard(limit = 10) {
	// Sort by mu - 3 * sigma desc.
	// Since SQLite doesn't have local Math/variables easily, we fetch and sort in JS
	// or we can calculate mu - 3 * sigma directly in SQLite: (mu - 3.0 * sigma)
	const stmt = db.prepare(`
		SELECT *, (mu - 3.0 * sigma) AS ordinal
		FROM players
		ORDER BY ordinal DESC
		LIMIT ?
	`);
	const players = stmt.all(limit);
	return players.map(p => ({
		...p,
		mmr: getMMR(p.mu, p.sigma)
	}));
}

// Get match history for a player
function getMatchHistory(discordId, limit = 10) {
	const stmt = db.prepare(`
		SELECT 
			m.*, 
			p1.username AS player1_username, 
			p2.username AS player2_username
		FROM matches m
		JOIN players p1 ON m.player1_id = p1.discord_id
		JOIN players p2 ON m.player2_id = p2.discord_id
		WHERE m.player1_id = ? OR m.player2_id = ?
		ORDER BY m.timestamp DESC
		LIMIT ?
	`);
	return stmt.all(discordId, discordId, limit);
}

// Set leaderboard channel for a guild
function setGuildLeaderboardChannel(guildId, channelId) {
	const stmt = db.prepare(`
		INSERT INTO guild_config (guild_id, leaderboard_channel_id)
		VALUES (?, ?)
		ON CONFLICT(guild_id) DO UPDATE SET leaderboard_channel_id = excluded.leaderboard_channel_id
	`);
	stmt.run(guildId, channelId);
}

// Get leaderboard channel for a guild
function getGuildLeaderboardChannel(guildId) {
	const stmt = db.prepare('SELECT leaderboard_channel_id FROM guild_config WHERE guild_id = ?');
	const row = stmt.get(guildId);
	return row ? row.leaderboard_channel_id : null;
}

// Get all guild leaderboard configurations
function getAllGuildLeaderboardChannels() {
	return db.prepare('SELECT guild_id, leaderboard_channel_id FROM guild_config').all();
}

module.exports = {
	getPlayer,
	updatePlayerRating,
	recordMatch,
	getLeaderboard,
	getMatchHistory,
	setGuildLeaderboardChannel,
	getGuildLeaderboardChannel,
	getAllGuildLeaderboardChannels,
	getMMR,
	db // Export db instance if raw queries are needed
};
