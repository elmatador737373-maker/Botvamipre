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
        # GENERAZIONE RISPOSTA IA (Versione ULTRA STABILE)
        # ==========================================
        async with message.channel.typing():
            try:
                # Definiamo i contenuti e la configurazione in modo esplicito
                testo_utente = str(clean_content)
                
                # Usiamo la sintassi standard e più compatibile dell'SDK
                response = ai_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=testo_utente,
                    config={
                        "system_instruction": f"Sei il segretario personale di <@{IL_MIO_ID_DISCORD}>. Sii formale, educato e dagli del 'Lei'."
                    }
                )
                
                # Controllo di sicurezza sulla risposta
                if response and hasattr(response, 'text') and response.text:
                    risposta_ia = response.text
                else:
                    risposta_ia = "Mi scusi, non sono riuscito a elaborare una risposta valida in questo momento."
                
                # Gestione dei prefissi (Conversazione attiva / Segretario del capo)
                if tagga_me:
                    risposta_finale = (
                        f"💼 *Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me.*\n"
                        f"*(Risponderò ai suoi messaggi successivi senza tag. Scriva 'stop' per terminare)*\n\n"
                        f"{risposta_ia}"
                    )
                elif tagga_bot and conversazioni_attive[user_id] == True and message.content == clean_content: 
                    risposta_finale = (
                        f"🤖 *Modalità conversazione attiva. Risponderò ai suoi prossimi messaggi senza bisogno di taggarmi. Scriva 'stop' per chiudere.*\n\n"
                        f"{risposta_ia}"
                    )
                else:
                    risposta_finale = risposta_ia

                # Invio su Discord
                await message.reply(risposta_finale)
                
            except Exception as e:
                # Forza la stampa dell'errore nei log di Render, così DEVE apparire per forza
                print(f"--- ERRORE RILEVATO DA PYTHON: {str(e)} ---")
                await message.reply("La prego di scusarmi, ho riscontrato un problema nei miei sistemi di comunicazione.")

# ==========================================
# 5. AVVIO MULTI-THREAD
# ==========================================
if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(DISCORD_TOKEN)
