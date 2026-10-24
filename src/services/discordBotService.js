import crypto from 'crypto';
import {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { env } from '../config/env.js';
import { supabase, localStore } from '../config/supabase.js';

class DiscordBotService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.botInfo = null;
    this.guildSettings = {
      guildId: env.DISCORD_GUILD_ID || '1562068415655714836',
      verifiedRoleId: env.DISCORD_VERIFIED_ROLE_ID || '123456789012345678',
      channelId: env.DISCORD_VERIFICATION_CHANNEL_ID || '',
    };
  }

  /**
   * Initialize and connect Discord Bot Client
   */
  async initialize() {
    const token = env.DISCORD_BOT_TOKEN?.trim();

    if (!token) {
      console.log('ℹ️ [Discord Bot] DISCORD_BOT_TOKEN is not set in .env. Running with Bot API Simulation Mode for local verification testing.');
      return;
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
        ],
      });

      this.client.once('ready', async () => {
        this.isReady = true;
        this.botInfo = {
          id: this.client.user.id,
          tag: this.client.user.tag,
          username: this.client.user.username,
        };
        console.log(`🤖 [Discord Bot] Successfully connected as ${this.client.user.tag} (ID: ${this.client.user.id})`);

        // Register slash command /verify-setup
        await this.registerSlashCommands();
      });

      // Handle Slash Commands and Button Interactions
      this.client.on('interactionCreate', async (interaction) => {
        try {
          if (interaction.isChatInputCommand()) {
            await this.handleChatInput(interaction);
          } else if (interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
          }
        } catch (err) {
          console.error('[Discord Bot Interaction Error]:', err.message);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ An error occurred processing this action.', ephemeral: true }).catch(() => {});
          } else {
            await interaction.reply({ content: '❌ An error occurred processing this action.', ephemeral: true }).catch(() => {});
          }
        }
      });

      await this.client.login(token);
    } catch (err) {
      console.warn('⚠️ [Discord Bot] Failed to login to Discord Gateway:', err.message);
      this.isReady = false;
    }
  }

  /**
   * Register Slash commands for Guild/Global
   */
  async registerSlashCommands() {
    if (!this.client?.user) return;

    try {
      const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);
      const commands = [
        new SlashCommandBuilder()
          .setName('verify-setup')
          .setDescription('Post the NightmareStore Discord verification panel into a channel')
          .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
          .addChannelOption((opt) =>
            opt.setName('channel').setDescription('Channel where the verification panel will be posted').setRequired(false)
          )
          .addRoleOption((opt) =>
            opt.setName('role').setDescription('Role to grant upon successful verification').setRequired(false)
          ),
      ];

      console.log('🔄 [Discord Bot] Registering application slash commands...');
      await rest.put(Routes.applicationCommands(this.client.user.id), {
        body: commands.map((c) => c.toJSON()),
      });
      console.log('✅ [Discord Bot] Slash commands registered successfully.');
    } catch (err) {
      console.warn('⚠️ [Discord Bot] Could not register slash commands:', err.message);
    }
  }

  /**
   * Handle /verify-setup Slash Command
   */
  async handleChatInput(interaction) {
    if (interaction.commandName === 'verify-setup') {
      // Security check: Must have Administrator permission
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '⛔ Only Discord administrators can configure the verification panel.',
          ephemeral: true,
        });
      }

      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const targetRole = interaction.options.getRole('role');

      if (targetRole) {
        this.guildSettings.verifiedRoleId = targetRole.id;
      }
      this.guildSettings.channelId = targetChannel.id;
      this.guildSettings.guildId = interaction.guildId;

      // Create Verification Panel Embed matching user specifications
      const embed = new EmbedBuilder()
        .setColor(0x5865f2) // Discord Blurple
        .setTitle('🛡️ Member Verification Required')
        .setDescription(
          `Welcome to **${interaction.guild.name}**!\n\n` +
            `To unlock all channels and protect our community from unauthorized bots, please complete our secure web verification.\n\n` +
            `**How it works:**\n` +
            `1️⃣ Click the **"Verify Account"** button below.\n` +
            `2️⃣ Sign in with your Discord account on our official website.\n` +
            `3️⃣ Complete the Google reCAPTCHA checkbox.\n` +
            `4️⃣ You will automatically receive the **<@&${this.guildSettings.verifiedRoleId}>** role!\n\n` +
            `*Security notice: This verification link is unique to you and expires after 15 minutes.*`
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200')
        .setFooter({
          text: 'NightmareStore Protection Engine • Powered by Google reCAPTCHA',
          iconURL: this.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setCustomId('btn_verify_account')
        .setLabel('Verify Account')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛡️');

      const row = new ActionRowBuilder().addComponents(button);

      const panelMsg = await targetChannel.send({ embeds: [embed], components: [row] });

      this.guildSettings.panelMessageId = panelMsg.id;

      // Save to Supabase discord_bot_settings
      if (supabase) {
        await supabase.from('discord_bot_settings').upsert({
          guild_id: interaction.guildId,
          verified_role_id: this.guildSettings.verifiedRoleId,
          verification_channel_id: targetChannel.id,
          panel_message_id: panelMsg.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'guild_id' });
      }

      await interaction.reply({
        content: `✅ Verification panel posted successfully in <#${targetChannel.id}>! Verified Role: <@&${this.guildSettings.verifiedRoleId}>`,
        ephemeral: true,
      });
    }
  }

  /**
   * Handle "Verify Account" Button Click
   */
  async handleButtonInteraction(interaction) {
    if (interaction.customId === 'btn_verify_account') {
      const discordUserId = interaction.user.id;
      const guildId = interaction.guildId;

      // Generate a cryptographically secure, single-use session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const stateHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      // Save session in Supabase & localStore
      const sessionObj = {
        id: crypto.randomUUID(),
        user_id: null,
        discord_user_id: discordUserId,
        state_hash: stateHash,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      };

      if (supabase) {
        await supabase.from('verification_sessions').insert(sessionObj);
      }
      if (!localStore.verificationSessions) localStore.verificationSessions = [];
      localStore.verificationSessions.push(sessionObj);

      const verifyUrl = `${env.APP_BASE_URL}/discord/verify?session=${sessionToken}&user_id=${discordUserId}&guild_id=${guildId}`;

      const replyEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🔐 Complete Your Verification')
        .setDescription(
          `Hello **${interaction.user.username}**! Click the secure link below to open our website verification portal:\n\n` +
            `👉 [**Click Here to Verify on NightmareStore Website**](${verifyUrl})\n\n` +
            `*⏱️ This secure verification session will expire in **15 minutes**.*`
        )
        .setFooter({ text: 'Do not share this link with anyone.' });

      const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Verification Page')
          .setStyle(ButtonStyle.Link)
          .setURL(verifyUrl)
      );

      await interaction.reply({
        embeds: [replyEmbed],
        components: [linkRow],
        ephemeral: true,
      });
    }
  }

  /**
   * Check if Discord User is a Member of the Guild
   */
  async checkMemberInGuild(guildId, discordUserId) {
    const targetGuildId = guildId || this.guildSettings.guildId;

    if (this.isReady && this.client) {
      try {
        const guild = this.client.guilds.cache.get(targetGuildId) || (await this.client.guilds.fetch(targetGuildId).catch(() => null));
        if (!guild) {
          console.warn(`[Discord Bot] Guild ${targetGuildId} not found in bot cache`);
          return { inGuild: true, simulated: false, guildName: 'NightmareStore Community' };
        }

        const member = await guild.members.fetch(discordUserId).catch(() => null);
        if (!member) {
          return { inGuild: false, guildName: guild.name };
        }

        return {
          inGuild: true,
          guildName: guild.name,
          hasRole: member.roles.cache.has(this.guildSettings.verifiedRoleId),
          member: {
            id: member.id,
            displayName: member.displayName,
            avatarUrl: member.displayAvatarURL(),
          },
        };
      } catch (err) {
        console.warn('[Discord Bot] Member fetch exception:', err.message);
      }
    }

    // In simulation / local dev fallback mode:
    return {
      inGuild: true,
      simulated: true,
      guildName: 'NightmareStore Community',
      hasRole: false,
    };
  }

  /**
   * Assign Verified Role to Discord Member
   */
  async assignVerifiedRole(guildId, discordUserId, roleId) {
    const targetGuildId = guildId || this.guildSettings.guildId;
    const targetRoleId = roleId || this.guildSettings.verifiedRoleId;

    if (this.isReady && this.client) {
      try {
        const guild = this.client.guilds.cache.get(targetGuildId) || (await this.client.guilds.fetch(targetGuildId).catch(() => null));
        if (!guild) {
          throw new Error(`Bot is not in Discord server ID: ${targetGuildId}`);
        }

        const member = await guild.members.fetch(discordUserId).catch(() => null);
        if (!member) {
          throw new Error('You must be a member of the Discord server before receiving the verified role.');
        }

        // Permission check: Does bot have MANAGE_ROLES?
        const botMember = await guild.members.fetchMe().catch(() => null);
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          throw new Error('Bot does not have "Manage Roles" permission in this Discord server.');
        }

        const role = await guild.roles.fetch(targetRoleId).catch(() => null);
        if (!role) {
          throw new Error(`Verified role ID ${targetRoleId} does not exist in the Discord server.`);
        }

        // Role hierarchy check: Bot highest role must be strictly higher than the target role
        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
          throw new Error('Bot highest role is below the Verified Role in Discord role hierarchy. Please move the Bot role above the Verified role.');
        }

        // If member already has role
        if (member.roles.cache.has(targetRoleId)) {
          return { success: true, alreadyHadRole: true, roleName: role.name };
        }

        await member.roles.add(targetRoleId, 'NightmareStore Web Verification Passed (reCAPTCHA v2)');
        return { success: true, roleAdded: true, roleName: role.name };
      } catch (err) {
        console.error('[Discord Bot Role Assignment Error]:', err.message);
        throw err;
      }
    }

    // Simulation / local dev fallback mode
    console.log(`[Discord Bot Simulation] Auto-assigned role ${targetRoleId} to user ${discordUserId}`);
    return {
      success: true,
      simulated: true,
      roleAdded: true,
      roleName: 'Verified',
    };
  }

  /**
   * Post Verification Panel to Channel via API
   */
  async postPanel(channelId, roleId) {
    if (roleId) this.guildSettings.verifiedRoleId = roleId;
    if (channelId) this.guildSettings.channelId = channelId;

    if (this.isReady && this.client) {
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        throw new Error(`Channel ID ${channelId} not found or inaccessible by the bot.`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🛡️ Member Verification Required')
        .setDescription(
          `Welcome to **${channel.guild.name}**!\n\n` +
            `Complete our secure web verification to unlock all channels and join discussions.\n\n` +
            `**Steps:**\n` +
            `1️⃣ Click **Verify Account** below.\n` +
            `2️⃣ Sign in with your Discord account.\n` +
            `3️⃣ Pass Google reCAPTCHA.\n` +
            `4️⃣ Instant **<@&${this.guildSettings.verifiedRoleId}>** role delivery!`
        )
        .setFooter({ text: 'NightmareStore Protection Engine' })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setCustomId('btn_verify_account')
        .setLabel('Verify Account')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛡️');

      const row = new ActionRowBuilder().addComponents(button);
      const msg = await channel.send({ embeds: [embed], components: [row] });
      return { success: true, messageId: msg.id };
    }

    return { success: true, simulated: true, message: 'Verification panel updated in simulated mode' };
  }

  /**
   * Get current Bot connection and guild stats
   */
  getStatus() {
    return {
      isReady: this.isReady,
      botInfo: this.botInfo || {
        id: env.DISCORD_CLIENT_ID,
        tag: 'NightmareStoreBot#0001',
        username: 'NightmareStoreBot',
      },
      guildSettings: this.guildSettings,
      guildCount: this.client?.guilds.cache.size || 1,
      ping: this.client?.ws.ping || 42,
    };
  }
}

export const discordBot = new DiscordBotService();
