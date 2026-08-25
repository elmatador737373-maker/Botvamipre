require('dotenv').config();
const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ComponentType
} = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');

// --- 1. SERVER WEB HTTP (PER RENDER & UPTIME ROBOT) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Evren City RP - Crew Manager Bot Online!');
});

app.listen(PORT, () => {
    console.log(`[Evren City] Server HTTP avviato sulla porta ${PORT}`);
});

// --- 2. GESTIONE CODA & COOLDOWN ANTI-BAN ---
const taskQueue = [];
let isProcessingQueue = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function queueTask(taskFunction) {
    return new Promise((resolve, reject) => {
        taskQueue.push({ taskFunction, resolve, reject });
        processQueue();
    });
}

async function processQueue() {
    if (isProcessingQueue || taskQueue.length === 0) return;
    isProcessingQueue = true;

    const { taskFunction, resolve, reject } = taskQueue.shift();

    try {
        const randomDelay = Math.floor(Math.random() * 3000) + 3500;
        console.log(`[Anti-Bot] Attesa di ${randomDelay}ms per simulazione umana...`);
        await sleep(randomDelay);

        const result = await taskFunction();
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        isProcessingQueue = false;
        processQueue();
    }
}

// --- 3. INIZIALIZZAZIONE PUPPETEER & DISCORD ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ] 
});

let page;
let membersCache = [];
let bannedCache = [];

async function initSocialClub() {
    console.log("[Puppeteer] Avvio browser Chromium...");
    const browser = await puppeteer.launch({ 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ] 
    });
    
    page = await browser.newPage();

    if (process.env.COOKIES_JSON) {
        try {
            const cookies = JSON.parse(process.env.COOKIES_JSON);
            await page.setCookie(...cookies);
            console.log("[Social Club] Cookie di sessione caricati dalla variabile d'ambiente!");
        } catch (e) {
            console.error("⚠️ ERRORE durante il parsing della variabile COOKIES_JSON:", e);
        }
    } else if (await fs.pathExists('./cookies.json')) {
        const cookies = await fs.readJson('./cookies.json');
        await page.setCookie(...cookies);
        console.log("[Social Club] Cookie di sessione caricati dal file locale!");
    } else {
        console.error("⚠️ CRITICO: Cookie non trovati né nelle variabili d'ambiente (COOKIES_JSON) né su file locale!");
    }
}

// --- FUNZIONE PER SPEDIRE LOG NEL CANALE DEDICATO ---
async function sendLogMessage(embed) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;
    try {
        const channel = await client.channels.fetch(logChannelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error("❌ Errore durante l'invio del messaggio nel canale Log:", err);
    }
}

// --- 4. FUNZIONI WEB SCRAPING ROCKSTAR ---

async function autoApproveUser(username) {
    const crewManageUrl = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`;
    await page.goto(crewManageUrl, { waitUntil: 'networkidle2' });

    return await page.evaluate((targetUser) => {
        const cards = Array.from(document.querySelectorAll('.invite-card'));
        for (const card of cards) {
            const nameEl = card.querySelector('.invite-card-username');
            if (nameEl && nameEl.textContent.trim().toLowerCase() === targetUser.toLowerCase()) {
                const acceptBtn = card.querySelector('button.accept-btn');
                if (acceptBtn) {
                    acceptBtn.click();
                    return true;
                }
            }
        }
        return false;
    }, username);
}

async function fetchCrewMembers() {
    const membersUrl = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`;
    await page.goto(membersUrl, { waitUntil: 'networkidle2' });

    membersCache = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.member-card'));
        return cards.map(card => {
            const name = card.querySelector('.member-card-username')?.textContent.trim() || '';
            const platform = card.querySelector('.platform-icon')?.getAttribute('title')?.toLowerCase() || 'pc'; 
            return { name, platform };
        });
    });

    return membersCache;
}

async function fetchBannedMembers() {
    const bannedUrl = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`;
    await page.goto(bannedUrl, { waitUntil: 'networkidle2' });

    bannedCache = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.banned-card, .member-card'));
        return cards.map(card => {
            const name = card.querySelector('.banned-card-username, .member-card-username')?.textContent.trim() || '';
            const platform = card.querySelector('.platform-icon')?.getAttribute('title')?.toLowerCase() || 'pc'; 
            return { name, platform };
        });
    });

    return bannedCache;
}

async function manageCrewMember(username, platform, action = 'kick') {
    let targetUrl;
    if (action === 'unban') {
        targetUrl = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/banned`;
    } else {
        targetUrl = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`;
    }

    if (page.url() !== targetUrl) {
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    }

    return await page.evaluate((targetUser, targetPlatform, actionType) => {
        const cardSelector = actionType === 'unban' ? '.banned-card, .member-card' : '.member-card';
        const cards = Array.from(document.querySelectorAll(cardSelector));

        for (const card of cards) {
            const nameEl = card.querySelector('.banned-card-username, .member-card-username');
            const platformEl = card.querySelector('.platform-icon');
            const userPlatform = platformEl ? platformEl.getAttribute('title')?.toLowerCase() : 'all';

            const matchesUser = nameEl && nameEl.textContent.trim().toLowerCase() === targetUser.toLowerCase();
            const matchesPlatform = targetPlatform === 'all' || (userPlatform && userPlatform.includes(targetPlatform));

            if (matchesUser && matchesPlatform) {
                if (actionType === 'unban') {
                    const unbanBtn = card.querySelector('button.unban-btn, button.remove-ban-btn');
                    if (unbanBtn) {
                        unbanBtn.click();
                        const confirmBtn = document.querySelector('.modal-confirm-btn');
                        if (confirmBtn) confirmBtn.click();
                        return true;
                    }
                } else {
                    const menuBtn = card.querySelector('.member-options-btn');
                    if (menuBtn) menuBtn.click();

                    const targetBtnSelector = actionType === 'ban' ? 'button.ban-btn' : 'button.kick-btn';
                    const actionBtn = card.querySelector(targetBtnSelector);

                    if (actionBtn) {
                        actionBtn.click();
                        const confirmBtn = document.querySelector('.modal-confirm-btn');
                        if (confirmBtn) confirmBtn.click();
                        return true;
                    }
                }
            }
        }
        return false;
    }, username, platform, action);
}

// --- 5. DEFINIZIONE COMANDI DISCORD PER EVREN CITY ---

const setupCommand = new SlashCommandBuilder()
    .setName('setup_pannello')
    .setDescription('[STAFF EVREN CITY] Invia il pannello per l\'ingresso nella Crew');

const choicesPiattaforma = [
    { name: 'Tutte le Piattaforme', value: 'all' },
    { name: 'PC', value: 'pc' },
    { name: 'PlayStation (PS4/PS5)', value: 'ps' },
    { name: 'Xbox (One/Series)', value: 'xbox' }
];

const kickCommand = new SlashCommandBuilder()
    .setName('kick_crew')
    .setDescription('[STAFF EVREN CITY] Espelle un membro dalla Crew Social Club')
    .addStringOption(opt => opt.setName('piattaforma').setDescription('Piattaforma dell\'utente').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente').setRequired(true).setAutocomplete(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo dell\'espulsione').setRequired(false));

const banCommand = new SlashCommandBuilder()
    .setName('ban_crew')
    .setDescription('[STAFF EVREN CITY] Banna e blocca un membro dalla Crew Social Club')
    .addStringOption(opt => opt.setName('piattaforma').setDescription('Piattaforma dell\'utente').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente').setRequired(true).setAutocomplete(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo del ban').setRequired(false));

const unbanCommand = new SlashCommandBuilder()
    .setName('unban_crew')
    .setDescription('[STAFF EVREN CITY] Sblocca un membro bannato dalla Crew Social Club')
    .addStringOption(opt => opt.setName('piattaforma').setDescription('Piattaforma dell\'utente').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente bannato').setRequired(true).setAutocomplete(true))
    .addStringOption(opt => opt.setName('motivo').setDescription('Motivo dello sblocco').setRequired(false));

// --- 6. EVENTO READY & REGISTRAZIONE COMANDI ---

client.once('ready', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag}`);
    await initSocialClub();

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
        Routes.applicationCommands(client.user.id), 
        { body: [setupCommand.toJSON(), kickCommand.toJSON(), banCommand.toJSON(), unbanCommand.toJSON()] }
    );
    console.log("[Evren City] Comandi registrati!");
});

// --- 7. GESTIONE INTERAZIONI DISCORD ---

client.on('interactionCreate', async interaction => {
    
    // VERIFICA RUOLO STAFF PER I COMANDI (Aggiornato con ROLE_STAFF_ID)
    const checkStaffPermission = (member) => {
        return member.roles.cache.has(process.env.ROLE_STAFF_ID) || member.permissions.has('Administrator');
    };

    // 1. AUTOCOMPLETE COMANDI KICK / BAN / UNBAN
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'kick_crew' || commandName === 'ban_crew' || commandName === 'unban_crew') {
            if (!checkStaffPermission(interaction.member)) return;

            const selectedPlatform = interaction.options.getString('piattaforma') || 'all';
            const focusedValue = interaction.options.getFocused().toLowerCase();

            let targetCache = [];

            if (commandName === 'unban_crew') {
                if (bannedCache.length === 0) {
                    await queueTask(() => fetchBannedMembers());
                }
                targetCache = bannedCache;
            } else {
                if (membersCache.length === 0) {
                    await queueTask(() => fetchCrewMembers());
                }
                targetCache = membersCache;
            }

            const filtered = targetCache.filter(m => {
                const matchPlatform = selectedPlatform === 'all' || m.platform.includes(selectedPlatform);
                const matchName = m.name.toLowerCase().includes(focusedValue);
                return matchPlatform && matchName;
            });

            await interaction.respond(
                filtered.slice(0, 25).map(m => ({ name: `${m.name} (${m.platform.toUpperCase()})`, value: m.name }))
            );
        }
        return;
    }

    // 2. CREAZIONE PANNELLO STAFF
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup_pannello') {
        if (!checkStaffPermission(interaction.member)) {
            return interaction.reply({ content: '❌ Non hai il ruolo Staff necessario per usare questo comando.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏙️ EVREN CITY RP — Gestione Crew Ufficiale')
            .setDescription(
                'Benvenuto nella gestione automatica della Crew Ufficiale di **Evren City RP**!\n\n' +
                '**Istruzioni per l\'ingresso:**\n' +
                '1️⃣ Vai sul Social Club di Rockstar o in-game e invia la richiesta alla nostra Crew.\n' +
                '2️⃣ Clicca sul pulsante **"Richiedi Approvazione"** qui sotto.\n' +
                '3️⃣ Inserisci il tuo nickname preciso del Social Club.\n\n' +
                '*Il sistema elaborerà la tua richiesta e ti notificherà lo stato direttamente in Messaggio Privato (DM).*'
            )
            .setColor('#2b2d31')
            .setFooter({ text: 'Evren City RP — Automation Bot' });

        const button = new ButtonBuilder()
            .setCustomId('btn_richiedi_crew')
            .setLabel('Richiedi Approvazione')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚡');

        await interaction.channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)]
        });

        return interaction.reply({ content: 'Pannello Evren City inviato con successo!', ephemeral: true });
    }

    // 3. CLICK PULSANTE -> APERTURA MODAL
    if (interaction.isButton() && interaction.customId === 'btn_richiedi_crew') {
        const modal = new ModalBuilder()
            .setCustomId('modal_richiesta_crew')
            .setTitle('Evren City RP — Verifica');

        const scInput = new TextInputBuilder()
            .setCustomId('input_sc_username')
            .setLabel('Il tuo Nickname Social Club')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Es. MarioRossi_99')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(scInput));
        await interaction.showModal(modal);
    }

    // 4. INVIO MODAL -> ELABORAZIONE E NOTIFICHE DM + LOG
    if (interaction.isModalSubmit() && interaction.customId === 'modal_richiesta_crew') {
        const scUsername = interaction.fields.getTextInputValue('input_sc_username').trim();
        await interaction.deferReply({ ephemeral: true });

        // Invia Primo DM: Presa in carico
        try {
            const startEmbed = new EmbedBuilder()
                .setTitle('⏳ Richiesta in Elaborazione — Evren City RP')
                .setDescription(`Abbiamo preso in carico la tua richiesta per l'account Social Club: **${scUsername}**.\nIl sistema sta verificando sul Social Club di Rockstar...`)
                .setColor('#f1c40f');
            await interaction.user.send({ embeds: [startEmbed] });
        } catch (e) {
            console.log(`Impossibile inviare DM di avvio a ${interaction.user.tag} (DM chiusi)`);
        }

        await interaction.editReply('⏳ La tua richiesta è stata presa in carico! Controlla i tuoi messaggi privati (DM) per gli aggiornamenti.');

        try {
            const success = await queueTask(() => autoApproveUser(scUsername));

            if (success) {
                // Notifica DM: Approvato
                try {
                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Richiesta Approvata — Evren City RP')
                        .setDescription(`Complimenti! Il tuo account Social Club **${scUsername}** è stato **accettato nella Crew ufficiale** di Evren City RP!\n\nBuon Roleplay in città! 🏙️`)
                        .setColor('#2ecc71');
                    await interaction.user.send({ embeds: [successEmbed] });
                } catch (e) {}

                // LOG AUDIT CANALE DEDICATO
                const logEmbed = new EmbedBuilder()
                    .setTitle('🟢 LOG: Ingresso Crew Approvato')
                    .addFields(
                        { name: 'Utente Discord', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                        { name: 'Account Social Club', value: `\`${scUsername}\``, inline: true },
                        { name: 'Data & Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    )
                    .setColor('#2ecc71')
                    .setTimestamp();
                await sendLogMessage(logEmbed);

            } else {
                // Notifica DM: Errore / Non Trovato
                try {
                    const failEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Richiesta Non Trovata — Evren City RP')
                        .setDescription(
                            `Non siamo riusciti a trovare nessuna richiesta pendente per **${scUsername}**.\n\n` +
                            '**Cosa devi fare adesso:**\n' +
                            '1. Assicurati di aver inviato la richiesta dal sito Social Club o da GTA Online.\n' +
                            '2. Verifica che lo username scritto corrisponda esattamente al tuo profilo Rockstar.\n' +
                            '3. Torna sul server e riprova.'
                        )
                        .setColor('#e74c3c');
                    await interaction.user.send({ embeds: [failEmbed] });
                } catch (e) {}

                // LOG AUDIT FALLIMENTO
                const logEmbed = new EmbedBuilder()
                    .setTitle('🟡 LOG: Ingresso Crew Fallito (Nessuna Richiesta Pendente)')
                    .addFields(
                        { name: 'Utente Discord', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                        { name: 'Account Cercato', value: `\`${scUsername}\``, inline: true }
                    )
                    .setColor('#f1c40f')
                    .setTimestamp();
                await sendLogMessage(logEmbed);
            }
        } catch (err) {
            console.error(err);
            try {
                await interaction.user.send('❌ Si è verificato un errore tecnico temporaneo durante l\'approvazione. Riprova più tardi o contatta lo Staff.');
            } catch (e) {}
        }
    }

    // 5. COMANDI STAFF (KICK, BAN, UNBAN) CON PULSANTI DI CONFERMA E LOG
    if (interaction.isChatInputCommand() && (interaction.commandName === 'kick_crew' || interaction.commandName === 'ban_crew' || interaction.commandName === 'unban_crew')) {
        if (!checkStaffPermission(interaction.member)) {
            return interaction.reply({ content: '❌ Non possiedi il ruolo Staff necessario per eseguire questa azione.', ephemeral: true });
        }

        const commandName = interaction.commandName;
        const platform = interaction.options.getString('piattaforma');
        const targetUser = interaction.options.getString('utente');
        const reason = interaction.options.getString('motivo') || 'Nessun motivo specificato';

        let actionType = 'kick';
        let actionTitle = 'Espulsione (Kick)';
        let colorHex = '#e67e22';

        if (commandName === 'ban_crew') {
            actionType = 'ban';
            actionTitle = 'Blocco permanente (Ban)';
            colorHex = '#e74c3c';
        } else if (commandName === 'unban_crew') {
            actionType = 'unban';
            actionTitle = 'Sblocco (Unban)';
            colorHex = '#3498db';
        }

        // EMBED E PULSANTI DI CONFERMA
        const confirmEmbed = new EmbedBuilder()
            .setTitle(`⚠️ Conferma ${actionTitle}`)
            .setDescription(
                `Sei sicuro di voler eseguire l'azione **${actionTitle.toUpperCase()}** per il seguente membro della Crew Social Club?\n\n` +
                `• **Utente Social Club:** \`${targetUser}\`\n` +
                `• **Piattaforma:** \`${platform.toUpperCase()}\`\n` +
                `• **Motivo:** ${reason}\n\n` +
                `*Questa operazione interagirà direttamente con il Social Club di Rockstar.*`
            )
            .setColor(colorHex);

        const confirmBtn = new ButtonBuilder()
            .setCustomId('confirm_action')
            .setLabel('Conferma Operazione')
            .setStyle(commandName === 'ban_crew' ? ButtonStyle.Danger : ButtonStyle.Primary);

        const cancelBtn = new ButtonBuilder()
            .setCustomId('cancel_action')
            .setLabel('Annulla')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        const response = await interaction.reply({
            embeds: [confirmEmbed],
            components: [row],
            ephemeral: true
        });

        // COLLECTOR PER I PULSANTI (Tempo limite: 30 secondi)
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async btnInteraction => {
            if (btnInteraction.customId === 'cancel_action') {
                await btnInteraction.update({
                    content: '❌ Operazione annullata.',
                    embeds: [],
                    components: []
                });
                return;
            }

            if (btnInteraction.customId === 'confirm_action') {
                await btnInteraction.update({
                    content: `⏳ Esecuzione dell'azione **${actionTitle}** in corso...`,
                    embeds: [],
                    components: []
                });

                try {
                    const success = await queueTask(() => manageCrewMember(targetUser, platform, actionType));

                    if (success) {
                        // Aggiorna le cache locali
                        if (actionType === 'unban') {
                            bannedCache = bannedCache.filter(m => m.name !== targetUser);
                        } else {
                            membersCache = membersCache.filter(m => m.name !== targetUser);
                        }

                        await btnInteraction.editReply({
                            content: `✅ **[EVREN CITY STAFF]** L'azione **${actionTitle}** su **${targetUser}** (${platform.toUpperCase()}) è stata eseguita con successo su Rockstar Social Club!`
                        });

                        // AUDIT LOG NEL CANALE DEDICATO
                        const logEmbed = new EmbedBuilder()
                            .setTitle(`🔴 LOG: ${actionTitle} Eseguito`)
                            .addFields(
                                { name: 'Staffer', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                                { name: 'Utente Social Club', value: `\`${targetUser}\``, inline: true },
                                { name: 'Piattaforma', value: `\`${platform.toUpperCase()}\``, inline: true },
                                { name: 'Motivo', value: reason, inline: false },
                                { name: 'Data & Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                            )
                            .setColor(colorHex)
                            .setTimestamp();

                        await sendLogMessage(logEmbed);

                    } else {
                        await btnInteraction.editReply({
                            content: `⚠️ Impossibile completare l'azione per **${targetUser}**. Verifica che l'utente esista nella lista ${actionType === 'unban' ? 'bannati' : 'membri'} sulla piattaforma selezionata.`
                        });
                    }
                } catch (err) {
                    console.error(err);
                    await btnInteraction.editReply({
                        content: `❌ Errore durante l'esecuzione dell'operazione di ${actionTitle}.`
                    });
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                try {
                    await interaction.editReply({
                        content: '⏱️ Tempo scaduto. L\'operazione è stata annullata automaticamente.',
                        embeds: [],
                        components: []
                    });
                } catch (e) {}
            }
        });
    }
});

client.login(process.env.DISCORD_TOKEN);