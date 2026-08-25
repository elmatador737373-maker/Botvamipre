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
    EmbedBuilder
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

    if (await fs.pathExists('./cookies.json')) {
        const cookies = await fs.readJson('./cookies.json');
        await page.setCookie(...cookies);
        console.log("[Social Club] Cookie di sessione caricati!");
    } else {
        console.error("⚠️ CRITICO: File cookies.json mancante! Esegui il primo avvio in locale per generarlo.");
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

async function manageCrewMember(username, platform, action = 'kick') {
    const membersUrl = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/members`;
    if (page.url() !== membersUrl) {
        await page.goto(membersUrl, { waitUntil: 'networkidle2' });
    }

    return await page.evaluate((targetUser, targetPlatform, actionType) => {
        const cards = Array.from(document.querySelectorAll('.member-card'));
        for (const card of cards) {
            const nameEl = card.querySelector('.member-card-username');
            const platformEl = card.querySelector('.platform-icon');
            const userPlatform = platformEl ? platformEl.getAttribute('title')?.toLowerCase() : 'all';

            const matchesUser = nameEl && nameEl.textContent.trim().toLowerCase() === targetUser.toLowerCase();
            const matchesPlatform = targetPlatform === 'all' || (userPlatform && userPlatform.includes(targetPlatform));

            if (matchesUser && matchesPlatform) {
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
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente').setRequired(true).setAutocomplete(true));

const banCommand = new SlashCommandBuilder()
    .setName('ban_crew')
    .setDescription('[STAFF EVREN CITY] Banna e blocca un membro dalla Crew Social Club')
    .addStringOption(opt => opt.setName('piattaforma').setDescription('Piattaforma dell\'utente').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente').setRequired(true).setAutocomplete(true));

// --- 6. EVENTO READY & REGISTRAZIONE COMANDI ---

client.once('ready', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag}`);
    await initSocialClub();

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
        Routes.applicationCommands(client.user.id), 
        { body: [setupCommand.toJSON(), kickCommand.toJSON(), banCommand.toJSON()] }
    );
    console.log("[Evren City] Comandi registrati!");
});

// --- 7. GESTIONE INTERAZIONI DISCORD ---

client.on('interactionCreate', async interaction => {
    
    // VERIFICA RUOLO STAFF PER I COMANDI
    const checkStaffPermission = (member) => {
        return member.roles.cache.has(process.env.STAFF_ROLE_ID) || member.permissions.has('Administrator');
    };

    // 1. AUTOCOMPLETE COMANDI KICK / BAN
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'kick_crew' || commandName === 'ban_crew') {
            if (!checkStaffPermission(interaction.member)) return;

            const selectedPlatform = interaction.options.getString('piattaforma') || 'all';
            const focusedValue = interaction.options.getFocused().toLowerCase();

            if (membersCache.length === 0) {
                await queueTask(() => fetchCrewMembers());
            }

            const filtered = membersCache.filter(m => {
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

    // 4. INVIO MODAL -> ELABORAZIONE E NOTIFICHE DM
    if (interaction.isModalSubmit() && interaction.customId === 'modal_richiesta_crew') {
        const scUsername = interaction.fields.getTextInputValue('input_sc_username').trim();
        await interaction.deferReply({ ephemeral: true });

        // Invia Primo DM: Presa in carico
        try {
            const startEmbed = new EmbedBuilder()
                .setTitle('⏳ Richiesta in Elaborazione — Evren City RP')
                .setDescription(`Abbiamo preso in carico la tua richiesta per l'account Social Club: **${scUsername}**.\nIl sistema stà verificando sul Social Club di Rockstar...`)
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
                } catch (e) {
                    console.log(`Impossibile inviare DM di successo a ${interaction.user.tag}`);
                }

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
                } catch (e) {
                    console.log(`Impossibile inviare DM di errore a ${interaction.user.tag}`);
                }
            }
        } catch (err) {
            console.error(err);
            try {
                await interaction.user.send('❌ Si è verificato un errore tecnico temporaneo durante l\'approvazione. Riprova più tardi o contatta lo Staff.');
            } catch (e) {}
        }
    }

    // 5. COMANDI STAFF (KICK & BAN)
    if (interaction.isChatInputCommand() && (interaction.commandName === 'kick_crew' || interaction.commandName === 'ban_crew')) {
        if (!checkStaffPermission(interaction.member)) {
            return interaction.reply({ content: '❌ Non possiedi il ruolo Staff necessario per eseguire questa azione.', ephemeral: true });
        }

        const platform = interaction.options.getString('piattaforma');
        const targetUser = interaction.options.getString('utente');
        const isBan = interaction.commandName === 'ban_crew';
        const actionText = isBan ? 'bannato' : 'espulso';

        await interaction.deferReply({ ephemeral: true });

        try {
            const success = await queueTask(() => manageCrewMember(targetUser, platform, isBan ? 'ban' : 'kick'));
            if (success) {
                membersCache = membersCache.filter(m => m.name !== targetUser);
                await interaction.editReply(`🚫 **[EVREN CITY STAFF]** L'utente **${targetUser}** (${platform.toUpperCase()}) è stato **${actionText}** con successo dalla Crew!`);
            } else {
                await interaction.editReply(`⚠️ Impossibile eseguire l'azione su **${targetUser}**. Controlla che la piattaforma selezionata sia corretta.`);
            }
        } catch (err) {
            console.error(err);
            await interaction.editReply(`❌ Errore durante l'operazione di ${actionText}.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
