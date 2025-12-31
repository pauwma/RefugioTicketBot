const { SlashCommand } = require('@eartharoid/dbf');
const {
	ApplicationCommandOptionType,
	MessageFlags,
	PermissionsBitField,
} = require('discord.js');
const ExtendedEmbedBuilder = require('../../lib/embed');

module.exports = class SettingsSlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'settings';
		super(client, {
			...options,
			defaultMemberPermissions: PermissionsBitField.Flags.ManageGuild,
			description: 'Configure guild settings for language support',
			dmPermission: false,
			name,
			options: [
				{
					description: 'Configure language role IDs',
					name: 'language-roles',
					options: [
						{
							description: 'Role for English-speaking users',
							name: 'english',
							required: false,
							type: ApplicationCommandOptionType.Role,
						},
						{
							description: 'Role for Spanish-speaking users',
							name: 'spanish',
							required: false,
							type: ApplicationCommandOptionType.Role,
						},
					],
					type: ApplicationCommandOptionType.Subcommand,
				},
				{
					description: 'Set language for a category',
					name: 'category-locale',
					options: [
						{
							autocomplete: true,
							description: 'The category to configure',
							name: 'category',
							required: true,
							type: ApplicationCommandOptionType.String,
						},
						{
							choices: [
								{
									name: '🇬🇧 English',
									value: 'en-GB',
								},
								{
									name: '🇪🇸 Spanish',
									value: 'es-ES',
								},
							],
							description: 'Language for this category',
							name: 'locale',
							required: true,
							type: ApplicationCommandOptionType.String,
						},
					],
					type: ApplicationCommandOptionType.Subcommand,
				},
			],
		});
	}

	/**
	 * @param {import("discord.js").AutocompleteInteraction} interaction
	 */
	async autocomplete(interaction) {
		/** @type {import("client")} */
		const client = this.client;

		const categories = await client.prisma.category.findMany({
			select: {
				id: true,
				name: true,
			},
			where: { guildId: interaction.guild.id },
		});

		const focused = interaction.options.getFocused(true);
		if (focused.name === 'category') {
			const filtered = categories.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()));
			return await interaction.respond(
				filtered.slice(0, 25).map(c => ({
					name: c.name,
					value: c.id.toString(),
				})),
			);
		}
	}

	/**
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(interaction) {
		/** @type {import("client")} */
		const client = this.client;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const settings = await client.prisma.guild.findUnique({ where: { id: interaction.guild.id } });
		const getMessage = client.i18n.getLocale(settings.locale);

		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'language-roles') {
			const englishRole = interaction.options.getRole('english', false);
			const spanishRole = interaction.options.getRole('spanish', false);

			if (!englishRole && !spanishRole) {
				return await interaction.editReply({
					embeds: [
						new ExtendedEmbedBuilder({
							iconURL: interaction.guild.iconURL(),
							text: settings.footer,
						})
							.setColor(settings.errorColour)
							.setTitle('Missing roles')
							.setDescription('Please provide at least one role (English or Spanish).'),
					],
				});
			}

			const updateData = {};
			if (englishRole) updateData.englishRoleId = englishRole.id;
			if (spanishRole) updateData.spanishRoleId = spanishRole.id;

			await client.prisma.guild.update({
				data: updateData,
				where: { id: interaction.guild.id },
			});

			// Update cached categories
			const { categories } = await client.prisma.guild.findUnique({
				select: { categories: { select: { id: true } } },
				where: { id: interaction.guild.id },
			});
			for (const { id } of categories) await client.tickets.getCategory(id, true);

			const fields = [];
			if (englishRole) {
				fields.push({
					inline: true,
					name: '🇬🇧 English Role',
					value: `<@&${englishRole.id}>`,
				});
			}
			if (spanishRole) {
				fields.push({
					inline: true,
					name: '🇪🇸 Spanish Role',
					value: `<@&${spanishRole.id}>`,
				});
			}

			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild.iconURL(),
						text: settings.footer,
					})
						.setColor(settings.successColour)
						.setTitle('✅ Language roles configured')
						.setDescription('Users with these roles will receive messages in their language.')
						.setFields(fields),
				],
			});
		} else if (subcommand === 'category-locale') {
			const categoryId = parseInt(interaction.options.getString('category'));
			const locale = interaction.options.getString('locale');

			const category = await client.prisma.category.findUnique({
				where: { id: categoryId },
			});

			if (!category || category.guildId !== interaction.guild.id) {
				return await interaction.editReply({
					embeds: [
						new ExtendedEmbedBuilder({
							iconURL: interaction.guild.iconURL(),
							text: settings.footer,
						})
							.setColor(settings.errorColour)
							.setTitle('Invalid category')
							.setDescription('Category not found or does not belong to this server.'),
					],
				});
			}

			await client.prisma.category.update({
				data: { locale },
				where: { id: categoryId },
			});

			// Update cached category
			await client.tickets.getCategory(categoryId, true);

			const localeFlag = locale === 'en-GB' ? '🇬🇧 English' : '🇪🇸 Spanish';

			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild.iconURL(),
						text: settings.footer,
					})
						.setColor(settings.successColour)
						.setTitle('✅ Category locale updated')
						.setDescription(`Category **${category.name}** is now set to ${localeFlag}.\n\nAll tickets in this category will use this language.`),
				],
			});
		}
	}
};
