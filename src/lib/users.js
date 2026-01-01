const { PermissionsBitField } = require('discord.js');

/**
 *
 * @param {import("discord.js").Client} client
 * @param {string} userId
 * @returns {Promise<Collection<import("discord.js").Guild>}
 */
module.exports.getCommonGuilds = (client, userId) => client.guilds.cache.filter(guild => guild.members.cache.has(userId));

/**
 * @param {import("discord.js").Guild} guild
 * @returns {Promise<string[]>}
 */
const updateStaffRoles = async guild => {
	const { categories } = await guild.client.prisma.guild.findUnique({
		select: { categories: { select: { staffRoles: true } } },
		where: { id: guild.id },
	});
	const staffRoles = [
		...new Set(
			categories.reduce((acc, c) => {
				acc.push(...c.staffRoles);
				return acc;
			}, []),
		),
	];
	await guild.client.keyv.set(`cache/guild-staff:${guild.id}`, staffRoles);
	return staffRoles;
};

module.exports.updateStaffRoles = updateStaffRoles;

/**
 *
 * @param {import("discord.js").Guild} guild
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
module.exports.isStaff = async (guild, userId) => {
	/** @type {import("client")} */
	const client = guild.client;
	if (client.supers.includes(userId)) return true;
	try {
		const guildMember = guild.members.cache.get(userId) || await guild.members.fetch(userId);
		if (guildMember.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
		const staffRoles = await client.keyv.get(`cache/guild-staff:${guild.id}`) || await updateStaffRoles(guild);
		return staffRoles.some(r => guildMember.roles.cache.has(r));
	} catch {
		return false;
	}
};

/**
 *
 * @param {import("discord.js")} member
 * @returns {Promise<number>}
 * 	- `4` = OPERATOR (SUPER)
 *  - `3` = GUILD_OWNER
 *  - `2` = GUILD_ADMIN
 *  - `1` = GUILD_STAFF
 *  - `0` = GUILD_MEMBER
 *  - `-1` = NONE (NOT A MEMBER)
 */
module.exports.getPrivilegeLevel = async member => {
	if (!member) return -1;
	else if (member.guild.client.supers.includes(member.id)) return 4;
	else if (member.guild.ownerId === member.id) return 3;
	else if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return 2;
	else if (await this.isStaff(member.guild, member.id)) return 1;
	else return 0;
};

/**
 * Detect user's preferred language based on their roles
 * Priority: English role > Spanish role > Default locale
 *
 * @param {import("discord.js").GuildMember} member - The guild member
 * @param {Object} guildSettings - Guild settings with englishRoleId and spanishRoleId
 * @param {string} [defaultLocale='en-GB'] - Fallback locale
 * @returns {string} - Locale code (en-GB or es-ES)
 */
module.exports.getUserLanguage = (member, guildSettings, defaultLocale = 'en-GB') => {
	// Priority: English role > Spanish role > Default
	if (guildSettings.englishRoleId && member.roles.cache.has(guildSettings.englishRoleId)) {
		return 'en-GB';
	}

	if (guildSettings.spanishRoleId && member.roles.cache.has(guildSettings.spanishRoleId)) {
		return 'es-ES';
	}

	return defaultLocale;
};

/**
 * Detect if user has wrong language role for category
 * @param {import("discord.js").GuildMember} member - The guild member
 * @param {Object} category - Category with locale field
 * @param {Object} guildSettings - Guild settings with englishRoleId and spanishRoleId
 * @returns {Object} - { isLanguageMismatch: boolean, userLanguage: string|null, categoryLanguage: string }
 */
module.exports.detectLanguageMismatch = (member, category, guildSettings) => {
	const categoryLanguage = category.locale || 'en-GB';

	// Check which language role(s) the user has
	const hasEnglish = guildSettings.englishRoleId && member.roles.cache.has(guildSettings.englishRoleId);
	const hasSpanish = guildSettings.spanishRoleId && member.roles.cache.has(guildSettings.spanishRoleId);

	// If user has both or neither language roles, not a language mismatch
	if ((hasEnglish && hasSpanish) || (!hasEnglish && !hasSpanish)) {
		return {
			categoryLanguage,
			isLanguageMismatch: false,
			userLanguage: null,
		};
	}

	// User has exactly one language role - check if it matches category
	const userLanguage = hasEnglish ? 'en-GB' : 'es-ES';
	const isLanguageMismatch = userLanguage !== categoryLanguage;

	return {
		categoryLanguage,
		isLanguageMismatch,
		userLanguage,
	};
};
