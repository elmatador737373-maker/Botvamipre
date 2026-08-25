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
    Routes
} = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');

// --- 1. SERVER WEB FOR RENDER (PREVIENE SLEEP E PERMETTE UPTIME PING) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('GTA Crew Bot Online & Active!');
});

app.listen(PORT, () => {
    console.log(`[HTTP] Server avviato sulla porta ${PORT}`);
});

// --- 2. GESTIONE CODA DI ESECUZIONE E COOLDOWN ANTI-BAN ---
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
        // Pausa casuale di sicurezza tra 3.5s e 6.5s prima di fare azioni sul Social Club
        const randomDelay = Math.floor(Math.random() * 3000) + 3500;
        console.log(`[Anti-Bot] Attesa di ${randomDelay}ms per simulare comportamento umano...`);
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

// --- 3. CONFIGURAZIONE DISCORD & PUPPETEER ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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
            '--single-process', // Ottimizzazione memoria RAM per Render
            '--disable-gpu'
        ] 
    });
    
    page = await browser.newPage();

    if (await fs.pathExists('./cookies.json')) {
        const cookies = await fs.readJson('./cookies.json');
        await page.setCookie(...cookies);
        console.log("[Social Club] Cookie caricati con successo!");
    } else {
        console.error("⚠️ CRITICO: Archivio cookies.json non trovato! Generalo prima in locale e poi caricalo sul server.");
    }
}

// --- 4. FUNZIONI DI SCRAPING ED AUTOMAZIONE WEB ---

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

// --- 5. DEFINIZIONE COMANDI DISCORD ---

const setupCommand = new SlashCommandBuilder()
    .setName('setup_pannello')
    .setDescription('[ADMIN] Crea il pannello per la richiesta d\'ingresso nella Crew');

const choicesPiattaforma = [
    { name: 'Tutte le Piattaforme', value: 'all' },
    { name: 'PC', value: 'pc' },
    { name: 'PlayStation (PS4/PS5)', value: 'ps' },
    { name: 'Xbox (One/Series)', value: 'xbox' }
];

const kickCommand = new SlashCommandBuilder()
    .setName('kick_crew')
    .setDescription('[STAFF] Espelle un membro dalla Crew Social Club')
    .addStringOption(opt => opt.setName('piattaforma').setDescription('Piattaforma dell\'utente').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente').setRequired(true).setAutocomplete(true));

const banCommand = new SlashCommandBuilder()
    .setName('ban_crew')
    .setDescription('[STAFF] Banna e blocca un membro dalla Crew Social Club')
    .addStringOption(opt => opt.setName('piattaforma').setDescription('Piattaforma dell\'utente').setRequired(true).addChoices(...choicesPiattaforma))
    .addStringOption(opt => opt.setName('utente').setDescription('Seleziona utente').setRequired(true).setAutocomplete(true));

// --- 6. EVENTO READY & REGISTRAZIONE COMANDI ---

client.once('ready', async () => {
    console.log(`[Discord] Bot loggato come: ${client.user.tag}`);
    await initSocialClub();

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
        Routes.applicationCommands(client.user.id), 
        { body: [setupCommand.toJSON(), kickCommand.toJSON(), banCommand.toJSON()] }
    );
    console.log("[Discord] Comandi Slash registrati con successo!");
});

// --- 7. HANDLER DELLE INTERAZIONI ---

client.on('interactionCreate', async interaction => {
    
    // Autocomplete filtrato per Piattaforma e Nome
    if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === 'kick_crew' || commandName === 'ban_crew') {
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

    // Comando per pubblicare il pannello
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup_pannello') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Permesso negato: solo Amministratori.', ephemeral: true });
        }

        const button = new ButtonBuilder()
            .setCustomId('btn_richiedi_crew')
            .setLabel('Richiedi Entrata nella Crew')
            .setStyle(ButtonStyle.Success);

        await interaction.channel.send({
            content: '📌 **Richiesta di Ingresso nella Crew**\n\n1. Invia la richiesta d\'invito prima sul sito del Social Club o in-game.\n2. Clicca il pulsante qui sotto per inserire il tuo Nickname Social Club ed essere approvato!',
            components: [new ActionRowBuilder().addComponents(button)]
        });

        return interaction.reply({ content: 'Pannello inviato correttamente!', ephemeral: true });
    }

    // Click sul Pulsante -> Apre il Popup Modal
    if (interaction.isButton() && interaction.customId === 'btn_richiedi_crew') {
        const modal = new ModalBuilder().setCustomId('modal_richiesta_crew').setTitle('Verifica Social Club');
        const scInput = new TextInputBuilder()
            .setCustomId('input_sc_username')
            .setLabel('Il tuo Nickname Social Club')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Es. MarioRossi_99')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(scInput));
        await interaction.showModal(modal);
    }

    // Invio Form Modal -> Accodamento per l'approvazione automatica
    if (interaction.isModalSubmit() && interaction.customId === 'modal_richiesta_crew') {
        const scUsername = interaction.fields.getTextInputValue('input_sc_username').trim();
        await interaction.deferReply({ ephemeral: true });

        try {
            const success = await queueTask(() => autoApproveUser(scUsername));
            if (success) {
                await interaction.editReply(`✅ **Approvato!** L'utente **${scUsername}** è stato accettato nella Crew Social Club!`);
            } else {
                await interaction.editReply(`⚠️ Impossibile trovare una richiesta pendente per **${scUsername}**.\n\nAssicurati di aver prima cliccato su *"Richiedi Invito"* dal Social Club.`);
            }
        } catch (err) {
            console.error(err);
            await interaction.editReply('❌ Si è verificato un errore o l\'operazione è andata in timeout. Riprova tra poco.');
        }
    }

    // Comandi Staff (Kick / Ban)
    if (interaction.isChatInputCommand() && (interaction.commandName === 'kick_crew' || interaction.commandName === 'ban_crew')) {
        if (!interaction.member.permissions.has('KickMembers')) {
            return interaction.reply({ content: '❌ Permessi non sufficienti.', ephemeral: true });
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
                await interaction.editReply(`🚫 **${targetUser}** (${platform.toUpperCase()}) è stato ${actionText} con successo dalla Crew Social Club!`);
            } else {
                await interaction.editReply(`⚠️ Impossibile completare l'azione per **${targetUser}**. Verifica piattaforma o presenza nella Crew.`);
            }
        } catch (err) {
            console.error(err);
            await interaction.editReply(`❌ Errore durante l'esecuzione del ${actionText}.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
