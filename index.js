require('dotenv').config();
const express = require('express');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');

// --- 1. CONFIGURAZIONE SUPABASE & SERVER WEB HTTP (PER UPTIMEROBOT) ---
const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('🟢 Evren City RP - Crew Bot Online & Ready!');
});

app.listen(PORT, () => {
    console.log(`[Evren City] Server HTTP avviato sulla porta ${PORT}`);
});

// --- 2. GESTIONE CODA & CACHE MEMORIA PER AUTOCOMPLETE VELOCE ---
const taskQueue = [];
let isProcessingQueue = false;
let cachedInvites = []; // Cache in memoria per autocomplete fulmineo
let lastCacheUpdate = 0;

const randomSleep = (min = 3000, max = 6000) => {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
};

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
        await randomSleep(3000, 5000); 
        const result = await taskFunction();
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        isProcessingQueue = false;
        processQueue();
    }
}

// --- 3. CLIENT DISCORD & PLAYWRIGHT CON ANTI-BAN ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ] 
});

async function getAuthenticatedPage() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1920,1080'
        ]
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        locale: 'it-IT',
        timezoneId: 'Europe/Rome'
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.navigator.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    await context.addCookies([
      {
        "name": "_ga_PJQ2JYZDQC",
        "value": "GS2.1.s1787669530$o1$g1$t1787674543$j58$l0$h0",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "OptanonConsent",
        "value": "isGpcEnabled=0&datestamp=Tue+Aug+25+2026+18%3A15%3A41+GMT%2B0200+(Ora+legale+dell%E2%80%99Europa+centrale)&version=202604.2.0&browserGpcFlag=0&isDntEnabled=0&isIABGlobal=false&hosts=&genVendors=&consentId=e5100e25-7fcc-48c7-ad66-abc78d94389b&interactionCount=1&isAnonUser=1&prevHadToken=0&landingPath=NotLandingPage&groups=1%3A1%2C2%3A1%2C3%3A1%2C4%3A1&fclco=&lastConsentTs=1787669533&intType=1&crTime=1787669535578&geolocation=IT%3B75&AwaitingReconsent=false",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_ga",
        "value": "GA1.1.6527890.1787669531",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "rockstarweb_lang.prod",
        "value": "en-US",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "bm_sv",
        "value": "1462F541BEF1731454C3B8DF66B694F9~YAAQhrUQAnkBNDKgAQAAgnuwOQCT/zQGBl5WvXpqdrgAVX5KttGRWfOMhyknbrR5YTXDysdRjy2aDo3TCB4JzGczqDavazvN3t3zIH9wueJIDd1+wdO6azPCPPtW5V5kjx2SwEd7sB0j9AO/IuCXn/7KGyvvPLhwlOCYzHy54fPMR6ws2xjYNb6NxgsIEweKimxVW0TS03+WMgUYH6OA8hsez0o4hUUiwdN2qlfFMS58ltkAkEqB4n3x5CxykifFwE5TwyzCyZM=~1",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "BearerToken",
        "value": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjdmNmQwNDRlLTBmNGMtNGM3ZS04NDk0LWUyYzBkZWM1YWE4ZiIsInR5cCI6IkpXVCJ9.eyJuYW1laWQiOiIzMDYxODk5MjUiLCJyb2Nrc3tarEF1dGguUnVpZci6IjEyNDgwZTE4ZDQyODQwNjg4N2JiNTQxYjk4OTE4MTUzIiwianRpIjoiYjQ2NTI5N2EtNTQ5ZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZS00OWNjLWE2YzctYTY3YjgzMmZhNDAyIiwiY2xpZW50X2lkIjoicnNnIiwiYW1yIjpbInB3ZCJdLCJzY0F1dGguS2VlcMeMZW5kSW4iOiJUcnVlIicic2NBdXRoLlRva2VuU3RvcmFnZVR0bCI6IjI1OTIwMDAiLCJzY0F1dGguSXNBTWlub3IiOiJGYWxzZSIsInNjQXV0aC5OaWNrbmFtZSI6IkV2cmVuTWFuYWdlbWVudCIsInNjQXV0aC5BdmF0YXJVcmwiOiJodHRwczovL3Byb2QtYXZhdGFycy5ha2FtYWl6ZWQubmV0L3N0b2NrLWF2YXtvcnMvbi/HVEFWL2d0YXYwMi5wbmciLCJzY0F1dGguSXNFbWFpbFZlcmlmaWVkIjoiVHJ1ZSIsInNjQXV0aC5NZW1iJSIsInNjQXV0aC5NZW1iZXJSinNlciI6IjIwMjYtMDgtMjVUMTQ6NTQ6NTIuNzYwMDAwMFoiLCJuYmYiOjE3ODc2NzQyNjIsImF1ZCI6WyJodHRwczovL3d3dy5yb2Nrc3tarGdhbWVzLmNvbSIsImh0dHBzOi8vc2NhcGkucm9ja3N0YXJnYW1lcy5jb20iLCJyb2Nrc3tarHNlcnZpY2VzIl0sInNjb3BlIjoic2NhcGk6KiBzY3M6dXBkYXRlUHJvZmlzeCIsImV4cCI6MTc4NzY3NDU2MiwiaWF0IjoxNzg3Njc0MjYyLCJpc3MiOiJodHRwczovLw==",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "OptanonAlertBoxClosed",
        "value": "2026-08-25T14:52:13.501Z",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_fbp",
        "value": "fb.1.1787669802088.153666339927725545",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_gcl_au",
        "value": "1.1.877096203.1787669802",
        "domain": "www.rockstargames.com",
        "path": "/"
      },
      {
        "name": "_twpid",
        "value": "tw.1787669801620.744046117391119025",
        "domain": "www.rockstargames.com",
        "path": "/"
      }
    ]);

    const page = await context.newPage();
    return { browser, page };
}

async function sendLogMessage(embed) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;
    try {
        const channel = await client.channels.fetch(logChannelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error("❌ Errore invio log:", err);
    }
}

// --- 4. FUNZIONI PLAYWRIGHT (FETCH & AZIONI REALI) ---
async function fetchPendingInvites(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedInvites.length > 0 && (now - lastCacheUpdate < 120000)) {
        return cachedInvites;
    }

    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3500);

        const invites = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr, .member-row, [data-member-row], div');
            let list = [];
            for (let row of rows) {
                const text = row.innerText ? row.innerText.trim() : '';
                if (text) {
                    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1 && l.length < 25);
                    for (let l of lines) {
                        const low = l.toLowerCase();
                        if (!list.includes(l) && !low.includes('accetta') && !low.includes('rifiuta') && !low.includes('invites') && !low.includes('manage')) {
                            list.push({ name: l });
                        }
                    }
                }
            }
            return list;
        });

        cachedInvites = invites;
        lastCacheUpdate = Date.now();
        return cachedInvites;
    } catch (e) {
        return cachedInvites;
    } finally {
        await browser.close();
    }
}

async function handleCrewInviteAction(username, action = 'approve') {
    const { browser, page } = await getAuthenticatedPage();
    try {
        await page.goto(`https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3500);

        const executed = await page.evaluate(({ targetUser, actionType }) => {
            const elements = Array.from(document.querySelectorAll('tr, div, li, article'));
            for (let el of elements) {
                const text = el.innerText || '';
                if (text.toLowerCase().includes(targetUser.toLowerCase())) {
                    const buttons = el.querySelectorAll('button, a[role="button"], .btn');
                    for (let btn of buttons) {
                        const btnText = btn.innerText.toLowerCase();
                        if (actionType === 'approve') {
                            if (btnText.includes('accetta') || btnText.includes('accept') || btn.classList.contains('accept') || btn.classList.contains('approve')) {
                                btn.click();
                                return true;
                            }
                        } else if (actionType === 'reject') {
                            if (btnText.includes('rifiuta') || btnText.includes('reject') || btnText.includes('deny') || btn.classList.contains('reject') || btn.classList.contains('deny')) {
                                btn.click();
                                return true;
                            }
                        }
                    }
                }
            }
            return false;
        }, { targetUser: username, actionType: action });

        if (executed) {
            await page.waitForTimeout(4000); 
            cachedInvites = cachedInvites.filter(i => i.name.toLowerCase() !== username.toLowerCase());
            return true;
        }
        return false;
    } catch (e) {
        console.error("Errore durante l'azione Playwright:", e);
        return false;
    } finally {
        await browser.close();
    }
}

// --- 5. COMANDI DISCORD & REGISTRAZIONE SLASH ---
const testLoginCommand = new SlashCommandBuilder().setName('test_login').setDescription('[STAFF] Test login Playwright');
const accettaCrewCommand = new SlashCommandBuilder()
    .setName('accetta_crew')
    .setDescription('[STAFF] Accetta una richiesta in sospeso')
    .addStringOption(o => o.setName('utente').setDescription('Seleziona o scrivi l ID Social Club').setRequired(true).setAutocomplete(true));

const rifiutaCrewCommand = new SlashCommandBuilder()
    .setName('rifiuta_crew')
    .setDescription('[STAFF] Rifiuta una richiesta in sospeso')
    .addStringOption(o => o.setName('utente').setDescription('Seleziona o scrivi l ID Social Club').setRequired(true).setAutocomplete(true));

const vediCrewCommand = new SlashCommandBuilder()
    .setName('vedi_crew')
    .setDescription('[STAFF] Mostra e aggiorna tutte le richieste pendenti della crew');

client.once('clientReady', async () => {
    console.log(`[Evren City] Bot connesso come ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { 
        body: [
            testLoginCommand.toJSON(), 
            accettaCrewCommand.toJSON(),
            rifiutaCrewCommand.toJSON(),
            vediCrewCommand.toJSON()
        ] 
    });
});

client.on('interactionCreate', async interaction => {
    const checkStaff = (m) => m.roles.cache.has(process.env.ROLE_STAFF_ID) || m.permissions.has('Administrator');

    if (interaction.isAutocomplete()) {
        if (!checkStaff(interaction.member)) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        
        let invites = cachedInvites;
        if (invites.length === 0) {
            invites = await fetchPendingInvites();
        }

        const filtered = invites.filter(m => m.name.toLowerCase().includes(focused));
        await interaction.respond(filtered.slice(0, 25).map(m => ({ name: m.name, value: m.name })));
        return;
    }

    if (!checkStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Non sei autorizzato a usare questo comando.', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'test_login') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        await interaction.editReply(`✅ **[Playwright] Sistema Operativo e in ascolto code.**`);
        return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'vedi_crew') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const invites = await queueTask(() => fetchPendingInvites(true));
        const crewLink = `https://socialclub.rockstargames.com/crew/${process.env.CREW_ID}/manage/invites`;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📋 Richieste Pendenti Crew (Aggiornate)')
            .setDescription(invites.length > 0 
                ? invites.map((inv, idx) => `**${idx + 1}.** ${inv.name}`).join('\n') 
                : 'Nessuna richiesta pendente al momento.')
            .addFields({ name: '🔗 Link Gestione Inviti', value: `[Apri Social Club](${crewLink})` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (interaction.isChatInputCommand() && (interaction.commandName === 'accetta_crew' || interaction.commandName === 'rifiuta_crew')) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const username = interaction.options.getString('utente');
        const action = interaction.commandName === 'accetta_crew' ? 'approve' : 'reject';
        const actionLabel = action === 'approve' ? 'ACCETTATA' : 'RIFIUTATA';

        const success = await queueTask(() => handleCrewInviteAction(username, action));
        if (success) {
            const embed = new EmbedBuilder()
                .setColor(action === 'approve' ? '#57F287' : '#ED4245')
                .setTitle(`✅ Richiesta ${actionLabel}`)
                .setDescription(`La richiesta di **${username}** è stata gestita con successo sul Social Club.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            const logEmbed = new EmbedBuilder()
                .setTitle(`🛠️ STAFF CREW ACTION: ${actionLabel}`)
                .setColor(action === 'approve' ? '#57F287' : '#ED4245')
                .addFields(
                    { name: 'Staff', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                    { name: 'Social Club ID', value: username, inline: true }
                )
                .setTimestamp();
            await sendLogMessage(logEmbed);

        } else {
            await interaction.editReply(`❌ Impossibile completare l'azione per **${username}** sul Social Club. Verifica che sia ancora in sospeso.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
