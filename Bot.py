import os
import threading
from flask import Flask
import discord
from discord.ext import commands
from google import genai
from dotenv import load_dotenv

# ==========================================
# 1. CONFIGURAZIONE SERVER FLASK (Anti-Sleep Render)
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Il segretario è online e attivo!"

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 2. INIZIALIZZAZIONE E CREDENZIALI
# ==========================================
load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

ai_client = genai.Client(api_key=GEMINI_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# IMPORTANTE: Inserisci il tuo ID Utente Discord reale qui
IL_MIO_ID_DISCORD = 1191824316376043580  

# Dizionario per tenere traccia di chi ha la conversazione attiva
# Struttura: {user_id: True}
conversazioni_attive = {}

@bot.event
async def on_ready():
    print(f'Segretario pronto! Loggato come {bot.user.name}')

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    user_id = message.author.id
    tagga_bot = bot.user.mentioned_in(message)
    tagga_me = any(user.id == IL_MIO_ID_DISCORD for user in message.mentions)
    in_dm = isinstance(message.channel, discord.DMChannel)
    
    # Controlla se l'utente ha già una conversazione attiva con il bot
    ha_sessione_attiva = conversazioni_attive.get(user_id, False)

    # --------------------------------------------------------
    # CONTROLLO COMANDO DI STOP
    # --------------------------------------------------------
    if ha_sessione_attiva and "stop" in message.content.lower():
        conversazioni_attive[user_id] = False
        await message.reply("Certamente. Sessione terminata. Tornerò in modalità silenziosa fino al prossimo tag.")
        return

    # ==========================================
    # IL BOT RISPONDE SE:
    # 1. C'è un tag (o DM)
    # 2. L'utente è in una conversazione già attiva
    # ==========================================
    if tagga_bot or tagga_me or in_dm or ha_sessione_attiva:
        
        # Se è il primo tag e non era attivo, attiviamo la sessione
        if tagga_bot and not ha_sessione_attiva and not in_dm:
            conversazioni_attive[user_id] = True
            ha_sessione_attiva = True

        # Puliamo il testo dai tag
        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        
        if not clean_content and not ha_sessione_attiva:
            if tagga_me:
                await message.reply(f"Salve! Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me. (Scriva 'stop' per congedarmi)")
            else:
                await message.reply("Desidera qualcosa? Sono a sua disposizione. (Scriva 'stop' per chiudere la chat)")
            return

        # Se l'utente scrive a vuoto ma la sessione è attiva, non facciamo nulla
        if not clean_content:
            return

        # ==========================================
        # GESTIONE SPECIALE: RIASSUNTO PER IL CAPO
        # ==========================================
        testo_minuscolo = message.content.lower()
        parole_chiave = ["riassunto", "riassumi", "novità", "successo", "aggiornamento", "report"]
        
        if tagga_bot and message.author.id == IL_MIO_ID_DISCORD and any(parola in testo_minuscolo for parola in parole_chiave):
            # ... (Logica del riassunto opzionale, per ora saltiamo per brevità se vuoi, altrimenti esegue)
            pass

        # ==========================================
        # GENERAZIONE RISPOSTA IA
        # ==========================================
        async with message.channel.typing():
            try:
                istruzione_sistema = (
                    f"Sei il segretario personale di <@{IL_MIO_ID_DISCORD}>. "
                    "Sei in una conversazione continua con l'utente attuale. "
                    "Sii formale, educato e dagli del 'Lei'. "
                    "Ricorda all'utente che può scrivere 'stop' in qualsiasi momento per terminare la conversazione con te."
                )

                response = ai_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=clean_content,
                    config={"system_instruction": istruzione_sistema}
                )
                
                risposta_ia = response.text
                
                # Se l'utente ha taggato TE (il capo), il bot si presenta come sostituto
                if tagga_me:
                    risposta_finale = (
                        f"💼 *Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me.*\n"
                        f"*(Risponderò ai suoi messaggi successivi senza tag. Scriva 'stop' per terminare)*\n\n"
                        f"{risposta_ia}"
                    )
                # Se è la prima volta che taggano il bot direttamente, spiega la modalità attiva
                elif tagga_bot and conversazioni_attive[user_id] == True and message.content == clean_content: 
                    risposta_finale = (
                        f"🤖 *Modalità conversazione attiva. Risponderò ai suoi prossimi messaggi in questa chat senza bisogno di taggarmi. Scriva 'stop' per chiudere.*\n\n"
                        f"{risposta_ia}"
                    )
                else:
                    # Risposta normale durante la conversazione attiva senza tag
                    risposta_finale = risposta_ia

                await message.reply(risposta_finale)
                
            except Exception as e:
                print(f"Errore IA: {e}")
                await message.reply("La prego di scusarmi, ho riscontrato un problema nei miei sistemi di comunicazione.")

    await bot.process_commands(message)

# ==========================================
# 5. AVVIO MULTI-THREAD
# ==========================================
if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(DISCORD_TOKEN)
